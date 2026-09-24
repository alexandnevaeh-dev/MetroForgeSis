import { useEffect, useState, useRef, useId } from 'react';
import { LiveEditSession, type LiveEditOperation } from '@metroforge/engines/live-edit-session';
import { Button, Input, PropertyRow } from './ui/index.js';
type Draft = { session: LiveEditSession; fingerprints: string[]; farBackground?: string };
// Retain unsaved room work when navigating between rooms during this app session.
const drafts = new Map<string, Draft>();
// Drafts outlive the mounted room editor, so close protection must as well.
const protectRoomDrafts=(event:BeforeUnloadEvent)=>{
 if([...drafts.values()].some(draft=>draft.session.snapshot().dirty)){
  event.preventDefault();event.returnValue='';
 }
};
if(typeof window!=='undefined')window.addEventListener('beforeunload',protectRoomDrafts);
export function UnityRoomGeometry({projectPath,roomId,width,height,zoom=100,gridSnap=false,tileSize=16}: {projectPath:string;roomId:string;width:number;height:number;zoom?:number;gridSnap?:boolean;tileSize?:number}) {
 const fieldId=useId();
 const scale=Number.isFinite(zoom)?Math.max(0.25,Math.min(4,zoom/100)):1;
 const snapStep=gridSnap&&Number.isFinite(tileSize)&&tileSize>0?tileSize:1;
 const viewWidth=width/scale,viewHeight=height/scale;
 const timingId=`${roomId}:enemy-timing`;
 const framingId=`${roomId}:background-framing`;
 const key=JSON.stringify([projectPath,roomId]);
 const [draft,setDraft]=useState<Draft|null>(null);
 const [,refresh]=useState(0);
 const [selected,setSelected]=useState('');
 type Drag = {id:string; pointerId:number; startX:number; startY:number; x:number; y:number; dx:number; dy:number};
 const dragRef=useRef<Drag|null>(null);
 const [drag,setDrag]=useState<Drag|null>(null);
 const point=(svg:SVGSVGElement,clientX:number,clientY:number)=>{
  const matrix=svg.getScreenCTM();if(!matrix)return null;
  return new DOMPoint(clientX,clientY).matrixTransform(matrix.inverse());
 };
 const cancelDrag=()=>{dragRef.current=null;setDrag(null);};
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [saving,setSaving]=useState(false);
 const [backgroundUrl,setBackgroundUrl]=useState<string>();
 const [backgroundStatus,setBackgroundStatus]=useState('');
 useEffect(()=>{let alive=true;const cached=drafts.get(key);if(cached){setDraft(cached);return;}
  void window.metroforge!.readUnityRoomEdit(projectPath,roomId).then(data=>{if(!alive)return;const next={session:new LiveEditSession(projectPath,crypto.randomUUID(),[...data.objects,{id:framingId,roomId,x:0,y:0,properties:{...data.backgroundFraming}},...(data.enemyTiming?[{id:timingId,roomId,x:0,y:0,properties:{...data.enemyTiming}}]:[])],new Set(['width','height','name','farCameraRelative','farParallax','attackWindupSeconds','attackRecoverySeconds','attackCooldownSeconds'])),fingerprints:data.fingerprints,farBackground:data.farBackground};drafts.set(key,next);setDraft(next);}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};
 },[key,projectPath,roomId,framingId,timingId]);
 useEffect(()=>{
  let alive=true;setBackgroundUrl(undefined);setBackgroundStatus('');
  if(!draft?.farBackground)return;
  setBackgroundStatus('Loading room background…');
  void window.metroforge!.getAssetPreview(projectPath,`Assets/StreamingAssets/${draft.farBackground}`).then(result=>{
   if(!alive)return;setBackgroundUrl(result.dataUrl);setBackgroundStatus(result.dataUrl?'Static room overview · Unity camera framing, lighting and parallax are shown in Play Mode.':'The room background image is unavailable. Geometry remains editable.');
  }).catch(()=>{if(alive)setBackgroundStatus('The room background could not be loaded. Geometry remains editable.');});
  return()=>{alive=false;};
 },[projectPath,draft?.farBackground]);
 const state=draft?.session.snapshot();
 const solids=state?.objects.filter(o=>o.id!==framingId&&o.id!==timingId);
 const framing=state?.objects.find(o=>o.id===framingId);
 const timing=state?.objects.find(o=>o.id===timingId);
 const object=solids?.find(o=>o.id===selected);
 const token=()=>({projectId:projectPath,sessionId:draft!.session.sessionId,baseRevision:draft!.session.snapshot().revision});
 const edit=(operations:LiveEditOperation[])=>{if(!draft||saving)return;try{draft.session.commit({...token(),operations});setError('');setNotice('');refresh(n=>n+1);}catch(e){setError(String(e));}};
 const history=(redo:boolean)=>{if(!draft)return;try{if(redo)draft.session.redo(token());else draft.session.undo(token());refresh(n=>n+1);setNotice('');}catch(e){setError(String(e));}};
 const reload=async()=>{
  setSaving(true);setError('');setNotice('');
  try{
   const data=await window.metroforge!.readUnityRoomEdit(projectPath,roomId);
   const next:Draft={session:new LiveEditSession(projectPath,crypto.randomUUID(),[...data.objects,{id:framingId,roomId,x:0,y:0,properties:{...data.backgroundFraming}},...(data.enemyTiming?[{id:timingId,roomId,x:0,y:0,properties:{...data.enemyTiming}}]:[])],new Set(['width','height','name','farCameraRelative','farParallax','attackWindupSeconds','attackRecoverySeconds','attackCooldownSeconds'])),fingerprints:data.fingerprints,farBackground:data.farBackground};
   drafts.set(key,next);setDraft(next);setSelected('');cancelDrag();setNotice('Reloaded saved room. Previous draft and undo history discarded.');
  }catch(e){setError(String(e));}finally{setSaving(false);}
 };
 const save=async()=>{if(!draft||!state)return;setSaving(true);setError('');try{const result=await window.metroforge!.saveUnityRoomEdit(projectPath,roomId,solids!,draft.fingerprints,{farCameraRelative:framing?.properties.farCameraRelative===true,farParallax:Number(framing?.properties.farParallax??0.1)},timing?{attackWindupSeconds:Number(timing.properties.attackWindupSeconds),attackRecoverySeconds:Number(timing.properties.attackRecoverySeconds),attackCooldownSeconds:Number(timing.properties.attackCooldownSeconds)}:undefined);draft.fingerprints=result.fingerprints;draft.session.markSaved(state.revision);setNotice('Saved. Restart the Unity game to apply room changes.');refresh(n=>n+1);}catch(e){setError(String(e));}finally{setSaving(false);}};
 return <div className="unity-room-geometry">
  <div className="row">
   <Button disabled={!draft||saving} onClick={()=>{const id=crypto.randomUUID();edit([{type:'add',object:{id,roomId,x:Math.round(width/2),y:Math.round(height/2),properties:{width:80,height:16,name:'Platform'}}}]);setSelected(id);}}>Add platform</Button>
   <Button disabled={!object||saving} onClick={()=>edit([{type:'remove',objectId:selected}])}>Remove solid</Button>
   <Button disabled={!state?.canUndo||saving} onClick={()=>history(false)}>Undo room edit</Button>
   <Button disabled={!state?.canRedo||saving} onClick={()=>history(true)}>Redo room edit</Button>
   <Button disabled={!state?.dirty||saving} onClick={()=>void save()}>{saving?'Saving…':'Save room'}</Button>
   <Button disabled={saving} onClick={()=>void reload()}>{state?.dirty?'Discard draft and reload room':'Reload saved room'}</Button>
  </div>
  <p className="hint">{state?.dirty?'Unsaved room changes · retained while switching rooms.':'Unity room geometry'} · Drag a solid to move it, or edit its position and size below. Escape cancels a drag. Runtime restart required.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {timing&&<details className="room-background-disclosure"><summary>Enemy attack timing</summary><fieldset className="enemy-timing-fields" disabled={saving}><legend>Attack durations in seconds</legend>
   {([['attackWindupSeconds','Attack windup'],['attackRecoverySeconds','Attack recovery'],['attackCooldownSeconds','Attack cooldown']] as const).map(([key,label])=><PropertyRow key={key} label={<label htmlFor={`${fieldId}-${key}`}>{label}</label>}><Input id={`${fieldId}-${key}`} aria-label={label} type="number" min={0.01} max={key==='attackCooldownSeconds'?60:10} step={0.01} value={Number(timing.properties[key])} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isFinite(value))edit([{type:'property',objectId:timingId,key,value}]);}}/></PropertyRow>)}
   <p className="hint">Cooldown must cover windup plus recovery. Save room, then restart Unity preview to apply.</p>
  </fieldset></details>}
  {framing&&<details className="room-background-disclosure"><summary>Distant background settings</summary><fieldset className="room-background-settings" disabled={saving}><legend>Distant background</legend><div className="room-background-fields">
   <label className="room-background-toggle"><Input type="checkbox" aria-label="Frame background to camera" checked={framing.properties.farCameraRelative===true} onChange={e=>edit([{type:'property',objectId:framingId,key:'farCameraRelative',value:e.target.checked}])}/>Frame background to camera</label>
   <label className="room-background-parallax">Parallax amount<Input aria-label="Background parallax" type="number" min={0} max={1} step={0.05} disabled={framing.properties.farCameraRelative!==true} value={Number(framing.properties.farParallax)} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isFinite(value)&&value>=0&&value<=1)edit([{type:'property',objectId:framingId,key:'farParallax',value}]);}}/></label>
   </div><p className="hint">0 follows the camera; 1 allows the most drift. Save and restart Unity to preview the background.</p>
  </fieldset></details>}
  {backgroundStatus&&<p className="hint" role="status">{backgroundStatus}</p>}
  <svg className="room-canvas" viewBox={`${(width-viewWidth)/2} ${(height-viewHeight)/2} ${viewWidth} ${viewHeight}`} aria-label="Unity room geometry" style={{width:'100%',touchAction:'none'}}
   onPointerMove={e=>{const current=dragRef.current;if(!current||current.pointerId!==e.pointerId)return;const p=point(e.currentTarget,e.clientX,e.clientY);if(!p)return;const next={...current,dx:Math.round((current.x+p.x-current.startX)/snapStep)*snapStep-current.x,dy:Math.round((current.y+p.y-current.startY)/snapStep)*snapStep-current.y};dragRef.current=next;setDrag(next);}}
   onPointerUp={e=>{const current=dragRef.current;if(!current||current.pointerId!==e.pointerId)return;cancelDrag();if(current.dx||current.dy)edit([{type:'move',objectId:current.id,x:current.x+current.dx,y:current.y+current.dy}]);}}
   onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
   onKeyDown={e=>{if(e.key==='Escape'){cancelDrag();e.preventDefault();}}}>
   <rect width={width} height={height} fill="#171c24" />
   {backgroundUrl&&<image data-room-background="far" href={backgroundUrl} x={-width*0.01} y={-height*0.01} width={width*1.02} height={height*1.02} preserveAspectRatio="xMidYMid slice" pointerEvents="none" />}
   {solids?.map(o=><rect key={o.id} role="button" tabIndex={0} aria-label={`Select ${o.properties.name??'solid'} ${o.id}`} x={o.x+(drag?.id===o.id?drag.dx:0)} y={o.y+(drag?.id===o.id?drag.dy:0)} width={Number(o.properties.width)} height={Number(o.properties.height)} fill={selected===o.id?'#70b5e8':'#6a5746'} stroke={selected===o.id?'#d9f0ff':'#bd8756'} strokeWidth={2} onPointerDown={e=>{if(saving||e.button!==0)return;const svg=e.currentTarget.ownerSVGElement;if(!svg)return;const p=point(svg,e.clientX,e.clientY);if(!p)return;e.preventDefault();e.currentTarget.focus();svg.setPointerCapture(e.pointerId);setSelected(o.id);const next={id:o.id,pointerId:e.pointerId,startX:p.x,startY:p.y,x:o.x,y:o.y,dx:0,dy:0};dragRef.current=next;setDrag(next);}} onClick={()=>setSelected(o.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(o.id);}}}/>)}
  </svg>
  {object&&<fieldset disabled={saving}><legend>Selected solid</legend><div className="row">{(['x','y','width','height'] as const).map(field=><label key={field}>{field}<input aria-label={`Solid ${field}`} type="number" value={field==='x'||field==='y'?object[field]:Number(object.properties[field])} min={field==='width'||field==='height'?1:undefined} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(!Number.isFinite(value)||((field==='width'||field==='height')&&value<=0))return;edit([field==='x'||field==='y'?{type:'move',objectId:object.id,x:field==='x'?value:object.x,y:field==='y'?value:object.y}:{type:'property',objectId:object.id,key:field,value}]);}} /></label>)}</div></fieldset>}
 </div>;
}
