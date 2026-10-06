#if UNITY_EDITOR && ENABLE_INPUT_SYSTEM
using System;
using System.Collections;
using UnityEngine;
using UnityEditor;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
[DefaultExecutionOrder(-200)]
public class WallSlideValidationDriver : MonoBehaviour {
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-wallSlideTest")>=0)new GameObject("WallSlideTest").AddComponent<WallSlideValidationDriver>();}
 private Keyboard keyboard;private int direction=1;
 private void Update(){if(keyboard==null)return;InputSystem.QueueStateEvent(keyboard,direction>0?new KeyboardState(Key.D):direction<0?new KeyboardState(Key.A):new KeyboardState());InputSystem.Update();}
 private void Check(bool ok,string label){if(!ok){Debug.LogError("WALL_SLIDE_FAIL "+label);EditorApplication.Exit(1);throw new Exception(label);}Debug.Log("WALL_SLIDE_PASS "+label);}
 private IEnumerator Start(){
  var wall=new GameObject("Wall").AddComponent<BoxCollider2D>();wall.size=new Vector2(32,4000);wall.transform.position=new Vector2(28,0);
  var player=new GameObject("Player").AddComponent<PlayerActor>();
  player.Configure(new GameplayPack{movement=new GameplayMovement{gravity=980,maxFallSpeed=650,walkSpeed=200,acceleration=1800,airAcceleration=900,jumpHeight=120,coyoteTime=.12f,jumpBufferTime=.1f},combat=new GameplayCombat{maxHealth=100}},null);
  var body=player.GetComponent<Rigidbody2D>();body.position=new Vector2(0,500);Physics2D.SyncTransforms();
  Application.runInBackground=true;AcceptanceDriver.ConfigureAcceptanceInput();keyboard=InputSystem.AddDevice<Keyboard>();InputSystem.EnableDevice(keyboard);
  yield return new WaitForSeconds(.4f);Check(!player.IsWallSliding&&body.linearVelocity.y< -150,"locked_ability_does_not_slow_fall");
  player.GrantAbility("wall_slide");yield return new WaitForSeconds(.25f);
  Check(player.IsWallSliding,"pressing_into_wall_starts_slide");Check(body.linearVelocity.y>=-92&&body.linearVelocity.y< -20,"slide_caps_descent");
  direction=0;yield return new WaitForSeconds(.25f);Check(!player.IsWallSliding&&body.linearVelocity.y< -150,"release_restores_gravity");
  direction=1;yield return new WaitForSeconds(.15f);Check(player.IsWallSliding,"repress_resumes_slide");
  direction=-1;yield return new WaitForSeconds(.2f);Check(!player.IsWallSliding&&body.position.x< -3,"moving_away_releases_wall");
  player.Defeat();Check(!player.IsWallSliding,"death_clears_slide");
  Debug.Log("WALL_SLIDE_VALIDATION_OK native keyboard and collision contacts");EditorApplication.Exit(0);
 }
}
#endif
