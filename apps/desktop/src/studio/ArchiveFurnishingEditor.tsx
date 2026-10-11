import {useEffect,useId,useRef,useState} from 'react';
import {Button,ButtonStrip,Checkbox,Input,Select,InspectorSection} from './ui/index.js';
import type {ArchiveFurnishingState} from './metroforge-api.js';
type Draft={data:ArchiveFurnishingState;id:string;x:string;width:string;height:string;floorY:string;defaultFloor:boolean;dirty:boolean;undo:string[];redo:string[]};
const drafts=new Map<string,Draft>();
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if([...drafts.values()].some(d=>d.dirty)){event.preventDefault();event.returnValue='';}});
function choose(data:ArchiveFurnishingState,id:string,undo:string[]=[],redo:string[]=[]):Draft{
 const bay=data.bays.find(b=>b.id===id)??data.bays[0];
 return {data,id:bay?.id??'',x:String(bay?.x??''),width:String(bay?.width??''),height:String(bay?.height??''),floorY:String(bay?.floorY??''),defaultFloor:bay?.floorY===undefined,dirty:false,undo,redo};
}
export function ArchiveFurnishingEditor({projectPath,roomId,disabled=false,onSaved}:{projectPath:string;roomId:string;disabled?:boolean;onSaved:()=>void}){
 const key=JSON.stringify([projectPath,roomId]),fieldId=useId(),alive=useRef(true),action=useRef(false);
 const [draft,setDraft]=useState<Draft|null>(drafts.get(key)??null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const store=(next:Draft)=>{drafts.set(key,next);setDraft(next);};
 const reload=async()=>{
  if(action.current)return;action.current=true;setBusy(true);setError('');setNotice('');
  try{if(!window.metroforge?.readArchiveFurnishings)throw Error('Desktop connection unavailable. Reopen the app.');const data=await window.metroforge.readArchiveFurnishings(projectPath,roomId);if(alive.current){const cached=drafts.get(key);const same=cached?.data.revision===data.revision;store(choose(data,cached?.id??'',same?cached!.undo:[],same?cached!.redo:[]));}}
  catch(e){if(alive.current)setError(String(e));}finally{action.current=false;if(alive.current)setBusy(false);}
 };
 useEffect(()=>{alive.current=true;if(!drafts.get(key)?.dirty)void reload();return()=>{alive.current=false;};},[key]);
 const update=(patch:Partial<Draft>)=>{if(draft)store({...draft,...patch,dirty:true});};
 const save=async()=>{
  if(action.current||!draft||disabled)return;
  const values=[draft.x,draft.width,draft.height,...(!draft.defaultFloor?[draft.floorY]:[])];
  if(values.some(v=>!v.trim()||!Number.isFinite(Number(v)))){setError('Enter finite furnishing dimensions and floor coordinates.');return;}
  action.current=true;setBusy(true);setError('');setNotice('');
  try{const next=await window.metroforge!.saveArchiveFurnishing(projectPath,roomId,{id:draft.id,x:Number(draft.x),width:Number(draft.width),height:Number(draft.height),floorY:draft.defaultFloor?null:Number(draft.floorY)},draft.data.revision);
   if(alive.current){store(choose(next,draft.id,[...draft.undo,next.historyToken!],[]));setNotice('Furnishing saved. Restart Play Preview and review support, clearance and appearance.');onSaved();}}
  catch(e){if(alive.current)setError(String(e));}finally{action.current=false;if(alive.current)setBusy(false);}
 };
 const restore=async(direction:'undo'|'redo')=>{
  if(action.current||!draft||draft.dirty||disabled)return;const token=draft[direction].at(-1);if(!token)return;
  action.current=true;setBusy(true);setError('');setNotice('');
  try{const next=await window.metroforge!.restoreArchiveFurnishing(projectPath,roomId,draft.data.revision,token);
   if(alive.current){store(choose(next,draft.id,direction==='undo'?draft.undo.slice(0,-1):[...draft.undo,next.historyToken!],direction==='redo'?draft.redo.slice(0,-1):[...draft.redo,next.historyToken!]));setNotice('Furnishing restored. Native review is required again.');onSaved();}}
  catch(e){if(alive.current)setError(String(e));}finally{action.current=false;if(alive.current)setBusy(false);}
 };
 return <InspectorSection title="Archive furnishing authoring">
  <p className="hint">Original decorative assemblies. These world dimensions create no collision or reward interaction. Native support and visual review remain pending.</p>
  {!draft&&!error&&<p role="status">Loading furnishings…</p>}
  {error&&<p role="alert">{error}</p>}
  {draft?.data.bays.length===0&&<p>No archive furnishings are authored in this room.</p>}
  {draft&&draft.id&&<>
   <label><span id={fieldId+'-furnishing'}>Archive furnishing</span><Select aria-labelledby={fieldId+'-furnishing'} value={draft.id} disabled={busy||draft.dirty||disabled} onChange={e=>store(choose(draft.data,e.target.value,draft.undo,draft.redo))}>{draft.data.bays.map(b=><option key={b.id} value={b.id}>{b.id} · {b.kind.replaceAll('-',' ')}</option>)}</Select></label>
   <label><span>Assembly center X</span><Input type="number" step="1" value={draft.x} disabled={busy||disabled} onChange={e=>update({x:e.target.value})}/></label>
   <label><span>Assembly width</span><Input type="number" min="64" max="1024" step="1" value={draft.width} disabled={busy||disabled} onChange={e=>update({width:e.target.value})}/></label>
   <label><span>Assembly height</span><Input type="number" min="32" max="384" step="1" value={draft.height} disabled={busy||disabled} onChange={e=>update({height:e.target.value})}/></label>
   <Checkbox label="Use room floor" checked={draft.defaultFloor} disabled={busy||disabled} onChange={e=>update({defaultFloor:e.target.checked})}/>
   {!draft.defaultFloor&&<label><span>Assembly floor Y</span><Input type="number" min="0" max={draft.data.height} step="1" value={draft.floorY} disabled={busy||disabled} onChange={e=>update({floorY:e.target.value})}/></label>}
   <p className="hint">Saved edits preserve the requested size. Unsupported or obstructed assemblies are omitted in the native game. Furniture details may extend above the assembly body.</p>
   <ButtonStrip><Button disabled={busy||disabled||!draft.dirty} onClick={()=>void save()}>Save furnishing</Button><Button disabled={busy||!draft.dirty} onClick={()=>{store(choose(draft.data,draft.id,draft.undo,draft.redo));setError('');setNotice('');}}>Discard furnishing draft</Button></ButtonStrip>
   <ButtonStrip><Button disabled={busy||disabled||draft.dirty||!draft.undo.length} onClick={()=>void restore('undo')}>Undo furnishing</Button><Button disabled={busy||disabled||draft.dirty||!draft.redo.length} onClick={()=>void restore('redo')}>Redo furnishing</Button></ButtonStrip>
  </>}
  <Button disabled={busy||draft?.dirty} onClick={()=>void reload()}>Reload furnishings</Button>
  {notice&&<p role="status">{notice}</p>}
 </InspectorSection>;
}
