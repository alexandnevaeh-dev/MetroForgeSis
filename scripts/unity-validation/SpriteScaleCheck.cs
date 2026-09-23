using System;
using System.IO;
using UnityEditor;
using UnityEngine;
public static class SpriteScaleCheck {
 static void Require(bool ok,string reason){if(!ok)throw new Exception(reason);}
 public static void Run(){try{
  var root=Application.streamingAssetsPath;var rel="assets/sprite-scale-check.png";
  Directory.CreateDirectory(Path.Combine(root,"assets"));
  var texture=new Texture2D(128,64,TextureFormat.RGBA32,false);
  File.WriteAllBytes(Path.Combine(root,rel),texture.EncodeToPNG());
  var pivot=new Vector2(.5f,0);
  var legacy=StreamingArtCache.GetSheet(root,rel,64,64,pivot,FilterMode.Point);
  var detailed=StreamingArtCache.GetSheet(root,rel,64,64,pivot,FilterMode.Point,4);
  Require(legacy.Length==2&&detailed.Length==2,"Frame count changed");
  Debug.Log("SPRITE_SCALE_BOUNDS legacy="+legacy[0].bounds.size+" detailed="+detailed[0].bounds.size);
  Require(Mathf.Abs(legacy[0].bounds.size.x-64)<.001f&&Mathf.Abs(legacy[0].bounds.size.y-64)<.001f,"Legacy scale changed");
  Require(Mathf.Abs(detailed[0].bounds.size.x-16)<.001f&&Mathf.Abs(detailed[0].bounds.size.y-16)<.001f,"High resolution scale incorrect");
  Require(Mathf.Abs(detailed[0].bounds.min.y)<.0001f,"Foot pivot shifted");
  Require(!ReferenceEquals(legacy,detailed),"Cache aliases different scales");
  Require(ReferenceEquals(detailed,StreamingArtCache.GetSheet(root,rel,64,64,pivot,FilterMode.Point,4)),"Scale cache miss");
  foreach(var value in new[]{0f,-1f,float.NaN,float.PositiveInfinity})Require(ReferenceEquals(legacy,StreamingArtCache.GetSheet(root,rel,64,64,pivot,FilterMode.Point,value)),"Invalid scale did not fall back");
  var go=new GameObject("Scaled clip check");var renderer=go.AddComponent<SpriteRenderer>();var player=go.AddComponent<SpriteSheetPlayer>();go.SendMessage("Awake");
  player.LoadClips(new[]{new GameplaySpriteClip{ownerId="player",clip="idle",relativePath=rel,frameWidth=64,frameHeight=64,frameCount=2,pivotX=.5f,pivotY=0,pixelsPerUnit=4}},"player",root);
  player.Play("idle",true);Require(renderer.sprite!=null&&renderer.sprite.pixelsPerUnit==4,"Clip metadata not applied");
  UnityEngine.Object.DestroyImmediate(go);UnityEngine.Object.DestroyImmediate(texture);
  File.WriteAllText(Path.Combine(Application.dataPath,"../sprite-scale-result.json"),"{\"passed\":true,\"scope\":\"Native sprite scale, legacy default, cache separation, invalid fallback, foot pivot and clip metadata\"}");
  Debug.Log("UNITY_SPRITE_SCALE_PASS");EditorApplication.Exit(0);
 }catch(Exception error){Debug.LogException(error);EditorApplication.Exit(1);}}
}