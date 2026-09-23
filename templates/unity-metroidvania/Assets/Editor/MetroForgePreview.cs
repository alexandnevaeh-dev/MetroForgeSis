#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

// Interactive preview only. Acceptance drivers are deliberately not enabled here.
public static class MetroForgePreview
{
    [MenuItem("MetroForge/Play Generated Game")]
    public static void Play()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode) return;
        const string scene = "Assets/Scenes/World.unity";
        if (!File.Exists(Path.Combine(Application.dataPath, "Scenes", "World.unity")))
            throw new InvalidOperationException("Generated World scene is missing.");
        // Preserve authored changes when launched through the editor menu.
        if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
        EditorSceneManager.OpenScene(scene);
        SessionState.EraseBool("MetroForge.Acceptance.Watch");
        SessionState.EraseString("MetroForge.Acceptance.PendingMode");
        AcceptanceDriver.ForcedMode = null;
        EditorApplication.isPaused = false;
        EditorApplication.EnterPlaymode();
    }
}
#endif
