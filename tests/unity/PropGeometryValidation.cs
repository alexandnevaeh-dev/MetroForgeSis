#if UNITY_EDITOR
using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad]
public static class PropGeometryValidation
{
    static double entered;
    static PropGeometryValidation()
    {
        if (Array.IndexOf(Environment.GetCommandLineArgs(), "-propGeometryCheck") < 0) return;
        EditorApplication.playModeStateChanged += state => {
            if (state == PlayModeStateChange.EnteredPlayMode) entered = EditorApplication.timeSinceStartup;
        };
        EditorApplication.update += () => {
            if (entered > 0 && EditorApplication.timeSinceStartup - entered > 45) {
                Debug.LogError("PROP_GEOMETRY_TIMEOUT"); EditorApplication.Exit(1);
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
