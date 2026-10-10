using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

public class GameBootstrap : MonoBehaviour
{
    public GameplayPack Pack { get; private set; }
    public string CurrentRoomId { get; private set; }
    public bool Victory { get; private set; }
    public bool OnTitleScreen => _onTitle;
    public PlayerActor Player => _player;
    public string SavePath => _savePath;
    public GameplayRoom CurrentRoom => _room;
    public BossController Boss { get; private set; }
    public int BossPhaseChangeCount { get; private set; }
    public int BossAttackCount { get; private set; }
    public int BossDefeatCount { get; private set; }
    private readonly HashSet<string> _defeatedBosses = new HashSet<string>();
    public float LastRoomLoadMs { get; private set; }
    public int LastRoomLoadGc0 { get; private set; }
    public Vector2 RespawnAnchor => _spawn;
    public float LastRespawnMs { get; private set; }
    public float LastCreateEnemyMs { get; private set; }
    public float LastWriteSaveMs { get; private set; }

    private readonly Dictionary<string, GameplayRoom> _rooms = new Dictionary<string, GameplayRoom>();
    private Transform _worldRoot;
    private Transform _activeRoomRoot;
    private readonly Dictionary<string, Transform> _roomCache = new Dictionary<string, Transform>();
    public readonly List<string> TransitionLog = new List<string>();
    public string LastTransitionJson { get; private set; }
    public bool LastTransitionCached { get; private set; }
    private Transform RoomParent => _activeRoomRoot != null ? _activeRoomRoot : _worldRoot;
    private PlayerActor _player;
    private LootRuntime _loot;
    private InventoryPanelUI _inventoryPanel;
    private NpcDialogueUI _npcDialogue;
    private Camera _camera;
    private Text _hud;
    private Button _titleReturnBtn;
    private GameplayRoom _room;
    private string _streamingRoot;
    private string _savePath;
    private Vector2 _spawn;
    private bool _onTitle;
    private bool _loadingRoom;
    private bool _restoringSave;
    private float _ignoreDoorsUntil;
    private float _layoutAt;
    private string _layoutSig;

    private void Start()
    {
        _streamingRoot = Path.Combine(Application.streamingAssetsPath);
        var saveRoot = System.Environment.GetEnvironmentVariable("METROFORGE_GAME_SAVE_DIR");
        if (string.IsNullOrWhiteSpace(saveRoot))
            saveRoot = Application.persistentDataPath;
        Directory.CreateDirectory(saveRoot);
        _savePath = Path.Combine(saveRoot, "metroforge_save.json");
        var jsonPath = Path.Combine(_streamingRoot, "gameplay.json");
        if (!File.Exists(jsonPath))
        {
            Debug.LogError("Missing StreamingAssets/gameplay.json");
            return;
        }
        try { _loot = new LootRuntime(_streamingRoot); }
        catch (System.Exception error) { Debug.LogError("Loot catalog failed validation: " + error.Message); }
        Pack = JsonUtility.FromJson<GameplayPack>(File.ReadAllText(jsonPath));
        if (Pack.combat != null && Pack.combat.maxHealth <= 0f)
            Pack.combat.maxHealth = 100f;
        foreach (var room in Pack.rooms)
            _rooms[room.id] = room;

        StreamingArtCache.PreloadTree(_streamingRoot, "assets/backgrounds");
        StreamingArtCache.PreloadTree(_streamingRoot, "assets/tilesets");
        StreamingArtCache.PreloadTree(_streamingRoot, "assets/vfx");
        StreamingArtCache.PreloadTree(_streamingRoot, "assets/props");
        StreamingArtCache.PreloadTree(_streamingRoot, "assets/characters");
        StreamingArtCache.PreloadTree(_streamingRoot, "assets/enemies");
        StreamingArtCache.PreloadTree(_streamingRoot, "assets/bosses");
        StreamingArtCache.PreloadTree(_streamingRoot, "assets/architecture");
        StreamingArtCache.PreloadTree(_streamingRoot, "assets/ui");
        Debug.Log("FOUNDRY_ART_PRELOAD_MS " + StreamingArtCache.LastPreloadMs.ToString("0.0") +
                  " files=" + StreamingArtCache.LastPreloadCount);

        Physics2D.gravity = new Vector2(0f, -Pack.movement.gravity);
        _camera = Camera.main;
        if (_camera != null)
        {
            _camera.orthographic = true;
            _camera.orthographicSize = 120f;
        }
        _worldRoot = new GameObject("World").transform;
        BuildHud();
        var startId = Pack.startRoomId;
        var spawn = Vector2.zero;
        string savedAbilities = null;
        var skipTitle = AcceptanceDriver.RequestedFromCommandLine();
        var catalogOnly = string.Equals(AcceptanceDriver.ForcedMode, "catalog", System.StringComparison.OrdinalIgnoreCase);
        foreach (var arg in System.Environment.GetCommandLineArgs())
        {
            if (arg.Equals("-acceptanceMode=catalog", System.StringComparison.OrdinalIgnoreCase))
                catalogOnly = true;
        }
        if (!skipTitle && !catalogOnly && File.Exists(_savePath))
        {
            var save = JsonUtility.FromJson<SaveBlob>(File.ReadAllText(_savePath));
            if (save != null && _rooms.ContainsKey(save.roomId))
            {
                startId = save.roomId;
                spawn = new Vector2(save.x, save.y);
                savedAbilities = save.abilities;
                Victory = save.victory;
                RestoreBossProgress(save.defeatedBosses);
            }
        }
        try
        {
            if (catalogOnly)
            {
                if (_camera != null)
                    _camera.backgroundColor = new Color(0.05f, 0.04f, 0.05f);
            }
            else if (skipTitle)
            {
                LoadRoom(startId, spawn, true);
                ApplySavedAbilities(savedAbilities);
            }
            else
                BuildTitle(startId, spawn, savedAbilities);
        }
        finally
        {
            if (AcceptanceDriver.RequestedFromCommandLine() && GetComponent<AcceptanceDriver>() == null)
                gameObject.AddComponent<AcceptanceDriver>();
        }
    }

    private void ApplySavedAbilities(string savedAbilities)
    {
        if (string.IsNullOrEmpty(savedAbilities) || _player == null)
            return;
        foreach (var id in savedAbilities.Split(','))
        {
            if (!string.IsNullOrEmpty(id))
                _player.GrantAbility(id);
        }
    }

    private void BuildTitle(string startId, Vector2 spawn, string savedAbilities)
    {
        _onTitle = true;
        if (_titleReturnBtn != null)
            _titleReturnBtn.gameObject.SetActive(false);
        var canvas = GameObject.Find("HUD");
        var existing = canvas != null ? canvas.transform.Find("TitlePanel") : null;
        if (existing != null)
            Destroy(existing.gameObject);
        var panel = new GameObject("TitlePanel");
        panel.transform.SetParent(canvas.transform, false);
        var img = panel.AddComponent<Image>();
        var titleSprite = LoadStreamingSprite("assets/ui/title.png", new Vector2(0.5f, 0.5f));
        if (titleSprite != null)
            img.sprite = titleSprite;
        else
            img.color = new Color(0.08f, 0.06f, 0.05f, 0.94f);
        var rt = panel.GetComponent<RectTransform>();
        rt.anchorMin = Vector2.zero;
        rt.anchorMax = Vector2.one;
        rt.offsetMin = Vector2.zero;
        rt.offsetMax = Vector2.zero;
        AddTitleButton(panel.transform, "Continue", new Vector2(0f, -40f), "assets/ui/continue.png", () =>
        {
            Destroy(panel);
            _onTitle = false;
            if (_titleReturnBtn != null)
                _titleReturnBtn.gameObject.SetActive(true);
            if (File.Exists(_savePath))
            {
                var save = JsonUtility.FromJson<SaveBlob>(File.ReadAllText(_savePath));
                if (save != null && _rooms.ContainsKey(save.roomId))
                {
                    RestoreSave(save);
                    return;
                }
            }
            LoadRoom(startId, spawn, true);
            ApplySavedAbilities(savedAbilities);
        });
        AddTitleButton(panel.transform, "New Game", new Vector2(0f, -110f), "assets/ui/new_game.png", () =>
        {
            Destroy(panel);
            _onTitle = false;
            if (_titleReturnBtn != null)
                _titleReturnBtn.gameObject.SetActive(true);
            if (File.Exists(_savePath))
                File.Delete(_savePath);
            Victory = false;
            _defeatedBosses.Clear();
            BossPhaseChangeCount = BossAttackCount = BossDefeatCount = 0;
            LoadRoom(Pack.startRoomId, Vector2.zero, true);
        });
    }

    private void AddTitleButton(Transform parent, string label, Vector2 pos, string spriteRel, UnityEngine.Events.UnityAction onClick)
    {
        var go = new GameObject(label);
        go.transform.SetParent(parent, false);
        var img = go.AddComponent<Image>();
        var sprite = LoadStreamingSprite(spriteRel, new Vector2(0.5f, 0.5f));
        if (sprite != null)
            img.sprite = sprite;
        else
            img.color = new Color(0.55f, 0.4f, 0.18f, 1f);
        var rt = go.GetComponent<RectTransform>();
        rt.sizeDelta = new Vector2(280f, 56f);
        rt.anchoredPosition = pos;
        var btn = go.AddComponent<Button>();
        btn.onClick.AddListener(onClick);
        var textGo = new GameObject("Label");
        textGo.transform.SetParent(go.transform, false);
        var text = textGo.AddComponent<Text>();
        text.font = _hud != null ? _hud.font : Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        text.text = label;
        text.alignment = TextAnchor.MiddleCenter;
        text.color = Color.white;
        text.fontSize = 22;
        var trt = text.rectTransform;
        trt.anchorMin = Vector2.zero;
        trt.anchorMax = Vector2.one;
        trt.offsetMin = Vector2.zero;
        trt.offsetMax = Vector2.zero;
    }

    private Sprite LoadStreamingSprite(string rel, Vector2 pivot, float ppu = 1f)
    {
        return StreamingArtCache.GetSprite(_streamingRoot, rel, pivot, ppu, FilterMode.Point);
    }

    private Sprite LoadSlicedSprite(string rel, Vector4 border)
    {
        return StreamingArtCache.GetSliced(_streamingRoot, rel, border);
    }


    /// <summary>
    /// Diagnostic warp only. Do not count as normal-input traversal acceptance.
    /// </summary>
    public void DiagnosticWarpToRoom(string roomId)
    {
        LoadRoom(roomId, Vector2.zero, false);
    }

    public void ReloadFromSaveFile()
    {
        if (!File.Exists(_savePath))
            return;
        var save = JsonUtility.FromJson<SaveBlob>(File.ReadAllText(_savePath));
        if (save == null || !_rooms.ContainsKey(save.roomId))
            return;
        RestoreSave(save);
    }

    private void RestoreSave(SaveBlob save)
    {
        _restoringSave = true;
        try
        {
            RestoreBossProgress(save.defeatedBosses);
            LoadRoom(save.roomId, new Vector2(save.x, save.y), true);
            if (_player != null)
            {
                _player.Inventory.Restore(save.inventory);
                _player.Abilities.Clear();
                ApplySavedAbilities(save.abilities);
            }
            Victory = save.victory;
        }
        finally { _restoringSave = false; }
        WriteSave();
    }

    private void BuildHud()
    {
        var canvas = GameObject.Find("HUD");
        if (canvas == null)
        {
            var go = new GameObject("HUD");
            canvas = go;
            var c = go.AddComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay;
            c.pixelPerfect = true;
            go.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            go.AddComponent<GraphicRaycaster>();
        }
        // Generated scenes already contain HUD; they still need a UI event system.
        if (canvas.GetComponent<UnityEngine.UI.GraphicRaycaster>() == null)
            canvas.AddComponent<UnityEngine.UI.GraphicRaycaster>();
        var eventSystem = UnityEngine.EventSystems.EventSystem.current;
        if (eventSystem == null)
            eventSystem = new GameObject("EventSystem").AddComponent<UnityEngine.EventSystems.EventSystem>();
        if (eventSystem.GetComponent<UnityEngine.EventSystems.BaseInputModule>() == null)
        {
#if ENABLE_INPUT_SYSTEM
            var module = eventSystem.gameObject.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
            if (module.actionsAsset == null) module.AssignDefaultActions();
#else
            eventSystem.gameObject.AddComponent<UnityEngine.EventSystems.StandaloneInputModule>();
#endif
        }
        var textGo = new GameObject("Status");
        textGo.transform.SetParent(canvas.transform, false);
        _hud = textGo.AddComponent<Text>();
        _hud.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        if (_hud.font == null)
            _hud.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        _hud.fontSize = 22;
        _hud.color = new Color(0.96f, 0.91f, 0.78f, 1f);
        _hud.alignment = TextAnchor.UpperLeft;
        var outline = textGo.AddComponent<Outline>();
        outline.effectColor = new Color(0.08f, 0.05f, 0.03f, 0.92f);
        outline.effectDistance = new Vector2(1.5f, -1.5f);
        var rt = _hud.rectTransform;
        rt.anchorMin = new Vector2(0f, 1f);
        rt.anchorMax = new Vector2(0f, 1f);
        rt.pivot = new Vector2(0f, 1f);
        rt.anchoredPosition = new Vector2(24f, -24f);
        rt.sizeDelta = new Vector2(640f, 120f);

        var titleBtnGo = new GameObject("ReturnToTitle");
        titleBtnGo.transform.SetParent(canvas.transform, false);
        var titleImg = titleBtnGo.AddComponent<Image>();
        titleImg.color = new Color(0.28f, 0.18f, 0.1f, 0.92f);
        var titleRt = titleBtnGo.GetComponent<RectTransform>();
        titleRt.anchorMin = new Vector2(1f, 1f);
        titleRt.anchorMax = new Vector2(1f, 1f);
        titleRt.pivot = new Vector2(1f, 1f);
        titleRt.anchoredPosition = new Vector2(-24f, -24f);
        titleRt.sizeDelta = new Vector2(160f, 36f);
        _titleReturnBtn = titleBtnGo.AddComponent<Button>();
        _titleReturnBtn.onClick.AddListener(ReturnToTitle);
        var titleLabelGo = new GameObject("Label");
        titleLabelGo.transform.SetParent(titleBtnGo.transform, false);
        var titleLabel = titleLabelGo.AddComponent<Text>();
        titleLabel.font = _hud.font;
        titleLabel.text = "Title";
        titleLabel.alignment = TextAnchor.MiddleCenter;
        titleLabel.color = new Color(0.96f, 0.91f, 0.78f, 1f);
        titleLabel.fontSize = 18;
        var titleLabelRt = titleLabel.rectTransform;
        titleLabelRt.anchorMin = Vector2.zero;
        titleLabelRt.anchorMax = Vector2.one;
        titleLabelRt.offsetMin = Vector2.zero;
        titleLabelRt.offsetMax = Vector2.zero;
        titleBtnGo.SetActive(false);
        _inventoryPanel = canvas.AddComponent<InventoryPanelUI>();
        _inventoryPanel.Initialize(this, WriteSave);
        canvas.AddComponent<BossEncounterHUD>().Initialize(this, _hud.font);
        _npcDialogue = canvas.AddComponent<NpcDialogueUI>();
        _npcDialogue.Initialize(this);
    }

    private void Update()
    {
        if ((_npcDialogue == null || !_npcDialogue.BlocksTitleReturn) && ReadTitleReturn())
            ReturnToTitle();
        WriteUiLayout();
        if (_player == null || _room == null || _camera == null)
            return;
        var pos = _player.transform.position;
        // Permit doorway transitions, but recover falls below the authored room shell.
        if (float.IsNaN(pos.x) || float.IsNaN(pos.y) || float.IsInfinity(pos.x) || float.IsInfinity(pos.y) ||
            pos.x < -128f || pos.x > _room.width + 128f || pos.y < -128f || pos.y > _room.height + 256f)
        {
            _player.Defeat();
            pos = _player.transform.position;
        }
        var halfH = _camera.orthographicSize;
        var halfW = halfH * _camera.aspect;
        var x = Mathf.Clamp(pos.x, halfW, Mathf.Max(halfW, _room.width - halfW));
        var y = Mathf.Clamp(pos.y, halfH, Mathf.Max(halfH, _room.height - halfH));
        _camera.transform.position = new Vector3(x, y, -10f);
        if (_hud != null)
        {
            var abilities = string.Join(",", _player.Abilities);
            _hud.text = Victory
                ? "VICTORY"
                : $"{Pack.title}\nRoom {_room.id}  HP {_player.Health:0}\nAbilities: {(string.IsNullOrEmpty(abilities) ? "-" : abilities)}\nH: Heal ({_player.Inventory.Count("health_vial")})  I: Inventory  Esc: Title";
        }
    }

    public void ReturnToTitle()
    {
        if (_onTitle || Pack == null)
            return;
        if (GetComponent<AcceptanceDriver>() != null)
            return;
        _inventoryPanel?.Close();
        WriteSave();
        OpenTitleScreen();
    }

    /// <summary>
    /// Player-facing title. Not a door transition. Immediate teardown avoids duplicate players when Continue runs.
    /// </summary>
    public void OpenTitleScreen()
    {
        if (Pack == null)
            return;
        foreach (var pair in _roomCache)
        {
            if (pair.Value != null)
            {
                RetireRoom(pair.Value);
                DestroyImmediate(pair.Value.gameObject);
            }
        }
        _roomCache.Clear();
        _activeRoomRoot = null;
        if (_player != null)
        {
            foreach (var col in _player.GetComponentsInChildren<Collider2D>(true))
                col.enabled = false;
            DestroyImmediate(_player.gameObject);
            _player = null;
        }
        CurrentRoomId = null;
        _room = null;
        BuildTitle(Pack.startRoomId, Vector2.zero, null);
    }

    public bool TryClickTitleContinue()
    {
        var panel = GameObject.Find("TitlePanel");
        if (panel == null)
            return false;
        var btnTr = panel.transform.Find("Continue");
        var btn = btnTr != null ? btnTr.GetComponent<UnityEngine.UI.Button>() : null;
        if (btn == null)
            return false;
        btn.onClick.Invoke();
        return true;
    }

    private static bool ReadTitleReturn()
    {
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;
        if (kb != null && kb.escapeKey.wasPressedThisFrame)
            return true;
#endif
        return Input.GetKeyDown(KeyCode.Escape);
    }

    private void LoadRoom(string roomId, Vector2 spawn, bool absoluteSpawn)
    {
        if (!_rooms.TryGetValue(roomId, out var room))
            return;
        if (_loadingRoom)
        {
            MainThreadProbe.Record("room_load_reentrant", 0f, 0, CurrentRoomId + "->" + roomId);
            return;
        }
        var t0 = Time.realtimeSinceStartup;
        MainThreadProbe.RoomLoadMarker.Begin();
        _loadingRoom = true;
        var gc0 = System.GC.CollectionCount(0);
        float teardownMs = 0f, presentationMs = 0f, collidersMs = 0f, createMs = 0f, initMs = 0f;
        var cached = _roomCache.TryGetValue(roomId, out var existing) && existing != null;
        LastTransitionCached = cached;
        try
        {
            _onTitle = false;
            if (_titleReturnBtn != null && GetComponent<AcceptanceDriver>() == null)
                _titleReturnBtn.gameObject.SetActive(true);

            var tTeardown = Time.realtimeSinceStartup;
            if (_activeRoomRoot != null)
                RetireRoom(_activeRoomRoot);
            foreach (var leftover in FindObjectsByType<DoorSensor>(FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                if (leftover == null || SensorBelongsToCache(leftover.transform))
                    continue;
                leftover.enabled = false;
                foreach (var col in leftover.GetComponents<Collider2D>())
                    col.enabled = false;
                leftover.gameObject.SetActive(false);
                Destroy(leftover.gameObject);
            }
            Physics2D.SyncTransforms();
            teardownMs = (Time.realtimeSinceStartup - tTeardown) * 1000f;

            CurrentRoomId = roomId;
            _room = room;
            Boss = null;
            var feet = absoluteSpawn && spawn != Vector2.zero
                ? spawn
                : Coord.FromGodot(room.spawnX, room.spawnY, room.height);
            if (!absoluteSpawn && spawn != Vector2.zero)
                feet = spawn;

            if (cached)
            {
                var tInit = Time.realtimeSinceStartup;
                RestoreRoom(existing);
                _activeRoomRoot = existing;
                EnsurePlayer(room, feet);
                RestoreEnemy(room);
                RefreshBossArena(room);
                ClearCollectedPickup(room);
                RefreshGates();
                _spawn = feet;
                WriteSave();
                initMs = (Time.realtimeSinceStartup - tInit) * 1000f;
            }
            else
            {
                var root = new GameObject("Room_" + roomId).transform;
                root.SetParent(_worldRoot, false);
                _roomCache[roomId] = root;
                _activeRoomRoot = root;

                var tPres = Time.realtimeSinceStartup;
                BuildBackgrounds(room);
                PlaceRoomProps(room);
                PlaceAmbient(room);
                presentationMs = (Time.realtimeSinceStartup - tPres) * 1000f;

                var tCol = Time.realtimeSinceStartup;
                foreach (var solid in room.solids)
                    CreateSolid(solid, room);
                foreach (var flight in room.stairFlights ?? System.Array.Empty<GameplayStairFlight>())
                    AuthoredStairFlight.Create(flight, room.height, RoomParent, LoadSlicedSprite($"assets/tilesets/{room.biomeId}/floor.png", Vector4.zero));
                foreach (var door in room.doors)
                {
                    CreateDoor(door, room);
                    if (HasBoss(room)) CreateBossArenaLock(door, room);
                }
                foreach (var gate in room.gates)
                    CreateGate(gate, room);
                collidersMs = (Time.realtimeSinceStartup - tCol) * 1000f;

                var tCreate = Time.realtimeSinceStartup;
                foreach (var pickup in RoomPickups(room))
                    if (HasActor(pickup) && (_player == null || !_player.Abilities.Contains(pickup.id)))
                        CreatePickup(room, pickup);
                if (room.grappleAnchors != null)
                    foreach (var anchor in room.grappleAnchors)
                        CreateGrappleAnchor(room, anchor);
                foreach(var npc in room.npcs ?? System.Array.Empty<GameplayNpc>())
                    NpcActor.Create(npc, room.height, RoomParent, Pack.sprites, _streamingRoot, _npcDialogue);
                if (HasPoint(room.checkpoint))
                    CreateCheckpoint(room);
                if (room.victory)
                    CreateVictory(room);
                createMs = (Time.realtimeSinceStartup - tCreate) * 1000f;

                var tInit = Time.realtimeSinceStartup;
                EnsurePlayer(room, feet);
                if (HasActor(room.enemy) && !BossDefeated(room))
                    CreateEnemy(room);
                RefreshBossArena(room);
                _spawn = feet;
                WriteSave();
                initMs = (Time.realtimeSinceStartup - tInit) * 1000f;
            }

            LastRoomLoadMs = (Time.realtimeSinceStartup - t0) * 1000f;
            LastRoomLoadGc0 = System.GC.CollectionCount(0) - gc0;
            _ignoreDoorsUntil = Time.unscaledTime + 0.25f;
            LastTransitionJson = "{\"room\":\"" + roomId + "\",\"cached\":" + (cached ? "true" : "false") +
                                 ",\"teardownMs\":" + teardownMs.ToString("0.###") +
                                 ",\"presentationMs\":" + presentationMs.ToString("0.###") +
                                 ",\"collidersMs\":" + collidersMs.ToString("0.###") +
                                 ",\"createMs\":" + createMs.ToString("0.###") +
                                 ",\"initMs\":" + initMs.ToString("0.###") +
                                 ",\"totalMs\":" + LastRoomLoadMs.ToString("0.###") +
                                 ",\"gc0Delta\":" + LastRoomLoadGc0 + "}";
            TransitionLog.Add(LastTransitionJson);
            MainThreadProbe.RoomLoadMarker.End();
            MainThreadProbe.Record("room_load", LastRoomLoadMs, LastRoomLoadGc0,
                roomId + (cached ? " cached" : " build") + " " + LastTransitionJson.Replace("\"", "'"));
            Debug.Log("FOUNDRY_ROOM_LOAD id=" + roomId + " cached=" + cached + " ms=" + LastRoomLoadMs.ToString("0.0") +
                      " gc0=" + LastRoomLoadGc0 + " phases=" + LastTransitionJson);
        }
        finally
        {
            _loadingRoom = false;
        }
    }

    private static void RetireRoom(Transform root)
    {
        if (root == null)
            return;
        foreach (var sensor in root.GetComponentsInChildren<DoorSensor>(true))
            sensor.enabled = false;
        foreach (var col in root.GetComponentsInChildren<Collider2D>(true))
            col.enabled = false;
        root.gameObject.SetActive(false);
    }

    private static void RestoreRoom(Transform root)
    {
        if (root == null)
            return;
        root.gameObject.SetActive(true);
        foreach (var col in root.GetComponentsInChildren<Collider2D>(true))
            col.enabled = true;
        foreach (var sensor in root.GetComponentsInChildren<DoorSensor>(true))
            sensor.enabled = true;
        Physics2D.SyncTransforms();
    }

    private void RestoreEnemy(GameplayRoom room)
    {
        var existing = _activeRoomRoot != null ? _activeRoomRoot.GetComponentInChildren<EnemyActor>(true) : null;
        if (!HasActor(room.enemy) || BossDefeated(room))
        {
            if (existing != null)
            {
                foreach (var col in existing.GetComponentsInChildren<Collider2D>(true))
                    col.enabled = false;
                existing.gameObject.SetActive(false);
                Destroy(existing.gameObject);
            }
            return;
        }
        if (existing == null || existing.Dead)
        {
            if (existing != null) RetireRuntimeActor(existing.gameObject);
            CreateEnemy(room);
            return;
        }
        existing.ResetCombat(room.enemy.health > 0 ? room.enemy.health : 30f);
        existing.transform.position = Coord.FromGodot(room.enemy.x, room.enemy.y, room.height);
        existing.Bind(_player);
        Boss = existing.GetComponent<BossController>();
        Boss?.ResetEncounter(_player);
        existing.gameObject.SetActive(true);
    }

    private void ClearCollectedPickup(GameplayRoom room)
    {
        if (_activeRoomRoot == null || _player == null)
            return;
        foreach (var pickup in _activeRoomRoot.GetComponentsInChildren<AbilityPickup>(true))
        {
            if (!_player.Abilities.Contains(pickup.AbilityId))
                continue;
            foreach (var col in pickup.GetComponentsInChildren<Collider2D>(true))
                col.enabled = false;
            pickup.gameObject.SetActive(false);
            Destroy(pickup.gameObject);
        }
    }

    private bool SensorBelongsToCache(Transform t)
    {
        foreach (var pair in _roomCache)
        {
            if (pair.Value != null && t.IsChildOf(pair.Value))
                return true;
        }
        return false;
    }

    public int CachedRoomCount => _roomCache.Count;

    public int ActiveNamedRoomCount()
    {
        if (_worldRoot == null)
            return 0;
        var n = 0;
        foreach (Transform child in _worldRoot)
        {
            if (child != null && child.gameObject.activeSelf && child.name.StartsWith("Room_"))
                n++;
        }
        return n;
    }

    private void EnsurePlayer(GameplayRoom room, Vector2 feet)
    {
        if (_player == null)
        {
            var go = new GameObject("Player");
            go.layer = 7;
            var body = go.AddComponent<Rigidbody2D>();
            body.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
            go.AddComponent<BoxCollider2D>();
            var renderer = go.AddComponent<SpriteRenderer>();
            renderer.sortingOrder = 10;
            var sheet = go.AddComponent<SpriteSheetPlayer>();
            sheet.LoadClips(Pack.sprites, "player", _streamingRoot);
            _player = go.AddComponent<PlayerActor>();
            _player.Configure(Pack, sheet);
            _player.OnDied += () =>
            {
                MainThreadProbe.PlayerDeathMarker.Begin();
                var t0 = Time.realtimeSinceStartup;
                _player.Revive();
                _player.transform.position = _spawn;
                _player.GetComponent<Rigidbody2D>().linearVelocity = Vector2.zero;
                RespawnEnemy();
                WriteSave();
                LastRespawnMs = (Time.realtimeSinceStartup - t0) * 1000f;
                MainThreadProbe.PlayerDeathMarker.End();
                MainThreadProbe.Record("player_death_respawn", LastRespawnMs, 0,
                    "anchor=(" + _spawn.x.ToString("0.#") + "," + _spawn.y.ToString("0.#") + ") room=" + CurrentRoomId);
            };
            _player.OnAbilityUnlocked += _ => RefreshGates();
            _player.OnCheckpointHit += HandleCheckpoint;
            _player.OnInventoryChanged += WriteSave;
            _player.OnVictoryReached += () =>
            {
                if (HasBoss(_room) && !BossDefeated(_room)) return;
                Victory = true;
                WriteSave();
            };
        }
        _player.transform.position = feet;
        _player.GetComponent<Rigidbody2D>().linearVelocity = Vector2.zero;
        _player.GetComponent<SpriteSheetPlayer>().Play("idle", true);
    }

    private void CreateGrappleAnchor(GameplayRoom room, GameplayCheckpoint point)
    {
        if (point == null || float.IsNaN(point.x) || float.IsInfinity(point.x) ||
            float.IsNaN(point.y) || float.IsInfinity(point.y) ||
            point.x < 0 || point.x > room.width || point.y < 0 || point.y > room.height)
            return;
        var go = new GameObject("WraithAnchor");
        go.transform.SetParent(RoomParent, false);
        go.transform.position = Coord.FromGodot(point.x, point.y, room.height);
        go.AddComponent<WraithAnchor>();
    }

    private void CreateSolid(GameplayRect rect, GameplayRoom room)
    {
        var go = new GameObject(string.IsNullOrEmpty(rect.name) ? "Solid" : rect.name);
        go.transform.SetParent(RoomParent, false);
        go.transform.position = Coord.RectCenter(rect, room.height);
        var box = go.AddComponent<BoxCollider2D>();
        box.size = new Vector2(rect.width, rect.height);
        if (rect.oneWay)
        {
            var platform = go.AddComponent<PlatformEffector2D>();
            platform.useOneWay = true;
            platform.useOneWayGrouping = true;
            platform.surfaceArc = 170f;
            platform.useSideFriction = false;
            box.usedByEffector = true;
        }
        var body = go.AddComponent<Rigidbody2D>();
        body.bodyType = RigidbodyType2D.Static;
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sortingOrder = 1;
        var isWall = rect.height > rect.width * 1.35f;
        if (!string.IsNullOrEmpty(room.backgrounds?.interior) &&
            CastleTerrainPresentation.Apply(_streamingRoot, go.transform, rect, sr)) return;
        var rel = isWall
            ? $"assets/tilesets/{room.biomeId}/wall.png"
            : $"assets/tilesets/{room.biomeId}/floor.png";
        if (TerrainArtPresentation.Apply(_streamingRoot, rel, go.transform, rect, sr)) return;
        var border = isWall ? new Vector4(6f, 12f, 6f, 12f) : new Vector4(12f, 6f, 12f, 6f);
        var tile = LoadSlicedSprite(rel, border)
            ?? LoadSlicedSprite($"assets/tilesets/{room.biomeId}/source.png", new Vector4(16f, 16f, 16f, 16f));
        if (tile != null)
        {
            sr.sprite = tile;
            sr.drawMode = SpriteDrawMode.Tiled;
            sr.tileMode = SpriteTileMode.Continuous;
            sr.size = new Vector2(rect.width, rect.height);
            sr.color = Color.white;
        }
        else
        {
            // Opaque collision terrain must occlude decorative background floors.
            sr.color = new Color(0.22f, 0.2f, 0.18f, 1f);
            // Keep physics in authored world units even when a texture is missing.
            // Scaling this GameObject would multiply the already-sized BoxCollider2D.
            var fallbackTexture = Texture2D.whiteTexture;
            sr.sprite = Sprite.Create(fallbackTexture,
                new Rect(0, 0, fallbackTexture.width, fallbackTexture.height),
                new Vector2(0.5f, 0.5f), fallbackTexture.width, 0, SpriteMeshType.FullRect);
            sr.drawMode = SpriteDrawMode.Sliced;
            sr.size = new Vector2(rect.width, rect.height);
        }
    }

    private void CreateDoor(GameplayDoor door, GameplayRoom room)
    {
        var go = new GameObject($"Door_{door.direction}_{door.targetRoomId}");
        go.transform.SetParent(RoomParent, false);
        go.transform.position = Coord.FromGodot(door.x + door.width * 0.5f, door.y + door.height * 0.5f, room.height);
        var box = go.AddComponent<BoxCollider2D>();
        box.isTrigger = true;
        box.size = new Vector2(door.width, door.height);
        var body = go.AddComponent<Rigidbody2D>();
        body.bodyType = RigidbodyType2D.Kinematic;
        body.gravityScale = 0f;
        body.freezeRotation = true;
        var sensor = go.AddComponent<DoorSensor>();
        sensor.TargetRoomId = door.targetRoomId;
        sensor.SpawnSide = door.spawnSide;
        sensor.Requirements = door.requirements ?? new string[0];
        sensor.OnEnter += HandleDoor;
    }

    private void HandleDoor(DoorSensor sensor)
    {
        if (_player == null || sensor == null || _loadingRoom)
            return;
        if (Time.unscaledTime < _ignoreDoorsUntil)
            return;
        if (HasBoss(_room) && !BossDefeated(_room)) return;
        if (!string.IsNullOrEmpty(CurrentRoomId) && sensor.TargetRoomId == CurrentRoomId)
            return;
        foreach (var req in sensor.Requirements)
        {
            if (!string.IsNullOrEmpty(req) && !_player.Abilities.Contains(req))
                return;
        }
        if (!_rooms.TryGetValue(sensor.TargetRoomId, out var next))
            return;
        var spawn = ResolveDoorArrival(next, CurrentRoomId, sensor.SpawnSide);
        LoadRoom(sensor.TargetRoomId, spawn, true);
    }

    private static Vector2 ResolveDoorArrival(GameplayRoom next, string sourceRoomId, string spawnSide)
    {
        // Existing packs retain their ordinary entry convention.
        float x = next.spawnX, y = next.spawnY;
        switch (spawnSide)
        {
            case "left": x = 80f; y = next.floorTop; break;
            case "right": x = next.width - 80f; y = next.floorTop; break;
            case "top": x = next.width * 0.5f; y = 80f; break;
        }
        var direction = spawnSide == "top" ? "up" : spawnSide == "bottom" ? "down" : spawnSide;
        foreach (var door in next.doors ?? System.Array.Empty<GameplayDoor>())
        {
            if (door.spatial == null || !door.spatial.authored || door.targetRoomId != sourceRoomId || door.direction != direction) continue;
            if (spawnSide == "left" || spawnSide == "right")
            {
                x = spawnSide == "left" ? 112f : next.width - 112f;
                y = door.spatial.floorY;
            }
            else
            {
                x = Mathf.Min(next.width - 112f, door.x + 112f);
                if (spawnSide == "top") y = 120f;
                if (spawnSide == "bottom" && door.spatial.hasArrivalX &&
                    !float.IsNaN(door.spatial.arrivalX) && !float.IsInfinity(door.spatial.arrivalX) &&
                    door.spatial.arrivalX >= 112f && door.spatial.arrivalX <= next.width - 112f)
                    x = door.spatial.arrivalX;
            }
            break;
        }
        return Coord.FromGodot(x, y, next.height);
    }

    private void CreateGate(GameplayGate gate, GameplayRoom room)
    {
        if (_player != null && _player.Abilities.Contains(gate.requiredAbility))
            return;
        var go = new GameObject($"Gate_{gate.requiredAbility}");
        go.transform.SetParent(RoomParent, false);
        go.transform.position = Coord.FromGodot(gate.x + gate.width * 0.5f, gate.y + gate.height * 0.5f, room.height);
        var box = go.AddComponent<BoxCollider2D>();
        box.size = new Vector2(gate.width, gate.height);
        var body = go.AddComponent<Rigidbody2D>();
        body.bodyType = RigidbodyType2D.Static;
        var sr = go.AddComponent<SpriteRenderer>();
        var sprite = LoadStreamingSprite("assets/props/interact/gate.png", new Vector2(0.5f, 0.5f));
        sr.sortingOrder = 6;
        if (sprite != null)
            sr.sprite = sprite;
        else
        {
            SetFallbackProp(sr, new Vector2(gate.width, gate.height), new Vector2(0.5f, 0.5f), new Color(0.72f, 0.55f, 0.18f, 0.85f));
        }
        var blocker = go.AddComponent<GateBlocker>();
        blocker.RequiredAbility = gate.requiredAbility;
    }

    private void RefreshGates()
    {
        if (_room == null || _player == null)
            return;
        var root = _activeRoomRoot != null ? _activeRoomRoot : _worldRoot;
        if (root == null)
            return;
        foreach (var gate in root.GetComponentsInChildren<GateBlocker>(true))
        {
            if (gate == null || !_player.Abilities.Contains(gate.RequiredAbility))
                continue;
            foreach (var col in gate.GetComponentsInChildren<Collider2D>(true))
                col.enabled = false;
            gate.gameObject.SetActive(false);
            Destroy(gate.gameObject);
        }
    }

    private static IEnumerable<GameplayActor> RoomPickups(GameplayRoom room)
    {
        if (room.abilityPickups != null)
            return room.abilityPickups;
        return HasActor(room.abilityPickup) ? new[] { room.abilityPickup } : System.Array.Empty<GameplayActor>();
    }

    private void CreatePickup(GameplayRoom room, GameplayActor pickup)
    {
        var go = new GameObject($"Pickup_{pickup.id}");
        go.transform.SetParent(RoomParent, false);
        go.transform.position = Coord.FromGodot(pickup.x, pickup.y, room.height);
        go.tag = "Pickup";
        var box = go.AddComponent<BoxCollider2D>();
        box.isTrigger = true;
        box.size = new Vector2(24f, 24f);
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sortingOrder = 8;
        var sprite = LoadStreamingSprite("assets/props/interact/ability.png", new Vector2(0.5f, 0.5f));
        if (sprite != null)
            sr.sprite = sprite;
        else
        {
            SetFallbackProp(sr, new Vector2(18f, 18f), new Vector2(0.5f, 0.5f), new Color(1f, 0.82f, 0.28f, 1f));
        }
        go.AddComponent<AbilityPickup>().AbilityId = pickup.id;
        go.AddComponent<PickupBob>();
    }

    private void CreateCheckpoint(GameplayRoom room)
    {
        var go = new GameObject("Checkpoint");
        go.transform.SetParent(RoomParent, false);
        go.transform.position = Coord.FromGodot(room.checkpoint.x, room.checkpoint.y, room.height);
        go.tag = "Checkpoint";
        var box = go.AddComponent<BoxCollider2D>();
        box.isTrigger = true;
        box.size = new Vector2(28f, 48f);
        box.offset = new Vector2(0f, 24f);
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sortingOrder = 7;
        GameplaySpriteClip presentation = null;
        foreach (var clip in Pack.sprites ?? System.Array.Empty<GameplaySpriteClip>())
            if (clip != null && clip.ownerId == "checkpoint" && clip.clip == "idle") { presentation = clip; break; }
        var sprite = presentation == null
            ? LoadStreamingSprite("assets/props/interact/save_shrine.png", new Vector2(0.5f, 0f))
            : StreamingArtCache.GetSprite(_streamingRoot, presentation.relativePath,
                new Vector2(presentation.pivotX, presentation.pivotY), presentation.pixelsPerUnit,
                presentation.smoothFiltering ? FilterMode.Bilinear : FilterMode.Point);
        if (sprite != null)
            sr.sprite = sprite;
        else
        {
            SetFallbackProp(sr, new Vector2(12f, 40f), new Vector2(0.5f, 0f), new Color(0.35f, 0.75f, 1f, 0.9f));
        }
        var pulse = go.AddComponent<CheckpointPulse>();
        pulse.AuthoredRoomId = room.id;
    }

    private static bool HasBoss(GameplayRoom room) => room != null && room.enemy != null && room.enemy.isBoss;
    public bool BossDefeated(GameplayRoom room) => HasBoss(room) && _defeatedBosses.Contains(room.enemy.id);

    private void RestoreBossProgress(string[] ids)
    {
        _defeatedBosses.Clear();
        foreach (var id in ids ?? new string[0])
            foreach (var room in Pack.rooms)
                if (HasBoss(room) && room.enemy.id == id) { _defeatedBosses.Add(id); break; }
    }

    private string[] CaptureBossProgress()
    {
        var ids = new List<string>(_defeatedBosses);
        ids.Sort(System.StringComparer.Ordinal);
        return ids.ToArray();
    }

    private void CreateBossArenaLock(GameplayDoor door, GameplayRoom room)
    {
        var go = new GameObject("BossArenaLock");
        go.transform.SetParent(RoomParent, false);
        go.transform.position = Coord.FromGodot(door.x + door.width * 0.5f, door.y + door.height * 0.5f, room.height);
        go.AddComponent<BoxCollider2D>().size = new Vector2(door.width, door.height);
        go.AddComponent<BossArenaLock>();
        var visual = new GameObject("Seal");
        visual.transform.SetParent(go.transform, false);
        var renderer = visual.AddComponent<SpriteRenderer>();
        renderer.sortingOrder = 8;
        renderer.sprite = LoadStreamingSprite("assets/props/interact/gate.png", new Vector2(0.5f, 0.5f));
        if (renderer.sprite == null)
            renderer.sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f), 4f);
        var size = renderer.sprite.bounds.size;
        visual.transform.localScale = new Vector3(door.width / size.x, door.height / size.y, 1f);
        renderer.color = new Color(0.35f, 0.9f, 1f, 0.8f);
    }

    private void RefreshBossArena(GameplayRoom room)
    {
        if (RoomParent == null) return;
        var blocked = HasBoss(room) && !BossDefeated(room);
        foreach (var seal in RoomParent.GetComponentsInChildren<BossArenaLock>(true))
            seal.gameObject.SetActive(blocked);
        var victory = RoomParent.Find("Victory");
        if (victory != null)
        {
            victory.GetComponent<BoxCollider2D>().enabled = !blocked;
            victory.GetComponent<SpriteRenderer>().enabled = !blocked;
        }
    }

    private void CreateVictory(GameplayRoom room)
    {
        var go = new GameObject("Victory");
        go.transform.SetParent(RoomParent, false);
        go.transform.position = Coord.FromGodot(room.width * 0.5f, room.floorTop - 40f, room.height);
        go.tag = "Victory";
        var box = go.AddComponent<BoxCollider2D>();
        box.isTrigger = true;
        box.size = new Vector2(48f, 48f);
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sortingOrder = 7;
        GameplaySpriteClip presentation = null;
        foreach (var clip in Pack.sprites ?? System.Array.Empty<GameplaySpriteClip>())
            if (clip != null && clip.ownerId == "victory" && clip.clip == "idle") { presentation = clip; break; }
        var sprite = presentation == null
            ? LoadStreamingSprite("assets/props/interact/pickup.png", new Vector2(0.5f, 0.5f))
            : StreamingArtCache.GetSprite(_streamingRoot, presentation.relativePath,
                new Vector2(presentation.pivotX, presentation.pivotY), presentation.pixelsPerUnit,
                presentation.smoothFiltering ? FilterMode.Bilinear : FilterMode.Point);
        if (presentation != null && sprite != null)
        {
            go.transform.position = Coord.FromGodot(room.width * 0.5f, room.floorTop, room.height);
            box.offset = new Vector2(0f, 24f);
        }
        if (sprite != null)
            sr.sprite = sprite;
        else
        {
            SetFallbackProp(sr, new Vector2(36f, 36f), new Vector2(0.5f, 0.5f), new Color(0.45f, 0.9f, 0.4f, 0.9f));
        }
    }

    private static void SetFallbackProp(SpriteRenderer renderer, Vector2 size, Vector2 pivot, Color color)
    {
        // Size the renderer, never the collider's transform. FullRect supports slicing
        // without changing the authored pickup/checkpoint/gate interaction footprint.
        var texture = Texture2D.whiteTexture;
        renderer.sprite = Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height), pivot,
            texture.width, 0, SpriteMeshType.FullRect);
        renderer.color = color;
        renderer.drawMode = SpriteDrawMode.Sliced;
        renderer.size = size;
    }

    private void HandleCheckpoint(Collider2D other)
    {
        var pulse = other != null
            ? other.GetComponent<CheckpointPulse>() ?? other.GetComponentInParent<CheckpointPulse>()
            : null;
        var authored = pulse != null ? pulse.AuthoredRoomId : "";
        var obj = other != null ? other.gameObject.name : "";
        var parent = other != null && other.transform.parent != null ? other.transform.parent.name : "";
        var pos = other != null ? other.transform.position : Vector3.zero;
        var playerCol = _player != null ? "PlayerActor.body" : "";
        var extra = "obj=" + obj + " parent=" + parent + " authored=" + authored +
                    " current=" + CurrentRoomId + " col=(" + pos.x.ToString("0.#") + "," + pos.y.ToString("0.#") +
                    ") player=" + playerCol;
        if (other == null || !other.gameObject.activeInHierarchy || authored != CurrentRoomId)
        {
            MainThreadProbe.Record("checkpoint_ignored", 0f, 0, extra);
            return;
        }
        if (_player != null)
            _spawn = _player.transform.position;
        WriteSave();
        MainThreadProbe.Record("checkpoint", 0f, 0,
            extra + " anchor=(" + _spawn.x.ToString("0.#") + "," + _spawn.y.ToString("0.#") + ")");
    }

    private void CreateEnemy(GameplayRoom room)
    {
        MainThreadProbe.EnemySpawnMarker.Begin();
        var t0 = Time.realtimeSinceStartup;
        var spec = room.enemy;
        var go = new GameObject(spec.id);
        go.transform.SetParent(RoomParent, false);
        go.transform.position = Coord.FromGodot(spec.x, spec.y, room.height);
        go.AddComponent<Rigidbody2D>().freezeRotation = true;
        go.AddComponent<BoxCollider2D>();
        go.AddComponent<SpriteRenderer>().sortingOrder = 9;
        var sheet = go.AddComponent<SpriteSheetPlayer>();
        sheet.LoadClips(Pack.sprites, spec.id, _streamingRoot);
        var enemy = go.AddComponent<EnemyActor>();
        enemy.EnemyId = spec.id;
        enemy.OnDefeated = defeated =>
        {
            if (spec.isBoss)
            {
                if (_defeatedBosses.Add(spec.id)) BossDefeatCount++;
                RefreshBossArena(room);
                WriteSave();
            }
            else _loot?.Spawn(defeated, WriteSave);
        };
        enemy.ConfigureMovement(spec.movement);
        enemy.Health = spec.health > 0 ? spec.health : 30f;
        enemy.Damage = spec.damage > 0 ? spec.damage : 8f;
        enemy.ConfigureAttack(spec.attackWindupSeconds, spec.attackRecoverySeconds, spec.attackCooldownSeconds);
        enemy.Bind(_player);
        if (spec.isBoss)
        {
            Boss = go.AddComponent<BossController>();
            Boss.Configure(enemy, spec, _player, room.width);
            Boss.OnPhaseChanged = _ => BossPhaseChangeCount++;
            Boss.OnAttackExecuted = () => BossAttackCount++;
        }
        sheet.Play("idle");
        LastCreateEnemyMs = (Time.realtimeSinceStartup - t0) * 1000f;
        MainThreadProbe.EnemySpawnMarker.End();
        MainThreadProbe.Record("enemy_spawn", LastCreateEnemyMs, 0, spec.id);
    }

    private void RespawnEnemy()
    {
        MainThreadProbe.RespawnMarker.Begin();
        var t0 = Time.realtimeSinceStartup;
        if (_room == null || !HasActor(_room.enemy) || BossDefeated(_room))
        {
            MainThreadProbe.RespawnMarker.End();
            return;
        }
        var existing = FindFirstObjectByType<EnemyActor>();
        if (existing != null)
            RetireRuntimeActor(existing.gameObject);
        CreateEnemy(_room);
        RefreshBossArena(_room);
        MainThreadProbe.RespawnMarker.End();
        MainThreadProbe.Record("enemy_respawn", (Time.realtimeSinceStartup - t0) * 1000f, 0, CurrentRoomId);
    }

    private void RetireRuntimeActor(GameObject actor)
    {
        // Death can arrive from a physics contact. Immediately disable and detach
        // the old actor so queries see only its replacement; defer its destruction.
        actor.SetActive(false);
        actor.transform.SetParent(null, false);
        Destroy(actor);
    }

    private void BuildBackgrounds(GameplayRoom room)
    {
        if (!string.IsNullOrEmpty(room.backgrounds.interior))
        {
            var plate = StreamingArtCache.GetSprite(_streamingRoot, room.backgrounds.interior,
                new Vector2(0.5f, 0.5f), 1f, FilterMode.Bilinear);
            if (plate != null)
            {
                var go = new GameObject("CastleInterior");
                go.transform.SetParent(RoomParent, false);
                go.transform.position = new Vector3(room.width * 0.5f, room.height * 0.5f, 0f);
                var cover = Mathf.Max(room.width / plate.rect.width, room.height / plate.rect.height);
                go.transform.localScale = new Vector3(cover, cover, 1f);
                var renderer = go.AddComponent<SpriteRenderer>();
                renderer.sprite = plate;
                renderer.sortingOrder = -80;
                var tint = room.backgrounds.interiorTint;
                renderer.color = tint != null && tint.Length == 4
                    ? new Color(tint[0], tint[1], tint[2], tint[3]) : Color.white;
                return;
            }
        }
        CreateBg(room.backgrounds.far, room, -80, "far");
        CreateBg(room.backgrounds.mid, room, -40, "mid");
        CreateBg(room.backgrounds.near, room, -20, "near");
        CreateBg(room.backgrounds.foreground, room, 6, "foreground");
        CreatePlayfieldScrim(room);
    }

    private void CreatePlayfieldScrim(GameplayRoom room)
    {
        var go = new GameObject("PlayfieldScrim");
        go.transform.SetParent(RoomParent, false);
        go.transform.position = new Vector3(room.width * 0.5f, room.height * 0.5f, 0f);
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f), 4f, 0, SpriteMeshType.FullRect);
        sr.color = new Color(0.05f, 0.04f, 0.04f, 0.42f);
        sr.sortingOrder = -8;
        go.transform.localScale = new Vector3(room.width, room.height, 1f);
    }

    private void CreateBg(string rel, GameplayRoom room, int sorting, string layer)
    {
        if (string.IsNullOrEmpty(rel))
            return;
        var tex = StreamingArtCache.GetTexture(_streamingRoot, rel, FilterMode.Bilinear, TextureWrapMode.Clamp);
        if (tex == null)
            return;
        var biome = string.IsNullOrEmpty(room.biomeId) ? "biome_0" : room.biomeId;
        var cover = Mathf.Max(room.width / tex.width, room.height / tex.height);
        var scale = cover;
        var tint = Color.white;
        var pivot = new Vector2(0.5f, 0.5f);
        var pos = new Vector3(room.width * 0.5f, room.height * 0.5f, 0f);
        if (layer == "far")
        {
            scale = cover * 1.02f;
            tint = new Color(0.58f, 0.55f, 0.52f, 1f);
        }
        else if (layer == "mid")
        {
            tint = new Color(0.64f, 0.61f, 0.58f, 1f);
            if (biome == "biome_2")
            {
                scale = 0.34f;
                pivot = new Vector2(0.5f, 0f);
                pos = new Vector3(room.width * 0.5f, Coord.FromGodot(0f, room.floorTop, room.height).y - 20f, 0f);
            }
            else if (biome == "biome_0")
            {
                scale = 0.46f;
                pos = new Vector3(room.width * 0.55f, room.height * 0.56f, 0f);
            }
            else
            {
                scale = 0.44f;
                pos = new Vector3(room.width * 0.5f, room.height * 0.48f, 0f);
            }
        }
        else if (layer == "near" || layer == "foreground")
        {
            if (biome == "biome_2")
            {
                scale = 0.15f;
                pos = new Vector3(room.width * 0.16f, Coord.FromGodot(0f, room.floorTop, room.height).y - 40f, 0f);
                pivot = new Vector2(0.5f, 0f);
            }
            else
            {
                scale = 0.24f;
                pos = new Vector3(room.width * 0.2f, Coord.FromGodot(0f, room.floorTop, room.height).y - 28f, 0f);
                pivot = new Vector2(0.5f, 0f);
            }
            tint = new Color(0.82f, 0.8f, 0.76f, 1f);
        }
        var sprite = StreamingArtCache.GetSprite(_streamingRoot, rel, pivot, 1f, FilterMode.Bilinear);
        if (sprite == null)
            return;
        var go = new GameObject(Path.GetFileNameWithoutExtension(rel));
        go.transform.SetParent(RoomParent, false);
        go.transform.position = pos;
        go.transform.localScale = new Vector3(scale, scale, 1f);
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sprite = sprite;
        sr.sortingOrder = sorting;
        sr.color = tint;
        if (layer == "far" && room.backgrounds.farCameraRelative)
            go.AddComponent<CameraBackgroundLayer>().Configure(_camera, new Vector2(room.width * 0.5f, room.height * 0.5f), room.backgrounds.farParallax);
        if (layer == "near" && biome != "biome_2")
        {
            var right = Instantiate(go, RoomParent);
            right.name = go.name + "_Right";
            right.transform.position = new Vector3(room.width * 0.82f, pos.y, 0f);
            var rightSr = right.GetComponent<SpriteRenderer>();
            if (rightSr != null)
                rightSr.flipX = true;
        }
        if (layer == "near" && biome == "biome_2")
        {
            var right = Instantiate(go, RoomParent);
            right.name = go.name + "_Right";
            right.transform.position = new Vector3(room.width * 0.86f, pos.y, 0f);
            var rightSr = right.GetComponent<SpriteRenderer>();
            if (rightSr != null)
                rightSr.flipX = true;
        }
    }

    private void PlaceRoomProps(GameplayRoom room)
    {
        // Null preserves legacy packs. An explicit empty list means all requests were omitted.
        if (room.furnishings != null)
        {
            foreach(var item in room.furnishings)
            {
                if(item == null || item.collision != "none" || item.width <= 0 || item.height <= 0)
                    continue;
                var sprite = LoadStreamingSprite(item.asset, new Vector2(0.5f, 0f));
                if(sprite == null) { Debug.LogWarning("FOUNDRY_FURNISHING_OMITTED artwork-unavailable " + item.id); continue; }
                var go = new GameObject(item.id);
                go.transform.SetParent(RoomParent, false);
                go.transform.position = Coord.FromGodot(item.x, item.floorY, room.height);
                go.transform.localScale = new Vector3(item.width / sprite.rect.width, item.height / sprite.rect.height, 1f);
                var sr = go.AddComponent<SpriteRenderer>();
                sr.sprite = sprite;
                sr.sortingOrder = item.layer == "rear" ? -1 : 3;
                // Furniture adds no Collider2D; reward/support collision remains separate.
                Debug.Log("FOUNDRY_FURNISHING_PLACED " + item.id + " anchor=" + item.anchor);
            }
            foreach(var omission in room.furnishingOmissions ?? new GameplayFurnishingOmission[0])
                Debug.Log("FOUNDRY_FURNISHING_OMITTED " + omission.id + " reason=" + omission.reason);
            return;
        }
        var biome = string.IsNullOrEmpty(room.biomeId) ? "biome_0" : room.biomeId;
        var xs = new[] { 0.22f, 0.44f, 0.66f, 0.84f };
        for (var i = 0; i < 4; i++)
        {
            var rel = $"assets/props/{biome}/{biome}_prop_{i}.png";
            var sprite = LoadStreamingSprite(rel, new Vector2(0.5f, 0f));
            if (sprite == null)
                continue;
            var go = new GameObject($"Prop_{biome}_{i}");
            go.transform.SetParent(RoomParent, false);
            go.transform.position = Coord.FromGodot(room.width * xs[i], room.floorTop, room.height);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.sortingOrder = 3;
            var propScale = biome == "biome_2" && i == 3 ? 0.55f : 0.85f;
            go.transform.localScale = new Vector3(propScale, propScale, 1f);
        }
        var hangRel = biome == "biome_2"
            ? $"assets/props/{biome}/{biome}_prop_2.png"
            : $"assets/props/{biome}/{biome}_prop_3.png";
        var hang = LoadStreamingSprite(hangRel, new Vector2(0.5f, 1f));
        if (hang != null)
        {
            var fg = new GameObject($"Foreground_{biome}");
            fg.transform.SetParent(RoomParent, false);
            fg.transform.position = Coord.FromGodot(room.width * 0.08f, room.floorTop - 180f, room.height);
            var sr = fg.AddComponent<SpriteRenderer>();
            sr.sprite = hang;
            sr.sortingOrder = 4;
            sr.color = new Color(0.78f, 0.76f, 0.72f, 1f);
            fg.transform.localScale = new Vector3(0.7f, 0.7f, 1f);
        }
    }

    private void PlaceAmbient(GameplayRoom room)
    {
        var biome = string.IsNullOrEmpty(room.biomeId) ? "biome_0" : room.biomeId;
        var floor = Coord.FromGodot(room.width * 0.5f, room.floorTop, room.height);
        if (biome == "biome_0")
        {
            var moltenA = AmbientLoop.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_molten.png",
                Coord.FromGodot(room.width * 0.38f, room.floorTop + 2f, room.height), 2, 160, 48, 8f, new Vector2(0.5f, 0.5f));
            var moltenB = AmbientLoop.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_molten.png",
                Coord.FromGodot(room.width * 0.72f, room.floorTop + 2f, room.height), 2, 160, 48, 8f, new Vector2(0.5f, 0.5f));
            if (moltenA != null) moltenA.transform.localScale = new Vector3(0.5f, 0.2f, 1f);
            if (moltenB != null) moltenB.transform.localScale = new Vector3(0.5f, 0.2f, 1f);
            SteamPlume.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_steam.png",
                Coord.FromGodot(room.width * 0.3f, room.floorTop - 90f, room.height), 3, 64, 96);
            SteamPlume.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_steam.png",
                Coord.FromGodot(room.width * 0.7f, room.floorTop - 70f, room.height), 3, 64, 96);
        }
        else if (biome == "biome_1")
        {
            SteamPlume.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_steam.png",
                Coord.FromGodot(room.width * 0.24f, room.floorTop - 80f, room.height), 3, 64, 96);
            SteamPlume.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_steam.png",
                Coord.FromGodot(room.width * 0.78f, room.floorTop - 110f, room.height), 3, 64, 96);
            AmbientLoop.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_drip.png",
                Coord.FromGodot(room.width * 0.4f, room.floorTop - 160f, room.height), 5, 24, 48, 5f, new Vector2(0.5f, 1f));
            AmbientLoop.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_drip.png",
                Coord.FromGodot(room.width * 0.62f, room.floorTop - 130f, room.height), 5, 24, 48, 6f, new Vector2(0.5f, 1f));
        }
        else
        {
            var fernA = AmbientLoop.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_sway.png",
                Coord.FromGodot(room.width * 0.2f, room.floorTop, room.height), 4, 96, 64, 4f, new Vector2(0.5f, 0f));
            var fernB = AmbientLoop.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_sway.png",
                Coord.FromGodot(room.width * 0.81f, room.floorTop, room.height), 4, 96, 64, 3.5f, new Vector2(0.5f, 0f));
            if (fernA != null) fernA.transform.localScale = new Vector3(0.65f, 0.65f, 1f);
            if (fernB != null) fernB.transform.localScale = new Vector3(0.6f, 0.6f, 1f);
            SteamPlume.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_steam.png",
                Coord.FromGodot(room.width * 0.32f, room.floorTop - 36f, room.height), 4, 64, 96);
            SteamPlume.Spawn(RoomParent, _streamingRoot, "assets/vfx/ambient_steam.png",
                Coord.FromGodot(room.width * 0.48f, room.floorTop - 64f, room.height), 4, 64, 96);
        }
        var moteSprite = LoadStreamingSprite("assets/vfx/hit.png", new Vector2(0.5f, 0.5f));
        DriftingMotes.Spawn(RoomParent, floor + new Vector2(0f, 40f), moteSprite, 5, 160f);
    }

    private static bool HasActor(GameplayActor actor)
    {
        return actor != null && !string.IsNullOrEmpty(actor.id);
    }

    private static bool HasPoint(GameplayCheckpoint point)
    {
        return point != null && (point.x != 0f || point.y != 0f);
    }

    /// <summary>
    /// Dumps on-screen button rectangles and HUD state for standalone UI smoke.
    /// Does not invoke save/load. Not used as combat or progression evidence.
    /// </summary>
    private void WriteUiLayout()
    {
        if (AcceptanceDriver.RequestedFromCommandLine())
            return;
        if (Time.unscaledTime - _layoutAt < 0.2f)
            return;
        _layoutAt = Time.unscaledTime;
        var abilities = _player != null ? string.Join(",", _player.Abilities) : "";
        var hud = _hud != null ? _hud.text : "";
        var sig = (_onTitle ? "title" : "play") + "|" + (CurrentRoomId ?? "") + "|" + abilities + "|" + Screen.width + "x" + Screen.height;
        var sb = new StringBuilder();
        sb.Append("{\n");
        sb.Append("  \"screenWidth\": ").Append(Screen.width).Append(",\n");
        sb.Append("  \"screenHeight\": ").Append(Screen.height).Append(",\n");
        sb.Append("  \"fullScreen\": ").Append(Screen.fullScreen ? "true" : "false").Append(",\n");
        sb.Append("  \"onTitle\": ").Append(_onTitle ? "true" : "false").Append(",\n");
        sb.Append("  \"roomId\": \"").Append(CurrentRoomId ?? "").Append("\",\n");
        sb.Append("  \"abilities\": \"").Append(abilities.Replace("\"", "")).Append("\",\n");
        sb.Append("  \"victory\": ").Append(Victory ? "true" : "false").Append(",\n");
        sb.Append("  \"playerHp\": ").Append(_player != null ? _player.Health.ToString("0.##") : "0").Append(",\n");
        sb.Append("  \"playerX\": ").Append(_player != null ? _player.transform.position.x.ToString("0.##") : "0").Append(",\n");
        sb.Append("  \"playerY\": ").Append(_player != null ? _player.transform.position.y.ToString("0.##") : "0").Append(",\n");
        sb.Append("  \"hudText\": \"").Append((hud ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n")).Append("\",\n");
        sb.Append("  \"persistentDataPath\": \"").Append((Application.persistentDataPath ?? "").Replace("\\", "\\\\")).Append("\",\n");
        sb.Append("  \"savePath\": \"").Append((_savePath ?? "").Replace("\\", "\\\\")).Append("\",\n");
        sb.Append("  \"buttons\": [\n");
        var first = true;
        foreach (var btn in UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None))
        {
            if (btn == null || !btn.isActiveAndEnabled)
                continue;
            var rt = btn.GetComponent<RectTransform>();
            if (rt == null)
                continue;
            var corners = new Vector3[4];
            rt.GetWorldCorners(corners);
            var minX = corners[0].x;
            var maxX = corners[0].x;
            var minY = corners[0].y;
            var maxY = corners[0].y;
            for (var i = 1; i < 4; i++)
            {
                minX = Mathf.Min(minX, corners[i].x);
                maxX = Mathf.Max(maxX, corners[i].x);
                minY = Mathf.Min(minY, corners[i].y);
                maxY = Mathf.Max(maxY, corners[i].y);
            }
            var cx = (minX + maxX) * 0.5f;
            var cy = (minY + maxY) * 0.5f;
            if (!first)
                sb.Append(",\n");
            first = false;
            sb.Append("    {\"name\": \"").Append(btn.gameObject.name.Replace("\"", "")).Append("\"");
            sb.Append(", \"x\": ").Append(cx.ToString("0.##"));
            sb.Append(", \"y\": ").Append(cy.ToString("0.##"));
            sb.Append(", \"minX\": ").Append(minX.ToString("0.##"));
            sb.Append(", \"maxX\": ").Append(maxX.ToString("0.##"));
            sb.Append(", \"minY\": ").Append(minY.ToString("0.##"));
            sb.Append(", \"maxY\": ").Append(maxY.ToString("0.##"));
            sb.Append(", \"w\": ").Append((maxX - minX).ToString("0.##"));
            sb.Append(", \"h\": ").Append((maxY - minY).ToString("0.##"));
            sb.Append(", \"normX\": ").Append(Screen.width > 0 ? (cx / Screen.width).ToString("0.####") : "0");
            sb.Append(", \"normYFromTop\": ").Append(Screen.height > 0 ? ((Screen.height - cy) / Screen.height).ToString("0.####") : "0");
            sb.Append("}");
        }
        sb.Append("\n  ]\n}\n");
        var json = sb.ToString();
        try
        {
            var diagnosticRoot = Path.GetDirectoryName(_savePath);
            if (!string.IsNullOrEmpty(diagnosticRoot))
                File.WriteAllText(Path.Combine(diagnosticRoot, "ui-layout.json"), json);
        }
        catch (System.Exception)
        {
            // Layout dump is diagnostic only.
        }
        if (sig != _layoutSig)
        {
            _layoutSig = sig;
        }
    }

    private void WriteSave()
    {
        if (_restoringSave || _player == null || _room == null)
            return;
        MainThreadProbe.SaveMarker.Begin();
        var t0 = Time.realtimeSinceStartup;
        var blob = new SaveBlob
        {
            roomId = CurrentRoomId,
            x = _player.transform.position.x,
            y = _player.transform.position.y,
            abilities = string.Join(",", _player.Abilities),
            victory = Victory,
            defeatedBosses = CaptureBossProgress(),
            inventory = _player.Inventory.Capture(),
        };
        File.WriteAllText(_savePath, JsonUtility.ToJson(blob));
        LastWriteSaveMs = (Time.realtimeSinceStartup - t0) * 1000f;
        MainThreadProbe.SaveMarker.End();
        if (LastWriteSaveMs >= 2f)
            MainThreadProbe.Record("write_save", LastWriteSaveMs, 0, CurrentRoomId);
    }

    [System.Serializable]
    private class SaveBlob
    {
        public string roomId;
        public float x;
        public float y;
        public string abilities;
        public bool victory;
        public string[] defeatedBosses;
        public InventorySave inventory;
    }
}
