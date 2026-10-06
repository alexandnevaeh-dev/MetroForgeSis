using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad]
public static class InventoryUiPlayModeCheck
{
 const string Key="MetroForge.InventoryUiPlayMode";
 static GameBootstrap game;
 static int stage;
 static double next,deadline;
 static InventoryUiPlayModeCheck(){EditorApplication.playModeStateChanged+=Changed;}
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
    game.Player.Inventory.Grant("warden_mail",3);game.Player.Inventory.Grant("forged_blade",2);game.Player.Inventory.Grant("health_vial",2);
    var panel=game.GetComponentInChildren<InventoryPanelUI>();
    if(panel==null)panel=UnityEngine.Object.FindFirstObjectByType<InventoryPanelUI>();
    Require(panel!=null,"Inventory UI missing");
    game.Player.GrantAbility("ember_seal");game.Player.GrantAbility("dash");
    Require(game.Player.GetComponent<EmberSeal>().BeginCharge(),"Charge setup failed");
    panel.Open();
    Require(!game.Player.GetComponent<EmberSeal>().IsCharging,"Opening inventory left spell charging");
    Require(!game.Player.GetComponent<EmberSeal>().BeginCharge(),"Spell started while paused");
    Require(!game.Player.TryDash(1),"Dash started while paused");
    Require(panel.IsOpen&&Time.timeScale==0&&game.Player.InputBlocked,"Opening inventory did not pause/block input");
    stage=2;
   }else{
    var panel=UnityEngine.Object.FindFirstObjectByType<InventoryPanelUI>();
    var armor=GameObject.Find("InventoryPanel/InventoryRow2/Action");
    if(armor==null)armor=GameObject.Find("HUD/InventoryPanel/InventoryRow2/Action");
    Require(armor!=null,"Armor action absent");armor.GetComponent<UnityEngine.UI.Button>().onClick.Invoke();
    Require(game.Player.Inventory.Equipped("armor")=="","UI unequip failed");
    armor.GetComponent<UnityEngine.UI.Button>().onClick.Invoke();Require(game.Player.Inventory.Equipped("armor")=="warden_mail","UI equip failed");
    var vial=GameObject.Find("HUD/InventoryPanel/InventoryRow1/Action");Require(vial!=null,"Vial action absent");
    var health=game.Player.Health;game.Player.Hurt(40);vial.GetComponent<UnityEngine.UI.Button>().onClick.Invoke();
    Require(game.Player.Inventory.Count("health_vial")==1,"UI use failed");Require(game.Player.Health>health-32,"UI healing failed");
    panel.Close();Require(Time.timeScale==1&&!game.Player.InputBlocked,"Close did not restore gameplay");
    Require(game.Player.GetComponent<EmberSeal>().BeginCharge(),"Spell remained blocked after closing");game.Player.GetComponent<EmberSeal>().Cancel();
    File.WriteAllText(Path.Combine(Application.dataPath,"../inventory-ui-playmode-result.json"),"{\"passed\":true,\"scope\":\"Actual uGUI panel pause, equip, unequip, use and resume via button callbacks; no visual QA\"}");
    Debug.Log("UNITY_INVENTORY_UI_PLAYMODE_PASS");Finish(2);return;
   }
   next=EditorApplication.timeSinceStartup+1;
  }catch(Exception error){Debug.LogException(error);Finish(3);}
 }
 static void Finish(int result){EditorApplication.update-=Tick;SessionState.SetInt(Key,result);EditorApplication.isPlaying=false;}
}
