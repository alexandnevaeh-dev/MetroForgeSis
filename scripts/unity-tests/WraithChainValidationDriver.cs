#if UNITY_EDITOR
using System;
using System.Collections;
using UnityEngine;
using UnityEditor;
public class WraithChainValidationDriver : MonoBehaviour {
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-wraithChainTest")>=0)new GameObject("WraithChainTest").AddComponent<WraithChainValidationDriver>();}
 private void Check(bool ok,string label){if(!ok){Debug.LogError("WRAITH_CHAIN_FAIL "+label);EditorApplication.Exit(1);throw new Exception(label);}Debug.Log("WRAITH_CHAIN_PASS "+label);}
 private IEnumerator Start(){
  var player=new GameObject("Player").AddComponent<PlayerActor>();
  player.Configure(new GameplayPack {movement=new GameplayMovement {gravity=0,maxFallSpeed=1000,dashDuration=.1f,dashCooldown=.3f,dashSpeed=500},combat=new GameplayCombat {maxHealth=100,invulnerableSeconds=0}},null);
  var body=player.GetComponent<Rigidbody2D>();var chain=player.GetComponent<WraithChain>();
  var anchor=new GameObject("Anchor").AddComponent<WraithAnchor>();anchor.transform.position=new Vector3(240,124);
  Check(!chain.TryAttach(anchor),"locked_without_grapple");player.GrantAbility("grapple");
  anchor.transform.position=new Vector3(600,24);Check(!chain.TryAttach(anchor),"range_limit");
  anchor.transform.position=new Vector3(240,124);
  var wall=new GameObject("Wall").AddComponent<BoxCollider2D>();wall.size=new Vector2(20,300);wall.transform.position=new Vector3(100,100);Physics2D.SyncTransforms();
  Check(!chain.TryAttach(anchor),"solid_line_of_sight_blocks_attach");Destroy(wall.gameObject);yield return null;Physics2D.SyncTransforms();
  Check(chain.TryAttach(anchor),"valid_anchor_attaches");Check(!chain.TryAttach(anchor),"duplicate_attach_rejected");
  player.GrantAbility("phase");Check(!player.TryDash(1),"dash_blocked_while_pulling");
  yield return new WaitForSeconds(.1f);Check(body.position.x>0&&body.position.y>0,"physics_pull_moves_toward_anchor");
  yield return new WaitForSeconds(.6f);Check(!chain.IsPulling,"arrival_releases_anchor");
  Check(!chain.TryAttach(anchor),"cooldown_after_release");yield return new WaitForSeconds(1f);
  body.position=Vector2.zero;body.linearVelocity=Vector2.zero;Physics2D.SyncTransforms();
  Check(chain.TryAttach(anchor),"reattach_after_cooldown");anchor.enabled=false;yield return new WaitForFixedUpdate();yield return new WaitForFixedUpdate();
  Check(!chain.IsPulling,"disabled_anchor_cancels");anchor.enabled=true;yield return new WaitForSeconds(1.6f);
  body.position=Vector2.zero;body.linearVelocity=Vector2.zero;Physics2D.SyncTransforms();
  Check(chain.TryAttach(anchor),"attach_before_obstacle");
  wall=new GameObject("MovingWall").AddComponent<BoxCollider2D>();wall.size=new Vector2(20,300);wall.transform.position=new Vector3(80,100);Physics2D.SyncTransforms();
  yield return new WaitForSeconds(.3f);Check(!chain.IsPulling&&body.position.x<80,"new_obstacle_stops_pull");
  yield return new WaitForSeconds(1.6f);
  body.position=Vector2.zero;body.linearVelocity=Vector2.zero;
  anchor.transform.position=new Vector3(120,24);
  wall.transform.position=new Vector3(60,24);wall.size=new Vector2(20,60);
  var reachable=new GameObject("ReachableAnchor").AddComponent<WraithAnchor>();
  reachable.transform.position=new Vector3(0,224);Physics2D.SyncTransforms();
  Check(chain.TryAttachNearest(),"blocked_nearest_does_not_hide_reachable_anchor");
  yield return new WaitForSeconds(.1f);
  Check(body.position.y>0&&Mathf.Abs(body.position.x)<2,"selected_reachable_anchor_direction");
  Destroy(reachable.gameObject);yield return null;yield return null;
  Check(!chain.IsPulling,"destroyed_anchor_releases_chain");
  var tether=player.transform.Find("Wraith Chain Visual");
  Check(tether==null||!tether.GetComponent<LineRenderer>().enabled,"destroyed_anchor_hides_tether");
  Debug.Log("WRAITH_CHAIN_VALIDATION_OK");EditorApplication.Exit(0);
 }
}
#endif
