using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad]
public static class InventorySavePlayModeCheck
{
 const string Key="MetroForge.InventorySavePlayMode";
 static GameBootstrap game;
 static int stage;
 static double next,deadline;
 static InventorySavePlayModeCheck(){EditorApplication.playModeStateChanged+=Changed;}
 public static void Run(){SessionState.SetInt(Key,1);EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);EditorApplication.isPlaying=true;}
 static void Require(bool ok,string message){if(!ok)throw new Exception(message);}
 static void Changed(PlayModeStateChange state){
  if(SessionState.GetInt(Key,0)==0)return;
  if(state==PlayModeStateChange.EnteredEditMode){int code=SessionState.GetInt(Key,3)==2?0:1;SessionState.SetInt(Key,0);EditorApplication.Exit(code);return;}
  if(state!=PlayModeStateChange.EnteredPlayMode)return;
  var camera=new GameObject("Main Camera");camera.tag="MainCamera";camera.AddComponent<Camera>();
  game=new GameObject("Save integration game").AddComponent<GameBootstrap>();
  stage=0;next=EditorApplication.timeSinceStartup+1;deadline=next+90;EditorApplication.update+=Tick;
 }
 static void Tick(){
  if(EditorApplication.timeSinceStartup<next)return;
  try{
   Require(EditorApplication.timeSinceStartup<deadline,"Save roundtrip timed out");
   if(stage==0){if(game.Pack==null||!game.OnTitleScreen)return;Require(game.TryClickTitleContinue(),"Initial Continue unavailable");stage=1;}
   else if(stage==1){
    Require(game.Player!=null,"Player missing");
    Require(game.Player.Inventory.Grant("warden_mail",3),"Armor missing");
    Require(game.Player.Inventory.Grant("forged_blade",2),"Weapon missing");
    Require(game.Player.Inventory.Grant("heart_relic",2),"Health relic missing");
    game.Player.Inventory.Unequip("armor");game.ReturnToTitle();
    Require(game.Player==null,"Title did not destroy player");Require(File.Exists(game.SavePath),"Save absent");stage=2;
   }else if(stage==2){Require(game.TryClickTitleContinue(),"Saved Continue unavailable");stage=3;}
   else{
    Require(game.Player.Inventory.Count("warden_mail")==3,"Armor ownership lost");
    Require(game.Player.Inventory.Count("forged_blade")==2,"Weapon ownership lost");
    Require(game.Player.Inventory.Equipped("armor")=="","Intentionally empty armor slot changed");
    Require(game.Player.Inventory.Equipped("weapon")=="forged_blade","Weapon slot lost");
    Require(game.Player.Inventory.Count("heart_relic")==2,"Relic ownership lost");
    var savedMaximum=game.Player.MaxHealth;
    Require(Mathf.Approximately(savedMaximum,game.Pack.combat.maxHealth+50),"Restored health bonus missing");
    game.Player.Inventory.Grant("heart_relic",1);
    Require(Mathf.Approximately(game.Player.MaxHealth,savedMaximum+25),"Additional relic capacity missing");
    game.Player.Revive();
    game.Player.Inventory.Grant("warden_mail",1);game.ReloadFromSaveFile();
    Require(Mathf.Approximately(game.Player.MaxHealth,savedMaximum),"Reload retained unsaved health bonus");
    Require(game.Player.Health<=game.Player.MaxHealth,"Reload health exceeds restored capacity");
    Require(game.Player.Inventory.Count("warden_mail")==3,"Reload did not replace inventory");
    Require(game.Player.Inventory.Equipped("armor")=="","Reload reequipped empty slot");
    File.WriteAllText(Path.Combine(Application.dataPath,"../inventory-save-playmode-result.json"),"{\"passed\":true,\"scope\":\"Actual title Continue, save file, player recreation and reload; programmatic UI callbacks, no visual QA\"}");
    Debug.Log("UNITY_INVENTORY_SAVE_PLAYMODE_PASS");Finish(2);return;
   }
   next=EditorApplication.timeSinceStartup+1;
  }catch(Exception error){Debug.LogException(error);Finish(3);}
 }
 static void Finish(int result){EditorApplication.update-=Tick;SessionState.SetInt(Key,result);EditorApplication.isPlaying=false;}
}
