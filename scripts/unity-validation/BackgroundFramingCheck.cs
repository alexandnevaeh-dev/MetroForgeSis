using System;
using System.IO;
using UnityEditor;
using UnityEngine;
public static class BackgroundFramingCheck
{
 public static void Run()
 {
  GameObject cameraObject=null,layerObject=null;Texture2D texture=null;Sprite sprite=null;
  int code=1,cases=0;
  try{
   cameraObject=new GameObject("Framing validation camera");var camera=cameraObject.AddComponent<Camera>();camera.orthographic=true;camera.orthographicSize=120;
   layerObject=new GameObject("Framing validation layer");var renderer=layerObject.AddComponent<SpriteRenderer>();
   texture=new Texture2D(64,36);sprite=Sprite.Create(texture,new Rect(0,0,64,36),new Vector2(0.5f,0.5f),1);renderer.sprite=sprite;
   var layer=layerObject.AddComponent<CameraBackgroundLayer>();
   foreach(float movement in new[]{0f,0.1f,1f,-5f,5f,float.NaN,float.PositiveInfinity})
   foreach(float aspect in new[]{9f/16f,4f/3f,16f/9f,32f/9f})
   foreach(var position in new[]{new Vector3(-1000,-500,-10),new Vector3(0,0,-10),new Vector3(360,260,-10),new Vector3(720,520,-10),new Vector3(5000,2000,-10)}){
    camera.aspect=aspect;camera.transform.position=position;
    layer.Configure(camera,new Vector2(360,260),movement);
    var bounds=renderer.bounds;float halfHeight=camera.orthographicSize,halfWidth=halfHeight*aspect;
    Require(bounds.min.x<=position.x-halfWidth+0.01f&&bounds.max.x>=position.x+halfWidth-0.01f,"Horizontal coverage gap");
    Require(bounds.min.y<=position.y-halfHeight+0.01f&&bounds.max.y>=position.y+halfHeight-0.01f,"Vertical coverage gap");
    Require(camera.transform.position==position&&camera.orthographicSize==120,"Framing modified gameplay camera");
    Require(Mathf.Approximately(layer.transform.localScale.x,layer.transform.localScale.y),"Background distorted");cases++;
   }
   camera.aspect=16f/9f;camera.transform.position=new Vector3(360,260,-10);layer.Configure(camera,new Vector2(360,260),0.1f);
   float original=layer.transform.position.x;camera.transform.position+=new Vector3(10,0,0);layer.RefreshFrame();
   Require(Mathf.Approximately(layer.transform.position.x-original,9f),"Unclamped parallax displacement incorrect");
   File.WriteAllText(Path.Combine(Application.dataPath,"../background-framing-result.json"),"{\"passed\":true,\"coverageCases\":"+cases+",\"scope\":\"Native Unity component bounds across camera positions, aspect ratios and parallax values; camera invariance and displacement; not a gameplay animation capture\"}");
   Debug.Log("UNITY_BACKGROUND_FRAMING_PASS cases="+cases);code=0;
  }catch(Exception error){Debug.LogException(error);}
  finally{if(layerObject!=null)UnityEngine.Object.DestroyImmediate(layerObject);if(cameraObject!=null)UnityEngine.Object.DestroyImmediate(cameraObject);if(sprite!=null)UnityEngine.Object.DestroyImmediate(sprite);if(texture!=null)UnityEngine.Object.DestroyImmediate(texture);EditorApplication.Exit(code);}
 }
 static void Require(bool value,string message){if(!value)throw new Exception(message);}
}
