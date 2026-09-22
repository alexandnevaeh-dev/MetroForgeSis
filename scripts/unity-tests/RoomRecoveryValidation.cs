#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad]
public static class RoomRecoveryValidation {
 private static double started;
 private static double lastReport;
 static RoomRecoveryValidation() {
  if (System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "-roomRecoveryTest") < 0) return;
  EditorApplication.playModeStateChanged += state => { if(state==PlayModeStateChange.EnteredPlayMode){started=EditorApplication.timeSinceStartup;lastReport=started;} };
  EditorApplication.update += () => {
   if(started<=0 || !EditorApplication.isPlaying)return;
   var now=EditorApplication.timeSinceStartup;
   if(now-lastReport>5){Debug.Log("ROOM_RECOVERY_WATCH paused="+EditorApplication.isPaused+" scale="+Time.timeScale+" frame="+Time.frameCount);lastReport=now;}
   if(now-started>30){Debug.LogError("ROOM_RECOVERY_TIMEOUT native test did not finish within 30s of Play Mode");EditorApplication.Exit(1);}
  };
 }
 public static void Run() { EditorSceneManager.OpenScene("Assets/Scenes/World.unity"); EditorApplication.EnterPlaymode(); }
}
#endif
