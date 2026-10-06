#if UNITY_EDITOR
using System;
using System.Collections;
using UnityEngine;
using UnityEditor;
public class RoomRecoveryValidationDriver : MonoBehaviour {
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-roomRecoveryTest")>=0)new GameObject("RecoveryTest").AddComponent<RoomRecoveryValidationDriver>();}
 private void Check(bool ok,string label){if(!ok){Debug.LogError("ROOM_RECOVERY_FAIL "+label);EditorApplication.Exit(1);throw new Exception(label);}Debug.Log("ROOM_RECOVERY_PASS "+label);}
 private IEnumerator Start(){
  yield return null;var game=UnityEngine.Object.FindFirstObjectByType<GameBootstrap>();
  Check(game!=null&&game.Pack!=null,"bootstrap_loaded");game.DiagnosticWarpToRoom(game.Pack.startRoomId);yield return null;
  var player=game.Player;var body=player.GetComponent<Rigidbody2D>();var deaths=0;player.OnDied+=()=>deaths++;
  player.GrantAbility("phase");player.Revive();
  body.position=new Vector2(100,-120);player.transform.position=body.position;body.linearVelocity=new Vector2(0,-300);Physics2D.SyncTransforms();
  yield return new WaitForSeconds(.15f);
  Check(deaths==1,"fall_defeats_despite_spawn_invulnerability");
  Check(!player.Dead&&player.Health==player.MaxHealth,"existing_respawn_restores_health");
  Check(Vector2.Distance(player.transform.position,game.RespawnAnchor)<6,"respawn_uses_checkpoint");
  Check(System.IO.File.Exists(game.SavePath),"respawn_persists_save");
  body.gravityScale=0;body.position=new Vector2(-64,game.CurrentRoom.height/2);player.transform.position=body.position;body.linearVelocity=Vector2.zero;Physics2D.SyncTransforms();
  yield return new WaitForSeconds(.05f);Check(deaths==1,"doorway_margin_does_not_defeat");
  body.position=new Vector2(game.CurrentRoom.width+200,game.CurrentRoom.height/2);player.transform.position=body.position;Physics2D.SyncTransforms();
  yield return new WaitForSeconds(.05f);Check(deaths==2,"horizontal_escape_recovers");
  Check(Vector2.Distance(player.transform.position,game.RespawnAnchor)<6,"horizontal_recovery_uses_checkpoint");
  var isolated=new GameObject("DefeatOnce").AddComponent<PlayerActor>();var calls=0;isolated.OnDied+=()=>calls++;isolated.Defeat();isolated.Defeat();Check(calls==1,"dead_actor_dispatches_once");
  Debug.Log("ROOM_RECOVERY_VALIDATION_OK diagnostic placements plus real fall physics; not normal-input traversal");EditorApplication.Exit(0);
 }
}
#endif
