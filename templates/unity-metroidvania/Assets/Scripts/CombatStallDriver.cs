using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Profiling;
#if UNITY_EDITOR
using UnityEditor;
#endif
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
#endif

/// <summary>
/// Capture-off combat stall probe. Does not encode frames or allocate capture RTs.
/// FrameCombatCamera is test-only framing and is measured separately from production follow-cam.
/// </summary>
[DefaultExecutionOrder(-200)]
public class CombatStallDriver : MonoBehaviour
{
    private GameBootstrap _game;
    private string _outDir;
    private readonly List<string> _trialSummary = new List<string>();
    private readonly HashSet<KeyCode> _held = new HashSet<KeyCode>();
    private System.Action _tick;
    private bool _frameCombat;
    private bool _loggedHold;

    private IEnumerator Start()
    {
        _game = GetComponent<GameBootstrap>();
        var wait = 0f;
        while ((_game == null || _game.Pack == null || _game.Player == null) && wait < 8f)
        {
            wait += Time.unscaledDeltaTime;
            yield return null;
        }
        var qa = Path.Combine(Directory.GetParent(Application.dataPath)?.FullName ?? Application.persistentDataPath, "qa");
        _outDir = Path.Combine(qa, "motion", "combat-stall");
        Directory.CreateDirectory(_outDir);
        Time.timeScale = 1f;
        QualitySettings.vSyncCount = 0;
        Application.targetFrameRate = 60;
        EnsureKeyboard();
        MainThreadProbe.Reset();

        var boot = "{\"assetPrepMs\":" + StreamingArtCache.LastPreloadMs.ToString("0.0") +
                   ",\"files\":" + StreamingArtCache.LastPreloadCount +
                   ",\"artMisses\":" + StreamingArtCache.MissCount +
                   ",\"roomLoadMs\":" + (_game != null ? _game.LastRoomLoadMs.ToString("0.0") : "-1") +
                   ",\"capture\":false}\n";
        File.WriteAllText(Path.Combine(_outDir, "boot.json"), boot);
        Debug.Log("FOUNDRY_COMBAT_STALL_BOOT " + boot.Trim());

        yield return Idle(2.2f);
        yield return ApproachEnemy();
        yield return Idle(0.8f);

        var profilerPath = Path.Combine(_outDir, "unity-profiler");
        TryStartProfiler(profilerPath);
        yield return Idle(0.8f);
        yield return RunTrial("cold_production_cam", 5.0f, false);
        TryStopProfiler();
        yield return Idle(0.6f);
        yield return RunTrial("warm_production_cam", 5.0f, false);
        yield return Idle(0.6f);
        yield return RunTrial("cold_test_framing_cam", 5.0f, true);
        yield return Idle(0.6f);
        yield return RunTrial("warm_test_framing_cam", 5.0f, true);
        yield return RespawnRoutine();
        File.WriteAllText(Path.Combine(_outDir, "spans.jsonl"), MainThreadProbe.Dump());
        File.WriteAllText(Path.Combine(_outDir, "trials.json"), "{\n  \"captureEnabled\": false,\n  \"encodeEnabled\": false,\n  \"trials\": [\n    " +
                          string.Join(",\n    ", _trialSummary) + "\n  ]\n}\n");
        Debug.Log("FOUNDRY_COMBAT_STALL_OK trials=" + _trialSummary.Count);
#if UNITY_EDITOR
        EditorApplication.Exit(0);
#else
        Application.Quit(0);
#endif
    }

    private IEnumerator RunTrial(string name, float seconds, bool testFraming)
    {
        var dir = Path.Combine(_outDir, name);
        Directory.CreateDirectory(dir);
        _frameCombat = testFraming;
        _tick = LiveEnemy;
        var stalls = new StringBuilder();
        var events = new StringBuilder();
        var dts = new List<float>();
        var gameFrames = 0;
        var lastEvent = -999f;
        var recStart = Time.unscaledTime;
        var lastFrameTime = recStart;
        var until = recStart + seconds;
        var gcAtStart = GC.CollectionCount(0);
        var missAtStart = StreamingArtCache.MissCount;
        float maxDt = 0f;
        float firstDt = 0f;
        float mean = 0f;
        EnemyActor cachedEnemy = null;

        while (Time.unscaledTime < until)
        {
            ApplyKeys();
            yield return null;
            gameFrames++;
            var now = Time.unscaledTime;
            var dt = now - lastFrameTime;
            dts.Add(dt);
            lastFrameTime = now;
            if (gameFrames == 1)
                firstDt = dt;
            if (dt > maxDt)
                maxDt = dt;
            mean += dt;
            if (dt >= 0.05f)
            {
                stalls.Append("{\"t\":").Append((now - recStart).ToString("0.###"));
                stalls.Append(",\"dt\":").Append(dt.ToString("0.####"));
                stalls.Append(",\"room\":\"").Append(_game != null ? _game.CurrentRoomId : "").Append("\"");
                stalls.Append(",\"gc0\":").Append(GC.CollectionCount(0) - gcAtStart);
                stalls.Append(",\"artMisses\":").Append(StreamingArtCache.MissCount - missAtStart);
                stalls.Append(",\"lastSpan\":\"").Append(MainThreadProbe.LastName).Append("\"");
                stalls.Append(",\"lastSpanMs\":").Append(MainThreadProbe.LastMsValue.ToString("0.###"));
                stalls.Append(",\"respawnMs\":").Append(_game != null ? _game.LastRespawnMs.ToString("0.###") : "0");
                stalls.Append(",\"createEnemyMs\":").Append(_game != null ? _game.LastCreateEnemyMs.ToString("0.###") : "0");
                stalls.Append(",\"writeSaveMs\":").Append(_game != null ? _game.LastWriteSaveMs.ToString("0.###") : "0");
                stalls.Append(",\"roomLoadMs\":").Append(_game != null ? _game.LastRoomLoadMs.ToString("0.###") : "0");
                stalls.Append(",\"framing\":").Append(testFraming ? "true" : "false");
                stalls.Append(",\"firstFrame\":").Append(gameFrames == 1 ? "true" : "false");
                stalls.Append(",\"capture\":false}\n");
            }
            if (now - lastEvent >= 0.08f)
            {
                lastEvent = now;
                AppendEvent(events, now - recStart, ref cachedEnemy);
            }
        }

        if (dts.Count > 0)
            mean /= dts.Count;
        var duration = Mathf.Max(0.001f, Time.unscaledTime - recStart);
        var fps = gameFrames / duration;
        File.WriteAllText(Path.Combine(dir, "stalls.jsonl"), stalls.ToString());
        File.WriteAllText(Path.Combine(dir, "events.jsonl"), events.ToString());
        var meta =
            "{\n  \"trial\": \"" + name + "\",\n  \"captureEnabled\": false,\n  \"encodeEnabled\": false,\n  \"testFramingCamera\": " +
            (testFraming ? "true" : "false") +
            ",\n  \"note\": \"" + (testFraming
                ? "TEST-ONLY FrameCombatCamera. Not production follow-cam."
                : "Production GameBootstrap follow-cam.") +
            "\",\n  \"durationSec\": " + duration.ToString("0.###") +
            ",\n  \"gameFrames\": " + gameFrames +
            ",\n  \"achievedFps\": " + fps.ToString("0.##") +
            ",\n  \"meanGameDt\": " + mean.ToString("0.####") +
            ",\n  \"firstFrameDt\": " + firstDt.ToString("0.####") +
            ",\n  \"maxGameDt\": " + maxDt.ToString("0.####") +
            ",\n  \"artMisses\": " + (StreamingArtCache.MissCount - missAtStart) +
            ",\n  \"gc0Delta\": " + (GC.CollectionCount(0) - gcAtStart) +
            ",\n  \"room\": \"" + (_game != null ? _game.CurrentRoomId : "") + "\"\n}\n";
        File.WriteAllText(Path.Combine(dir, "meta.json"), meta);
        _trialSummary.Add(meta.Trim());
        Debug.Log("FOUNDRY_COMBAT_TRIAL " + name + " fps=" + fps.ToString("0.0") + " maxDt=" + maxDt.ToString("0.####") +
                  " framing=" + testFraming);
        _frameCombat = false;
        _tick = null;
        IdleHold();
        ApplyKeys();
    }

    private IEnumerator RespawnRoutine()
    {
        yield return Idle(0.55f);
        var death = MeasureDeathInPlace();
        yield return Idle(0.4f);
        yield return WalkToRoom("room_000", KeyCode.A, 12f);
        yield return ApproachShrineAndDie();
        var checkpoint = _lastCheckpointJson ?? "{\"ok\":false}";
        var cont = MeasureContinue();
        var json = "{\n  \"note\": \"Production death uses Revive + move to _spawn. Walking through doors is normal input. ReloadFromSaveFile is Continue. DiagnosticWarp is not used.\",\n" +
                   "  \"deathInCurrentRoom\": " + death + ",\n" +
                   "  \"checkpoint\": " + checkpoint + ",\n" +
                   "  \"continueFromSave\": " + cont + ",\n" +
                   "  \"gates\": {\"inCombatRoom\": " + CountGates() +
                   ", \"note\": \"room_001 has no gates in gameplay.json. dash is kept across death so RefreshGates would clear gated rooms entered via normal doors.\"}\n}\n";
        File.WriteAllText(Path.Combine(_outDir, "respawn-checks.json"), json);
        Debug.Log("FOUNDRY_RESPAWN_CHECKS " + json.Replace("\n", " "));
    }

    private string _lastCheckpointJson;

    private IEnumerator ApproachShrineAndDie()
    {
        var shrine = GameObject.Find("Checkpoint");
        if (shrine == null || _game == null || _game.Player == null)
        {
            _lastCheckpointJson = "{\"ok\":false,\"objectPresent\":false,\"note\":\"Checkpoint is authored in room_000; walk-back may have failed.\"}";
            yield break;
        }
        var shrineCol = shrine.GetComponent<Collider2D>();
        var playerCol = _game.Player.GetComponent<Collider2D>();
        _tick = () =>
        {
            var dx = shrine.transform.position.x - _game.Player.transform.position.x;
            Hold(KeyCode.D, dx > 4f);
            Hold(KeyCode.A, dx < -4f);
            Hold(KeyCode.LeftShift, false);
        };
        var until = Time.unscaledTime + 5f;
        var overlapped = false;
        while (Time.unscaledTime < until)
        {
            if (shrineCol != null && playerCol != null && shrineCol.Distance(playerCol).isOverlapped)
            {
                overlapped = true;
                break;
            }
            if (Mathf.Abs(shrine.transform.position.x - _game.Player.transform.position.x) < 6f)
                break;
            yield return null;
        }
        _tick = null;
        IdleHold();
        ApplyKeys();
        for (var i = 0; i < 8; i++)
            yield return null;
        yield return Idle(0.5f);
        if (_game.Player.Health > 1f)
            _game.Player.Hurt(9999f);
        yield return null;
        var anchor = _game.RespawnAnchor;
        var dist = Vector2.Distance(_game.Player.transform.position, anchor);
        var nearShrine = Vector2.Distance(anchor, (Vector2)shrine.transform.position) < 48f;
        var ok = nearShrine && dist < 16f && _game.CurrentRoomId == "room_000";
        _lastCheckpointJson = "{\n    \"ok\": " + (ok ? "true" : "false") +
               ",\n    \"objectPresent\": true,\n    \"usedProductionRespawn\": true,\n    \"testTeleport\": false" +
               ",\n    \"walkedToShrine\": true,\n    \"overlappedShrine\": " + (overlapped ? "true" : "false") +
               ",\n    \"anchorNearShrine\": " + (nearShrine ? "true" : "false") +
               ",\n    \"distanceAfterDeath\": " + dist.ToString("0.##") +
               ",\n    \"note\": \"Walked onto shrine so OnTriggerEnter2D could fire. Death uses _spawn.\"\n  }";
    }

    private string MeasureDeathInPlace()
    {
        if (_game == null || _game.Player == null)
            return "{\"ok\":false,\"reason\":\"no player\"}";
        _game.Player.GrantAbility("dash");
        var abilitiesBefore = string.Join(",", _game.Player.Abilities);
        var gatesBefore = CountGates();
        var roomBefore = _game.CurrentRoomId;
        var anchorBefore = _game.RespawnAnchor;
        if (_game.Player.Health > 1f)
            _game.Player.Hurt(9999f);
        if (_game.Player.Health > 1f)
            _game.Player.Hurt(9999f);
        var pos = _game.Player.transform.position;
        var enemy = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
        var dist = Vector2.Distance(new Vector2(pos.x, pos.y), anchorBefore);
        var ok = !_game.Player.Dead && _game.Player.Health >= _game.Player.MaxHealth - 0.1f && dist < 12f &&
                 string.Join(",", _game.Player.Abilities) == abilitiesBefore && enemy != null &&
                 enemy.Health >= 29f && CountGates() == gatesBefore && roomBefore == _game.CurrentRoomId;
        return "{\n    \"ok\": " + (ok ? "true" : "false") +
               ",\n    \"usedProductionRespawn\": true,\n    \"testTeleport\": false" +
               ",\n    \"room\": \"" + roomBefore + "\"" +
               ",\n    \"distanceToAnchor\": " + dist.ToString("0.##") +
               ",\n    \"healthAfter\": " + _game.Player.Health.ToString("0.##") +
               ",\n    \"stillDead\": " + (_game.Player.Dead ? "true" : "false") +
               ",\n    \"abilitiesAfter\": \"" + string.Join(",", _game.Player.Abilities) + "\"" +
               ",\n    \"enemyPresent\": " + (enemy != null ? "true" : "false") +
               ",\n    \"enemyHp\": " + (enemy != null ? enemy.Health.ToString("0.##") : "-1") +
               ",\n    \"gatesBefore\": " + gatesBefore +
               ",\n    \"respawnMs\": " + _game.LastRespawnMs.ToString("0.###") + "\n  }";
    }

    private string MeasureContinue()
    {
        var savePath = _game != null ? _game.SavePath : "";
        var saveExisted = File.Exists(savePath);
        string saveRoom = "";
        float saveX = 0f;
        if (saveExisted)
        {
            var raw = File.ReadAllText(savePath);
            saveRoom = FindJsonString(raw, "roomId");
            float.TryParse(FindJsonNumber(raw, "x"), out saveX);
        }
        _game.ReloadFromSaveFile();
        var continueRoom = _game.CurrentRoomId;
        var continueX = _game.Player != null ? _game.Player.transform.position.x : -1f;
        var continueAbilities = _game.Player != null ? string.Join(",", _game.Player.Abilities) : "";
        var ok = saveExisted && continueRoom == saveRoom && Mathf.Abs(continueX - saveX) < 48f;
        return "{\n    \"ok\": " + (ok ? "true" : "false") +
               ",\n    \"saveExisted\": " + (saveExisted ? "true" : "false") +
               ",\n    \"saveRoom\": \"" + saveRoom + "\",\n    \"loadedRoom\": \"" + continueRoom + "\"" +
               ",\n    \"saveX\": " + saveX.ToString("0.##") + ",\n    \"loadedX\": " + continueX.ToString("0.##") +
               ",\n    \"abilities\": \"" + continueAbilities + "\"" +
               ",\n    \"note\": \"ReloadFromSaveFile is production Continue.\"\n  }";
    }

    private IEnumerator WalkToRoom(string roomId, KeyCode key, float seconds)
    {
        _tick = () =>
        {
            Hold(key, true);
            Hold(KeyCode.LeftShift, true);
        };
        var until = Time.unscaledTime + seconds;
        while (Time.unscaledTime < until && (_game == null || _game.CurrentRoomId != roomId))
            yield return null;
        _tick = null;
        IdleHold();
        ApplyKeys();
        yield return Idle(0.3f);
    }

    private static int CountGates()
    {
        return UnityEngine.Object.FindObjectsByType<GateBlocker>(FindObjectsSortMode.None).Length;
    }

    private static string FindJsonString(string json, string key)
    {
        var needle = "\"" + key + "\":\"";
        var i = json.IndexOf(needle, StringComparison.Ordinal);
        if (i < 0)
        {
            needle = "\"" + key + "\": \"";
            i = json.IndexOf(needle, StringComparison.Ordinal);
        }
        if (i < 0)
            return "";
        var start = i + needle.Length;
        var end = json.IndexOf('"', start);
        return end < 0 ? "" : json.Substring(start, end - start);
    }

    private static string FindJsonNumber(string json, string key)
    {
        var needle = "\"" + key + "\":";
        var i = json.IndexOf(needle, StringComparison.Ordinal);
        if (i < 0)
            return "0";
        var start = i + needle.Length;
        while (start < json.Length && (json[start] == ' '))
            start++;
        var end = start;
        while (end < json.Length && "0123456789.-".IndexOf(json[end]) >= 0)
            end++;
        return json.Substring(start, Mathf.Max(0, end - start));
    }

    private IEnumerator ApproachEnemy()
    {
        _tick = ApproachTick;
        var until = Time.unscaledTime + 20f;
        var lastRoom = _game != null ? _game.CurrentRoomId : "";
        while (Time.unscaledTime < until)
        {
            yield return null;
            var room = _game != null ? _game.CurrentRoomId : "";
            if (!string.IsNullOrEmpty(room) && room != lastRoom)
            {
                MainThreadProbe.Record("live_door", _game.LastRoomLoadMs, _game.LastRoomLoadGc0, lastRoom + "->" + room);
                File.WriteAllText(
                    Path.Combine(_outDir, "live_door_" + lastRoom + "_to_" + room + ".json"),
                    "{\n  \"from\": \"" + lastRoom + "\",\n  \"to\": \"" + room +
                    "\",\n  \"loadMs\": " + _game.LastRoomLoadMs.ToString("0.0") +
                    ",\n  \"nextFrameDt\": " + Time.unscaledDeltaTime.ToString("0.####") +
                    ",\n  \"note\": \"Normal-input door. Not DiagnosticWarp.\"\n}\n");
                lastRoom = room;
            }
            var enemy = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
            if (enemy != null && _game != null && _game.CurrentRoomId != "room_000" && _game.Player != null)
            {
                var dx = enemy.transform.position.x - _game.Player.transform.position.x;
                if (Mathf.Abs(dx) < 140f)
                    break;
            }
        }
        _tick = null;
        IdleHold();
        ApplyKeys();
    }

    private IEnumerator Idle(float seconds)
    {
        var until = Time.unscaledTime + seconds;
        while (Time.unscaledTime < until)
        {
            IdleHold();
            ApplyKeys();
            yield return null;
        }
    }

    private void LateUpdate()
    {
        if (!_frameCombat)
            return;
        var t0 = Time.realtimeSinceStartup;
        FrameCombatCamera();
        var ms = (Time.realtimeSinceStartup - t0) * 1000f;
        if (ms >= 2f)
            MainThreadProbe.Record("test_framing_cam", ms, 0, "test-only");
    }

    private void Update()
    {
        _tick?.Invoke();
        ApplyKeys();
    }

    private void FixedUpdate()
    {
        _tick?.Invoke();
        ApplyKeys();
    }

    private void ApproachTick()
    {
        Hold(KeyCode.D, true);
        Hold(KeyCode.LeftShift, true);
        Hold(KeyCode.Space, Time.unscaledTime % 1.2f < 0.08f);
    }

    private void LiveEnemy()
    {
        var enemy = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
        if (_game == null || _game.Player == null)
            return;
        if (enemy == null)
        {
            Hold(KeyCode.D, true);
            Hold(KeyCode.J, false);
            return;
        }
        var dx = enemy.transform.position.x - _game.Player.transform.position.x;
        Hold(KeyCode.D, dx > 10f);
        Hold(KeyCode.A, dx < -10f);
        Hold(KeyCode.J, Mathf.Abs(dx) < 64f);
    }

    private void FrameCombatCamera()
    {
        var cam = Camera.main;
        if (cam == null || _game == null || _game.Player == null)
            return;
        var enemy = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
        var p = _game.Player.transform.position;
        if (enemy == null)
        {
            cam.orthographicSize = 120f;
            return;
        }
        var e = enemy.transform.position;
        var mid = (p + e) * 0.5f;
        var span = Mathf.Abs(e.x - p.x);
        cam.orthographicSize = Mathf.Clamp(Mathf.Max(90f, span * 0.45f + 70f), 90f, 140f);
        cam.transform.position = new Vector3(mid.x, mid.y + 24f, -10f);
    }

    private void IdleHold()
    {
        Hold(KeyCode.D, false);
        Hold(KeyCode.A, false);
        Hold(KeyCode.LeftShift, false);
        Hold(KeyCode.J, false);
        Hold(KeyCode.Space, false);
    }

    private void Hold(KeyCode key, bool down)
    {
        if (down)
            _held.Add(key);
        else
            _held.Remove(key);
    }

    private void AppendEvent(StringBuilder events, float t, ref EnemyActor cached)
    {
        if (cached == null)
            cached = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
        var p = _game != null ? _game.Player : null;
        events.Append("{\"t\":").Append(t.ToString("0.###"));
        events.Append(",\"room\":\"").Append(_game != null ? _game.CurrentRoomId : "").Append("\"");
        events.Append(",\"playerClip\":\"").Append(p != null ? p.CurrentClip : "").Append("\"");
        events.Append(",\"playerX\":").Append(p != null ? p.transform.position.x.ToString("0.#") : "0");
        events.Append(",\"playerHp\":").Append(p != null ? p.Health.ToString("0.#") : "0");
        events.Append(",\"enemyPresent\":").Append(cached != null ? "true" : "false");
        if (cached != null)
        {
            events.Append(",\"enemyClip\":\"").Append(cached.CurrentClip).Append("\"");
            events.Append(",\"enemyHp\":").Append(cached.Health.ToString("0.#"));
            events.Append(",\"enemyX\":").Append(cached.transform.position.x.ToString("0.#"));
        }
        events.Append("}\n");
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
#endif
    }

    private void ApplyKeys()
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
            MapKey(code, keys);
        var state = keys.Count == 0 ? default : new KeyboardState(keys.ToArray());
        InputSystem.QueueStateEvent(kb, state);
        InputSystem.Update();
        if (!_loggedHold && _held.Contains(KeyCode.D))
        {
            _loggedHold = true;
            Debug.Log("FOUNDRY_COMBAT_HOLD_D enabled=" + kb.enabled);
        }
#endif
    }

    private static void MapKey(KeyCode code, List<UnityEngine.InputSystem.Key> keys)
    {
        switch (code)
        {
            case KeyCode.A: keys.Add(UnityEngine.InputSystem.Key.A); break;
            case KeyCode.D: keys.Add(UnityEngine.InputSystem.Key.D); break;
            case KeyCode.Space: keys.Add(UnityEngine.InputSystem.Key.Space); break;
            case KeyCode.J: keys.Add(UnityEngine.InputSystem.Key.J); break;
            case KeyCode.LeftShift: keys.Add(UnityEngine.InputSystem.Key.LeftShift); break;
        }
    }

    private static void TryStartProfiler(string pathWithoutExt)
    {
        try
        {
            Profiler.logFile = pathWithoutExt;
            Profiler.enableBinaryLog = true;
            Profiler.enabled = true;
            Debug.Log("FOUNDRY_PROFILER_ON " + pathWithoutExt);
        }
        catch (Exception ex)
        {
            Debug.Log("FOUNDRY_PROFILER_SKIP " + ex.Message);
        }
    }

    private static void TryStopProfiler()
    {
        try
        {
            Profiler.enabled = false;
            Profiler.enableBinaryLog = false;
            Profiler.logFile = "";
            Debug.Log("FOUNDRY_PROFILER_OFF");
        }
        catch (Exception ex)
        {
            Debug.Log("FOUNDRY_PROFILER_SKIP " + ex.Message);
        }
    }
}
