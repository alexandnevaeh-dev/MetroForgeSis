using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad]
public static class EquipmentPlayModeCheck
{
 const string Key = "MetroForge.EquipmentPlayModeCheck";
 static EquipmentPlayModeCheck() { EditorApplication.playModeStateChanged += Changed; }
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
   Require(player.Inventory.Grant("warden_mail",3),"Generated armor missing");
   Require(Mathf.Approximately(player.ArmorRating,25),"Duplicate armor amplified stats");
   var before=player.Health;player.Hurt(float.NaN);Require(player.Health==before,"NaN damaged health");
   player.Hurt(40);Require(Mathf.Approximately(player.Health,before-32),"Armor mitigation mismatch");
   Require(player.Inventory.Unequip("armor"),"Unequip failed");Require(player.ArmorRating==0,"Unequipped armor remains active");
   Require(player.Inventory.Grant("forged_blade",2),"Generated weapon missing");
   var enemy=new GameObject("Equipment test enemy").AddComponent<EnemyActor>();enemy.Health=1000;
   typeof(PlayerActor).GetMethod("TryHit",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(player,new object[]{enemy});
   Require(Mathf.Approximately(enemy.Health,1000-pack.combat.attackDamage-8),"Melee weapon bonus not applied");
   var unarmored=new GameObject("Unarmored test player").AddComponent<PlayerActor>();unarmored.Configure(pack,null);
   before=unarmored.Health;unarmored.Hurt(40);Require(Mathf.Approximately(unarmored.Health,before-40),"Unarmored damage mismatch");
   File.WriteAllText(Path.Combine(Application.dataPath,"../equipment-playmode-result.json"),"{\"passed\":true,\"scope\":\"Actual PlayerActor initialization, catalog read, armor damage and direct melee hit; no normal-input or visual evidence\"}");
   Debug.Log("UNITY_EQUIPMENT_PLAYMODE_PASS");SessionState.SetInt(Key,2);
  } catch(Exception error) {Debug.LogException(error);SessionState.SetInt(Key,3);}
  EditorApplication.isPlaying=false;
 }
}
