using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEngine;
using UnityEditor;
public static class MetroForgeAnimationValidation {
 public static void Run() {
  GameObject go=null; bool passed=false;
  try {
   go=new GameObject("AnimationPhaseValidation"); go.AddComponent<SpriteRenderer>();
   var player=go.AddComponent<SpriteSheetPlayer>();
   var flags=BindingFlags.Instance|BindingFlags.NonPublic;
   var type=typeof(SpriteSheetPlayer);
   var clips=(Dictionary<string,Sprite[]>)type.GetField("_clips",flags).GetValue(player);
   var fps=(Dictionary<string,float>)type.GetField("_fps",flags).GetValue(player);
   var loops=(Dictionary<string,bool>)type.GetField("_loop",flags).GetValue(player);
   clips["walk"]=new Sprite[8]; clips["run"]=new Sprite[12]; clips["idle"]=new Sprite[4];
   fps["walk"]=8; fps["run"]=12; fps["idle"]=4;
   loops["walk"]=loops["run"]=loops["idle"]=true;
   player.Play("walk");
   type.GetField("_frame",flags).SetValue(player,3);
   type.GetField("_elapsed",flags).SetValue(player,.0625f);
   player.Play("run");
   int frame=(int)type.GetField("_frame",flags).GetValue(player);
   float elapsed=(float)type.GetField("_elapsed",flags).GetValue(player);
   if(frame!=5 || Mathf.Abs(elapsed-1f/48f)>.0001f) throw new Exception("Gait phase was not preserved");
   player.Play("run",true);
   if((int)type.GetField("_frame",flags).GetValue(player)!=0) throw new Exception("Explicit restart failed");
   player.Play("walk"); type.GetField("_frame",flags).SetValue(player,5);
   player.Play("idle");
   if((int)type.GetField("_frame",flags).GetValue(player)!=0) throw new Exception("Idle must start at zero");
   player.LoadClips(new GameplaySpriteClip[0],"player","");
   if(player.CurrentClip!=null || fps.Count!=0 || loops.Count!=0) throw new Exception("Reload retains stale playback state");
   passed=true; Debug.Log("ANIMATION_PHASE_VALIDATION_PASS");
  } catch(Exception ex){Debug.LogException(ex);}
  finally {
   if(go!=null) UnityEngine.Object.DestroyImmediate(go);
   Directory.CreateDirectory(Path.Combine(Application.dataPath,"../qa"));
   File.WriteAllText(Path.Combine(Application.dataPath,"../qa/animation-phase-result.txt"),passed?"PASS: walk/run phase, explicit restart, idle transition, reload state. Native EditMode only; no visual animation approval.":"FAIL");
   EditorApplication.Exit(passed?0:1);
  }
 }
}