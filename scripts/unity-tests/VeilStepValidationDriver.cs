#if UNITY_EDITOR
using System;
using System.Collections;
using UnityEngine;
using UnityEditor;
public class VeilStepValidationDriver : MonoBehaviour {
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot() {
  if (Array.IndexOf(Environment.GetCommandLineArgs(), "-veilStepTest") >= 0)
   new GameObject("VeilStepValidation").AddComponent<VeilStepValidationDriver>();
 }
 private void Check(bool value, string label) { if (!value) { Debug.LogError("VEIL_STEP_FAIL " + label); EditorApplication.Exit(1); throw new Exception(label); } Debug.Log("VEIL_STEP_PASS " + label); }
 private IEnumerator Start() {
  var go = new GameObject("Player"); var player = go.AddComponent<PlayerActor>();
  var pack = new GameplayPack { movement = new GameplayMovement { gravity=0, dashDuration=.08f, dashCooldown=.4f, dashSpeed=200, maxFallSpeed=1000 }, combat = new GameplayCombat { maxHealth=100, invulnerableSeconds=0 } };
  player.Configure(pack, null);
  Check(!player.TryDash(1), "locked_without_ability");
  player.GrantAbility("dash"); Check(player.TryDash(1), "ordinary_dash_starts"); player.Hurt(10); Check(player.Health==90, "ordinary_dash_not_invulnerable");
  yield return new WaitForSeconds(.5f);
  player.GrantAbility("phase"); Check(player.TryDash(-1), "veil_step_starts_left");
  Check(go.GetComponent<Rigidbody2D>().linearVelocity.x<0, "leftward_velocity");
  Check(go.GetComponent<BoxCollider2D>().enabled, "solid_collision_retained");
  player.Hurt(10); Check(player.Health==90, "damage_blocked_during_veil_step");
  Check(!player.TryDash(1), "repeated_activation_rejected");
  yield return new WaitForSeconds(.15f);
  Check(!player.IsVeilStepping, "protection_expires"); player.Hurt(10); Check(player.Health==80, "damage_after_expiry");
  Check(!player.TryDash(1), "cooldown_enforced");
  yield return new WaitForSeconds(.4f);
  Check(player.TryDash(1), "ready_after_cooldown");
  yield return new WaitForSeconds(.15f);
  player.Hurt(1000); Check(player.Dead && !player.TryDash(1), "dead_player_cannot_dash");
  Debug.Log("VEIL_STEP_VALIDATION_OK"); EditorApplication.Exit(0);
 }
}
#endif
