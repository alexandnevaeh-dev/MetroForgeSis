using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad]
public static class HealthEffectPlayModeCheck
{
 const string Key = "MetroForge.HealthEffectPlayModeCheck";
 static HealthEffectPlayModeCheck() { EditorApplication.playModeStateChanged += Changed; }
 public static void Run() {
  SessionState.SetInt(Key, 1);
  EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
  EditorApplication.isPlaying = true;
 }
 static void Require(bool ok, string message) { if(!ok) throw new Exception(message); }
 static void Changed(PlayModeStateChange state) {
  if(SessionState.GetInt(Key,0)==0)return;
  if(state==PlayModeStateChange.EnteredEditMode) { var code=SessionState.GetInt(Key,3)==2?0:1;SessionState.SetInt(Key,0);EditorApplication.Exit(code);return; }
  if(state!=PlayModeStateChange.EnteredPlayMode)return;
  try {
   var pack=JsonUtility.FromJson<GameplayPack>(File.ReadAllText(Path.Combine(Application.streamingAssetsPath,"gameplay.json")));
   var player=new GameObject("Equipment test player").AddComponent<PlayerActor>();player.Configure(pack,null);
   var baseline=player.MaxHealth;
   Require(player.Inventory.Grant("heart_relic",2),"Heart relic missing");
   Require(Mathf.Approximately(player.MaxHealth,baseline+50),"Relics did not increase maximum health");
   Require(Mathf.Approximately(player.Health,baseline),"Acquisition granted unintended healing");
   player.Revive(float.MaxValue);Require(Mathf.Approximately(player.Health,player.MaxHealth),"Revive exceeded maximum");
   player.Inventory.Restore(null);Require(Mathf.Approximately(player.MaxHealth,baseline)&&Mathf.Approximately(player.Health,baseline),"Removing bonuses failed to clamp health");
   player.Inventory.Grant("heart_relic",2);Require(Mathf.Approximately(player.Health,baseline),"Reacquiring bonuses restored lost health");
   player.Inventory.Grant("health_vial",1);Require(player.UseConsumable("health_vial"),"Healing did not use increased capacity");
   Require(Mathf.Approximately(player.Health,baseline+30),"Healing amount incorrect");
   File.WriteAllText(Path.Combine(Application.dataPath,"../health-effect-playmode-result.json"),"{\"passed\":true,\"scope\":\"Actual PlayerActor max-health relic stacking, clamp, revive and consumable capacity; no normal-input or visual evidence\"}");
   Debug.Log("UNITY_HEALTH_EFFECT_PLAYMODE_PASS");SessionState.SetInt(Key,2);
  } catch(Exception error) {Debug.LogException(error);SessionState.SetInt(Key,3);}
  EditorApplication.isPlaying=false;
 }
}
