using System;
using System.IO;
using UnityEditor;
using UnityEngine;
public static class MetroForgeSpriteGridValidation {
 public static void Run(){
  bool ok=false; string detail="";Texture2D source=null;
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
   ok=true;detail="8-frame grid content/order, scale/pivot, horizontal strip compatibility, oversized cell bounds";
  }catch(Exception e){detail=e.ToString();Debug.LogException(e);}
  finally{if(source!=null)UnityEngine.Object.DestroyImmediate(source);File.WriteAllText(Path.Combine(root,"result.txt"),(ok?"PASS ":"FAIL ")+detail);Debug.Log("SPRITE_GRID_"+(ok?"PASS ":"FAIL ")+detail);EditorApplication.Exit(ok?0:1);}
 }
}