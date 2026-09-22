#if UNITY_EDITOR
using System;
using System.Collections;
using UnityEngine;
using UnityEditor;
public class EnemyMovementValidationDriver : MonoBehaviour {
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-enemyMovementTest")>=0)new GameObject("EnemyMovementTest").AddComponent<EnemyMovementValidationDriver>();}
 private void Check(bool ok,string label){if(!ok){Debug.LogError("ENEMY_MOVEMENT_FAIL "+label);EditorApplication.Exit(1);throw new Exception(label);}Debug.Log("ENEMY_MOVEMENT_PASS "+label);}
 private IEnumerator Start(){
  var player=new GameObject("Player").AddComponent<PlayerActor>();
  player.Configure(new GameplayPack{movement=new GameplayMovement{gravity=0,maxFallSpeed=1000},combat=new GameplayCombat{maxHealth=100,invulnerableSeconds=0}},null);
  player.transform.position=new Vector3(0,200);player.GetComponent<Rigidbody2D>().position=player.transform.position;
  var enemy=new GameObject("StationaryTrap").AddComponent<EnemyActor>();enemy.ConfigureMovement("stationary");enemy.Bind(player);
  Check(enemy.GetComponent<Rigidbody2D>().bodyType==RigidbodyType2D.Static,"stationary_body_anchored");
  yield return new WaitForSeconds(1f);Check(enemy.transform.position==Vector3.zero,"stationary_stays_at_authored_position");
  Check(player.Health==100,"no_attack_across_vertical_gap");
  player.GetComponent<Rigidbody2D>().position=new Vector2(30,0);player.transform.position=new Vector3(30,0);Physics2D.SyncTransforms();
  yield return new WaitForSeconds(.15f);Check(player.Health<100,"nearby_player_can_be_hit");
  enemy.ConfigureMovement("patrol");player.transform.position=new Vector3(300,0);player.GetComponent<Rigidbody2D>().position=new Vector2(300,0);Physics2D.SyncTransforms();
  yield return new WaitForSeconds(.2f);Check(enemy.transform.position.x>1,"mobile_enemy_still_moves");
  enemy.ConfigureMovement("stationary");var stopped=enemy.transform.position;yield return new WaitForSeconds(.2f);
  Check(Vector3.Distance(stopped,enemy.transform.position)<.01f,"switch_to_stationary_stops_motion");
  Debug.Log("ENEMY_MOVEMENT_VALIDATION_OK");EditorApplication.Exit(0);
 }
}
#endif
