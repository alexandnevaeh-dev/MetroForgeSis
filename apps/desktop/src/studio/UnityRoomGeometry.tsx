import { useEffect, useState } from 'react';
import { LiveEditSession, type LiveEditOperation } from '@metroforge/engines/live-edit-session';
import { Button, Input } from './ui/index.js';
type Draft = { session: LiveEditSession; fingerprints: string[] };
// Retain unsaved room work when navigating between rooms during this app session.
const drafts = new Map<string, Draft>();
export function UnityRoomGeometry({projectPath,roomId,width,height}: {projectPath:string;roomId:string;width:number;height:number}) {
 const framingId=`${roomId}:background-framing`;
 const key=JSON.stringify([projectPath,roomId]);
 const [draft,setDraft]=useState<Draft|null>(null);
 const [,refresh]=useState(0);
 const [selected,setSelected]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [saving,setSaving]=useState(false);
 useEffect(()=>{let alive=true;const cached=drafts.get(key);if(cached){setDraft(cached);return;}
  void window.metroforge!.readUnityRoomEdit(projectPath,roomId).then(data=>{if(!alive)return;const next={session:new LiveEditSession(projectPath,crypto.randomUUID(),[...data.objects,{id:framingId,roomId,x:0,y:0,properties:{...data.backgroundFraming}}],new Set(['width','height','name','farCameraRelative','farParallax'])),fingerprints:data.fingerprints};drafts.set(key,next);setDraft(next);}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};
 },[key,projectPath,roomId,framingId]);
 const state=draft?.session.snapshot();
 const solids=state?.objects.filter(o=>o.id!==framingId);
 const framing=state?.objects.find(o=>o.id===framingId);
 const object=solids?.find(o=>o.id===selected);
 const token=()=>({projectId:projectPath,sessionId:draft!.session.sessionId,baseRevision:draft!.session.snapshot().revision});
 const edit=(operations:LiveEditOperation[])=>{if(!draft||saving)return;try{draft.session.commit({...token(),operations});setError('');setNotice('');refresh(n=>n+1);}catch(e){setError(String(e));}};
 const history=(redo:boolean)=>{if(!draft)return;try{if(redo)draft.session.redo(token());else draft.session.undo(token());refresh(n=>n+1);setNotice('');}catch(e){setError(String(e));}};
 const save=async()=>{if(!draft||!state)return;setSaving(true);setError('');try{const result=await window.metroforge!.saveUnityRoomEdit(projectPath,roomId,solids!,draft.fingerprints,{farCameraRelative:framing?.properties.farCameraRelative===true,farParallax:Number(framing?.properties.farParallax??0.1)});draft.fingerprints=result.fingerprints;draft.session.markSaved(state.revision);setNotice('Saved. Restart the Unity game to apply room changes.');refresh(n=>n+1);}catch(e){setError(String(e));}finally{setSaving(false);}};
 return <div className="unity-room-geometry">
  <div className="row">
   <Button disabled={!draft||saving} onClick={()=>{const id=crypto.randomUUID();edit([{type:'add',object:{id,roomId,x:Math.round(width/2),y:Math.round(height/2),properties:{width:80,height:16,name:'Platform'}}}]);setSelected(id);}}>Add platform</Button>
   <Button disabled={!object||saving} onClick={()=>edit([{type:'remove',objectId:selected}])}>Remove solid</Button>
   <Button disabled={!state?.canUndo||saving} onClick={()=>history(false)}>Undo room edit</Button>
   <Button disabled={!state?.canRedo||saving} onClick={()=>history(true)}>Redo room edit</Button>
   <Button disabled={!state?.dirty||saving} onClick={()=>void save()}>{saving?'Saving…':'Save room'}</Button>
  </div>
  <p className="hint">{state?.dirty?'Unsaved room changes · retained while switching rooms.':'Unity room geometry'} · Select a solid to edit its position and size. Runtime restart required.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {framing&&<fieldset className="room-background-settings" disabled={saving}><legend>Distant background</legend><div className="room-background-fields">
   <label className="room-background-toggle"><Input type="checkbox" aria-label="Frame background to camera" checked={framing.properties.farCameraRelative===true} onChange={e=>edit([{type:'property',objectId:framingId,key:'farCameraRelative',value:e.target.checked}])}/>Frame background to camera</label>
   <label className="room-background-parallax">Parallax amount<Input aria-label="Background parallax" type="number" min={0} max={1} step={0.05} disabled={framing.properties.farCameraRelative!==true} value={Number(framing.properties.farParallax)} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isFinite(value)&&value>=0&&value<=1)edit([{type:'property',objectId:framingId,key:'farParallax',value}]);}}/></label>
   </div><p className="hint">0 follows the camera; 1 allows the most drift. Save and restart Unity to preview the background.</p>
  </fieldset>}
  <svg className="room-canvas" viewBox={`0 0 ${width} ${height}`} style={{width:'100%',maxHeight:560}} aria-label="Unity room geometry">
   <rect width={width} height={height} fill="#171c24" />
   {solids?.map(o=><rect key={o.id} role="button" tabIndex={0} aria-label={`Select ${o.properties.name??'solid'} ${o.id}`} x={o.x} y={o.y} width={Number(o.properties.width)} height={Number(o.properties.height)} fill={selected===o.id?'#70b5e8':'#6a5746'} stroke={selected===o.id?'#d9f0ff':'#bd8756'} strokeWidth={2} onClick={()=>setSelected(o.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(o.id);}}}/>)}
  </svg>
  {object&&<fieldset disabled={saving}><legend>Selected solid</legend><div className="row">{(['x','y','width','height'] as const).map(field=><label key={field}>{field}<input aria-label={`Solid ${field}`} type="number" value={field==='x'||field==='y'?object[field]:Number(object.properties[field])} min={field==='width'||field==='height'?1:undefined} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(!Number.isFinite(value)||((field==='width'||field==='height')&&value<=0))return;edit([field==='x'||field==='y'?{type:'move',objectId:object.id,x:field==='x'?value:object.x,y:field==='y'?value:object.y}:{type:'property',objectId:object.id,key:field,value}]);}} /></label>)}</div></fieldset>}
 </div>;
}
