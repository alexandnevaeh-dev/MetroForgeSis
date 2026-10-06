#if UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
public sealed class PropGeometryValidationDriver : MonoBehaviour
{
    int passed, failed;
    readonly List<string> results = new List<string>();
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Install()
    {
        if (Array.IndexOf(Environment.GetCommandLineArgs(), "-propGeometryCheck") >= 0)
            new GameObject("PropGeometryValidation").AddComponent<PropGeometryValidationDriver>();
    }
    void Check(bool value, string label)
    {
        if (value) passed++; else failed++;
        results.Add("{\"passed\":"+(value?"true":"false")+",\"test\":\""+label+"\"}");
        Debug.Log((value?"PROP_PASS ":"PROP_FAIL ")+label);
    }
    void Geometry(GameObject prop, Vector2 colliderSize, Vector2 displaySize, string kind)
    {
        Check(prop != null, kind+" fallback is created");
        if (prop == null) return;
        var collider = prop.GetComponent<BoxCollider2D>();
        var renderer = prop.GetComponent<SpriteRenderer>();
        Physics2D.SyncTransforms();
        var worldSize = collider != null ? (Vector2)prop.transform.TransformVector(collider.size) : Vector2.zero;
        Check(Vector2.Distance(worldSize,colliderSize)<.01f, kind+" authored collision size survives fallback rendering");
        Check(Vector3.Distance(prop.transform.lossyScale,Vector3.one)<.001f,kind+" physics root keeps unit scale");
        Check(renderer != null && renderer.sprite != null && Vector2.Distance(renderer.bounds.size,displaySize)<.01f,kind+" fallback visible bounds match intended display size");
    }
    IEnumerator Start()
    {
        GameBootstrap game = null;
        var until = Time.realtimeSinceStartup+10;
        while(Time.realtimeSinceStartup<until) {
            game=FindFirstObjectByType<GameBootstrap>();
            if(game != null && game.Pack != null)break;
            yield return null;
        }
        if(game==null || game.Pack==null){Check(false,"bootstrap loaded");Finish();yield break;}
        GameplayRoom room=null;
        foreach(var candidate in game.Pack.rooms)if(candidate.id=="room_019")room=candidate;
        if(room==null){Check(false,"real blocked room exists");Finish();yield break;}
        game.DiagnosticWarpToRoom(room.id); // Geometry-only fixture, never traversal evidence.
        yield return null;
        Geometry(GameObject.Find("Gate_double_jump"),new Vector2(32,128),new Vector2(32,128),"gate");
        var field=typeof(GameBootstrap).GetField("_streamingRoot",BindingFlags.NonPublic|BindingFlags.Instance);
        var originalRoot=field.GetValue(game);
        var missing=Path.GetFullPath(Path.Combine(Application.dataPath,"../qa/missing-prop-art"));
        Directory.CreateDirectory(missing);
        field.SetValue(game,missing); // Missing-art branch only; no assets are moved or deleted.
        var originalClips=game.Pack.sprites;
        var filtered=new List<GameplaySpriteClip>();
        foreach(var clip in originalClips)if(clip.ownerId!="checkpoint"&&clip.ownerId!="victory")filtered.Add(clip);
        game.Pack.sprites=filtered.ToArray();
        try {
            var actor=new GameplayActor{id="geometry_probe",x=700,y=room.floorTop};
            Invoke(game,"CreatePickup",room,actor);
            Geometry(GameObject.Find("Pickup_geometry_probe"),new Vector2(24,24),new Vector2(18,18),"pickup");
            var checkpointRoom=new GameplayRoom{id="geometry_probe",height=room.height,floorTop=room.floorTop,checkpoint=new GameplayCheckpoint{x=750,y=room.floorTop}};
            var before=FindNames("Checkpoint");
            Invoke(game,"CreateCheckpoint",checkpointRoom);
            Geometry(NewNamed("Checkpoint",before),new Vector2(28,48),new Vector2(12,40),"checkpoint");
            before=FindNames("Victory");
            Invoke(game,"CreateVictory",room);
            Geometry(NewNamed("Victory",before),new Vector2(48,48),new Vector2(36,36),"victory");
        } finally {field.SetValue(game,originalRoot);game.Pack.sprites=originalClips;}
        yield return GatePhysics(game,room);
        Finish();
    }
    IEnumerator GatePhysics(GameBootstrap game,GameplayRoom room)
    {
        var gate=GameObject.Find("Gate_double_jump");
        var player=game.Player;
        var body=player != null ? player.GetComponent<Rigidbody2D>() : null;
        var collider=gate != null ? gate.GetComponent<BoxCollider2D>() : null;
        Check(body != null && collider != null && !collider.isTrigger,"gate physics fixture has player body and solid gate");
        if(body==null || collider==null)yield break;
        Check(!player.Abilities.Contains("double_jump"),"gate begins with required ability missing");
        if(player.Abilities.Contains("double_jump"))yield break;
        var bounds=collider.bounds;
        // This explicit position is diagnostic setup only. Motion and acquisition below
        // use the actual player's input, collision and pickup trigger code.
        body.position=new Vector2(bounds.min.x-80,body.position.y);
        body.linearVelocity=Vector2.zero;
        player.InputBlocked=false;
        Application.runInBackground=true;
        var oldBackground=InputSystem.settings.backgroundBehavior;
        var oldEditorInput=InputSystem.settings.editorInputBehaviorInPlayMode;
        var oldUpdate=InputSystem.settings.updateMode;
        InputSystem.settings.backgroundBehavior=InputSettings.BackgroundBehavior.IgnoreFocus;
        InputSystem.settings.editorInputBehaviorInPlayMode=InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
        InputSystem.settings.updateMode=InputSettings.UpdateMode.ProcessEventsManually;
        var keyboard=InputSystem.AddDevice<Keyboard>();
        keyboard.MakeCurrent();
        try {
            var until=Time.realtimeSinceStartup+1.4f;
            while(Time.realtimeSinceStartup<until){Drive(keyboard);yield return null;}
            InputSystem.QueueStateEvent(keyboard,new KeyboardState());
            InputSystem.Update();
            yield return new WaitForFixedUpdate();
            Debug.Log("PROP_GATE_BLOCKED x="+body.position.x+" y="+body.position.y+" edge="+bounds.min.x);
            Check(gate != null && gate.activeInHierarchy && body.position.x < bounds.min.x,"missing ability keeps the real player blocked by the gate");
            Check(body.position.x > bounds.min.x-35,"player reached the gate rather than stopping at another obstacle");
            var pickup=new GameplayActor{id="double_jump",x=body.position.x-12,y=room.height-body.position.y};
            Invoke(game,"CreatePickup",room,pickup);
            until=Time.realtimeSinceStartup+1.5f;
            while(Time.realtimeSinceStartup<until && body.position.x < bounds.max.x+35){Drive(keyboard);yield return null;}
            InputSystem.QueueStateEvent(keyboard,new KeyboardState());
            InputSystem.Update();
            yield return null;
            Debug.Log("PROP_GATE_CROSSED x="+body.position.x+" y="+body.position.y+" edge="+bounds.max.x);
            Check(player.Abilities.Contains("double_jump"),"actual pickup trigger grants required ability without a diagnostic grant");
            Check(gate == null || !gate.activeInHierarchy,"ability event retires the blocking gate");
            Check(body.position.x > bounds.max.x+12,"real player crosses the unlocked gate footprint");
        } finally {
            InputSystem.RemoveDevice(keyboard);
            InputSystem.settings.backgroundBehavior=oldBackground;
            InputSystem.settings.editorInputBehaviorInPlayMode=oldEditorInput;
            InputSystem.settings.updateMode=oldUpdate;
        }
    }
    static void Drive(Keyboard keyboard)
    {
        if(!keyboard.enabled)InputSystem.EnableDevice(keyboard);
        InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.D));
        InputSystem.Update();
    }
    static void Invoke(GameBootstrap game,string name,params object[] args)
    {typeof(GameBootstrap).GetMethod(name,BindingFlags.NonPublic|BindingFlags.Instance).Invoke(game,args);}
    static HashSet<int> FindNames(string name)
    {
        var ids=new HashSet<int>();
        foreach(var transform in FindObjectsByType<Transform>(FindObjectsSortMode.None))if(transform.name==name)ids.Add(transform.gameObject.GetInstanceID());
        return ids;
    }
    static GameObject NewNamed(string name,HashSet<int> before)
    {
        foreach(var transform in FindObjectsByType<Transform>(FindObjectsSortMode.None))if(transform.name==name&&!before.Contains(transform.gameObject.GetInstanceID()))return transform.gameObject;
        return null;
    }
    void Finish()
    {
        var output=Path.GetFullPath(Path.Combine(Application.dataPath,"../qa"));Directory.CreateDirectory(output);
        File.WriteAllText(Path.Combine(output,"prop-geometry-result.json"),"{\"passed\":"+(failed==0?"true":"false")+",\"checksPassed\":"+passed+",\"checksFailed\":"+failed+",\"scope\":\"PlayMode geometry diagnostic; explicit warp and missing-art lookup, not traversal acceptance\",\"results\":["+string.Join(",",results)+"]}");
        Debug.Log("PROP_GEOMETRY_RESULT passed="+passed+" failed="+failed);
        UnityEditor.EditorApplication.Exit(failed==0?0:1);
    }
}
#endif
