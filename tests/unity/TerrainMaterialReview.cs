#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

// Diagnostic scene review, not normal-input traversal. Render the real camera.
[InitializeOnLoad]
public static class TerrainMaterialReview
{
    const string Key = "MetroForge.TerrainMaterialReview";
    static double deadline, next;
    static int roomIndex;
    static bool awaitingCamera;
    static GameBootstrap game;
    static readonly string[] Rooms = { "room_000", "room_019", "room_038" };
    static readonly List<string> Results = new List<string>();
    static int passed, failed;
    static TerrainMaterialReview()
    {
        EditorApplication.playModeStateChanged += state => {
            if (SessionState.GetInt(Key,0)==0) return;
            if (state==PlayModeStateChange.EnteredPlayMode) {
                deadline=EditorApplication.timeSinceStartup+90;roomIndex=-1;
                passed=failed=0;awaitingCamera=false;Results.Clear();EditorApplication.update+=Tick;
            }
            if (state==PlayModeStateChange.EnteredEditMode) {
                int code=SessionState.GetInt(Key,2)==1?0:1;
                SessionState.SetInt(Key,0);EditorApplication.Exit(code);
            }
        };
    }
    public static void Run()
    {
        SessionState.SetInt(Key,1);
        EditorSceneManager.OpenScene("Assets/Scenes/World.unity");
        EditorApplication.EnterPlaymode();
    }
    static void Check(bool value,string label)
    {
        if(value)passed++;else failed++;
        Results.Add("{\"passed\":"+(value?"true":"false")+",\"test\":\""+label+"\"}");
        Debug.Log((value?"TERRAIN_PASS ":"TERRAIN_FAIL ")+label);
    }
    static void Tick()
    {
        try {
            if(EditorApplication.timeSinceStartup>deadline)throw new Exception("Native terrain review exceeded its watchdog");
            if(roomIndex<0) {
                game=UnityEngine.Object.FindFirstObjectByType<GameBootstrap>();
                if(game==null||game.Pack==null||!game.OnTitleScreen)return;
                if(!game.TryClickTitleContinue())throw new Exception("Actual title Continue did not load the game");
                roomIndex=0;next=EditorApplication.timeSinceStartup+1;return;
            }
            if(EditorApplication.timeSinceStartup<next)return;
            if(!awaitingCamera) {
                game.DiagnosticWarpToRoom(Rooms[roomIndex]); // Explicit diagnostic setup.
                awaitingCamera=true;next=EditorApplication.timeSinceStartup+.8;return;
            }
            Camera.main.aspect=960f/600f;
            int terrainBodies=0;
            foreach(var body in UnityEngine.Object.FindObjectsByType<Rigidbody2D>(FindObjectsSortMode.None)) {
                if(body.bodyType!=RigidbodyType2D.Static)continue;
                var collider=body.GetComponent<BoxCollider2D>();var renderer=body.GetComponent<SpriteRenderer>();
                if(collider==null||renderer==null||renderer.sortingOrder!=1)continue;
                terrainBodies++;
                Check(Vector3.Distance(body.transform.lossyScale,Vector3.one)<.001f,Rooms[roomIndex]+" "+body.name+" unit physics root");
                Check(renderer.sprite!=null && renderer.sprite.texture.width==1254,Rooms[roomIndex]+" "+body.name+" new opaque material bound");
                Check(Vector2.Distance(renderer.size,collider.size)<.01f,Rooms[roomIndex]+" "+body.name+" visual footprint matches collision");
            }
            Check(terrainBodies>0,Rooms[roomIndex]+" contains visible collision-bound terrain");
            Capture(Rooms[roomIndex]);
            roomIndex++;awaitingCamera=false;next=EditorApplication.timeSinceStartup+.5;
            if(roomIndex==Rooms.Length)Finish(failed==0);
        } catch(Exception error) {Debug.LogException(error);Check(false,"native review exception");Finish(false);}
    }
    static void Capture(string room)
    {
        var camera=Camera.main;
        var previous=camera.targetTexture;var active=RenderTexture.active;
        var target=RenderTexture.GetTemporary(960,600,24,RenderTextureFormat.ARGB32);
        Texture2D image=null;
        try {
            camera.targetTexture=target;camera.Render();RenderTexture.active=target;
            image=new Texture2D(960,600,TextureFormat.RGB24,false);
            image.ReadPixels(new Rect(0,0,960,600),0,0);image.Apply();
            var output=Path.GetFullPath(Path.Combine(Application.dataPath,"../qa/terrain-material"));
            Directory.CreateDirectory(output);File.WriteAllBytes(Path.Combine(output,room+".png"),image.EncodeToPNG());
        } finally {RenderTexture.active=active;camera.targetTexture=previous;RenderTexture.ReleaseTemporary(target);if(image!=null)UnityEngine.Object.Destroy(image);}
    }
    static void Finish(bool ok)
    {
        EditorApplication.update-=Tick;
        var output=Path.GetFullPath(Path.Combine(Application.dataPath,"../qa/terrain-material"));Directory.CreateDirectory(output);
        File.WriteAllText(Path.Combine(output,"result.json"),"{\"passed\":"+(ok?"true":"false")+",\"checksPassed\":"+passed+",\"checksFailed\":"+failed+",\"scope\":\"Native PlayMode camera renders and collider-aligned material diagnostics; explicit room warps, not traversal acceptance\",\"results\":["+string.Join(",",Results)+"]}");
        SessionState.SetInt(Key,ok?1:2);EditorApplication.ExitPlaymode();
    }
}
#endif
