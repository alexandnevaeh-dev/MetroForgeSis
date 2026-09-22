#if UNITY_EDITOR && ENABLE_INPUT_SYSTEM
using System;
using System.Collections;
using UnityEngine;
using UnityEditor;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
[DefaultExecutionOrder(-200)]
public class DoubleJumpValidationDriver : MonoBehaviour {
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-doubleJumpTest")>=0)new GameObject("DoubleJumpTest").AddComponent<DoubleJumpValidationDriver>();}
 private Keyboard keyboard;
 private bool press;
 private void Update(){if(keyboard==null)return;InputSystem.QueueStateEvent(keyboard,press?new KeyboardState(Key.Space):new KeyboardState());InputSystem.Update();press=false;}
 private void Check(bool ok,string label){if(!ok){Debug.LogError("DOUBLE_JUMP_FAIL "+label);EditorApplication.Exit(1);throw new Exception(label);}Debug.Log("DOUBLE_JUMP_PASS "+label);}
 private IEnumerator Jump(){press=true;yield return new WaitForSeconds(.06f);}
 private IEnumerator Start(){
  var floor=new GameObject("Floor").AddComponent<BoxCollider2D>();floor.size=new Vector2(800,32);floor.transform.position=new Vector2(0,-16);
  var player=new GameObject("Player").AddComponent<PlayerActor>();
  player.Configure(new GameplayPack{movement=new GameplayMovement{gravity=1000,maxFallSpeed=1000,walkSpeed=140,acceleration=1800,airAcceleration=1800,jumpHeight=70,coyoteTime=.1f,jumpBufferTime=.1f},combat=new GameplayCombat{maxHealth=100}},null);
  var body=player.GetComponent<Rigidbody2D>();
  Application.runInBackground=true;AcceptanceDriver.ConfigureAcceptanceInput();keyboard=InputSystem.AddDevice<Keyboard>();InputSystem.EnableDevice(keyboard);
  yield return new WaitForSeconds(.2f);
  yield return Jump();Check(body.linearVelocity.y>200,"ground_jump");
  yield return new WaitForSeconds(.25f);var before=body.linearVelocity.y;
  yield return Jump();Check(body.linearVelocity.y<before,"locked_air_jump_rejected");
  yield return new WaitForSeconds(.9f);Check(Mathf.Abs(body.position.y)<3,"landed");
  player.GrantAbility("double_jump");yield return Jump();yield return new WaitForSeconds(.28f);
  yield return Jump();Check(body.linearVelocity.y>200,"unlocked_air_jump");
  yield return new WaitForSeconds(.14f);before=body.linearVelocity.y;
  yield return Jump();Check(body.linearVelocity.y<before,"third_jump_rejected");
  yield return new WaitForSeconds(1.2f);Check(Mathf.Abs(body.position.y)<3,"second_landing");
  yield return Jump();yield return new WaitForSeconds(.28f);yield return Jump();Check(body.linearVelocity.y>200,"landing_restores_air_jump");
  Debug.Log("DOUBLE_JUMP_VALIDATION_OK keyboard input and native physics");EditorApplication.Exit(0);
 }
}
#endif
