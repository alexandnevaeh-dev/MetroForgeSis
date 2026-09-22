#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad]
public static class EnemyMovementValidation {
 private static double started;
 private static double lastReport;
 static EnemyMovementValidation() {
  if (System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "-enemyMovementTest") < 0) return;
  EditorApplication.playModeStateChanged += state => { if(state==PlayModeStateChange.EnteredPlayMode){started=EditorApplication.timeSinceStartup;lastReport=started;} };
  EditorApplication.update += () => {
   if(started<=0 || !EditorApplication.isPlaying)return;
   var now=EditorApplication.timeSinceStartup;
   if(now-lastReport>5){Debug.Log("ENEMY_MOVEMENT_WATCH paused="+EditorApplication.isPaused+" scale="+Time.timeScale+" frame="+Time.frameCount);lastReport=now;}
   if(now-started>30){Debug.LogError("ENEMY_MOVEMENT_TIMEOUT native test did not finish within 30s of Play Mode");EditorApplication.Exit(1);}
  };
 }
 public static void Run() { EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single); EditorApplication.EnterPlaymode(); }
}
#endif
