#if UNITY_EDITOR && ENABLE_INPUT_SYSTEM
using System;
using System.Collections;
using UnityEngine;
using UnityEditor;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
[DefaultExecutionOrder(-200)]
public class GapTraversalValidationDriver : MonoBehaviour {
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-gapTraversalTest")>=0)new GameObject("GapTest").AddComponent<GapTraversalValidationDriver>();}
 private void Check(bool ok,string label){if(!ok){Debug.LogError("GAP_TRAVERSAL_FAIL "+label);EditorApplication.Exit(1);throw new Exception(label);}Debug.Log("GAP_TRAVERSAL_PASS "+label);}
 private void Floor(float start,float width){var box=new GameObject("Floor").AddComponent<BoxCollider2D>();box.size=new Vector2(width,32);box.transform.position=new Vector2(start+width/2,-16);}
 private PlayerActor controlled;
 private Keyboard keyboard;
 private bool driving;
 private bool jumpRequested;
 private float inspectUntil;
 private float nextInspect;
 private void Update(){
  if(!driving||controlled==null||keyboard==null)return;
  var jump=AcceptanceDriver.NeedsGapJump(controlled,1);
  if(jump&&!jumpRequested){
   inspectUntil=Time.unscaledTime+.35f;
   var flags=System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance;
   Debug.Log("GAP_DIAG position="+controlled.transform.position+" velocity="+controlled.GetComponent<Rigidbody2D>().linearVelocity+" grounded="+typeof(PlayerActor).GetField("_grounded",flags).GetValue(controlled)+" coyote="+typeof(PlayerActor).GetField("_coyote",flags).GetValue(controlled));
  }
  jumpRequested|=jump;
  InputSystem.QueueStateEvent(keyboard,jump?new KeyboardState(Key.D,Key.Space):new KeyboardState(Key.D));InputSystem.Update();
 }
 private void LateUpdate(){
  if(controlled==null||Time.unscaledTime>=inspectUntil||Time.unscaledTime<nextInspect)return;
  nextInspect=Time.unscaledTime+.04f;
  var flags=System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance;
  Debug.Log("GAP_INPUT current="+(Keyboard.current==keyboard)+" held="+keyboard.spaceKey.isPressed+" edge="+keyboard.spaceKey.wasPressedThisFrame+" buffer="+typeof(PlayerActor).GetField("_jumpBuffer",flags).GetValue(controlled)+" coyote="+typeof(PlayerActor).GetField("_coyote",flags).GetValue(controlled)+" velocity="+controlled.GetComponent<Rigidbody2D>().linearVelocity+" y="+controlled.transform.position.y);
 }
 private IEnumerator Start(){
  Floor(0,200);Floor(232,400);
  var player=new GameObject("Player").AddComponent<PlayerActor>();
  player.Configure(new GameplayPack{movement=new GameplayMovement{gravity=1000,maxFallSpeed=1000,walkSpeed=140,acceleration=1800,airAcceleration=1800,jumpHeight=70,coyoteTime=.1f,jumpBufferTime=.1f},combat=new GameplayCombat{maxHealth=100}},null);
  player.transform.position=new Vector3(100,0);player.GetComponent<Rigidbody2D>().position=new Vector2(100,0);Physics2D.SyncTransforms();
  Application.runInBackground=true;AcceptanceDriver.ConfigureAcceptanceInput();keyboard=InputSystem.AddDevice<Keyboard>();InputSystem.EnableDevice(keyboard);controlled=player;
  yield return new WaitForSeconds(.1f);
  Check(!AcceptanceDriver.NeedsGapJump(player,1),"continuous_floor_needs_no_jump");
  driving=true;var rose=false;var minimumY=0f;var deadline=Time.unscaledTime+5;
  while(player.transform.position.x<320&&Time.unscaledTime<deadline){
   yield return null;rose|=player.transform.position.y>15;minimumY=Mathf.Min(minimumY,player.transform.position.y);
  }
  driving=false;InputSystem.QueueStateEvent(keyboard,new KeyboardState());InputSystem.Update();
  Debug.Log("GAP_DIAG end="+player.transform.position+" minY="+minimumY);
  Check(jumpRequested,"gap_detected_from_ground_probe");Check(rose,"keyboard_jump_lifts_player");Check(player.transform.position.x>=320&&minimumY>-4,"crosses_gap_without_falling");
  yield return new WaitForSeconds(.8f);Check(Mathf.Abs(player.transform.position.y)<3,"lands_on_far_platform");
  Debug.Log("GAP_TRAVERSAL_VALIDATION_OK keyboard-only crossing after initial placement");EditorApplication.Exit(0);
 }
}
#endif
