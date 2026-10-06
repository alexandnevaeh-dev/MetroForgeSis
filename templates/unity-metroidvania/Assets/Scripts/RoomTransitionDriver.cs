using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
#endif

/// <summary>
/// Focused room-transition and checkpoint/gate checks. Capture off. Not animation-feel.
/// DiagnosticWarp and ReloadFromSaveFile are labeled separately from Title Continue.
/// </summary>
[DefaultExecutionOrder(-200)]
public class RoomTransitionDriver : MonoBehaviour
{
    private GameBootstrap _game;
    private string _outDir;
    private readonly HashSet<KeyCode> _held = new HashSet<KeyCode>();
    private System.Action _tick;
    private int _crossings;

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
        _outDir = Path.Combine(qa, "motion", "room-transition");
        Directory.CreateDirectory(_outDir);
        Time.timeScale = 1f;
        QualitySettings.vSyncCount = 0;
        Application.targetFrameRate = 60;
        EnsureKeyboard();
        MainThreadProbe.Reset();
        _game.TransitionLog.Clear();

        var boot = "{\"note\":\"cold_entry is the already-loaded start room, not a door\",\"room\":\"" +
                   _game.CurrentRoomId + "\",\"roomLoadMs\":" + _game.LastRoomLoadMs.ToString("0.0") +
                   ",\"cached\":" + (_game.LastTransitionCached ? "true" : "false") +
                   ",\"phases\":" + (_game.LastTransitionJson ?? "null") + "}\n";
        File.WriteAllText(Path.Combine(_outDir, "cold-entry.json"), boot);
        Debug.Log("FOUNDRY_ROOM_TRANSITION_BOOT " + boot.Trim());

        yield return Idle(0.6f);
        yield return CrossingLoop();
        yield return AttackNearDoors();
        yield return CheckpointAndRespawn();
        yield return GateCheck();
        yield return ContinueChecks();

        File.WriteAllText(Path.Combine(_outDir, "transitions.jsonl"), string.Join("\n", _game.TransitionLog) + "\n");
        File.WriteAllText(Path.Combine(_outDir, "spans.jsonl"), MainThreadProbe.Dump());
        WriteInventory();
        Debug.Log("FOUNDRY_ROOM_TRANSITION_OK crossings=" + _crossings);
#if UNITY_EDITOR
        EditorApplication.Exit(0);
#else
        Application.Quit(0);
#endif
    }

    private IEnumerator CrossingLoop()
    {
        var startLoads = _game.TransitionLog.Count;
        yield return WalkToRoom("room_001", KeyCode.D, 8f);
        _crossings++;
        yield return Idle(0.25f);
        var afterCold = Snapshot("cold_001", startLoads);
        yield return WalkToRoom("room_000", KeyCode.A, 8f);
        _crossings++;
        yield return Idle(0.25f);
        var afterWarm000 = Snapshot("warm_000", afterCold.loads);
        for (var i = 0; i < 2; i++)
        {
            yield return WalkToRoom("room_001", KeyCode.D, 8f);
            _crossings++;
            yield return Idle(0.15f);
            yield return WalkToRoom("room_000", KeyCode.A, 8f);
            _crossings++;
            yield return Idle(0.15f);
        }
        var afterRepeat = Snapshot("repeat_back", afterWarm000.loads);
        var json = "{\n  \"crossings\": " + _crossings +
                   ",\n  \"loadEvents\": " + (_game.TransitionLog.Count - startLoads) +
                   ",\n  \"onePerCrossing\": " + ((_game.TransitionLog.Count - startLoads) == _crossings ? "true" : "false") +
                   ",\n  \"activeNamedRooms\": " + _game.ActiveNamedRoomCount() +
                   ",\n  \"cachedRooms\": " + _game.CachedRoomCount +
                   ",\n  \"cold_001\": " + afterCold.json +
                   ",\n  \"warm_000\": " + afterWarm000.json +
                   ",\n  \"repeat\": " + afterRepeat.json +
                   ",\n  \"note\": \"Transition duration is LastRoomLoadMs / phases, not gameplay frame dt.\"\n}\n";
        File.WriteAllText(Path.Combine(_outDir, "crossings.json"), json);
        Debug.Log("FOUNDRY_CROSSINGS " + json.Replace("\n", " "));
    }

    private IEnumerator AttackNearDoors()
    {
        if (_game.CurrentRoomId != "room_001")
            yield return WalkToRoom("room_001", KeyCode.D, 8f);
        var loadsBefore = _game.TransitionLog.Count;
        var roomBefore = _game.CurrentRoomId;
        _tick = () =>
        {
            Hold(KeyCode.A, _game.Player != null && _game.Player.transform.position.x > 90f);
            Hold(KeyCode.J, true);
        };
        var until = Time.unscaledTime + 1.2f;
        while (Time.unscaledTime < until)
            yield return null;
        _tick = null;
        IdleHold();
        ApplyKeys();
        _tick = () =>
        {
            Hold(KeyCode.D, _game.Player != null && _game.Player.transform.position.x < 860f);
            Hold(KeyCode.J, true);
        };
        until = Time.unscaledTime + 1.2f;
        while (Time.unscaledTime < until)
            yield return null;
        _tick = null;
        IdleHold();
        ApplyKeys();
        var loads = _game.TransitionLog.Count - loadsBefore;
        var json = "{\n  \"roomBefore\": \"" + roomBefore + "\",\n  \"roomAfter\": \"" + _game.CurrentRoomId +
                   "\",\n  \"loadsDuringAttack\": " + loads +
                   ",\n  \"sameRoomReload\": " + (loads > 0 && _game.CurrentRoomId == roomBefore ? "true" : "false") +
                   ",\n  \"ok\": " + (loads == 0 || _game.CurrentRoomId != roomBefore ? "true" : "false") +
                   ",\n  \"note\": \"Attack hitbox must not open doors. Zero or one intended crossing only.\"\n}\n";
        File.WriteAllText(Path.Combine(_outDir, "attack-near-doors.json"), json);
        Debug.Log("FOUNDRY_ATTACK_NEAR_DOORS " + json.Replace("\n", " "));
    }

    private IEnumerator CheckpointAndRespawn()
    {
        if (_game.CurrentRoomId != "room_000")
            yield return WalkToRoom("room_000", KeyCode.A, 8f);
        yield return WalkOntoShrine();
        var shrineAnchor = _game.RespawnAnchor;
        var shrineOk = Vector2.Distance(shrineAnchor, Coord.FromGodot(150f, 480f, 520f)) < 64f ||
                       (_game.Player != null && Vector2.Distance(_game.Player.transform.position, shrineAnchor) < 24f);
        yield return Idle(0.35f);
        var ignoredBefore = CountSpan("checkpoint_ignored");
        var acceptedBefore = CountSpan("checkpoint");
        yield return WalkToRoom("room_001", KeyCode.D, 8f);
        _tick = () =>
        {
            Hold(KeyCode.D, _game.Player != null && _game.Player.transform.position.x < 200f);
        };
        var until = Time.unscaledTime + 2f;
        while (Time.unscaledTime < until && _game.Player != null && _game.Player.transform.position.x < 180f)
            yield return null;
        _tick = null;
        IdleHold();
        ApplyKeys();
        yield return Idle(0.3f);
        var ignoredIn001 = CountSpan("checkpoint_ignored") - ignoredBefore;
        var acceptedIn001 = CountSpan("checkpoint") - acceptedBefore;
        var spawnBeforeDeath = _game.RespawnAnchor;
        if (_game.Player != null && _game.Player.Health > 1f)
            _game.Player.Hurt(9999f);
        yield return null;
        var deathPos = _game.Player != null ? (Vector2)_game.Player.transform.position : Vector2.zero;
        var diedAtDoorNotShrine = Vector2.Distance(deathPos, spawnBeforeDeath) < 16f &&
                                  Vector2.Distance(deathPos, Coord.FromGodot(150f, 480f, 520f)) > 40f;
        yield return WalkToRoom("room_000", KeyCode.A, 8f);
        yield return Idle(0.3f);
        if (_game.Player != null && _game.Player.Health > 1f)
            _game.Player.Hurt(9999f);
        yield return null;
        var death000 = _game.Player != null ? (Vector2)_game.Player.transform.position : Vector2.zero;
        var json = "{\n  \"shrineTouchedIn000\": " + (shrineOk ? "true" : "false") +
                   ",\n  \"acceptedInRoom001\": " + acceptedIn001 +
                   ",\n  \"ignoredInRoom001\": " + ignoredIn001 +
                   ",\n  \"room001HasAuthoredCheckpoint\": false" +
                   ",\n  \"deathIn001AtDoorSpawn\": " + (diedAtDoorNotShrine ? "true" : "false") +
                   ",\n  \"death001Pos\": \"" + deathPos.x.ToString("0.#") + "," + deathPos.y.ToString("0.#") + "\"" +
                   ",\n  \"death000Pos\": \"" + death000.x.ToString("0.#") + "," + death000.y.ToString("0.#") + "\"" +
                   ",\n  \"ok\": " + (acceptedIn001 == 0 && diedAtDoorNotShrine ? "true" : "false") +
                   ",\n  \"note\": \"room_001/002 must not accept room_000 shrine. Production death uses _spawn.\"\n}\n";
        File.WriteAllText(Path.Combine(_outDir, "checkpoints.json"), json);
        Debug.Log("FOUNDRY_CHECKPOINTS " + json.Replace("\n", " "));
    }

    private IEnumerator GateCheck()
    {
        var hadDash = _game.Player != null && _game.Player.Abilities.Contains("dash");
        Debug.Log("FOUNDRY_GATE_SETUP diagnostic_warp room_004 labeled=DIAGNOSTIC_WARP");
        _game.DiagnosticWarpToRoom("room_004");
        yield return null;
        var gatesNoDash = CountGates();
        var blocked = gatesNoDash > 0 && !hadDash;
        if (_game.Player != null)
            _game.Player.GrantAbility("dash");
        yield return null;
        var gatesWithDash = CountGates();
        var json = "{\n  \"room\": \"" + _game.CurrentRoomId +
                   "\",\n  \"setup\": \"DIAGNOSTIC_WARP room_004. Not traversal evidence.\"" +
                   ",\n  \"hadDashBeforeWarp\": " + (hadDash ? "true" : "false") +
                   ",\n  \"gatesWithoutDash\": " + gatesNoDash +
                   ",\n  \"gatesAfterGrantDash\": " + gatesWithDash +
                   ",\n  \"ok\": " + (gatesNoDash > 0 && gatesWithDash == 0 ? "true" : "false") +
                   ",\n  \"note\": \"room_004 authors a dash gate. Zero-gates-stayed-zero is not this check.\"\n}\n";
        File.WriteAllText(Path.Combine(_outDir, "gates.json"), json);
        Debug.Log("FOUNDRY_GATES " + json.Replace("\n", " "));
    }

    private IEnumerator ContinueChecks()
    {
        if (_game.Player != null)
            _game.Player.GrantAbility("dash");
        yield return Idle(0.2f);
        var saveRoom = _game.CurrentRoomId;
        var saveX = _game.Player != null ? _game.Player.transform.position.x : 0f;
        _game.ReloadFromSaveFile();
        yield return null;
        var diagOk = _game.CurrentRoomId == saveRoom &&
                     _game.Player != null && Mathf.Abs(_game.Player.transform.position.x - saveX) < 48f;
        var diag = "{\n    \"kind\": \"ReloadFromSaveFile\",\n    \"playerFacing\": false,\n    \"ok\": " +
                   (diagOk ? "true" : "false") + ",\n    \"room\": \"" + _game.CurrentRoomId +
                   "\",\n    \"x\": " + (_game.Player != null ? _game.Player.transform.position.x.ToString("0.##") : "-1") +
                   "\n  }";

        _game.OpenTitleScreen();
        yield return null;
        yield return null;
        var clicked = _game.TryClickTitleContinue();
        yield return null;
        yield return null;
        var titleOk = clicked && _game.CurrentRoomId == saveRoom && _game.Player != null &&
                      Mathf.Abs(_game.Player.transform.position.x - saveX) < 64f;
        var title = "{\n    \"kind\": \"TitleContinueButton\",\n    \"playerFacing\": true,\n    \"clicked\": " +
                    (clicked ? "true" : "false") + ",\n    \"ok\": " + (titleOk ? "true" : "false") +
                    ",\n    \"room\": \"" + _game.CurrentRoomId +
                    "\",\n    \"x\": " + (_game.Player != null ? _game.Player.transform.position.x.ToString("0.##") : "-1") +
                    "\n  }";
        var json = "{\n  \"diagnosticReloadFromSaveFile\": " + diag +
                   ",\n  \"titleContinue\": " + title + "\n}\n";
        File.WriteAllText(Path.Combine(_outDir, "continue.json"), json);
        Debug.Log("FOUNDRY_CONTINUE " + json.Replace("\n", " "));
    }

    private struct Snap
    {
        public int loads;
        public string json;
    }

    private Snap Snapshot(string label, int prevLoads)
    {
        var loads = _game.TransitionLog.Count;
        var phases = _game.LastTransitionJson ?? "{}";
        var json = "{\n    \"label\": \"" + label + "\",\n    \"cached\": " +
                   (_game.LastTransitionCached ? "true" : "false") +
                   ",\n    \"totalMs\": " + _game.LastRoomLoadMs.ToString("0.###") +
                   ",\n    \"newLoads\": " + (loads - prevLoads) +
                   ",\n    \"activeNamedRooms\": " + _game.ActiveNamedRoomCount() +
                   ",\n    \"phases\": " + phases + "\n  }";
        return new Snap { loads = loads, json = json };
    }

    private IEnumerator WalkOntoShrine()
    {
        var shrine = GameObject.Find("Checkpoint");
        if (shrine == null || _game.Player == null)
            yield break;
        var shrineCol = shrine.GetComponent<Collider2D>();
        var playerCol = _game.Player.GetComponent<Collider2D>();
        _tick = () =>
        {
            var dx = shrine.transform.position.x - _game.Player.transform.position.x;
            Hold(KeyCode.D, dx > 4f);
            Hold(KeyCode.A, dx < -4f);
        };
        var until = Time.unscaledTime + 3f;
        while (Time.unscaledTime < until)
        {
            if (shrineCol != null && playerCol != null && shrineCol.Distance(playerCol).isOverlapped)
                break;
            yield return null;
        }
        _tick = null;
        IdleHold();
        ApplyKeys();
        for (var i = 0; i < 6; i++)
            yield return null;
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
        yield return Idle(0.2f);
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

    private static int CountGates()
    {
        return UnityEngine.Object.FindObjectsByType<GateBlocker>(FindObjectsInactive.Exclude, FindObjectsSortMode.None).Length;
    }

    private static int CountSpan(string name)
    {
        var dump = MainThreadProbe.Dump();
        var n = 0;
        var needle = "\"name\":\"" + name + "\"";
        var i = 0;
        while ((i = dump.IndexOf(needle, i, StringComparison.Ordinal)) >= 0)
        {
            n++;
            i += needle.Length;
        }
        return n;
    }

    private void WriteInventory()
    {
        var doors = UnityEngine.Object.FindObjectsByType<DoorSensor>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length;
        var doorsActive = UnityEngine.Object.FindObjectsByType<DoorSensor>(FindObjectsInactive.Exclude, FindObjectsSortMode.None).Length;
        var checks = UnityEngine.Object.FindObjectsByType<CheckpointPulse>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length;
        var checksActive = UnityEngine.Object.FindObjectsByType<CheckpointPulse>(FindObjectsInactive.Exclude, FindObjectsSortMode.None).Length;
        File.WriteAllText(Path.Combine(_outDir, "inventory.json"),
            "{\n  \"activeNamedRooms\": " + _game.ActiveNamedRoomCount() +
            ",\n  \"cachedRooms\": " + _game.CachedRoomCount +
            ",\n  \"doorSensorsIncludingInactive\": " + doors +
            ",\n  \"doorSensorsActive\": " + doorsActive +
            ",\n  \"checkpointsIncludingInactive\": " + checks +
            ",\n  \"checkpointsActive\": " + checksActive + "\n}\n");
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
        {
            switch (code)
            {
                case KeyCode.A: keys.Add(UnityEngine.InputSystem.Key.A); break;
                case KeyCode.D: keys.Add(UnityEngine.InputSystem.Key.D); break;
                case KeyCode.J: keys.Add(UnityEngine.InputSystem.Key.J); break;
                case KeyCode.LeftShift: keys.Add(UnityEngine.InputSystem.Key.LeftShift); break;
                case KeyCode.Space: keys.Add(UnityEngine.InputSystem.Key.Space); break;
            }
        }
        var state = keys.Count == 0 ? default : new KeyboardState(keys.ToArray());
        InputSystem.QueueStateEvent(kb, state);
        InputSystem.Update();
#endif
    }
}
