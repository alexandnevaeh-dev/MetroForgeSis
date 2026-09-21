#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class MetroForgeAcceptance
{
    public static void CompileOnly()
    {
        Debug.Log("FOUNDRY_COMPILE_OK Unity scripts imported");
    }

    public static void RunAssetCatalog() => Launch("catalog");
    public static void RunMotion() => Launch("motion");
    public static void RunHitchProbe() => Launch("hitch");
    public static void RunCombatStallProbe() => Launch("combatstall");
    public static void RunRoomTransitionProbe() => Launch("roomtransition");

    public static void RunPlayAcceptance() => Launch("normal_input");
    public static void RunCapture() => Launch("capture");
    public static void RunPerf() => Launch("perf");
    public static void RunAll() => Launch("all");

    private static void Launch(string mode)
    {
        var scene = "Assets/Scenes/World.unity";
        if (!File.Exists(Path.Combine(Application.dataPath, "Scenes", "World.unity")))
        {
            Debug.LogError("FOUNDRY_ACCEPT_FAIL missing_scene " + scene);
            EditorApplication.Exit(1);
            return;
        }
        EditorSceneManager.OpenScene(scene);
        AcceptanceDriver.ForcedMode = mode;
        SessionState.SetString("MetroForge.Acceptance.PendingMode", mode);
        EditorApplication.EnterPlaymode();
    }
}
#endif
