using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Rendering;
#if UNITY_EDITOR
using UnityEditor;
#endif
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
#endif

/// <summary>
/// Records motion PNG sequences for animation review. Not a visual-feel verdict.
/// live_enemy uses normal walk into an occupied room. biome_1/2 warps are diagnostic only.
/// </summary>
[DefaultExecutionOrder(-200)]
public class MotionCaptureDriver : MonoBehaviour
{
    private const int FrameW = 960;
    private const int FrameH = 540;
    private const float TargetFps = 60f;

    private GameBootstrap _game;
    private string _motionRoot;
    private readonly List<string> _clips = new List<string>();
    private readonly List<string> _hitchLog = new List<string>();
    private bool _frameCombat;
    private bool _writeFrames = true;
    private RenderTexture[] _ring;

    private IEnumerator Start()
    {
        _game = GetComponent<GameBootstrap>();
        var wait = 0f;
        while ((_game == null || _game.Pack == null || _game.Player == null) && wait < 8f)
        {
            wait += Time.unscaledDeltaTime;
            yield return null;
        }
        foreach (var arg in Environment.GetCommandLineArgs())
        {
            if (arg.Equals("-acceptanceMode=hitch", StringComparison.OrdinalIgnoreCase) ||
                arg.Equals("-motionCapture=off", StringComparison.OrdinalIgnoreCase))
                _writeFrames = false;
        }
        if (string.Equals(AcceptanceDriver.ForcedMode, "hitch", StringComparison.OrdinalIgnoreCase))
            _writeFrames = false;
        var qa = Path.Combine(Directory.GetParent(Application.dataPath)?.FullName ?? Application.persistentDataPath, "qa");
        _motionRoot = Path.Combine(qa, "motion", _writeFrames ? "60fps" : "hitch");
        Directory.CreateDirectory(_motionRoot);
        Time.timeScale = 1f;
        QualitySettings.vSyncCount = 0;
        Application.targetFrameRate = 60;
        EnsureKeyboard();
        NoteHitch("boot", "assetPrepMs=" + StreamingArtCache.LastPreloadMs.ToString("0.0") +
                          " files=" + StreamingArtCache.LastPreloadCount +
                          " capture=" + _writeFrames);

        yield return Warmup(_writeFrames ? 5.5f : 2.2f);
        yield return WaitUntilSettled("boot_room_000");
        yield return RecordWhile("biome_0_env", 2.2f, IdleHold, false,
            "pouring-bay environmental loops at timescale 1; room_000 after init settled. not a diagnostic warp");
        yield return RecordWhile("courier_move_combat", 3.5f, CourierMoveCombat, false,
            "room_000 normal input; walk/run/jump/attack. target 60fps async GPU readback; timescale 1 is not smoothness");
        yield return ApproachEnemy();
        yield return WaitUntilSettled("post_approach");
        var enemy = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
        var enemyReady = enemy != null && _game != null && _game.CurrentRoomId != "room_000";
        var liveNote = enemyReady
            ? "live enemy via normal walk into occupied room after door load settled. movement/attack/recovery/hurt/death. door transitions are under qa/motion/*/transitions"
            : "FAILED to reach an enemy room via normal input; clip is not acceptance evidence";
        yield return RecordWhile("live_enemy", 7.0f, LiveEnemy, enemyReady, liveNote);

        if (_game != null)
        {
            yield return MeasureTransition("room_003", "DIAGNOSTIC WARP room_003");
            yield return WaitUntilSettled("post_warp_003");
            yield return RecordWhile("biome_1_env", 2.2f, IdleHold, false,
                "DIAGNOSTIC WARP room_003 quench loops; recorded after load settled; not live-enemy or progression evidence");
            yield return MeasureTransition("room_006", "DIAGNOSTIC WARP room_006");
            yield return WaitUntilSettled("post_warp_006");
            yield return RecordWhile("biome_2_env", 2.2f, IdleHold, false,
                "DIAGNOSTIC WARP room_006 cooling-yard loops; recorded after load settled; not live-enemy or progression evidence");
        }

        File.WriteAllText(Path.Combine(_motionRoot, "index.json"), IndexJson());
        File.WriteAllText(Path.Combine(_motionRoot, "hitch-log.jsonl"), string.Join("", _hitchLog));
        Debug.Log("FOUNDRY_MOTION_OK clips=" + _clips.Count + " capture=" + _writeFrames);
#if UNITY_EDITOR
        EditorApplication.Exit(0);
#else
        Application.Quit(0);
#endif
    }

    private void LateUpdate()
    {
        if (!_frameCombat)
            return;
        FrameCombatCamera();
    }

    private void CourierMoveCombat()
    {
        Hold(KeyCode.D, true);
        Hold(KeyCode.LeftShift, true);
        var x = _game != null && _game.Player != null ? _game.Player.transform.position.x : 0f;
        var roomW = _game != null && _game.CurrentRoom != null ? _game.CurrentRoom.width : 800f;
        if (x < roomW - 140f && Time.unscaledTime % 1.4f < 0.08f)
            Hold(KeyCode.Space, true);
        else
            Hold(KeyCode.Space, false);
        if (Time.unscaledTime % 0.55f < 0.12f)
            Hold(KeyCode.J, true);
        else
            Hold(KeyCode.J, false);
    }

    private IEnumerator Warmup(float seconds)
    {
        var until = Time.unscaledTime + seconds;
        var rt = new RenderTexture(FrameW, FrameH, 0, RenderTextureFormat.ARGB32);
        rt.Create();
        var stable = 0;
        while (Time.unscaledTime < until)
        {
            IdleHold();
            ApplyKeys();
            yield return null;
            _pulse = KeyCode.None;
            if (_writeFrames)
            {
                var cam = Camera.main;
                if (cam != null)
                {
                    var prev = cam.targetTexture;
                    cam.targetTexture = rt;
                    cam.Render();
                    cam.targetTexture = prev;
                    var req = AsyncGPUReadback.Request(rt, 0, TextureFormat.RGB24);
                    while (!req.done)
                        yield return null;
                }
            }
            if (Time.unscaledDeltaTime > 0f && Time.unscaledDeltaTime < 0.05f)
                stable++;
            else
                stable = 0;
            if (stable >= 60)
                break;
        }
        rt.Release();
        Debug.Log("FOUNDRY_MOTION_WARMUP stableFrames=" + stable);
    }

    private void NoteHitch(string name, string detail)
    {
        _hitchLog.Add("{\"t\":" + Time.unscaledTime.ToString("0.###") +
                      ",\"name\":\"" + name + "\",\"detail\":\"" + (detail ?? "").Replace("\"", "'") +
                      "\",\"room\":\"" + (_game != null ? _game.CurrentRoomId : "") +
                      "\",\"capture\":" + (_writeFrames ? "true" : "false") + "}\n");
        Debug.Log("FOUNDRY_HITCH " + name + " " + detail);
    }

    private IEnumerator MeasureTransition(string roomId, string label)
    {
        var gc0 = GC.CollectionCount(0);
        _game.DiagnosticWarpToRoom(roomId);
        yield return null;
        var dt = Time.unscaledDeltaTime;
        var loadMs = _game != null ? _game.LastRoomLoadMs : -1f;
        var gc = GC.CollectionCount(0) - gc0;
        WriteTransitionFile(roomId, label, loadMs, dt, gc);
        yield break;
    }

    private void WriteTransitionFile(string name, string label, float loadMs, float nextDt, int gc)
    {
        NoteHitch("transition_" + name,
            label + " loadMs=" + loadMs.ToString("0.0") + " nextFrameDt=" + nextDt.ToString("0.####") +
            " gc0Delta=" + gc);
        var transDir = Path.Combine(_motionRoot, "transitions");
        Directory.CreateDirectory(transDir);
        File.WriteAllText(
            Path.Combine(transDir, name + ".json"),
            "{\n  \"id\": \"" + name + "\",\n  \"label\": \"" + label.Replace("\"", "'") +
            "\",\n  \"loadMs\": " + loadMs.ToString("0.0") +
            ",\n  \"nextFrameDt\": " + nextDt.ToString("0.####") +
            ",\n  \"gc0Delta\": " + gc +
            ",\n  \"captureEnabled\": " + (_writeFrames ? "true" : "false") +
            ",\n  \"note\": \"Transition measurement separate from env/combat clips.\"\n}\n");
    }

    private IEnumerator WaitUntilSettled(string label)
    {
        var until = Time.unscaledTime + 2.4f;
        var stable = 0;
        float maxDt = 0f;
        while (Time.unscaledTime < until)
        {
            IdleHold();
            ApplyKeys();
            yield return null;
            var dt = Time.unscaledDeltaTime;
            if (dt > maxDt)
                maxDt = dt;
            if (dt > 0f && dt < 0.04f)
                stable++;
            else
                stable = 0;
            if (stable >= 45)
                break;
        }
        NoteHitch("settle_" + label, "maxDt=" + maxDt.ToString("0.####") + " stableFrames=" + stable);
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
                WriteTransitionFile(
                    "live_" + lastRoom + "_to_" + room,
                    "LIVE DOOR " + lastRoom + " -> " + room,
                    _game != null ? _game.LastRoomLoadMs : -1f,
                    Time.unscaledDeltaTime,
                    0);
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

    private void IdleHold()
    {
        Hold(KeyCode.D, false);
        Hold(KeyCode.A, false);
        Hold(KeyCode.LeftShift, false);
        Hold(KeyCode.J, false);
        Hold(KeyCode.Space, false);
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

    private IEnumerator RecordWhile(string name, float seconds, System.Action tick, bool frameCombat, string note)
    {
        var dir = Path.Combine(_motionRoot, name);
        Directory.CreateDirectory(dir);
        foreach (var leftover in Directory.GetFiles(dir, "frame_*.png"))
            File.Delete(leftover);
        yield return WaitUntilSettled("pre_record_" + name);
        _frameCombat = frameCombat;
        _tick = tick;
        var events = new StringBuilder();
        var pending = new List<PendingRead>();
        var captured = new List<CapturedFrame>();
        var dts = new List<float>();
        var stalls = new StringBuilder();
        if (_writeFrames)
            EnsureRing();
        var slot = 0;
        var requested = 0;
        var gpuErrors = 0;
        var droppedBacklog = 0;
        var skippedCap = 0;
        var gameFrames = 0;
        var lastCap = -999f;
        var minDt = 1f / TargetFps;
        var recStart = Time.unscaledTime;
        var lastFrameTime = recStart;
        var lastEvent = -999f;
        var until = recStart + seconds;
        var gcAtStart = GC.CollectionCount(0);

        while (Time.unscaledTime < until)
        {
            ApplyKeys();
            yield return null;
            _pulse = KeyCode.None;
            gameFrames++;
            var now = Time.unscaledTime;
            var dt = now - lastFrameTime;
            dts.Add(dt);
            lastFrameTime = now;
            if (dt >= 0.05f)
            {
                stalls.Append("{\"t\":").Append((now - recStart).ToString("0.###"));
                stalls.Append(",\"dt\":").Append(dt.ToString("0.####"));
                stalls.Append(",\"room\":\"").Append(_game != null ? _game.CurrentRoomId : "").Append("\"");
                stalls.Append(",\"gc0\":").Append(GC.CollectionCount(0) - gcAtStart);
                stalls.Append(",\"capture\":").Append(_writeFrames ? "true" : "false");
                stalls.Append(",\"artMisses\":").Append(StreamingArtCache.MissCount);
                stalls.Append(",\"lastSpan\":\"").Append(MainThreadProbe.LastName).Append("\"");
                stalls.Append(",\"lastSpanMs\":").Append(MainThreadProbe.LastMsValue.ToString("0.###"));
                stalls.Append(",\"framing\":").Append(_frameCombat ? "true" : "false");
                stalls.Append("}\n");
            }
            if (!_writeFrames)
            {
                if (now - lastEvent >= 0.08f)
                {
                    lastEvent = now;
                    AppendEvent(events, now - recStart);
                }
                continue;
            }
            Harvest(pending, captured, ref gpuErrors);
            if (now - lastEvent >= 0.08f)
            {
                lastEvent = now;
                AppendEvent(events, now - recStart);
            }
            if (now - lastCap < minDt * 0.85f)
            {
                skippedCap++;
                continue;
            }
            var inFlight = 0;
            for (var i = 0; i < pending.Count; i++)
            {
                if (!pending[i].req.done)
                    inFlight++;
            }
            if (inFlight >= _ring.Length - 1)
            {
                droppedBacklog++;
                continue;
            }
            lastCap = now;
            var rt = _ring[slot % _ring.Length];
            var wrapped = 0;
            while (RtInFlight(pending, rt) && wrapped < _ring.Length)
            {
                slot++;
                wrapped++;
                rt = _ring[slot % _ring.Length];
            }
            if (RtInFlight(pending, rt))
            {
                droppedBacklog++;
                continue;
            }
            slot++;
            var cam = Camera.main;
            var ok = false;
            if (cam != null)
            {
                var prev = cam.targetTexture;
                cam.targetTexture = rt;
                cam.Render();
                cam.targetTexture = prev;
                ok = true;
            }
            if (!ok)
            {
                droppedBacklog++;
                continue;
            }
            requested++;
            pending.Add(new PendingRead
            {
                req = AsyncGPUReadback.Request(rt, 0, TextureFormat.RGB24),
                t = now - recStart,
                rt = rt,
            });
        }

        var recEnd = Time.unscaledTime;
        if (_writeFrames)
        {
            var waitUntil = Time.unscaledTime + 6f;
            while (pending.Count > 0 && Time.unscaledTime < waitUntil)
            {
                Harvest(pending, captured, ref gpuErrors);
                yield return null;
            }
            gpuErrors += pending.Count;
            pending.Clear();
            captured.Sort((a, b) => a.t.CompareTo(b.t));
            for (var i = 0; i < captured.Count; i++)
            {
                var tex = new Texture2D(FrameW, FrameH, TextureFormat.RGB24, false);
                tex.LoadRawTextureData(captured[i].rgb);
                tex.Apply(false, false);
                File.WriteAllBytes(Path.Combine(dir, "frame_" + i.ToString("0000") + ".png"), tex.EncodeToPNG());
                UnityEngine.Object.Destroy(tex);
            }
        }
        else
            pending.Clear();

        var duration = Mathf.Max(0.001f, recEnd - recStart);
        var written = _writeFrames ? captured.Count : 0;
        var coverage = _writeFrames ? written : gameFrames;
        var achieved = coverage / duration;
        var expected = Mathf.RoundToInt(duration * TargetFps);
        var droppedVsTarget = Mathf.Max(0, expected - coverage);
        float meanDt = 0f;
        float maxDt = 0f;
        for (var i = 0; i < dts.Count; i++)
        {
            meanDt += dts[i];
            if (dts[i] > maxDt)
                maxDt = dts[i];
        }
        if (dts.Count > 0)
            meanDt /= dts.Count;

        File.WriteAllText(
            Path.Combine(dir, "meta.json"),
            "{\n  \"clip\": \"" + name + "\",\n  \"targetFps\": " + TargetFps.ToString("0") +
            ",\n  \"timescale\": 1,\n  \"durationSec\": " + duration.ToString("0.###") +
            ",\n  \"gameFrames\": " + gameFrames +
            ",\n  \"requestedCaptures\": " + requested +
            ",\n  \"writtenFrames\": " + written +
            ",\n  \"gpuReadbackErrors\": " + gpuErrors +
            ",\n  \"droppedBacklog\": " + droppedBacklog +
            ",\n  \"skippedForCap\": " + skippedCap +
            ",\n  \"droppedVsTarget60\": " + droppedVsTarget +
            ",\n  \"achievedFps\": " + achieved.ToString("0.##") +
            ",\n  \"meanGameDt\": " + meanDt.ToString("0.####") +
            ",\n  \"maxGameDt\": " + maxDt.ToString("0.####") +
            ",\n  \"width\": " + FrameW + ",\n  \"height\": " + FrameH +
            ",\n  \"captureEnabled\": " + (_writeFrames ? "true" : "false") +
            ",\n  \"encodeAfterClip\": true,\n  \"note\": \"" + (note ?? "").Replace("\"", "'") + "\"\n}\n");
        File.WriteAllText(Path.Combine(dir, "events.jsonl"), events.ToString());
        File.WriteAllText(Path.Combine(dir, "stalls.jsonl"), stalls.ToString());
        _clips.Add(name);
        _frameCombat = false;
        _tick = null;
        IdleHold();
        ApplyKeys();
        Debug.Log("FOUNDRY_MOTION_CLIP " + name + " written=" + written + " requested=" + requested +
                  " achievedFps=" + achieved.ToString("0.0") + " droppedVs60=" + droppedVsTarget +
                  " maxDt=" + maxDt.ToString("0.####") + " capture=" + _writeFrames);
        if (_writeFrames)
            yield return WaitUntilSettled("post_encode_" + name);
        else
        {
            for (var i = 0; i < 12; i++)
                yield return null;
        }
    }

    private void EnsureRing()
    {
        if (_ring != null)
            return;
        _ring = new RenderTexture[8];
        for (var i = 0; i < _ring.Length; i++)
        {
            _ring[i] = new RenderTexture(FrameW, FrameH, 0, RenderTextureFormat.ARGB32);
            _ring[i].Create();
        }
    }

    private void AppendEvent(StringBuilder events, float t)
    {
        var enemy = UnityEngine.Object.FindFirstObjectByType<EnemyActor>();
        var p = _game != null ? _game.Player : null;
        events.Append("{\"t\":").Append(t.ToString("0.###"));
        events.Append(",\"room\":\"").Append(_game != null ? _game.CurrentRoomId : "").Append("\"");
        events.Append(",\"playerClip\":\"").Append(p != null ? p.CurrentClip : "").Append("\"");
        events.Append(",\"playerX\":").Append(p != null ? p.transform.position.x.ToString("0.#") : "0");
        events.Append(",\"enemyPresent\":").Append(enemy != null ? "true" : "false");
        if (enemy != null)
        {
            events.Append(",\"enemyClip\":\"").Append(enemy.CurrentClip).Append("\"");
            events.Append(",\"enemyHp\":").Append(enemy.Health.ToString("0.#"));
            events.Append(",\"enemyX\":").Append(enemy.transform.position.x.ToString("0.#"));
        }
        events.Append("}\n");
    }

    private static bool RtInFlight(List<PendingRead> pending, RenderTexture rt)
    {
        for (var i = 0; i < pending.Count; i++)
        {
            if (pending[i].rt == rt && !pending[i].req.done)
                return true;
        }
        return false;
    }

    private static void Harvest(List<PendingRead> pending, List<CapturedFrame> captured, ref int gpuErrors)
    {
        for (var i = pending.Count - 1; i >= 0; i--)
        {
            var item = pending[i];
            if (!item.req.done)
                continue;
            pending.RemoveAt(i);
            if (item.req.hasError)
            {
                gpuErrors++;
                continue;
            }
            captured.Add(new CapturedFrame { t = item.t, rgb = item.req.GetData<byte>().ToArray() });
        }
    }

    private class PendingRead
    {
        public AsyncGPUReadbackRequest req;
        public float t;
        public RenderTexture rt;
    }

    private class CapturedFrame
    {
        public float t;
        public byte[] rgb;
    }

    private readonly HashSet<KeyCode> _held = new HashSet<KeyCode>();
    private KeyCode _pulse = KeyCode.None;
    private System.Action _tick;
    private bool _loggedHold;

    private void Update()
    {
        _tick?.Invoke();
        ApplyKeys();
        _pulse = KeyCode.None;
    }

    private void FixedUpdate()
    {
        _tick?.Invoke();
        ApplyKeys();
    }

    private void Hold(KeyCode key, bool down)
    {
        if (down)
            _held.Add(key);
        else
            _held.Remove(key);
    }

    private void Pulse(KeyCode key)
    {
        _pulse = key;
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
        MapKey(_pulse, keys);
        var state = keys.Count == 0 ? default : new KeyboardState(keys.ToArray());
        InputSystem.QueueStateEvent(kb, state);
        InputSystem.Update();
        if (!_loggedHold && _held.Contains(KeyCode.D))
        {
            _loggedHold = true;
            Debug.Log("FOUNDRY_MOTION_HOLD_D enabled=" + kb.enabled + " pressed=" + kb.dKey.isPressed);
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

    private string IndexJson()
    {
        var sb = new StringBuilder();
        sb.Append("{\n  \"engine\": \"unity\",\n  \"targetFps\": 60,\n  \"timescale\": 1,\n");
        sb.Append("  \"note\": \"Async GPU readback when captureEnabled. Encode after each clip. Timescale 1 is not a smoothness claim. biome_1/2 warps are diagnostic; env clips start after settle. NPC/boss not implemented. Visual feel pending human review.\",\n");
        sb.Append("  \"captureEnabled\": ").Append(_writeFrames ? "true" : "false").Append(",\n  \"clips\": [");
        for (var i = 0; i < _clips.Count; i++)
        {
            if (i > 0)
                sb.Append(", ");
            sb.Append("\"").Append(_clips[i]).Append("\"");
        }
        sb.Append("]\n}\n");
        return sb.ToString();
    }
}
