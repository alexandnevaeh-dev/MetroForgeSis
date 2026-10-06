using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad] public static class EditedCatalogPlayModeCheck {
 const string Key="MetroForge.EditedCatalogPlayMode";
 static PlayerActor player;static int stage,collections;static double next,deadline;static string receipt;
 static EditedCatalogPlayModeCheck(){EditorApplication.playModeStateChanged+=Changed;}
 public static void Run(){SessionState.SetInt(Key,1);EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);EditorApplication.isPlaying=true;}
 static void Require(bool value,string message){if(!value)throw new Exception(message);}
 static void Changed(PlayModeStateChange state){
  if(SessionState.GetInt(Key,0)==0)return;
  if(state==PlayModeStateChange.EnteredEditMode){var code=SessionState.GetInt(Key,3)==2?0:1;SessionState.SetInt(Key,0);EditorApplication.Exit(code);return;}
  if(state!=PlayModeStateChange.EnteredPlayMode)return;
  try{
   var root=Application.streamingAssetsPath;
   var runtime=new LootRuntime(root);
   var pack=JsonUtility.FromJson<GameplayPack>(File.ReadAllText(Path.Combine(Application.streamingAssetsPath,"gameplay.json")));
   player=new GameObject("Loot test player").AddComponent<PlayerActor>();player.Configure(pack,null);player.enabled=false;
   player.GetComponent<Rigidbody2D>().gravityScale=0;player.transform.position=new Vector3(-200,0,0);
   var enemy=new GameObject("Loot test enemy").AddComponent<EnemyActor>();enemy.EnemyId="enemy_000";enemy.enabled=false;enemy.GetComponent<Rigidbody2D>().gravityScale=0;
   receipt=Path.Combine(Application.dataPath,"../edited-catalog-inventory.json");collections=0;
   enemy.OnDefeated=dead=>runtime.Spawn(dead,()=>{collections++;File.WriteAllText(receipt,JsonUtility.ToJson(player.Inventory.Capture()));});
   enemy.Hurt(10000);enemy.Hurt(10000);
   Require(UnityEngine.Object.FindObjectsByType<InventoryPickup>(FindObjectsSortMode.None).Length==1,"Death spawned duplicate pickups");
   stage=0;next=EditorApplication.timeSinceStartup+1;deadline=next+30;EditorApplication.update+=Tick;
  }catch(Exception e){Debug.LogException(e);Finish(3);}
 }
 static void Tick(){if(EditorApplication.timeSinceStartup<next)return;try{
  Require(EditorApplication.timeSinceStartup<deadline,"Loot test timed out");
  if(stage==0){Require(player.Inventory.Count("warden_mail")==0,"Pickup collected from outside trigger");player.GetComponent<Rigidbody2D>().position=new Vector2(0,0);Physics2D.SyncTransforms();stage=1;next=EditorApplication.timeSinceStartup+1;return;}
  Require(player.Inventory.Count("warden_mail")==3,"Physics collection did not grant quantity3");
  Require(collections==1,"Collection callback duplicated");
  Require(UnityEngine.Object.FindObjectsByType<InventoryPickup>(FindObjectsSortMode.None).Length==0,"Collected pickup remains");
  Require(player.Inventory.Equipped("armor")=="warden_mail","Armor pickup did not equip");
  Require(Mathf.Approximately(player.ArmorRating,75),"Edited armor effect not loaded");
  var before=player.Health;player.Hurt(35);Require(Mathf.Approximately(player.Health,before-20),"Edited armor mitigation not applied");
  var saved=JsonUtility.FromJson<InventorySave>(File.ReadAllText(receipt));Require(saved.items.Length==1&&saved.items[0].count==3,"Collection snapshot incorrect");
  File.WriteAllText(Path.Combine(Application.dataPath,"../edited-catalog-playmode-result.json"),"{\"passed\":true,\"scope\":\"Actual enemy death, physical trigger, inventory and collection callback snapshot; fixture loot; no normal-input or visual evidence\"}");
  Debug.Log("UNITY_EDITED_CATALOG_PLAYMODE_PASS");Finish(2);
 }catch(Exception e){Debug.LogException(e);Finish(3);}}
 static void Finish(int result){EditorApplication.update-=Tick;SessionState.SetInt(Key,result);EditorApplication.isPlaying=false;}
}
