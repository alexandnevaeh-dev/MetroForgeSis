#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

[InitializeOnLoad]
public static class MetroForgeAcceptance
{
    private const string WatchKey = "MetroForge.Acceptance.Watch";
    private static double started;
    private static double lastReport;
    private static double timeout;

    static MetroForgeAcceptance()
    {
        EditorApplication.playModeStateChanged += state =>
        {
            if (state == PlayModeStateChange.EnteredPlayMode && SessionState.GetBool(WatchKey, false))
            {
                started = EditorApplication.timeSinceStartup;
                lastReport = started;
                timeout = 210;
                foreach (var arg in System.Environment.GetCommandLineArgs())
                    if (arg.StartsWith("-acceptanceTimeout=") && double.TryParse(arg.Substring(19), out var seconds))
                        timeout = System.Math.Clamp(seconds, 15, 600) + 30;
            }
            if (state == PlayModeStateChange.ExitingPlayMode)
            {
                started = 0;
                SessionState.EraseBool(WatchKey);
            }
        };
        EditorApplication.update += Watch;
    }

    private static void Watch()
    {
        if (started <= 0 || !EditorApplication.isPlaying) return;
        var elapsed = EditorApplication.timeSinceStartup - started;
        if (EditorApplication.timeSinceStartup - lastReport >= 10)
        {
            Debug.Log("FOUNDRY_ACCEPT_WATCH elapsed=" + elapsed.ToString("F1") +
                " paused=" + EditorApplication.isPaused + " scale=" + Time.timeScale +
                " frame=" + Time.frameCount + " focused=" + Application.isFocused);
            lastReport = EditorApplication.timeSinceStartup;
        }
        if (elapsed > timeout)
        {
            Debug.LogError("FOUNDRY_ACCEPT_FAIL editor_wall_timeout: runtime did not finish; no pass inferred");
            SessionState.EraseBool(WatchKey);
            EditorApplication.Exit(1);
        }
    }

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
        SessionState.SetBool(WatchKey, true);
        EditorApplication.EnterPlaymode();
    }
}
#endif
