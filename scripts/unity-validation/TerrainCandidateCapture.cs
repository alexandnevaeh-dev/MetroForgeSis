using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
[InitializeOnLoad] public static class TerrainCandidateCapture {
 const string Key="MetroForge.TerrainCandidateCapture";
 static GameBootstrap game;static double deadline,next;static int stage;
 static TerrainCandidateCapture(){EditorApplication.playModeStateChanged+=Changed;}
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
  ApplyTerrainCandidate();CaptureScene();Debug.Log("UNITY_BACKGROUND_CANDIDATE_CAPTURE_PASS");Finish(2);
 }catch(Exception error){Debug.LogException(error);Finish(3);}}
 static void ApplyTerrainCandidate(){
  var rel=Environment.GetEnvironmentVariable("METROFORGE_CANDIDATE_TERRAIN");
  if(string.IsNullOrEmpty(rel)||Path.IsPathRooted(rel)||rel.Contains(".."))throw new Exception("Expected relative terrain candidate");
  var texture=new Texture2D(2,2,TextureFormat.RGBA32,false);
  if(!texture.LoadImage(File.ReadAllBytes(Path.Combine(Application.streamingAssetsPath,rel))))throw new Exception("Terrain decode failed");
  var pixels=texture.GetPixels32();int left=texture.width,right=-1,bottom=texture.height,top=-1;
  for(int y=0;y<texture.height;y++)for(int x=0;x<texture.width;x++)if(pixels[y*texture.width+x].a>128){left=Math.Min(left,x);right=Math.Max(right,x);bottom=Math.Min(bottom,y);top=Math.Max(top,y);}
  if(right<left)throw new Exception("Empty terrain alpha");
  texture.filterMode=FilterMode.Bilinear;
  var sprite=Sprite.Create(texture,new Rect(left,bottom,right-left+1,top-bottom+1),new Vector2(.5f,.5f),4f,0,SpriteMeshType.FullRect,new Vector4(12,6,12,6));
  int count=0;
  foreach(var body in UnityEngine.Object.FindObjectsByType<Rigidbody2D>(FindObjectsSortMode.None)){
   var box=body.GetComponent<BoxCollider2D>();var renderer=body.GetComponent<SpriteRenderer>();
   if(body.bodyType!=RigidbodyType2D.Static||box==null||box.isTrigger||renderer==null||renderer.sortingOrder!=1||box.size.y>box.size.x*1.35f)continue;
   var before=box.size;renderer.sprite=sprite;renderer.drawMode=SpriteDrawMode.Sliced;renderer.size=before;
   if(before.x>before.y*sprite.rect.width/sprite.rect.height*1.5f)BuildCappedTerrain(renderer,texture,sprite.rect,before);
   if(box.size!=before)throw new Exception("Candidate altered collision geometry");count++;
  }
  if(count==0)throw new Exception("No terrain renderer replaced");
  Debug.Log("TERRAIN_CANDIDATE_APPLIED count="+count+" crop="+left+","+bottom+","+(right-left+1)+","+(top-bottom+1)+" collisionUnchanged=true");
 }
 static void BuildCappedTerrain(SpriteRenderer original,Texture2D texture,Rect crop,Vector2 size){
  float capPixels=Mathf.Floor(crop.width*.25f),middlePixels=crop.width-2*capPixels;
  float ratio=size.y/crop.height,cap=capPixels*ratio,middleWidth=size.x-2*cap;
  int repeats=Mathf.Clamp(Mathf.RoundToInt(middleWidth/(middlePixels*ratio)),1,127);
  if(repeats%2==0)repeats++; // alternating middle ends at the original right edge
  float segment=middleWidth/repeats,cursor=-size.x*.5f;
  Action<Rect,float,bool> piece=(uv,w,flip)=>{
   var go=new GameObject("Candidate terrain piece");go.transform.SetParent(original.transform,false);
   go.transform.localPosition=new Vector3(cursor+w*.5f,0,0);
   var sr=go.AddComponent<SpriteRenderer>();sr.sprite=Sprite.Create(texture,uv,new Vector2(.5f,.5f),1f,0,SpriteMeshType.FullRect);
   sr.sortingOrder=original.sortingOrder;sr.flipX=flip;go.transform.localScale=new Vector3(w/uv.width,size.y/uv.height,1);cursor+=w;
  };
  piece(new Rect(crop.x,crop.y,capPixels,crop.height),cap,false);
  for(int i=0;i<repeats;i++)piece(new Rect(crop.x+capPixels,crop.y,middlePixels,crop.height),segment,i%2==1);
  piece(new Rect(crop.x+capPixels+middlePixels,crop.y,capPixels,crop.height),cap,false);
  if(Mathf.Abs(cursor-size.x*.5f)>.01f)throw new Exception("Terrain pieces do not span authored width");
  original.enabled=false;Debug.Log("TERRAIN_CAPS repeats="+repeats+" horizontalDensityRatio="+(segment/(middlePixels*ratio)));
 }
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
   File.WriteAllBytes(Path.Combine(Application.dataPath,"../terrain-capped-candidate-capture.png"),image.EncodeToPNG());
   Debug.Log("UNITY_BACKGROUND_CAPTURE_WRITTEN");
  }finally{RenderTexture.active=previousActive;camera.targetTexture=previousTarget;canvas.renderMode=oldMode;canvas.worldCamera=oldCamera;canvas.planeDistance=oldDistance;canvas.overrideSorting=oldOverride;canvas.sortingOrder=oldOrder;RenderTexture.ReleaseTemporary(target);if(image!=null)UnityEngine.Object.Destroy(image);}
 }
 static void Finish(int result){EditorApplication.update-=Tick;SessionState.SetInt(Key,result);EditorApplication.isPlaying=false;}
}
