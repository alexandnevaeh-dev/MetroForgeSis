#if UNITY_EDITOR && ENABLE_INPUT_SYSTEM
using System;
using System.IO;
using System.Collections;
using UnityEngine;
using UnityEditor;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
[DefaultExecutionOrder(-200)]
public class AscentValidationDriver : MonoBehaviour {
 [Serializable] private class Rect {public float x,y,width,height;}
 [Serializable] private class Layout {public float height,floor;public Rect[] platforms;}
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-ascentTest")>=0)new GameObject("AscentTest").AddComponent<AscentValidationDriver>();}
 private Keyboard keyboard;private PlayerActor player;private float targetX;private bool steering,jump;
 private void Update(){
  if(keyboard==null)return;
  var dx=steering?targetX-player.transform.position.x:0;
  var keys=new System.Collections.Generic.List<Key>();if(dx>3)keys.Add(Key.D);if(dx< -3)keys.Add(Key.A);if(jump)keys.Add(Key.Space);
  InputSystem.QueueStateEvent(keyboard,new KeyboardState(keys.ToArray()));InputSystem.Update();jump=false;
 }
 private void Check(bool ok,string label){if(!ok){Debug.LogError("ASCENT_FAIL "+label+" pos="+player.transform.position);EditorApplication.Exit(1);throw new Exception(label);}Debug.Log("ASCENT_PASS "+label);}
 private void Solid(float x,float y,float width,float height){var box=new GameObject("Solid").AddComponent<BoxCollider2D>();box.size=new Vector2(width,height);box.transform.position=new Vector2(x+width/2,y-height/2);}
 private IEnumerator Start(){
  var layout=JsonUtility.FromJson<Layout>(File.ReadAllText(Path.Combine(Application.streamingAssetsPath,"ascent-fixture.json")));
  Solid(0,layout.height-layout.floor,800,32);
  foreach(var p in layout.platforms)Solid(p.x,layout.height-p.y,p.width,p.height);
  Solid(0,780,320,16);Solid(496,780,304,16);
  player=new GameObject("Player").AddComponent<PlayerActor>();
  player.Configure(new GameplayPack{movement=new GameplayMovement{gravity=980,maxFallSpeed=650,walkSpeed=200,runSpeed=350,acceleration=1800,airAcceleration=900,jumpHeight=120,coyoteTime=.12f,jumpBufferTime=.1f},combat=new GameplayCombat{maxHealth=100}},null);
  var body=player.GetComponent<Rigidbody2D>();body.position=new Vector2(280,layout.height-layout.floor);Physics2D.SyncTransforms();
  Application.runInBackground=true;AcceptanceDriver.ConfigureAcceptanceInput();keyboard=InputSystem.AddDevice<Keyboard>();InputSystem.EnableDevice(keyboard);
  yield return new WaitForSeconds(.2f);
  for(var i=0;i<layout.platforms.Length;i++){
   var p=layout.platforms[i];targetX=p.x+p.width/2;steering=true;jump=true;
   yield return new WaitForSeconds(.15f);
   var deadline=Time.unscaledTime+4;var landed=false;
   while(Time.unscaledTime<deadline){yield return null;if(Mathf.Abs(body.position.y-(layout.height-p.y))<2&&Mathf.Abs(body.linearVelocity.y)<1&&body.position.x>p.x&&body.position.x<p.x+p.width){landed=true;break;}}
   Check(landed,"land_on_generated_ledge_"+i);yield return new WaitForSeconds(.1f);
  }
  targetX=400;jump=true;var reached=false;var end=Time.unscaledTime+2;
  while(Time.unscaledTime<end){yield return null;reached|=body.position.x>376&&body.position.x<424&&body.position.y+48>740;}
  Check(reached,"reach_ceiling_door_opening");Debug.Log("ASCENT_VALIDATION_OK generated geometry keyboard-only ascent after initial placement");EditorApplication.Exit(0);
 }
}
#endif
