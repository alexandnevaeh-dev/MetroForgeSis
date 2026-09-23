using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad] public static class BackgroundCandidateCapture {
 const string Key="MetroForge.BackgroundCandidateCapture";
 static GameBootstrap game;static double deadline,next;static int stage;
 static BackgroundCandidateCapture(){EditorApplication.playModeStateChanged+=Changed;}
 public static void Run(){SessionState.SetInt(Key,1);EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);EditorApplication.isPlaying=true;}
 static void Changed(PlayModeStateChange state){
  if(SessionState.GetInt(Key,0)==0)return;
  if(state==PlayModeStateChange.EnteredEditMode){int code=SessionState.GetInt(Key,3)==2?0:1;SessionState.SetInt(Key,0);EditorApplication.Exit(code);return;}
  if(state!=PlayModeStateChange.EnteredPlayMode)return;
  var camera=new GameObject("Main Camera");camera.tag="MainCamera";camera.AddComponent<Camera>().aspect=1280f/720f;
  game=new GameObject("Actual gameplay background review").AddComponent<GameBootstrap>();
  stage=0;deadline=EditorApplication.timeSinceStartup+90;EditorApplication.update+=Tick;
 }
 static void Tick(){try{
  if(EditorApplication.timeSinceStartup>deadline)throw new Exception("Background capture timed out");
  if(stage==0){
   if(game.Pack==null||!game.OnTitleScreen)return;
   var rel=Environment.GetEnvironmentVariable("METROFORGE_CANDIDATE_BACKGROUND");
   if(string.IsNullOrEmpty(rel)||Path.IsPathRooted(rel)||rel.Contains("..")||!File.Exists(Path.Combine(Application.streamingAssetsPath,rel)))throw new Exception("Supply an imported relative candidate background path");
   var room=Array.Find(game.Pack.rooms,r=>r.id==game.Pack.startRoomId);
   room.backgrounds.farCameraRelative=true;
   room.backgrounds.farParallax=0.1f;
   room.backgrounds.far=rel; // In-memory candidate only; authored room files remain untouched.
   if(!game.TryClickTitleContinue())throw new Exception("Could not enter actual game");
   stage=1;next=EditorApplication.timeSinceStartup+2;return;
  }
  if(EditorApplication.timeSinceStartup<next)return;
  if(game.Player==null||game.CurrentRoomId!=game.Pack.startRoomId)throw new Exception("Expected starting room and player");
  var visiblePlayer=game.Player.GetComponent<SpriteRenderer>();
  if(visiblePlayer.sprite==null || visiblePlayer.bounds.size.sqrMagnitude<=0)throw new Exception("Visual capture requires an actual player sprite; fixture is incomplete");
  var c=Camera.main;
  Debug.Log("BACKGROUND_SCENE_STATE player="+game.Player.transform.position+" camera="+c.transform.position+" halfHeight="+c.orthographicSize+" aspect="+c.aspect+" frames="+Time.frameCount+" timeScale="+Time.timeScale);
  CaptureScene();Debug.Log("UNITY_BACKGROUND_CANDIDATE_CAPTURE_PASS");Finish(2);
 }catch(Exception error){Debug.LogException(error);Finish(3);}}
 static void CaptureScene(){
  var camera=Camera.main;var canvas=GameObject.Find("HUD").GetComponent<Canvas>();
  var oldOrder=canvas.sortingOrder;var oldOverride=canvas.overrideSorting;var oldMode=canvas.renderMode;var oldCamera=canvas.worldCamera;var oldDistance=canvas.planeDistance;
  var previousTarget=camera.targetTexture;var previousActive=RenderTexture.active;
  var target=RenderTexture.GetTemporary(1280,720,24,RenderTextureFormat.ARGB32);Texture2D image=null;
  try{
   camera.targetTexture=target;canvas.renderMode=RenderMode.ScreenSpaceCamera;canvas.worldCamera=camera;canvas.planeDistance=1;canvas.overrideSorting=true;canvas.sortingOrder=32760;
   Canvas.ForceUpdateCanvases();
   var renderer=game.Player.GetComponent<SpriteRenderer>();
   Debug.Log("BACKGROUND_RENDER_BEFORE camera="+camera.transform.position+" size="+camera.orthographicSize+" aspect="+camera.aspect+" player="+game.Player.transform.position+" body="+game.Player.GetComponent<Rigidbody2D>().position+" bounds="+renderer.bounds+" viewport="+camera.WorldToViewportPoint(renderer.bounds.center));
   camera.Render();RenderTexture.active=target;
   Debug.Log("BACKGROUND_RENDER_AFTER camera="+camera.transform.position+" player="+game.Player.transform.position+" bounds="+renderer.bounds+" viewport="+camera.WorldToViewportPoint(renderer.bounds.center));
   image=new Texture2D(1280,720,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();
   File.WriteAllBytes(Path.Combine(Application.dataPath,"../background-candidate-capture.png"),image.EncodeToPNG());
   Debug.Log("UNITY_BACKGROUND_CAPTURE_WRITTEN");
  }finally{RenderTexture.active=previousActive;camera.targetTexture=previousTarget;canvas.renderMode=oldMode;canvas.worldCamera=oldCamera;canvas.planeDistance=oldDistance;canvas.overrideSorting=oldOverride;canvas.sortingOrder=oldOrder;RenderTexture.ReleaseTemporary(target);if(image!=null)UnityEngine.Object.Destroy(image);}
 }
 static void Finish(int result){EditorApplication.update-=Tick;SessionState.SetInt(Key,result);EditorApplication.isPlaying=false;}
}
