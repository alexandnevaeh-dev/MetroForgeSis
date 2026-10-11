using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEngine;
// Validation-only continuation of a proven earned save; steering uses the normal input driver.
public class RegionRouteProbeDriver : MonoBehaviour
{
 public static bool SaveWritesAuthorized { get; private set; }
 public static bool SaveWritesAllowed {
  get { foreach(var arg in Environment.GetCommandLineArgs())if(arg=="-acceptanceMode=region_route")return SaveWritesAuthorized; return true; }
 }
 [Serializable] public class Step { public string from,to,direction; public float startX,startY,endX,endY,cameraHeight; }
 [Serializable] public class Result { public bool passed; public string reason,scope="Provided-save continuation with real Input System events and door sensors; no warps or ability grants. External provenance establishes earned progression.";public Step[] transitions;public string[] surfaces; public string planId, resumeSaveSha256; }
 [Serializable] public class Waypoint { public string roomId; public bool hasSurface; public float floorY,x; }
 [Serializable] public class RoutePlan { public string format,id,resumeSavePath,resumeSaveSha256,expectedStartRoom; public string[] requiredAbilities; public Waypoint[] waypoints; }
 RoutePlan plan; byte[] sourceSaveBytes;
 GameBootstrap game;AcceptanceDriver input;List<Step> steps=new List<Step>();List<string> surfaces=new List<string>();bool failed;
 object Call(string name,params object[] args)=>typeof(AcceptanceDriver).GetMethod(name,BindingFlags.NonPublic|BindingFlags.Instance).Invoke(input,args);
 void Set(string name,object value)=>typeof(AcceptanceDriver).GetField(name,BindingFlags.NonPublic|BindingFlags.Instance).SetValue(input,value);
 void Target(float x){Set("_ascending",true);Set("_ascentTargetX",x);}
 void Release(){Set("_ascending",false);Call("ReleaseAll");}
 IEnumerator Capture(string name)=> (IEnumerator)Call("Capture",name);
 IEnumerator Start(){
  game=GetComponent<GameBootstrap>();input=GetComponent<AcceptanceDriver>();while(game.Player==null)yield return null;
  string problem=null;
  try{plan=ReadPlan();}catch(Exception error){problem=error.Message;}
  if(problem!=null){Finish(false,"invalid_plan: "+problem);yield break;}
  Call("EnsureKeyboard");
  try{using(var destination=new FileStream(game.SavePath,FileMode.CreateNew,FileAccess.Write,FileShare.None))destination.Write(sourceSaveBytes,0,sourceSaveBytes.Length);SaveWritesAuthorized=true;game.ReloadFromSaveFile();}
  catch(Exception error){SaveWritesAuthorized=false;Finish(false,"save_restore_failed: "+error.Message);yield break;}
  yield return null;
  if(game.CurrentRoomId!=plan.expectedStartRoom){Finish(false,"save_start_mismatch");yield break;}
  foreach(var ability in plan.requiredAbilities??Array.Empty<string>())if(!game.Player.Abilities.Contains(ability)){Finish(false,"required_saved_ability_missing: "+ability);yield break;}
  Debug.Log("REGION_ROUTE_START room="+game.CurrentRoomId+" abilities="+game.Player.Abilities.Count+" plan="+plan.id);
  foreach(var waypoint in plan.waypoints){
   var destination=waypoint.roomId;
   int guard=0;
   while(game.CurrentRoomId!=destination&&guard++<64){
    var door=NextDoor(destination);if(door==null){Finish(false,"no_earned_route_to_"+destination);yield break;}
    var room=game.CurrentRoom;var start=game.Player.transform.position;
    Debug.Log("REGION_ROUTE_PLAN "+room.id+" -> "+door.targetRoomId+" "+door.direction);
    yield return (IEnumerator)Call("NavigateProgressionDoor",door);
    if(game.CurrentRoomId!=door.targetRoomId){Finish(false,"door_failed_"+room.id+"_"+door.targetRoomId);yield break;}
    var end=game.Player.transform.position;steps.Add(new Step{from=room.id,to=game.CurrentRoomId,direction=door.direction,startX=start.x,startY=start.y,endX=end.x,endY=end.y,cameraHeight=Camera.main.orthographicSize*2});
   }
   if(game.CurrentRoomId!=destination){Finish(false,"target_unreached_"+destination);yield break;}
   Release();yield return Capture("branch_arrival_"+destination+"_"+steps.Count);
   if(waypoint.hasSurface){yield return ReachFloor(waypoint.floorY,waypoint.x);if(failed){Finish(false,"surface_unreached: "+destination);yield break;}}
  }
  Finish(true,"configured_waypoints_surfaces_and_returns");
 }
 RoutePlan ReadPlan(){
  string file=null;foreach(var arg in Environment.GetCommandLineArgs())if(arg.StartsWith("-routeProbePlan=",StringComparison.Ordinal))file=arg.Substring("-routeProbePlan=".Length);
  if(string.IsNullOrEmpty(file)||!Path.IsPathRooted(file)||new FileInfo(file).Length>65536)throw new InvalidDataException("Provide an absolute route plan under 64 KiB");
  var value=JsonUtility.FromJson<RoutePlan>(File.ReadAllText(file));
  if(value==null||value.format!="metroforge.unity.route-probe.v1"||string.IsNullOrEmpty(value.id)||value.waypoints==null||value.waypoints.Length==0||value.waypoints.Length>64)throw new InvalidDataException("Unsupported or empty route plan");
  if(string.IsNullOrEmpty(value.resumeSavePath)||!Path.IsPathRooted(value.resumeSavePath))throw new InvalidDataException("Provide an absolute source save path");
  ValidateSaveIsolation(value.resumeSavePath);
  if(new FileInfo(value.resumeSavePath).Length>65536)throw new InvalidDataException("Save exceeds 64 KiB");
  sourceSaveBytes=File.ReadAllBytes(value.resumeSavePath);
  using(var hash=System.Security.Cryptography.SHA256.Create()){var digest=BitConverter.ToString(hash.ComputeHash(sourceSaveBytes)).Replace("-","").ToLowerInvariant();if(!digest.Equals(value.resumeSaveSha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Source save hash mismatch");}
  var rooms=new Dictionary<string,GameplayRoom>();foreach(var room in game.Pack.rooms)rooms[room.id]=room;
  if(string.IsNullOrEmpty(value.expectedStartRoom)||!rooms.ContainsKey(value.expectedStartRoom))throw new InvalidDataException("Unknown start room");
  foreach(var waypoint in value.waypoints){if(waypoint==null||string.IsNullOrEmpty(waypoint.roomId)||!rooms.ContainsKey(waypoint.roomId))throw new InvalidDataException("Unknown waypoint room");var room=rooms[waypoint.roomId];if(waypoint.hasSurface&&(float.IsNaN(waypoint.x)||float.IsInfinity(waypoint.x)||float.IsNaN(waypoint.floorY)||float.IsInfinity(waypoint.floorY)||waypoint.x<0||waypoint.x>room.width||waypoint.floorY<0||waypoint.floorY>room.height))throw new InvalidDataException("Surface waypoint outside authored room");}
  return value;
 }
 void ValidateSaveIsolation(string source){
  var root=Environment.GetEnvironmentVariable("METROFORGE_GAME_SAVE_DIR");
  var token=Environment.GetEnvironmentVariable("METROFORGE_ROUTE_PROBE_TOKEN");
  if(string.IsNullOrWhiteSpace(root)||!Path.IsPathRooted(root)||string.IsNullOrEmpty(token)||token.Length<32)throw new InvalidDataException("A fresh isolated probe save directory and ownership token are required");
  var directory=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);
  var destination=Path.GetFullPath(game.SavePath);
  if(!string.Equals(Path.GetDirectoryName(destination),directory,StringComparison.OrdinalIgnoreCase)||File.Exists(destination))throw new InvalidDataException("Probe destination must be a new save file in its isolated directory");
  var sourcePath=Path.GetFullPath(source);
  if(sourcePath.StartsWith(directory+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Source save must remain outside the probe save directory");
  var marker=Path.Combine(directory,"route-probe-isolation.token");
  var entries=Directory.GetFileSystemEntries(directory);
  if(entries.Length!=1||!File.Exists(marker)||new FileInfo(marker).Length>256||File.ReadAllText(marker)!=token)throw new InvalidDataException("Probe directory must contain only its matching ownership marker");
  if((File.GetAttributes(directory)&FileAttributes.ReparsePoint)!=0||(File.GetAttributes(marker)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Probe save directory and marker must not be links");
 }
 GameplayDoor NextDoor(string destination){
  var rooms=new Dictionary<string,GameplayRoom>();foreach(var r in game.Pack.rooms)rooms[r.id]=r;
  var queue=new Queue<string>();var first=new Dictionary<string,GameplayDoor>();queue.Enqueue(game.CurrentRoomId);first[game.CurrentRoomId]=null;
  while(queue.Count>0){var id=queue.Dequeue();if(id==destination)return first[id];var room=rooms[id];if(room.enemy!=null&&room.enemy.isBoss&&!game.BossDefeated(room))continue;
   foreach(var d in room.doors){if(first.ContainsKey(d.targetRoomId)||!rooms.ContainsKey(d.targetRoomId))continue;bool allowed=true;foreach(var a in d.requirements??Array.Empty<string>())allowed&=game.Player.Abilities.Contains(a);if(!allowed)continue;first[d.targetRoomId]=id==game.CurrentRoomId?d:first[id];queue.Enqueue(d.targetRoomId);}}
  return null;
 }
 IEnumerator ReachFloor(float floor,float x){
  var room=game.CurrentRoom;var body=game.Player.GetComponent<Rigidbody2D>();float foot=room.height-body.position.y;
  GameplayRect destinationSupport=null;foreach(var solid in room.solids)if(Mathf.Abs(solid.y-floor)<.5f&&x>=solid.x+12&&x<=solid.x+solid.width-12)destinationSupport=solid;
  if(foot>floor+8){
   var flights=new List<GameplayStairFlight>();foreach(var f in room.stairFlights??Array.Empty<GameplayStairFlight>())if(f.to.y<foot-12&&f.to.y>=floor-8)flights.Add(f);flights.Sort((a,b)=>b.from.y.CompareTo(a.from.y));
   if(flights.Count==0){failed=true;Debug.Log("REGION_ROUTE_SURFACE_UNSUPPORTED no stair route to declared floor");yield break;}
   for(int i=0;i<flights.Count;i++){var f=flights[i];if(i==0){Target(f.from.x);float approach=Time.unscaledTime+8;while(Mathf.Abs(body.position.x-f.from.x)>8&&Time.unscaledTime<approach)yield return null;}
    Target(f.to.x);if(i>0||foot<room.floorTop-12)Call("Pulse",KeyCode.Space);float until=Time.unscaledTime+15;bool landed=false;
    while(Time.unscaledTime<until){if(Mathf.Abs(body.position.x-f.to.x)<14&&Mathf.Abs(body.position.y-(room.height-f.to.y))<6&&Mathf.Abs(body.linearVelocity.y)<8){landed=true;break;}yield return null;}
    Debug.Log("REGION_ROUTE_SURFACE_FLIGHT "+room.id+" i="+i+" landed="+landed+" position="+body.position);
    if(!landed){Release();failed=true;yield return Capture("branch_surface_failure_"+room.id);yield break;}yield return new WaitForSeconds(.1f);
    if(destinationSupport!=null&&f.to.y-floor>8&&f.to.y-floor<game.Pack.movement.jumpHeight-12){
     float landingX=Mathf.Clamp(f.to.x,destinationSupport.x+24,destinationSupport.x+destinationSupport.width-24);
     float range=game.Pack.movement.walkSpeed*2*Mathf.Sqrt(2*game.Pack.movement.jumpHeight/game.Pack.movement.gravity);
     if(Mathf.Abs(landingX-f.to.x)<range){Target(landingX);Call("Pulse",KeyCode.Space);float jumpUntil=Time.unscaledTime+5;
      while(Time.unscaledTime<jumpUntil){if(Mathf.Abs(body.position.y-(room.height-floor))<6&&Mathf.Abs(body.position.x-landingX)<14&&Mathf.Abs(body.linearVelocity.y)<8)break;yield return null;}
      if(Mathf.Abs(body.position.y-(room.height-floor))>=6){failed=true;Release();yield return Capture("branch_support_jump_failed_"+room.id);yield break;}
      Debug.Log("REGION_ROUTE_SUPPORT_JUMP room="+room.id+" support="+destinationSupport.name+" position="+body.position);break;
     }
    }
   }
  } else if(foot<floor-8){
   float until=Time.unscaledTime+90;int guard=0;
   while(room.height-body.position.y<floor-8&&Time.unscaledTime<until&&guard++<32){
    foot=room.height-body.position.y;float edge=body.position.x;GameplayStairFlight nearest=null;float distance=float.MaxValue;
    foreach(var f in room.stairFlights??Array.Empty<GameplayStairFlight>()){if(f.from.y<foot-20)continue;float d=Mathf.Abs(f.from.y-foot);if(d<distance){distance=d;nearest=f;}}
    if(nearest!=null)edge=nearest.to.x+Mathf.Sign(nearest.to.x-nearest.from.x)*74f;else edge=body.position.x<room.width*.5f?room.width-80:80;
    Target(Mathf.Clamp(edge,64,room.width-64));float stepUntil=Time.unscaledTime+8;while(room.height-body.position.y<foot+40&&Time.unscaledTime<stepUntil)yield return null;
   }
  }
  Target(x);float endTime=Time.unscaledTime+20,nextJump=0;
  while(Time.unscaledTime<endTime){float direction=Mathf.Sign(x-body.position.x);if(Time.unscaledTime>nextJump&&AcceptanceDriver.NeedsGapJump(game.Player,direction)){Call("Pulse",KeyCode.Space);nextJump=Time.unscaledTime+.5f;}if(Mathf.Abs(body.position.x-x)<14&&Mathf.Abs(room.height-body.position.y-floor)<8&&Mathf.Abs(body.linearVelocity.y)<8)break;yield return null;}
  Release();failed=Mathf.Abs(body.position.x-x)>=14||Mathf.Abs(room.height-body.position.y-floor)>=8;
  if(!failed)surfaces.Add(room.id+" floor="+floor+" x="+x);yield return Capture("branch_surface_"+room.id);Debug.Log("REGION_ROUTE_SURFACE "+room.id+" passed="+!failed+" position="+body.position);
 }
 void Finish(bool passed,string reason){Release();string dir=Path.Combine(Directory.GetParent(Application.dataPath).FullName,"qa");Directory.CreateDirectory(dir);File.WriteAllText(Path.Combine(dir,"region-route-result.json"),JsonUtility.ToJson(new Result{passed=passed,reason=reason,transitions=steps.ToArray(),surfaces=surfaces.ToArray(),planId=plan?.id,resumeSaveSha256=plan?.resumeSaveSha256},true));Debug.Log("REGION_ROUTE_AUDIT_END passed="+passed+" reason="+reason+" transitions="+steps.Count);Application.Quit(passed?0:1);}
}


