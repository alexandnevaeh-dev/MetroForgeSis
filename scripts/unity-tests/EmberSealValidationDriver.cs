#if UNITY_EDITOR
using System;
using System.Collections;
using UnityEngine;
using UnityEditor;
public class EmberSealValidationDriver : MonoBehaviour {
 [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
 private static void Boot(){if(Array.IndexOf(Environment.GetCommandLineArgs(),"-emberSealTest")>=0)new GameObject("EmberSealTest").AddComponent<EmberSealValidationDriver>();}
 private void Check(bool ok,string label){if(!ok){Debug.LogError("EMBER_SEAL_FAIL "+label);EditorApplication.Exit(1);throw new Exception(label);}Debug.Log("EMBER_SEAL_PASS "+label);}
 private EnemyActor Enemy(string name,Vector2 position){var enemy=new GameObject(name).AddComponent<EnemyActor>();enemy.transform.position=position;enemy.WalkSpeed=0;enemy.Health=200;enemy.GetComponent<Rigidbody2D>().bodyType=RigidbodyType2D.Static;return enemy;}
 private void Capture(string name){
  var directory=Environment.GetEnvironmentVariable("METROFORGE_CAPTURE_DIR");
  if(string.IsNullOrEmpty(directory))return;
  Check(SystemInfo.graphicsDeviceType!=UnityEngine.Rendering.GraphicsDeviceType.Null,"graphics_device_available_"+name);
  var cameraObject=new GameObject("EffectReviewCamera");var camera=cameraObject.AddComponent<Camera>();
  camera.orthographic=true;camera.orthographicSize=180;camera.aspect=1.6f;
  camera.transform.position=new Vector3(0,24,-10);camera.clearFlags=CameraClearFlags.SolidColor;
  camera.backgroundColor=new Color(.025f,.03f,.04f,1);
  var target=RenderTexture.GetTemporary(960,600,24);var previous=RenderTexture.active;
  Texture2D pixels=null;
  try{
   camera.targetTexture=target;camera.Render();RenderTexture.active=target;
   pixels=new Texture2D(960,600,TextureFormat.RGB24,false);pixels.ReadPixels(new Rect(0,0,960,600),0,0);pixels.Apply();
   System.IO.Directory.CreateDirectory(directory);System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory,name+".png"),pixels.EncodeToPNG());
   Debug.Log("EMBER_SEAL_CAPTURE "+name+" gpu="+SystemInfo.graphicsDeviceName);
  }finally{RenderTexture.active=previous;camera.targetTexture=null;RenderTexture.ReleaseTemporary(target);if(pixels!=null)Destroy(pixels);Destroy(cameraObject);}
 }
 private IEnumerator Start(){
  var player=new GameObject("Player").AddComponent<PlayerActor>();
  player.Configure(new GameplayPack{movement=new GameplayMovement{gravity=0,maxFallSpeed=1000},combat=new GameplayCombat{maxHealth=100}},null);
  var seal=player.GetComponent<EmberSeal>();
  Check(!seal.BeginCharge(),"locked_without_unlock");player.GrantAbility("ember_seal");
  Check(seal.BeginCharge(),"unlocked_charge");Check(!seal.ReleaseCharge(),"tap_does_not_fire");
  var close=Enemy("Close",new Vector2(50,10));close.gameObject.AddComponent<CircleCollider2D>();
  var far=Enemy("Far",new Vector2(400,10));
  var occluded=Enemy("Occluded",new Vector2(-50,10));
  var wall=new GameObject("Wall").AddComponent<BoxCollider2D>();wall.size=new Vector2(8,100);wall.transform.position=new Vector2(-25,24);
  Physics2D.SyncTransforms();Check(seal.BeginCharge(),"charge_after_cancel");yield return new WaitForSeconds(.85f);
  var ring=player.transform.Find("Ember Seal Range").GetComponent<LineRenderer>();
  Check(ring.enabled&&Mathf.Abs(Vector3.Distance(ring.GetPosition(0),player.transform.position+new Vector3(0,24))-150)<1,"charged_ring_matches_damage_radius");
  Capture("ember-charge");
  Check(seal.ReleaseCharge(),"charged_release");Check(seal.LastBurstHits==1,"one_unique_target");
  Check(Mathf.Approximately(close.Health,140),"full_charge_damage_once");
  Check(far.Health==200,"outside_radius_untouched");Check(occluded.Health==200,"wall_blocks_damage");
  Check(!seal.BeginCharge(),"cooldown_blocks_repeat");
  yield return null;Check(ring.enabled,"release_flash_visible");Capture("ember-release");
  yield return new WaitForSeconds(.3f);Check(!ring.enabled,"release_flash_expires");
  yield return new WaitForSeconds(3.1f);
  Check(seal.BeginCharge(),"cooldown_expires");player.Revive();Check(!seal.IsCharging,"revive_cancels_charge");
  Debug.Log("EMBER_SEAL_VALIDATION_OK");EditorApplication.Exit(0);
 }
}
#endif
