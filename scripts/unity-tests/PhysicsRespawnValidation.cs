#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad]
public static class PhysicsRespawnValidation
{
    static double started;
    static PhysicsRespawnValidation()
    {
        if (System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "-physicsRespawnCheck") < 0) return;
        EditorApplication.playModeStateChanged += state => {
            if (state == PlayModeStateChange.EnteredPlayMode) started = EditorApplication.timeSinceStartup;
        };
        EditorApplication.update += () => {
            if (started > 0 && EditorApplication.timeSinceStartup - started > 40) {
                Debug.LogError("PHYSICS_RESPAWN_TIMEOUT"); EditorApplication.Exit(1);
            }
        };
    }
    public static void Run()
    {
        EditorSceneManager.OpenScene("Assets/Scenes/World.unity");
        EditorApplication.EnterPlaymode();
    }
}
#endif
