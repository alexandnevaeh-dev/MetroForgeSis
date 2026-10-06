using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
[InitializeOnLoad]
public static class HealingInputPlayModeCheck
{
 const string Key="MetroForge.HealingInputPlayMode";
 static GameBootstrap game;
 static int stage;
 static Keyboard keyboard;
 static HealingInputFeed feed;
 static float initialHealth;
 [Serializable] private class SavedGame { public InventorySave inventory; }
 static double next,deadline;
 static HealingInputPlayModeCheck(){EditorApplication.playModeStateChanged+=Changed;}
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
    game.Player.GetComponent<Rigidbody2D>().constraints=RigidbodyConstraints2D.FreezeAll;
    foreach(var enemy in UnityEngine.Object.FindObjectsByType<EnemyActor>(FindObjectsSortMode.None))enemy.enabled=false;
    Require(game.Player.Inventory.Grant("health_vial",2),"Vials missing");
    initialHealth=game.Player.Health;game.Player.Hurt(40);
    Require(Mathf.Approximately(game.Player.Health,initialHealth-40),"Damage setup failed");
    InputSystem.settings.backgroundBehavior=InputSettings.BackgroundBehavior.IgnoreFocus;
    keyboard=InputSystem.AddDevice<Keyboard>();InputSystem.EnableDevice(keyboard);keyboard.MakeCurrent();
    feed=new GameObject("Healing input feed").AddComponent<HealingInputFeed>();feed.Keyboard=keyboard;feed.Held=true;stage=2;
   }else if(stage==2){
    Require(Mathf.Approximately(game.Player.Health,initialHealth-10),"H did not heal30 health="+game.Player.Health+" initial="+initialHealth+" count="+game.Player.Inventory.Count("health_vial")+" enabled="+game.Player.enabled+" dead="+game.Player.Dead+" key="+keyboard.hKey.isPressed+" active="+game.Player.gameObject.activeInHierarchy);
    Require(game.Player.Inventory.Count("health_vial")==1,"Held H consumed more than one vial");
    var saved=JsonUtility.FromJson<SavedGame>(File.ReadAllText(game.SavePath));
    Require(Array.Exists(saved.inventory.items,item=>item.id=="health_vial"&&item.count==1),"Consumption was not saved");
    feed.Held=false;stage=3;
   }else if(stage==3){feed.Held=true;stage=4;}
   else if(stage==4){
    Require(Mathf.Approximately(game.Player.Health,initialHealth),"Healing did not clamp at max");
    Require(game.Player.Inventory.Count("health_vial")==0,"Second vial not consumed");
    game.Player.Inventory.Grant("health_vial",1);feed.Held=false;stage=5;
   }else if(stage==5){feed.Held=true;stage=6;}
   else{
    Require(game.Player.Inventory.Count("health_vial")==1,"Full-health key press wasted vial");
    File.WriteAllText(Path.Combine(Application.dataPath,"../healing-input-playmode-result.json"),"{\"passed\":true,\"scope\":\"Simulated Input System H events through actual PlayerActor Update, health, quantity and save; no physical keyboard or visual QA\"}");
    Debug.Log("UNITY_HEALING_INPUT_PLAYMODE_PASS");Finish(2);return;
   }
   next=EditorApplication.timeSinceStartup+1;
  }catch(Exception error){Debug.LogException(error);Finish(3);}
 }
 static void Finish(int result){EditorApplication.update-=Tick;if(feed!=null)feed.enabled=false;if(keyboard!=null)InputSystem.RemoveDevice(keyboard);SessionState.SetInt(Key,result);EditorApplication.isPlaying=false;}
}
