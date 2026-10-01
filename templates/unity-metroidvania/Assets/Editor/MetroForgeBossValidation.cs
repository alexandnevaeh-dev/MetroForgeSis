using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

[InitializeOnLoad]
public static class MetroForgeBossValidation
{
    private const string Pending = "MetroForge.BossValidation.Pending";
    static MetroForgeBossValidation()
    {
        EditorApplication.update += () =>
        {
            if (EditorApplication.isPlaying && SessionState.GetBool(Pending, false))
            {
                SessionState.EraseBool(Pending);
                new GameObject("BossRuntimeProbe").AddComponent<MetroForgeBossRuntimeProbe>();
            }
        };
    }

    public static GameplayBossPhase[] Phases() => new[] {
        new GameplayBossPhase { phase = 1, healthThreshold = 1, attacks = new[] { "slam", "projectile" }, telegraphDuration = 0.8f, recoveryWindow = 1.2f },
        new GameplayBossPhase { phase = 2, healthThreshold = 0.5f, attacks = new[] { "slam", "projectile", "area_burst" }, telegraphDuration = 0.6f, recoveryWindow = 0.8f }
    };

    public static void RunRules()
    {
        var passed = false;
        var checks = 0;
        var detail = "";
        void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
        try
        {
            var encounter = new BossEncounter(Phases());
            encounter.Tick(0.7f, 200, 200, true, true);
            Check(encounter.State == BossEncounter.Stage.Telegraph && !encounter.AttackReady, "Attack skipped its telegraph.");
            encounter.Tick(0.79f, 190, 200, true, true);
            Check(!encounter.AttackReady, "A hit cancelled or shortened the committed windup.");
            encounter.Tick(0.02f, 190, 200, true, true);
            Check(encounter.State == BossEncounter.Stage.Attack && !encounter.AttackReady, "Damage fired at attack anticipation instead of the strike pose.");
            encounter.Tick(0.39f, 190, 200, true, true);
            Check(!encounter.AttackReady, "Damage preceded the middle strike pose.");
            encounter.Tick(0.02f, 190, 200, true, true);
            Check(encounter.AttackReady && encounter.CurrentAttack == "slam", "Telegraphed slam never reached impact.");
            encounter.Tick(0.01f, 190, 200, true, true);
            Check(!encounter.AttackReady && encounter.AttacksExecuted == 1, "Attack emitted repeated damage.");
            encounter.Tick(0.4f, 190, 200, true, true);
            Check(encounter.State == BossEncounter.Stage.Recovery && !encounter.AttackReady, "Attack lacked recovery or repeated impact.");
            encounter.Tick(0.02f, 100, 200, true, true);
            Check(encounter.PhaseNumber == 2 && encounter.PhaseChanges == 1, "Half-health phase threshold was not inclusive.");
            encounter.Tick(0.01f, 160, 200, true, true);
            Check(encounter.PhaseNumber == 2, "Healing rewound the encounter phase.");
            encounter.Tick(0.5f, 160, 200, true, true);
            encounter.Tick(0.61f, 160, 200, true, true);
            encounter.Tick(0.41f, 160, 200, true, true);
            Check(encounter.AttackReady && encounter.CurrentAttack == "slam", "Phase two did not start with its configured attack.");
            encounter.Tick(0.4f, 160, 200, true, true);
            encounter.Tick(0.81f, 160, 200, true, true);
            encounter.Tick(0.21f, 160, 200, true, true);
            encounter.Tick(0.61f, 160, 200, true, true);
            encounter.Tick(0.41f, 160, 200, true, true);
            Check(encounter.AttackReady && encounter.CurrentAttack == "projectile", "Configured attack rotation did not advance.");
            encounter.Tick(0.4f, 160, 200, true, true);
            encounter.Tick(0.81f, 160, 200, true, true);
            encounter.Tick(0.21f, 160, 200, true, true);
            encounter.Tick(0.61f, 160, 200, true, true);
            encounter.Tick(0.41f, 160, 200, true, true);
            Check(encounter.AttackReady && encounter.CurrentAttack == "area_burst", "Phase two's burst attack was omitted.");
            encounter.Tick(0.01f, 0, 200, true, true);
            encounter.Tick(5f, 200, 200, true, true);
            Check(encounter.State == BossEncounter.Stage.Defeated && !encounter.AttackReady, "Defeated boss resumed attacking.");
            encounter.Reset();
            Check(encounter.PhaseNumber == 1 && encounter.AttacksExecuted == 0 && encounter.PhaseChanges == 0, "Respawn retained encounter state.");
            encounter.Tick(4f, 200, 200, false, true);
            Check(encounter.State == BossEncounter.Stage.Idle && !encounter.AttackReady, "Boss attacked a missing/dead/blocked player.");
            var marked = new BossEncounter(Phases());
            marked.ConfigureAttack(1.5f, 0.1f);
            marked.Tick(0.7f, 200, 200, true, true);
            marked.Tick(0.81f, 200, 200, true, true);
            marked.Tick(0.05f, 200, 200, true, true);
            Check(!marked.AttackReady, "Authored early strike fired before its marker.");
            marked.Tick(0.051f, 200, 200, true, true);
            Check(marked.AttackReady, "Authored strike marker was ignored.");
            marked.Tick(0.6f, 200, 200, true, true);
            Check(marked.State == BossEncounter.Stage.Attack && !marked.AttackReady, "Animation was cut off after impact.");
            marked.Tick(0.9f, 200, 200, true, true);
            Check(marked.State == BossEncounter.Stage.Recovery && marked.AttacksExecuted == 1, "Full attack failed to enter recovery exactly once.");
            var hitch = new BossEncounter(Phases());
            hitch.Tick(0.7f, 200, 200, true, true);
            hitch.Tick(0.81f, 200, 200, true, true);
            hitch.Tick(2f, 200, 200, true, true);
            Check(hitch.AttackReady && hitch.AttacksExecuted == 1 && hitch.State == BossEncounter.Stage.Recovery,
                "Long frame skipped or repeated the strike.");
            passed = true;
            detail = "Native boss timing, interruption protection, thresholds, rotation, death, reset, target loss";
        }
        catch (Exception error) { detail = error.ToString(); Debug.LogException(error); }
        WriteResult("boss-rules-result.json", passed, checks, detail);
        EditorApplication.Exit(passed ? 0 : 1);
    }

    public static void RunRuntime()
    {
        EditorSceneManager.OpenScene("Assets/Scenes/World.unity");
        SessionState.SetBool(Pending, true);
        EditorApplication.EnterPlaymode();
    }

    public static void WriteResult(string filename, bool passed, int checks, string detail)
    {
        var root = Path.Combine(Application.dataPath, "../qa");
        Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root, filename), JsonUtility.ToJson(new Result { passed = passed, checks = checks, detail = detail }, true));
        Debug.Log("BOSS_VALIDATION_" + (passed ? "PASS " : "FAIL ") + detail);
    }
    [Serializable] private class Result { public bool passed; public int checks; public string detail; }
}

public sealed class MetroForgeBossRuntimeProbe : MonoBehaviour
{
    private int _checks;
    private bool _recording;
    private string _captureError;
    private readonly List<MotionFrame> _motion = new List<MotionFrame>();
    [Serializable] private class MotionFrame { public int frame, phase, pose, attacks; public string state, clip; public float playerHealth, bossHealth; }
    [Serializable] private class MotionTrace { public int fps = 24; public List<MotionFrame> frames; public string scope = "Diagnostic combat at fixed capture cadence; not a normal-input or performance test"; }
    private IEnumerator Start()
    {
        var scenario = Scenario();
        while (true)
        {
            bool more;
            object next = null;
            Exception failure = null;
            try { more = scenario.MoveNext(); if (more) next = scenario.Current; }
            catch (Exception error) { more = false; failure = error; }
            if (!more)
            {
                _recording = false;
                Time.captureFramerate = 0;
                if (_motion.Count > 0)
                    File.WriteAllText(Path.Combine(Application.dataPath, "../qa/boss-recording/motion.json"),
                        JsonUtility.ToJson(new MotionTrace { frames = _motion }, true));
                if (failure == null && _captureError != null) failure = new Exception(_captureError);
                MetroForgeBossValidation.WriteResult("boss-runtime-result.json", failure == null, _checks,
                    failure != null ? failure.ToString() : "Native PlayMode: arena/victory locks, telegraph and impact, phase transition, projectile, defeat, cached re-entry and real title Continue. Diagnostic positioning/damage; not a normal-input route playthrough.");
                EditorApplication.Exit(failure == null ? 0 : 1);
                yield break;
            }
            yield return next;
        }
    }
    private void Check(bool condition, string message) { if (!condition) throw new Exception(message); _checks++; }
    private IEnumerator Scenario()
    {
        GameBootstrap game = null;
        for (var i = 0; i < 100; i++)
        {
            game = FindFirstObjectByType<GameBootstrap>();
            if (game != null && game.Pack != null) break;
            yield return new WaitForSeconds(0.1f);
        }
        Check(game != null && game.Pack != null, "Real GameBootstrap did not initialize.");
        Check(game.TryClickTitleContinue(), "Real title Continue callback was unavailable.");
        var checkpoint = GameObject.Find("Checkpoint");
        var shrine = checkpoint != null ? checkpoint.GetComponent<SpriteRenderer>()?.sprite : null;
        Check(shrine != null && shrine.texture.width == 128 && Mathf.Abs(shrine.pixelsPerUnit - 4f / 3f) < 0.001f,
            "Checkpoint retained the prototype icon or lost its authored scale.");
        Check(Mathf.Abs(shrine.pivot.y - 4f) < 0.01f && checkpoint.transform.localScale == Vector3.one,
            "Checkpoint base padding was not anchored independently of physics.");
        var checkpointCollider = checkpoint.GetComponent<BoxCollider2D>();
        Check(checkpointCollider.isTrigger && checkpointCollider.size == new Vector2(28f, 48f)
            && checkpointCollider.offset == new Vector2(0f, 24f), "Grounded checkpoint trigger was distorted or below the floor.");
        yield return null;
        yield return null;
        Capture("castle-shrine");
        GameplayRoom arena = null;
        foreach (var room in game.Pack.rooms)
            if (room.enemy != null && room.enemy.isBoss && room.enemy.bossPhases.Length > 1) { arena = room; break; }
        Check(arena != null, "No phased boss arena was exported.");
        game.DiagnosticWarpToRoom(arena.id);
        yield return null;
        var boss = game.Boss;
        Check(boss != null, "Boss controller did not spawn.");
        var enemy = boss.GetComponent<EnemyActor>();
        var encounterHud = FindFirstObjectByType<BossEncounterHUD>();
        Check(encounterHud != null && encounterHud.Visible && Mathf.Abs(encounterHud.TargetFraction - 1f) < 0.01f,
            "Boss name/health panel did not appear at full health.");
        var corners = new Vector3[4];
        encounterHud.PanelRect.GetWorldCorners(corners);
        Check(corners[0].x >= 0f && corners[0].y >= 0f && corners[2].x <= Screen.width && corners[2].y <= Screen.height,
            "Boss panel was outside the gameplay viewport.");
        Check(boss != null && enemy.Health == arena.enemy.health, "Boss actor did not use its exported health.");
        foreach (var actor in new[] { game.Player.GetComponent<SpriteSheetPlayer>(), boss.GetComponent<SpriteSheetPlayer>() })
        {
            var sprite = actor.GetComponent<SpriteRenderer>().sprite;
            Check(actor.GroundContactInset >= 0f && actor.GroundContactInset <= 6f &&
                sprite != null && Mathf.Abs(sprite.pivot.y / sprite.pixelsPerUnit - actor.GroundContactInset) < 0.01f,
                "Legacy actor boot baseline does not match its measured idle inset.");
        }
        if (!string.IsNullOrEmpty(arena.backgrounds?.interior))
        {
            var coping = boss.transform.parent.GetComponentInChildren<SpriteRenderer>();
            foreach (var sprite in boss.transform.parent.GetComponentsInChildren<SpriteRenderer>())
                if (sprite.name == "CastleStoneCoping") { coping = sprite; break; }
            Check(coping != null && coping.name == "CastleStoneCoping", "Authored castle stone was not rendered.");
            var floor = coping.transform.parent.GetComponent<BoxCollider2D>();
            Check(floor != null && coping.transform.parent.localScale == Vector3.one &&
                Mathf.Abs(coping.transform.localPosition.y - floor.size.y * 0.5f) < 0.01f,
                "Stone coping changed physics scale or missed the collision top.");
            Check(Mathf.Abs(coping.size.x - floor.size.x) < 0.01f && coping.size.y <= floor.size.y,
                "Stone coping exceeded its collision surface dimensions.");
            var masonry = coping.transform.parent.Find("CastleFoundationMasonry");
            Check(masonry != null && masonry.GetComponent<SpriteRenderer>().sprite.texture.width == 384,
                "Painted castle foundation was not rendered.");
            Check(masonry.GetComponent<SpriteRenderer>().size == floor.size && masonry.GetComponent<Collider2D>() == null
                && masonry.localScale == Vector3.one && Mathf.Abs(masonry.localPosition.y - floor.size.y * 0.5f) < 0.01f,
                "Foundation art altered collision geometry or missed the floor edge.");
        }
        var seal = FindFirstObjectByType<BossArenaLock>();
        Check(seal != null && seal.GetComponent<BoxCollider2D>().enabled, "Arena was open before boss defeat.");
        var victory = boss.transform.parent.Find("Victory");
        Check(victory != null && !victory.GetComponent<BoxCollider2D>().enabled, "Victory was available before boss defeat.");
        var victorySprite = victory.GetComponent<SpriteRenderer>().sprite;
        Check(victorySprite != null && victorySprite.texture.width == 128 && Mathf.Abs(victorySprite.pivot.y - 4f) < 0.01f
            && Mathf.Abs(victorySprite.pixelsPerUnit - 1.6f) < 0.001f, "Victory reused the prototype floating pickup.");
        Check(Mathf.Abs(victory.position.y - (arena.height - arena.floorTop)) < 0.01f
            && victory.GetComponent<BoxCollider2D>().offset.y == 24f, "Victory reliquary was not grounded at the arena floor.");
        game.Player.transform.position = enemy.transform.position + Vector3.left * 70f;
        game.Player.GetComponent<Rigidbody2D>().linearVelocity = Vector2.zero;
        Physics2D.SyncTransforms();
        if (Array.IndexOf(Environment.GetCommandLineArgs(), "-bossRecord") >= 0 &&
            SystemInfo.graphicsDeviceType != UnityEngine.Rendering.GraphicsDeviceType.Null)
        {
            var frames = Path.Combine(Application.dataPath, "../qa/boss-recording");
            if (Directory.Exists(frames) && Directory.GetFiles(frames, "frame-*.png").Length > 0)
                throw new Exception("Preserve previous recording evidence before rerunning.");
            Directory.CreateDirectory(frames);
            _recording = true;
            Time.captureFramerate = 24;
        }
        var health = game.Player.Health;
        for (var i = 0; i < 30 && boss.Encounter.State != BossEncounter.Stage.Telegraph; i++) yield return new WaitForSeconds(0.05f);
        Check(boss.Encounter.State == BossEncounter.Stage.Telegraph && game.Player.Health == health, "Damage occurred before telegraph.");
        Capture("boss-telegraph");
        for (var i = 0; i < 30 && boss.Encounter.State == BossEncounter.Stage.Telegraph; i++) yield return new WaitForSeconds(0.05f);
        Check(boss.Encounter.State == BossEncounter.Stage.Attack && game.Player.Health == health && game.BossAttackCount == 0,
            "Real boss damage preceded the attack's strike pose.");
        for (var i = 0; i < 30 && game.BossAttackCount == 0; i++) yield return new WaitForSeconds(0.05f);
        Check(game.BossAttackCount > 0 && game.Player.Health < health, "Telegraphed slam did not apply real damage.");
        for (var i = 0; i < 30 && boss.Encounter.State == BossEncounter.Stage.Attack; i++) yield return new WaitForSeconds(0.05f);
        Check(boss.Encounter.State == BossEncounter.Stage.Recovery && game.BossAttackCount == 1,
            "Complete strike clip did not enter recovery without another damage event.");
        enemy.Hurt(arena.enemy.health * 0.55f);
        yield return null;
        yield return null;
        Check(boss.Encounter.PhaseNumber == 2 && game.BossPhaseChangeCount > 0, "Real damage did not advance the boss phase.");
        Check(Mathf.Abs(encounterHud.TargetFraction - 0.45f) < 0.01f &&
            GameObject.Find("BossPhase").GetComponent<UnityEngine.UI.Text>().text == "Phase II",
            "Boss panel did not track damage and the new phase.");
        Capture("boss-phase-two");
        for (var i = 0; i < 140 && FindFirstObjectByType<BossProjectile>() == null; i++) yield return new WaitForSeconds(0.05f);
        Check(FindFirstObjectByType<BossProjectile>() != null, "Configured projectile attack never spawned.");
        Capture("boss-projectile");
        var deathPosition = enemy.transform.position;
        enemy.Hurt(arena.enemy.health);
        Check(game.BossDefeated(arena) && game.BossDefeatCount == 1 && victory.GetComponent<BoxCollider2D>().enabled, "Defeat did not release arena and victory.");
        Check(FindFirstObjectByType<BossArenaLock>() == null, "Defeated arena seal remained active.");
        yield return null;
        Check(!encounterHud.Visible, "Boss panel remained after defeat.");
        Capture("boss-defeated");
        var deathDuration = boss.GetComponent<SpriteSheetPlayer>().ClipDuration("death");
        var retirementDelay = Mathf.Max(0.6f, deathDuration);
        yield return new WaitForSeconds(retirementDelay * 0.5f);
        Check(enemy != null && Vector3.Distance(enemy.transform.position, deathPosition) < 0.5f,
            "Defeated boss fell through the floor during its death animation.");
        Capture("boss-death");
        yield return new WaitForSeconds(retirementDelay * 0.5f + 0.15f);
        Check(enemy == null, "Boss corpse was not retired after the complete death clip.");
        game.Player.transform.position = victory.position;
        Physics2D.SyncTransforms();
        yield return new WaitForSeconds(0.2f);
        Check(game.Victory, "Real victory trigger did not grant victory after defeat.");
        Check(File.ReadAllText(game.SavePath).Contains(arena.enemy.id), "Boss defeat was not saved.");
        game.DiagnosticWarpToRoom(game.Pack.startRoomId);
        game.DiagnosticWarpToRoom(arena.id);
        Check(game.Boss == null && game.BossDefeated(arena), "Cached re-entry respawned a defeated boss.");
        game.OpenTitleScreen();
        Check(game.TryClickTitleContinue(), "Saved title Continue failed.");
        yield return null;
        Check(game.CurrentRoomId == arena.id && game.Boss == null && game.BossDefeated(arena) && game.Victory, "Continue lost boss defeat or victory state.");
        Check(!encounterHud.Visible, "Continue restored a stale defeated-boss panel.");
    }

    private void LateUpdate()
    {
        if (!_recording) return;
        try
        {
            var game = FindFirstObjectByType<GameBootstrap>();
            var boss = game.Boss;
            var animator = boss != null ? boss.GetComponent<SpriteSheetPlayer>() : null;
            Capture("frame-" + _motion.Count.ToString("D5"), true);
            _motion.Add(new MotionFrame { frame = _motion.Count, phase = boss != null ? boss.Encounter.PhaseNumber : 0,
                pose = animator != null ? animator.CurrentFrame : -1, attacks = game.BossAttackCount,
                state = boss != null ? boss.Encounter.State.ToString() : "Absent",
                clip = animator != null ? animator.CurrentClip : "", playerHealth = game.Player != null ? game.Player.Health : 0f,
                bossHealth = boss != null ? boss.Health : 0f });
        }
        catch (Exception error) { _captureError = error.ToString(); _recording = false; }
    }

    private void Capture(string name, bool recording = false)
    {
        // Optional native renders are diagnostic evidence, not normal-input traversal approval.
        if (SystemInfo.graphicsDeviceType == UnityEngine.Rendering.GraphicsDeviceType.Null) return;
        var camera = Camera.main;
        if (camera == null) throw new Exception("No gameplay camera for boss capture.");
        var target = RenderTexture.GetTemporary(1280, 720, 24);
        var oldTarget = camera.targetTexture;
        var oldActive = RenderTexture.active;
        Texture2D pixels = null;
        var hud = GameObject.Find("HUD")?.GetComponent<Canvas>();
        var oldMode = hud != null ? hud.renderMode : RenderMode.ScreenSpaceOverlay;
        var oldCamera = hud != null ? hud.worldCamera : null;
        var oldDistance = hud != null ? hud.planeDistance : 0f;
        try
        {
            camera.targetTexture = target;
            if (hud != null && oldMode == RenderMode.ScreenSpaceOverlay)
            {
                hud.renderMode = RenderMode.ScreenSpaceCamera;
                hud.worldCamera = camera;
                hud.planeDistance = 1f;
                Canvas.ForceUpdateCanvases();
            }
            camera.Render();
            RenderTexture.active = target;
            pixels = new Texture2D(1280, 720, TextureFormat.RGB24, false);
            pixels.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
            pixels.Apply();
            var folder = Path.Combine(Application.dataPath, recording ? "../qa/boss-recording" : "../qa/boss-captures");
            Directory.CreateDirectory(folder);
            File.WriteAllBytes(Path.Combine(folder, name + ".png"), pixels.EncodeToPNG());
            if (!recording) Debug.Log("BOSS_CAPTURE " + name);
        }
        finally
        {
            camera.targetTexture = oldTarget;
            RenderTexture.active = oldActive;
            RenderTexture.ReleaseTemporary(target);
            if (hud != null)
            {
                hud.renderMode = oldMode;
                hud.worldCamera = oldCamera;
                hud.planeDistance = oldDistance;
                Canvas.ForceUpdateCanvases();
            }
            if (pixels != null) Destroy(pixels);
        }
    }
}
