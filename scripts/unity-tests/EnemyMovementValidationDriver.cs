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
  var floor=new GameObject("Ledge").AddComponent<BoxCollider2D>();floor.size=new Vector2(200,32);floor.transform.position=new Vector2(100,-16);
  Physics2D.gravity=new Vector2(0,-980);
  player.GetComponent<Rigidbody2D>().bodyType=RigidbodyType2D.Static;
  player.transform.position=new Vector3(300,0);
  enemy.GetComponent<Rigidbody2D>().position=new Vector2(100,0);enemy.transform.position=new Vector3(100,0);enemy.ConfigureMovement("patrol");Physics2D.SyncTransforms();
  yield return new WaitForSeconds(4f);
  Check(enemy.transform.position.x>160&&enemy.transform.position.x<190&&Mathf.Abs(enemy.transform.position.y)<2,"mobile_enemy_stops_at_ledge");
  var edgeX=enemy.transform.position.x;player.transform.position=new Vector3(-100,0);Physics2D.SyncTransforms();
  yield return new WaitForSeconds(.6f);Check(enemy.transform.position.x<edgeX-10,"enemy_can_move_back_from_ledge");
  Debug.Log("ENEMY_MOVEMENT_VALIDATION_OK");EditorApplication.Exit(0);
 }
}
#endif
