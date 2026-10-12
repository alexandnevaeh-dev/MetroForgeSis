import {useEffect,useRef,useState} from 'react';
import type {AudioBindingSnapshot} from '@metroforge/generation';
import {Button,Select} from './ui/index.js';

export function AudioBindingEditor({projectPath,sourcePath}:{projectPath:string;sourcePath:string}){
 const [state,setState]=useState<AudioBindingSnapshot|null>(null),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const current=useRef(true),locked=useRef(false);
 const refresh=async()=>{
  if(!window.metroforge?.readAudioBindings){setError('Desktop audio authoring connection is unavailable.');return;}
  try{const next=await window.metroforge.readAudioBindings(projectPath,sourcePath);if(current.current){setState(next);setTarget(previous=>next.targets.some(row=>row.path===previous&&row.kind===next.source?.kind)?previous:next.targets.find(row=>row.kind===next.source?.kind)?.path??'');}}
  catch(e){if(current.current)setError(e instanceof Error?e.message:'Could not read game audio events.');}
 };
 useEffect(()=>{current.current=true;void refresh();return()=>{current.current=false;};},[projectPath,sourcePath]);
 const edit=async(undo:boolean)=>{
  if(locked.current||!state?.supported)return;locked.current=true;setBusy(true);setError('');setMessage('');
  try{const next=undo?await window.metroforge!.undoAudioBinding(projectPath,sourcePath,state.revision):await window.metroforge!.applyAudioBinding(projectPath,sourcePath,target,state.revision);
   if(current.current){setState(next);setMessage(undo?'Restored the previous audio. Restart the game preview to hear it.':'Take assigned to the game event. Restart the game preview and test playback.');}
  }catch(e){if(current.current)setError(e instanceof Error?e.message:'Audio change failed.');}
  finally{locked.current=false;if(current.current)setBusy(false);}
 };
 const targets=state?.targets.filter(row=>row.kind===state.source?.kind)??[];
 return <section aria-label="Game audio binding" className="form-stack">
  <h4>Use in game</h4>
  {!state&&<p className="hint" role="status">Reading game audio events…</p>}
  {state&&!state.supported&&<p className="hint">{state.reason}</p>}
  {state?.supported&&<>
   {state.sourceError&&<p className="hint" role="status">{state.sourceError}</p>}
   <label>Game event<Select aria-label="Game audio event" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}>{targets.map(row=><option key={row.path} value={row.path}>{row.id.replace(/_/g,' ')}{row.sourcePath?' · custom take':''}</option>)}</Select></label>
   <p className="hint">Listen to this take before assigning it. The previous clip is kept for Undo. Playback still needs testing in the restarted game.</p>
   {state.undoTarget&&<p className="hint">Last audio change: {state.undoTarget.split('/').at(-1)?.replace(/\.wav$/,'').replace(/_/g,' ')}.</p>}
   <div className="row"><Button disabled={busy||!target||!state.source} onClick={()=>void edit(false)}>Use this take</Button><Button disabled={busy||!state.undoTarget} onClick={()=>void edit(true)}>Undo audio change</Button><Button disabled={busy} onClick={()=>void refresh()}>Refresh audio events</Button></div>
  </>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
