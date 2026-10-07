#if UNITY_EDITOR
using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

public static class PlatformerOneWayValidation
{
    public static void Run()
    {
        var oldMode = Physics2D.simulationMode;
        GameObject root = null;
        try
        {
            Physics2D.simulationMode = SimulationMode2D.Script;
            root = new GameObject("OneWayValidation");
            var bootstrap = root.AddComponent<GameBootstrap>();
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            typeof(GameBootstrap).GetField("_worldRoot", flags).SetValue(bootstrap, root.transform);
            typeof(GameBootstrap).GetField("_streamingRoot", flags).SetValue(bootstrap, Path.Combine(Application.dataPath,"MissingValidationArt"));
            var room = new GameplayRoom {height=256, width=256, biomeId="biome_0"};
            var rect = JsonUtility.FromJson<GameplayRect>("{\"name\":\"TestLedge\",\"x\":0,\"y\":128,\"width\":128,\"height\":8,\"oneWay\":true}");
            typeof(GameBootstrap).GetMethod("CreateSolid", flags).Invoke(bootstrap,new object[]{rect,room});
            var ledge = root.transform.Find("TestLedge").GetComponent<BoxCollider2D>();
            var actor = new GameObject("PhysicsActor"); actor.transform.SetParent(root.transform);
            var body = actor.AddComponent<Rigidbody2D>(); body.gravityScale=0; body.freezeRotation=true;
            body.collisionDetectionMode=CollisionDetectionMode2D.Continuous;
            actor.AddComponent<BoxCollider2D>().size=new Vector2(8,8);
            var x = ledge.bounds.center.x;
            var top = ledge.bounds.max.y;
            body.position=new Vector2(x,top-20); body.linearVelocity=new Vector2(0,100);
            Physics2D.SyncTransforms();
            for(int i=0;i<60;i++) Physics2D.Simulate(1f/120f);
            bool roseThrough=body.position.y>top+8;
            body.position=new Vector2(x,top+32); body.linearVelocity=new Vector2(0,-100);
            Physics2D.SyncTransforms();
            for(int i=0;i<60;i++) Physics2D.Simulate(1f/120f);
            bool landed=Mathf.Abs(body.position.y-(top+4))<1f && Mathf.Abs(body.linearVelocity.y)<1f;
            // Legacy JSON omits the field and must keep an ordinary solid collider.
            var legacy=JsonUtility.FromJson<GameplayRect>("{\"name\":\"LegacySolid\",\"x\":160,\"y\":128,\"width\":64,\"height\":8}");
            typeof(GameBootstrap).GetMethod("CreateSolid",flags).Invoke(bootstrap,new object[]{legacy,room});
            var solid=root.transform.Find("LegacySolid").GetComponent<BoxCollider2D>();
            bool legacySolid=!solid.usedByEffector && solid.GetComponent<PlatformEffector2D>()==null;
            bool passed=roseThrough && landed && legacySolid;
            string result=JsonUtility.ToJson(new Proof {passed=passed,roseThrough=roseThrough,landed=landed,legacySolid=legacySolid,unityVersion=Application.unityVersion},true);
            File.WriteAllText(Path.Combine(Directory.GetParent(Application.dataPath).FullName,"one-way-proof.json"),result);
            Debug.Log("PLATFORMER_ONEWAY_RESULT "+result);
            EditorApplication.Exit(passed?0:1);
        }
        catch(Exception error){Debug.LogException(error);EditorApplication.Exit(2);}
        finally {Physics2D.simulationMode=oldMode;if(root!=null)UnityEngine.Object.DestroyImmediate(root);}
    }
    [Serializable] public class Proof {public bool passed,roseThrough,landed,legacySolid;public string unityVersion;}
}
#endif
