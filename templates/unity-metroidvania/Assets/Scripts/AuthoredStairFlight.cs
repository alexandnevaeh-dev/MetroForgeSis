using System;
using UnityEngine;

/// <summary>Owns an authored stair ribbon's physics and local floor material.</summary>
public class AuthoredStairFlight : MonoBehaviour
{
    private Mesh mesh;
    private Material material;
    public static void Create(GameplayStairFlight flight, float roomHeight, Transform parent, Sprite floor)
    {
        if (flight == null || flight.thickness <= 0f || float.IsNaN(flight.thickness) || float.IsInfinity(flight.thickness) || Vector2.Distance(flight.from,flight.to)<1f)
            throw new ArgumentException("Invalid authored stair flight");
        var go=new GameObject("AuthoredStairFlight");go.transform.SetParent(parent,false);
        var owner=go.AddComponent<AuthoredStairFlight>();
        var a=Coord.FromGodot(flight.from.x,flight.from.y,roomHeight);var b=Coord.FromGodot(flight.to.x,flight.to.y,roomHeight);
        var points=new[]{a,b,b-Vector2.up*flight.thickness,a-Vector2.up*flight.thickness};
        var collisionPoints=(Vector2[])points.Clone();
        if(flight.from.x>flight.to.x)Array.Reverse(collisionPoints);
        var collider=go.AddComponent<PolygonCollider2D>();collider.SetPath(0,collisionPoints);
        if(flight.oneWay){var effector=go.AddComponent<PlatformEffector2D>();effector.useOneWay=true;effector.useOneWayGrouping=true;effector.surfaceArc=170f;effector.useSideFriction=false;collider.usedByEffector=true;}
        var body=go.AddComponent<Rigidbody2D>();body.bodyType=RigidbodyType2D.Static;
        owner.mesh=new Mesh{name="Authored stair ribbon"};owner.mesh.vertices=new[]{new Vector3(a.x,a.y,0),new Vector3(b.x,b.y,0),new Vector3(points[2].x,points[2].y,0),new Vector3(points[3].x,points[3].y,0)};
        owner.mesh.triangles=new[]{0,1,2,0,2,3};var span=Vector2.Distance(a,b)/32f;owner.mesh.uv=new[]{new Vector2(0,1),new Vector2(span,1),new Vector2(span,0),new Vector2(0,0)};owner.mesh.RecalculateBounds();
        var texture=floor!=null?floor.texture:Texture2D.whiteTexture;
        if(floor!=null)texture.wrapMode=TextureWrapMode.Repeat;
        owner.material=new Material(Shader.Find("Sprites/Default"));owner.material.mainTexture=texture;owner.material.color=floor!=null?Color.white:new Color(.22f,.2f,.18f,1f);
        go.AddComponent<MeshFilter>().sharedMesh=owner.mesh;var renderer=go.AddComponent<MeshRenderer>();renderer.sharedMaterial=owner.material;renderer.sortingOrder=1;
    }
    private void OnDestroy(){if(mesh!=null)Destroy(mesh);if(material!=null)Destroy(material);}
}
