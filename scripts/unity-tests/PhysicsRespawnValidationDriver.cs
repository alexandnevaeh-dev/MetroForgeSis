using System.Collections;
using System.IO;
using UnityEngine;
public class PhysicsRespawnValidationDriver : MonoBehaviour
{
    bool invalidDestruction;
    int completed;
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Install()
    {
        if (System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "-physicsRespawnCheck") >= 0)
            new GameObject("PhysicsRespawnValidation").AddComponent<PhysicsRespawnValidationDriver>();
    }
    void OnEnable() { Application.logMessageReceived += Observe; }
    void OnDisable() { Application.logMessageReceived -= Observe; }
    void Observe(string message, string trace, LogType type)
    {
        if (message.Contains("Destroying GameObjects immediately is not permitted")) invalidDestruction = true;
    }
    IEnumerator Start()
    {
        GameBootstrap game = null;
        var limit = Time.realtimeSinceStartup + 10;
        while (Time.realtimeSinceStartup < limit) {
            game = FindFirstObjectByType<GameBootstrap>();
            if (game != null && game.Pack != null) break;
            yield return null;
        }
        if (game == null || game.Pack == null) { Finish(false, "bootstrap_not_ready"); yield break; }
        GameplayRoom selected = null;
        foreach (var room in game.Pack.rooms)
            if (room.enemy != null && !string.IsNullOrEmpty(room.enemy.id) && !room.enemy.isBoss) { selected = room; break; }
        if (selected == null) { Finish(false, "enemy_room_missing"); yield break; }
        game.DiagnosticWarpToRoom(selected.id);
        yield return null;
        for (var cycle = 0; cycle < 3; cycle++) {
            var oldEnemy = FindFirstObjectByType<EnemyActor>();
            if (oldEnemy == null || game.Player == null) { Finish(false, "actor_missing"); yield break; }
            var trigger = new GameObject("ActualPhysicsDefeatTrigger");
            trigger.layer = oldEnemy.gameObject.layer;
            trigger.transform.position = game.Player.transform.position;
            trigger.AddComponent<BoxCollider2D>().isTrigger = true;
            trigger.GetComponent<BoxCollider2D>().size = new Vector2(40, 40);
            var sensor = trigger.AddComponent<PhysicsDefeatSensor>();
            var deadline = Time.realtimeSinceStartup + 3;
            while (!sensor.Triggered && Time.realtimeSinceStartup < deadline) yield return null;
            if (!sensor.Triggered) { Finish(false, "real_trigger_not_entered"); yield break; }
            trigger.SetActive(false); Destroy(trigger);
            yield return null; yield return new WaitForFixedUpdate();
            var actors = FindObjectsByType<EnemyActor>(FindObjectsSortMode.None);
            if (invalidDestruction || oldEnemy != null || actors.Length != 1 || game.Player.Dead || game.Player.Health <= 0) {
                Finish(false, "unsafe_or_duplicate_respawn"); yield break;
            }
            completed++;
        }
        Finish(true, "three_actual_physics_trigger_deaths_retire_old_enemy_and_revive_player");
    }
    void Finish(bool passed, string detail)
    {
        var directory = Path.GetFullPath(Path.Combine(Application.dataPath, "../qa"));
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "physics-respawn-result.json"),
            "{\"passed\":" + (passed ? "true" : "false") + ",\"cycles\":" + completed + ",\"detail\":\"" + detail + "\"}");
        Debug.Log((passed ? "PHYSICS_RESPAWN_PASS " : "PHYSICS_RESPAWN_FAIL ") + detail);
#if UNITY_EDITOR
        UnityEditor.EditorApplication.Exit(passed ? 0 : 1);
#else
        Application.Quit(passed ? 0 : 1);
#endif
    }
}
public class PhysicsDefeatSensor : MonoBehaviour
{
    public bool Triggered { get; private set; }
    void OnTriggerEnter2D(Collider2D collider)
    {
        var player = collider.GetComponentInParent<PlayerActor>();
        if (Triggered || player == null) return;
        Triggered = true;
        player.Defeat();
    }
}
