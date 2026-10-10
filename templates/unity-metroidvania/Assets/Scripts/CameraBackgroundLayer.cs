using UnityEngine;

// Optional distant-layer framing. Does not modify gameplay geometry or camera tracking.
[RequireComponent(typeof(SpriteRenderer))]
public sealed class CameraBackgroundLayer : MonoBehaviour
{
 Camera targetCamera;
 SpriteRenderer layer;
 Vector2 roomCenter;
 float parallax;
 public void Configure(Camera camera, Vector2 center, float movement)
 {
  targetCamera=camera;roomCenter=center;
  parallax=float.IsNaN(movement)||float.IsInfinity(movement)?0f:Mathf.Clamp01(movement);
  layer=GetComponent<SpriteRenderer>();
  RefreshFrame();
 }
 void OnEnable(){Camera.onPreCull+=BeforeCull;}
 void OnDisable(){Camera.onPreCull-=BeforeCull;}
 void LateUpdate(){RefreshFrame();}
 void BeforeCull(Camera camera){if(camera==targetCamera)RefreshFrame();}
 public void RefreshFrame()
 {
  if(targetCamera==null||!targetCamera.orthographic||layer==null||layer.sprite==null)return;
  var size=layer.sprite.bounds.size;
  if(size.x<=0f||size.y<=0f)return;
  float height=targetCamera.orthographicSize*2f,width=height*targetCamera.aspect;
  float scale=Mathf.Max(width/size.x,height/size.y)*1.15f;
  // Clamp motion to the image's overscan so no empty edge can enter the view.
  var margin=new Vector2((size.x*scale-width)*0.5f,(size.y*scale-height)*0.5f);
  var cameraPosition=targetCamera.transform.position;
  var offset=(roomCenter-(Vector2)cameraPosition)*parallax;
  transform.position=new Vector3(cameraPosition.x+Mathf.Clamp(offset.x,-margin.x,margin.x),cameraPosition.y+Mathf.Clamp(offset.y,-margin.y,margin.y),transform.position.z);
  transform.localScale=new Vector3(scale,scale,1f);
 }
}
