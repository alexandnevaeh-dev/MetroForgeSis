#if UNITY_EDITOR
using System;
using System.Collections;
using UnityEngine;
using UnityEditor;
public class MultiPickupValidationDriver : MonoBehaviour {
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot() { if (Array.IndexOf(Environment.GetCommandLineArgs(), "-multiPickupTest") >= 0) new GameObject("MultiPickupTest").AddComponent<MultiPickupValidationDriver>(); }
 private void Check(bool ok,string label){if(!ok){Debug.LogError("MULTIPICKUP_FAIL "+label);EditorApplication.Exit(1);throw new Exception(label);}Debug.Log("MULTIPICKUP_PASS "+label);}
 private AbilityPickup Find(string id){foreach(var p in UnityEngine.Object.FindObjectsByType<AbilityPickup>(FindObjectsSortMode.None))if(p.AbilityId==id)return p;return null;}
 private IEnumerator Start(){
  yield return null; var game=UnityEngine.Object.FindFirstObjectByType<GameBootstrap>();
  Check(game!=null&&game.Pack!=null,"bootstrap_loaded");
  var first=game.Pack.startRoomId;var second=game.Pack.rooms[1].id;
  game.DiagnosticWarpToRoom(first);yield return null;
  Check(Find("phase")!=null&&Find("item_test_key")!=null,"both_pickups_spawn");
  var body=game.Player.GetComponent<Rigidbody2D>();body.gravityScale=0;
  body.position=(Vector2)Find("phase").transform.position-new Vector2(0,24);body.linearVelocity=Vector2.zero;
  yield return new WaitForSeconds(.15f);
  Check(game.Player.Abilities.Contains("phase"),"first_collected_by_physics");
  Check(!game.Player.Abilities.Contains("item_test_key")&&Find("item_test_key")!=null,"second_remains_uncollected");
  game.DiagnosticWarpToRoom(second);yield return null;game.DiagnosticWarpToRoom(first);yield return null;
  Check(game.LastTransitionCached,"revisit_uses_cache");
  Check(Find("phase")==null&&Find("item_test_key")!=null,"cached_room_retains_only_uncollected_reward");
  body=game.Player.GetComponent<Rigidbody2D>();body.gravityScale=0;body.position=(Vector2)Find("item_test_key").transform.position-new Vector2(0,24);body.linearVelocity=Vector2.zero;
  yield return new WaitForSeconds(.15f);
  Check(game.Player.Abilities.Contains("item_test_key"),"second_collected_by_physics");
  game.DiagnosticWarpToRoom(second);yield return null;game.DiagnosticWarpToRoom(first);yield return null;
  Check(Find("phase")==null&&Find("item_test_key")==null,"collected_rewards_do_not_respawn");
  Debug.Log("MULTIPICKUP_VALIDATION_OK diagnostic room warps; not normal-input traversal proof");EditorApplication.Exit(0);
 }
}
#endif
