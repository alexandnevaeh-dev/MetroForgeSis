using System;
using System.IO;
using UnityEditor;
using UnityEngine;
public static class MetroForgeSpriteGridValidation {
 public static void Run(){
  bool ok=false; string detail="";Texture2D source=null;GameObject actor=null;
  var root=Path.GetFullPath(Path.Combine(Application.dataPath,"../qa/sprite-grid"));
  Directory.CreateDirectory(root);
  try{
   source=new Texture2D(32,16,TextureFormat.RGBA32,false);
   for(int row=0;row<2;row++)for(int col=0;col<4;col++)
    for(int y=0;y<8;y++)for(int x=0;x<8;x++)
     source.SetPixel(col*8+x,8-row*8+y,new Color((row*4+col+1)/8f,0,0,1));
   source.Apply();File.WriteAllBytes(Path.Combine(root,"grid.png"),source.EncodeToPNG());
   var frames=StreamingArtCache.GetSheet(root,"grid.png",8,8,new Vector2(.5f,0),FilterMode.Point,2);
   if(frames.Length!=8)throw new Exception("Expected eight frames; got "+frames.Length);
   for(int i=0;i<8;i++){
    var rect=frames[i].rect;
    if(rect.x!=(i%4)*8||rect.y!=8-(i/4)*8)throw new Exception("Wrong source order at "+i);
    if(Mathf.Abs(frames[i].texture.GetPixel((int)rect.x+4,(int)rect.y+4).r-(i+1)/8f)>.01f)throw new Exception("Wrong cell content at "+i);
    if(frames[i].bounds.size.x!=4||frames[i].pivot.y!=0)throw new Exception("Scale/pivot changed");
   }
   var strip=StreamingArtCache.GetSheet(root,"grid.png",8,16,new Vector2(.5f,0),FilterMode.Point);
   if(strip.Length!=4||strip[3].rect.x!=24)throw new Exception("Horizontal strip regression");
   var oversized=StreamingArtCache.GetSheet(root,"grid.png",64,64,Vector2.zero,FilterMode.Point);
   if(oversized.Length!=1||oversized[0].rect.size!=new Vector2(32,16))throw new Exception("Oversized cell not clamped");
   actor=new GameObject("ImpactMetadataProbe");actor.AddComponent<SpriteRenderer>();
   var animator=actor.AddComponent<SpriteSheetPlayer>();
   GameplaySpriteClip Clip(string name,int marker,bool explicitMarker)=>new GameplaySpriteClip{
    ownerId="probe",clip=name,relativePath="grid.png",frameWidth=8,frameHeight=8,frameCount=8,
    fps=10,pixelsPerUnit=2,pivotX=.5f,pivotY=.5f,impactFrame=marker,hasImpactFrame=explicitMarker};
   animator.LoadClips(new[]{Clip("legacy",0,false),Clip("first",0,true),Clip("marked",5,true),Clip("invalid",8,true)},"probe",root);
   if(Mathf.Abs(animator.ClipImpactSeconds("legacy")-.4f)>.001f)throw new Exception("Legacy JsonUtility zero was mistaken for an authored first-frame strike");
   if(animator.ClipImpactSeconds("first")!=0f)throw new Exception("Explicit first-frame impact was lost");
   if(Mathf.Abs(animator.ClipImpactSeconds("marked")-.5f)>.001f)throw new Exception("Authored strike frame was ignored");
   if(Mathf.Abs(animator.ClipImpactSeconds("invalid")-.4f)>.001f)throw new Exception("Out-of-range strike marker escaped fallback");
   ok=true;detail="8-frame grid content/order, scale/pivot, horizontal strip compatibility, oversized cell bounds; legacy, first-frame, authored, invalid impact markers";
  }catch(Exception e){detail=e.ToString();Debug.LogException(e);}
  finally{if(actor!=null)UnityEngine.Object.DestroyImmediate(actor);if(source!=null)UnityEngine.Object.DestroyImmediate(source);File.WriteAllText(Path.Combine(root,"result.txt"),(ok?"PASS ":"FAIL ")+detail);Debug.Log("SPRITE_GRID_"+(ok?"PASS ":"FAIL ")+detail);EditorApplication.Exit(ok?0:1);}
 }
}
