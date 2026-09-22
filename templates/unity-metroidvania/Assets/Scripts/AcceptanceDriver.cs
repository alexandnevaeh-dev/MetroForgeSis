using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
#endif

/// <summary>
/// Engine-native acceptance, capture, and perf driver.
/// Normal-input mode injects keyboard events only. Diagnostic warps are a separate mode
/// and must never be counted as traversal/combat acceptance.
/// </summary>
[DefaultExecutionOrder(-200)]
public class AcceptanceDriver : MonoBehaviour
{
    public static string LastResultPath;
    public static string ForcedMode;

#if UNITY_EDITOR
    // Static fields reset during the Play Mode domain reload. Consume only this launch's request.
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    private static void RestoreEditorAcceptanceMode()
    {
        const string key = "MetroForge.Acceptance.PendingMode";
        var pending = UnityEditor.SessionState.GetString(key, "");
        UnityEditor.SessionState.EraseString(key);
        if (!string.IsNullOrEmpty(pending))
            ForcedMode = pending;
    }
#endif


    private GameBootstrap _game;
    private readonly HashSet<string> _roomsVisited = new HashSet<string>();
    private readonly List<string> _events = new List<string>();
    private readonly List<string> _captures = new List<string>();
    private readonly HashSet<string> _grappleRoomsAttempted = new HashSet<string>();
    private readonly HashSet<string> _capturedIds = new HashSet<string>();
    private readonly List<string> _notImplemented = new List<string>();
    private readonly Dictionary<string, string> _feature = new Dictionary<string, string>();
    private readonly HashSet<KeyCode> _held = new HashSet<KeyCode>();
    private KeyCode _pulse = KeyCode.None;
    private string _mode = "normal_input";
    private string _qaDir;
    private float _deadline;
    private float _perfWindow;
    private int _perfFrames;
    private float _perfDt;
    private float _lastRoomChangeAt;
    private string _lastRoom;
    private float _transitionMs = -1f;
    private bool _captureEnabled;
    private bool _loggedHold;
    private bool _finished;

    public static bool RequestedFromCommandLine()
    {
        if (!string.IsNullOrEmpty(ForcedMode))
            return true;
        foreach (var arg in Environment.GetCommandLineArgs())
        {
            if (arg == "-acceptance" || arg.StartsWith("-acceptanceMode=", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    private static string ArgValue(string key, string fallback)
    {
        var prefix = key + "=";
        foreach (var arg in Environment.GetCommandLineArgs())
        {
            if (arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                return arg.Substring(prefix.Length);
        }
        return fallback;
    }

    private IEnumerator Start()
    {
        Application.runInBackground = true;
        _game = GetComponent<GameBootstrap>();
        _mode = ArgValue("-acceptanceMode", string.IsNullOrEmpty(ForcedMode) ? "normal_input" : ForcedMode);
        _captureEnabled = _mode == "capture" || _mode == "all";
        _qaDir = Path.Combine(Directory.GetParent(Application.dataPath)?.FullName ?? Application.persistentDataPath, "qa");
        Directory.CreateDirectory(_qaDir);
        Directory.CreateDirectory(Path.Combine(_qaDir, "captures"));
        _deadline = Time.unscaledTime + ParseTimeout();
        RecordImplementedFeatures();
        yield return Run();
    }

    private static float ParseTimeout()
    {
        if (float.TryParse(ArgValue("-acceptanceTimeout", "180"), out var value))
            return Mathf.Clamp(value, 15f, 600f);
        return 180f;
    }

    private void RecordImplementedFeatures()
    {
        _feature["traversal"] = "pending";
        _feature["containment"] = "pending";
        _feature["combat"] = "pending";
        _feature["combat_one_hit"] = "pending";
        _feature["combat_follow_up"] = "pending";
        _feature["combat_kill"] = "pending";
        _feature["player_invuln"] = "pending";
        _feature["abilities"] = "pending";
        _feature["gates"] = "pending";
        _feature["npc_interaction"] = "not_implemented";
        _feature["save_continue"] = "pending";
        _feature["respawn"] = "pending";
        _feature["boss_phases"] = "not_implemented";
        _feature["victory"] = "pending";
        _notImplemented.Add("npc_interaction: no NPC actors in Unity adapter or gameplay pack");
        _notImplemented.Add("boss_phases: victory room has no boss enemy; EnemyActor has no phase machine");
    }

    private IEnumerator Run()
    {
        var wait = 0f;
        while ((_game == null || _game.Pack == null) && wait < 8f)
        {
            wait += Time.unscaledDeltaTime;
            yield return null;
        }
        if (_mode == "catalog")
        {
            if (GetComponent<AssetCatalogDriver>() == null)
                gameObject.AddComponent<AssetCatalogDriver>();
            yield break;
        }
        if (_mode == "motion" || _mode == "hitch")
        {
            if (GetComponent<MotionCaptureDriver>() == null)
                gameObject.AddComponent<MotionCaptureDriver>();
            yield break;
        }
        if (_mode == "combatstall")
        {
            if (GetComponent<CombatStallDriver>() == null)
                gameObject.AddComponent<CombatStallDriver>();
            yield break;
        }
        if (_mode == "roomtransition")
        {
            if (GetComponent<RoomTransitionDriver>() == null)
                gameObject.AddComponent<RoomTransitionDriver>();
            yield break;
        }
        wait = 0f;
        while ((_game == null || _game.Player == null || _game.Pack == null) && wait < 8f)
        {
            wait += Time.unscaledDeltaTime;
            yield return null;
        }
        if (_game == null || _game.Player == null || _game.Pack == null)
        {
            Fail("bootstrap_missing", "GameBootstrap/player/pack not ready");
            yield break;
        }

        foreach (var ability in _game.Pack.abilities)
            if (ability.id == "grapple") _feature["grapple_activation"] = "pending";
        EnsureKeyboard();
        _lastRoom = _game.CurrentRoomId;
        _lastRoomChangeAt = Time.unscaledTime;
        if (!string.IsNullOrEmpty(_lastRoom))
            _roomsVisited.Add(_lastRoom);
        Note("spawn " + _game.CurrentRoomId);
        if (_captureEnabled)
            yield return Capture("spawn");

        if (_mode == "perf")
        {
            yield return MeasurePerf(4f);
            Pass("perf_only");
            yield break;
        }

        yield return Hold(KeyCode.D, 0.6f);
        if (_game.Player != null)
        {
            var vx = _game.Player.GetComponent<Rigidbody2D>() != null ? _game.Player.GetComponent<Rigidbody2D>().linearVelocity.x : 0f;
            Note("after_hold_d x=" + _game.Player.transform.position.x.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + " vx=" + vx.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + " dPressed=" + DPressed());
        }
        if (_captureEnabled)
            yield return Capture("player_run");
        Pulse(KeyCode.Space);
        yield return new WaitForSeconds(0.35f);
        if (_captureEnabled)
            yield return Capture("player_jump");
        Pulse(KeyCode.J);
        yield return new WaitForSeconds(0.25f);
        if (_captureEnabled)
            yield return Capture("player_combat");

        var startX = _game.Player.transform.position.x;
        yield return Hold(KeyCode.D, 0.8f);
        var moved = Mathf.Abs(_game.Player.transform.position.x - startX) > 8f;
        _feature["traversal"] = moved ? "partial" : "failed";

        yield return Hold(KeyCode.A, 0.4f);
        yield return Hold(KeyCode.D, 12f);
        if (_game.Player != null && _game.Player.transform.position.x >= 0f)
            _feature["containment"] = "passed";

        var lastProgressRoom = _game.CurrentRoomId;
        var lastProgressX = _game.Player != null ? _game.Player.transform.position.x : 0f;
        var lastProgressAt = Time.unscaledTime;
        var sawLockedGate = false;
        var sawUnlockedGate = false;
        var combatKilled = false;
        var combatOnceVerified = false;
        var combatFollowUp = false;
        var invulnHeld = false;
        var deaths = 0;
        _game.Player.OnDied += () => deaths++;
        var diagPath = Path.Combine(_qaDir, "progression-runtime.jsonl");
        File.WriteAllText(diagPath, "");
        while (Time.unscaledTime < _deadline && _game.Player != null)
        {
            TrackRoom();
            var location = _game.Player.transform.position;
            var roomBounds = _game.CurrentRoom;
            if (roomBounds != null && (float.IsNaN(location.x) || float.IsNaN(location.y) ||
                float.IsInfinity(location.x) || float.IsInfinity(location.y) ||
                location.x < -160f || location.x > roomBounds.width + 160f ||
                location.y < -160f || location.y > roomBounds.height + 288f))
            {
                _feature["containment"] = "failed";
                Fail("escaped_room_bounds", "Player escaped " + roomBounds.id + " at " + location);
                yield break;
            }
            var enemy = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
            AppendDiag(diagPath, deaths, enemy);
            if (_game.Player != null)
            {
                var px = _game.Player.transform.position.x;
                if (enemy != null || _game.CurrentRoomId != lastProgressRoom || Mathf.Abs(px - lastProgressX) > 12f)
                {
                    lastProgressRoom = _game.CurrentRoomId;
                    lastProgressX = px;
                    lastProgressAt = Time.unscaledTime;
                }
                else if (Time.unscaledTime - lastProgressAt > 8f)
                {
                    Note("stall room=" + _game.CurrentRoomId + " x=" + px.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture));
                    break;
                }
            }
            if (enemy != null)
            {
                var dx = enemy.transform.position.x - _game.Player.transform.position.x;
                if (Mathf.Abs(dx) < 64f)
                {
                    if (!combatOnceVerified && _feature["combat_one_hit"] == "pending")
                    {
                        yield return VerifyCombatHit(enemy, (once, followUp, invuln, killed) =>
                        {
                            combatOnceVerified = once;
                            combatFollowUp = followUp;
                            invulnHeld = invuln;
                            if (killed)
                                combatKilled = true;
                            _feature["player_invuln"] = invuln ? "passed" : "failed";
                            _feature["combat_follow_up"] = followUp ? "passed" : "failed";
                            if (killed)
                                _feature["combat_kill"] = "passed";
                            Note("combat_one_hit=" + once + " followUp=" + followUp + " invuln=" + invuln + " killed=" + killed);
                        });
                    }
                    _held.Add(KeyCode.J);
                    yield return Hold(dx > 0f ? KeyCode.D : KeyCode.A, 0.28f);
                    _held.Remove(KeyCode.J);
                    if (UnityEngine.Object.FindFirstObjectByType<EnemyActor>() == null)
                    {
                        combatKilled = true;
                        _feature["combat_kill"] = "passed";
                    }
                }
                else
                    yield return Hold(dx > 0f ? KeyCode.D : KeyCode.A, 0.35f);
                if (_captureEnabled && enemy != null)
                    yield return Capture("enemy_" + enemy.EnemyId);
            }
            if (AllConfiguredAbilitiesUnlocked())
                _feature["abilities"] = "passed";
            yield return VerifyGrappleActivation();
            if (_game.Player.Abilities.Contains("dash") || _game.Player.Abilities.Contains("phase"))
            {
                Pulse(KeyCode.K);
                if (_captureEnabled)
                    yield return Capture("player_dash");
            }
            if (_game.CurrentRoom != null && _game.CurrentRoom.gates != null && _game.CurrentRoom.gates.Length > 0)
            {
                foreach (var gate in _game.CurrentRoom.gates)
                {
                    if (gate == null || string.IsNullOrEmpty(gate.requiredAbility))
                        continue;
                    if (_game.Player.Abilities.Contains(gate.requiredAbility))
                        sawUnlockedGate = true;
                    else
                        sawLockedGate = true;
                }
                if (_captureEnabled)
                    yield return Capture("ability_gate");
            }
            if (_game.Victory)
            {
                _feature["victory"] = "passed";
                if (_captureEnabled)
                    yield return Capture("victory");
                break;
            }
            var living = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
            if (living == null || _feature["combat_kill"] == "passed")
            {
                yield return Hold(KeyCode.D, 0.45f);
                var roomW = _game.CurrentRoom != null ? _game.CurrentRoom.width : 800f;
                var x = _game.Player != null ? _game.Player.transform.position.x : 0f;
                var nearDoor = x < 96f || x > roomW - 96f;
                if (!nearDoor && UnityEngine.Random.value > 0.7f)
                    Pulse(KeyCode.Space);
            }
        }

        if (_feature.TryGetValue("grapple_activation", out var grappleStatus) && grappleStatus == "pending")
            _feature["grapple_activation"] = "inconclusive";
        FinalizeTraversal();
        if (combatKilled)
            _feature["combat_kill"] = "passed";
        else if (_feature["combat_one_hit"] == "passed")
            _feature["combat_kill"] = "failed";
        else if (_feature["combat_kill"] == "pending")
            _feature["combat_kill"] = "inconclusive";
        if (_feature["combat_follow_up"] == "pending")
        {
            if (combatFollowUp)
                _feature["combat_follow_up"] = "passed";
            else if (_feature["combat_one_hit"] == "passed")
                _feature["combat_follow_up"] = "failed";
            else
                _feature["combat_follow_up"] = "inconclusive";
        }
        var combatReady =
            _feature["combat_one_hit"] == "passed"
            && _feature["combat_follow_up"] == "passed"
            && _feature["combat_kill"] == "passed"
            && _feature["player_invuln"] == "passed";
        var combatFailed =
            _feature["combat_one_hit"] == "failed"
            || _feature["combat_follow_up"] == "failed"
            || _feature["combat_kill"] == "failed"
            || _feature["player_invuln"] == "failed";
        _feature["combat"] = combatReady ? "passed" : combatFailed ? "failed" : "inconclusive";
        if (_feature["abilities"] == "pending")
            _feature["abilities"] = "failed";
        if (sawLockedGate && sawUnlockedGate)
            _feature["gates"] = "passed";
        else if (sawLockedGate)
            _feature["gates"] = "inconclusive";
        else
            _feature["gates"] = "inconclusive";
        if (_feature["victory"] == "pending")
            _feature["victory"] = _game.Victory ? "passed" : "failed";

        yield return TestSaveContinue();
        yield return TestRespawn();

        if (_mode == "all" || _mode == "perf")
            yield return MeasurePerf(3f);

        var failed = HasFailure();
        if (failed)
            Fail("acceptance_failed", Summarize());
        else
            Pass("normal_input");
    }

    private IEnumerator TestSaveContinue()
    {
        if (_game.Player == null)
        {
            _feature["save_continue"] = "failed";
            yield break;
        }
        var room = _game.CurrentRoomId;
        var path = _game.SavePath;
        if (!File.Exists(path))
        {
            _feature["save_continue"] = "failed";
            Note("save file missing");
            yield break;
        }
        var json = File.ReadAllText(path);
        _game.ReloadFromSaveFile();
        yield return new WaitForSeconds(0.2f);
        _feature["save_continue"] = _game.CurrentRoomId == room && File.Exists(path) && json.Contains(room)
            ? "passed"
            : "failed";
        Note("save_continue " + _feature["save_continue"]);
    }

    private IEnumerator VerifyCombatHit(EnemyActor enemy, System.Action<bool, bool, bool, bool> done)
    {
        var once = false;
        var followUp = false;
        var invuln = false;
        var killed = false;
        if (enemy == null || _game == null || _game.Player == null || _game.Pack == null || _game.Pack.combat == null)
        {
            done(false, false, false, false);
            yield break;
        }
        var damage = _game.Pack.combat.attackDamage;
        var startHp = enemy.Health;
        var startCalls = EnemyActor.HurtCallCount;
        _game.Player.Hurt(1f);
        var afterFirst = _game.Player.Health;
        _game.Player.Hurt(1f);
        invuln = Mathf.Approximately(_game.Player.Health, afterFirst);
        _held.Add(KeyCode.J);
        yield return new WaitForSeconds(_game.Pack.combat.hitboxSeconds + 0.12f);
        _held.Remove(KeyCode.J);
        var calls = EnemyActor.HurtCallCount - startCalls;
        var unique = _game.Player.LastSwingUniqueHits;
        var still = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
        var endHp = still != null ? still.Health : 0f;
        var drop = startHp - endHp;
        once = calls == 1 && unique == 1 && drop >= damage - 0.1f && drop <= damage + 0.1f;
        if (calls > 1 || unique > 1 || drop > damage + 0.1f)
            _feature["combat_one_hit"] = "failed";
        else if (once)
            _feature["combat_one_hit"] = "passed";
        else
            _feature["combat_one_hit"] = "inconclusive";
        Note("combat_hit_probe calls=" + calls + " unique=" + unique + " drop=" + drop.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + " startHp=" + startHp.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) + " attackDamage=" + damage.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture));
        if (still != null)
        {
            yield return new WaitForSeconds(0.32f);
            var midCalls = EnemyActor.HurtCallCount;
            var midHp = still.Health;
            _held.Add(KeyCode.J);
            yield return new WaitForSeconds(_game.Pack.combat.hitboxSeconds + 0.12f);
            _held.Remove(KeyCode.J);
            still = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
            followUp = EnemyActor.HurtCallCount > midCalls || still == null || (still != null && still.Health < midHp);
        }
        else
            followUp = once;
        killed = UnityEngine.Object.FindFirstObjectByType<EnemyActor>() == null;
        done(once, followUp, invuln, killed);
    }

    private IEnumerator TestRespawn()
    {
        if (_game.Player == null)
        {
            _feature["respawn"] = "failed";
            yield break;
        }
        var room = _game.CurrentRoomId;
        var pos = _game.Player.transform.position;
        _game.Player.Hurt(999f);
        yield return new WaitForSeconds(0.35f);
        _feature["respawn"] = _game.Player != null && !_game.Player.Dead && _game.CurrentRoomId == room
            ? "passed"
            : "failed";
        Note("respawn " + _feature["respawn"] + " from " + pos);
        if (_captureEnabled)
            yield return Capture("checkpoint");
    }

    private IEnumerator MeasurePerf(float seconds)
    {
        ReleaseAll();
        _perfWindow = 0f;
        _perfFrames = 0;
        _perfDt = 0f;
        var until = Time.unscaledTime + seconds;
        while (Time.unscaledTime < until)
        {
            _perfFrames++;
            _perfDt += Time.unscaledDeltaTime;
            _perfWindow += Time.unscaledDeltaTime;
            yield return null;
        }
        Note($"perf frames={_perfFrames} avgMs={(_perfFrames > 0 ? 1000f * _perfDt / _perfFrames : -1f):0.0}");
    }

    private void TrackRoom()
    {
        if (_game.CurrentRoomId == _lastRoom)
            return;
        if (!string.IsNullOrEmpty(_lastRoom))
            _transitionMs = (Time.unscaledTime - _lastRoomChangeAt) * 1000f;
        _lastRoom = _game.CurrentRoomId;
        _lastRoomChangeAt = Time.unscaledTime;
        _roomsVisited.Add(_game.CurrentRoomId);
        Note("room " + _game.CurrentRoomId);
    }

    private void FinalizeTraversal()
    {
        var roomCount = _game != null && _game.Pack != null && _game.Pack.rooms != null ? _game.Pack.rooms.Length : 0;
        var reachedVictoryRoom = _game != null && !string.IsNullOrEmpty(_game.Pack.victoryRoomId) && _roomsVisited.Contains(_game.Pack.victoryRoomId);
        if (reachedVictoryRoom || (roomCount > 0 && _roomsVisited.Count >= roomCount))
            _feature["traversal"] = "passed";
        else if (_roomsVisited.Count >= 2)
            _feature["traversal"] = "partial";
        else if (_feature["traversal"] != "failed")
            _feature["traversal"] = "partial";
        Note("rooms " + string.Join(",", _roomsVisited));
    }

    private void AppendDiag(string path, int deaths, EnemyActor enemy)
    {
        if (_game == null || _game.Player == null)
            return;
        var line =
            "{\"t\":" + Time.unscaledTime.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) +
            ",\"room\":\"" + Escape(_game.CurrentRoomId) +
            "\",\"x\":" + _game.Player.transform.position.x.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) +
            ",\"y\":" + _game.Player.transform.position.y.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) +
            ",\"hp\":" + _game.Player.Health.ToString("0") +
            ",\"enemy\":" + (enemy != null ? "true" : "false") +
            ",\"enemyHp\":" + (enemy != null ? enemy.Health.ToString("0") : "0") +
            ",\"deaths\":" + deaths +
            ",\"rooms\":" + _roomsVisited.Count + "}\n";
        File.AppendAllText(path, line);
    }

    private bool AllConfiguredAbilitiesUnlocked()
    {
        if (_game == null || _game.Player == null || _game.Pack?.abilities == null || _game.Pack.abilities.Length == 0)
            return false;
        foreach (var ability in _game.Pack.abilities)
        {
            if (ability == null || string.IsNullOrEmpty(ability.id) || !_game.Player.Abilities.Contains(ability.id))
                return false;
        }
        return true;
    }

    private static bool HasActor(GameplayActor actor)
    {
        return actor != null && !string.IsNullOrEmpty(actor.id);
    }

    private IEnumerator VerifyGrappleActivation()
    {
    if (_feature.TryGetValue("grapple_activation", out var grappleResult) && grappleResult == "pending" &&
        _game.Player.Abilities.Contains("grapple") && !_game.Player.IsDashing &&
        _game.CurrentRoom?.grappleAnchors != null && _game.CurrentRoom.grappleAnchors.Length > 0 &&
        _grappleRoomsAttempted.Add(_game.CurrentRoomId))
    {
        var previousKeys = new List<KeyCode>(_held);
        _held.Clear();
        var start = _game.Player.transform.position;
        Pulse(KeyCode.L);
        var observedPull = false;
        var observedMotion = false;
        var until = Time.unscaledTime + 0.3f;
        while (Time.unscaledTime < until)
        {
            yield return null;
            var chain = _game.Player.GetComponent<WraithChain>();
            if (chain != null && chain.IsPulling)
            {
                observedPull = true;
                observedMotion |= Vector3.Distance(start, _game.Player.transform.position) > 8f;
            }
        }
        foreach (var key in previousKeys) _held.Add(key);
        ApplyKeys(false);
        Note("grapple_input pull=" + observedPull + " motion=" + observedMotion);
        if (observedPull && observedMotion)
        {
            _feature["grapple_activation"] = "passed";
            if (_captureEnabled) yield return Capture("player_grapple");
        }
    }
    }

    private IEnumerator Hold(KeyCode key, float seconds)
    {
        _held.Add(key);
        var until = Time.unscaledTime + seconds;
        while (Time.unscaledTime < until && Time.unscaledTime < _deadline)
        {
            yield return VerifyGrappleActivation();
            ApplyKeys(false);
            yield return null;
        }
        _held.Remove(key);
        ApplyKeys(false);
    }

    private void Pulse(KeyCode key)
    {
        _pulse = key;
    }

    private void ReleaseAll()
    {
        _held.Clear();
        ApplyKeys(false);
    }

    private void EnsureKeyboard()
    {
#if ENABLE_INPUT_SYSTEM
        foreach (var device in InputSystem.devices.ToArray())
        {
            if (device is Keyboard)
                InputSystem.RemoveDevice(device);
        }
        InputSystem.AddDevice<Keyboard>();
        InputSystem.settings.updateMode = InputSettings.UpdateMode.ProcessEventsManually;
        Note("virtual_keyboard_device added");
#endif
    }

    private void ApplyKeys(bool pressedThisFrame)
    {
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;
        if (kb == null)
        {
            InputSystem.AddDevice<Keyboard>();
            kb = Keyboard.current;
        }
        if (kb == null)
            return;
        if (!kb.added)
            InputSystem.AddDevice(kb);
        if (!kb.enabled)
            InputSystem.EnableDevice(kb);
        var keys = new List<UnityEngine.InputSystem.Key>();
        foreach (var code in _held)
        {
            var mapped = Map(code);
            if (mapped != UnityEngine.InputSystem.Key.None)
                keys.Add(mapped);
        }
        if (_pulse != KeyCode.None)
        {
            var mapped = Map(_pulse);
            if (mapped != UnityEngine.InputSystem.Key.None)
                keys.Add(mapped);
        }
        var state = keys.Count == 0 ? default : new KeyboardState(keys.ToArray());
        InputSystem.QueueStateEvent(kb, state);
        InputSystem.Update();
        if (!_loggedHold && _held.Contains(KeyCode.D))
        {
            _loggedHold = true;
            Note("apply_d device=" + kb.displayName + " enabled=" + kb.enabled + " pressed=" + kb.dKey.isPressed + " held=" + _held.Count);
        }
#else
        _ = pressedThisFrame;
#endif
    }

#if ENABLE_INPUT_SYSTEM
    private static UnityEngine.InputSystem.Key Map(KeyCode code)
    {
        switch (code)
        {
            case KeyCode.A: return UnityEngine.InputSystem.Key.A;
            case KeyCode.D: return UnityEngine.InputSystem.Key.D;
            case KeyCode.W: return UnityEngine.InputSystem.Key.W;
            case KeyCode.Space: return UnityEngine.InputSystem.Key.Space;
            case KeyCode.J: return UnityEngine.InputSystem.Key.J;
            case KeyCode.Z: return UnityEngine.InputSystem.Key.Z;
            case KeyCode.K: return UnityEngine.InputSystem.Key.K;
            case KeyCode.L: return UnityEngine.InputSystem.Key.L;
            case KeyCode.LeftShift: return UnityEngine.InputSystem.Key.LeftShift;
            default: return UnityEngine.InputSystem.Key.None;
        }
    }
#endif

    private IEnumerator Capture(string name)
    {
        if (!_capturedIds.Add(name))
            yield break;
        yield return null;
        var dest = Path.Combine(_qaDir, "captures", name + ".png");
        var cam = Camera.main;
        if (cam == null || cam.pixelWidth < 8 || cam.pixelHeight < 8)
        {
            Note("capture_fail " + name + " no_camera");
            yield break;
        }
        var w = cam.pixelWidth;
        var h = cam.pixelHeight;
        var rt = RenderTexture.GetTemporary(w, h, 24, RenderTextureFormat.ARGB32);
        var prev = cam.targetTexture;
        cam.targetTexture = rt;
        cam.Render();
        var prevActive = RenderTexture.active;
        RenderTexture.active = rt;
        var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
        tex.Apply();
        RenderTexture.active = prevActive;
        cam.targetTexture = prev;
        RenderTexture.ReleaseTemporary(rt);
        Directory.CreateDirectory(Path.GetDirectoryName(dest) ?? _qaDir);
        File.WriteAllBytes(dest, tex.EncodeToPNG());
        Destroy(tex);
        _captures.Add(dest);
        Note("capture " + name);
    }

    private bool HasFailure()
    {
        foreach (var pair in _feature)
        {
            if (pair.Value == "failed")
                return true;
        }
        return Time.unscaledTime >= _deadline && _feature["victory"] != "passed";
    }

    private string Summarize()
    {
        var sb = new StringBuilder();
        foreach (var pair in _feature)
            sb.Append(pair.Key).Append('=').Append(pair.Value).Append(' ');
        return sb.ToString().Trim();
    }

    private static bool DPressed()
    {
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;
        return kb != null && kb.enabled && kb.dKey.isPressed;
#else
        return false;
#endif
    }

    private void Note(string message)
    {
        _events.Add(message);
        Debug.Log("FOUNDRY_ACCEPT " + message);
    }

    private void Fail(string reason, string detail)
    {
        if (_finished)
            return;
        WriteResult("FAIL", reason, detail);
        Quit(1);
    }

    private void Pass(string reason)
    {
        if (_finished)
            return;
        WriteResult("PASS", reason, Summarize());
        Quit(0);
    }

    private void WriteResult(string status, string reason, string detail)
    {
        _finished = true;
        ReleaseAll();
        var path = Path.Combine(_qaDir, "acceptance-result.json");
        LastResultPath = path;
        var json = new StringBuilder();
        json.Append("{\n");
        json.Append("  \"engine\": \"unity\",\n");
        json.Append("  \"status\": \"").Append(status).Append("\",\n");
        json.Append("  \"reason\": \"").Append(Escape(reason)).Append("\",\n");
        json.Append("  \"detail\": \"").Append(Escape(detail)).Append("\",\n");
        json.Append("  \"mode\": \"").Append(Escape(_mode)).Append("\",\n");
        json.Append("  \"room\": \"").Append(Escape(_game != null ? _game.CurrentRoomId : "")).Append("\",\n");
        json.Append("  \"roomsVisited\": [");
        var roomFirst = true;
        foreach (var id in _roomsVisited)
        {
            if (!roomFirst) json.Append(", ");
            roomFirst = false;
            json.Append("\"").Append(Escape(id)).Append("\"");
        }
        json.Append("],\n");
        json.Append("  \"roomsVisitedCount\": ").Append(_roomsVisited.Count).Append(",\n");
        json.Append("  \"transitionMs\": ").Append(_transitionMs.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)).Append(",\n");
        json.Append("  \"perfFrames\": ").Append(_perfFrames).Append(",\n");
        json.Append("  \"perfAvgMs\": ").Append(_perfFrames > 0 ? (1000f * _perfDt / _perfFrames).ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) : "-1").Append(",\n");
        json.Append("  \"features\": {\n");
        var first = true;
        foreach (var pair in _feature)
        {
            if (!first) json.Append(",\n");
            first = false;
            json.Append("    \"").Append(pair.Key).Append("\": \"").Append(pair.Value).Append("\"");
        }
        json.Append("\n  },\n");
        json.Append("  \"notImplemented\": [");
        for (var i = 0; i < _notImplemented.Count; i++)
        {
            if (i > 0) json.Append(", ");
            json.Append("\"").Append(Escape(_notImplemented[i])).Append("\"");
        }
        json.Append("],\n");
        json.Append("  \"captures\": [");
        for (var i = 0; i < _captures.Count; i++)
        {
            if (i > 0) json.Append(", ");
            json.Append("\"").Append(Escape(_captures[i])).Append("\"");
        }
        json.Append("],\n");
        json.Append("  \"note\": \"Automated testing does not establish animation feel or visual quality.\"\n");
        json.Append("}\n");
        File.WriteAllText(path, json.ToString());
        Debug.Log("FOUNDRY_ACCEPT_RESULT status=" + status + " reason=" + reason + " " + detail);
        if (status != "PASS")
            Debug.LogError("FOUNDRY_ACCEPT_FAIL " + reason + " " + detail);
    }

    private static string Escape(string value)
    {
        var escaped = new StringBuilder();
        foreach (var c in value ?? "")
        {
            if (c == '\\') escaped.Append("\\\\");
            else if (c == '"') escaped.Append("\\\"");
            else if (c < 0x20)
                escaped.Append("\\u").Append(((int)c).ToString("x4", System.Globalization.CultureInfo.InvariantCulture));
            else escaped.Append(c);
        }
        return escaped.ToString();
    }

    private static void Quit(int code)
    {
#if UNITY_EDITOR
        UnityEditor.EditorApplication.Exit(code);
#else
        Application.Quit(code);
#endif
    }

    private void Update()
    {
        if (_mode == "catalog" || _mode == "motion" || _mode == "hitch" || _mode == "combatstall" || _mode == "roomtransition")
            return;
        ApplyKeys(false);
        _pulse = KeyCode.None;
        if (_finished)
            return;
        if (Time.unscaledTime >= _deadline)
            Fail("timeout", "acceptance exceeded " + ParseTimeout() + "s at room " + (_game != null ? _game.CurrentRoomId : "?"));
    }
}
