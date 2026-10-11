import {useEffect,useId,useState} from 'react';
import {Button,Input} from './ui/index.js';
import type {TopDownPropAuthoring} from './metroforge-api.js';

export function TopDownPropAnchorEditor({projectPath,assetPath,busy,onSaved}:{projectPath:string;assetPath:string;busy:boolean;onSaved:()=>void}){
 const id=useId();const [source,setSource]=useState<TopDownPropAuthoring|null>(null),[x,setX]=useState(''),[y,setY]=useState(''),[scale,setScale]=useState(''),[confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let cancelled=false;setSource(null);setError('');setNotice('');setConfirmed(false);void window.metroforge!.getTopDownPropAuthoring(projectPath,assetPath).then(result=>{if(cancelled)return;setSource(result);setX(String(result.anchorPx[0]));setY(String(result.anchorPx[1]));setScale(String(result.displayScale));}).catch(e=>{if(!cancelled)setError(String(e))});return()=>{cancelled=true}},[projectPath,assetPath,reload]);
 const valid=source&&[x,y,scale].every(v=>v.trim()!==''&&Number.isFinite(Number(v)))&&Number(x)>=0&&Number(x)<=source.sourceSize[0]&&Number(y)>=0&&Number(y)<=source.sourceSize[1]&&Number(scale)>0&&Number(scale)<=4;
 return <details><summary>Asset ground anchor</summary>
 {!source&&!error&&<p role="status">Loading source settings…</p>}
 {source&&<form noValidate onSubmit={async event=>{event.preventDefault();if(!valid||busy||saving||(!source.hasLayout&&!confirmed))return;setSaving(true);setError('');setNotice('');try{const result=await window.metroforge!.saveTopDownPropAnchor(projectPath,assetPath,{anchorX:Number(x),anchorY:Number(y),displayScale:Number(scale),nonCollidingScenery:confirmed},source.revision);setSource(result);setNotice('Saved asset anchor. Existing room placements and artwork are unchanged.');onSaved();}catch(e){setError(String(e))}finally{setSaving(false)}}}>
 <p className="hint">Source: {source.sourceSize[0]} × {source.sourceSize[1]} pixels. The anchor meets the room ground position. Existing collision footprints and layers are retained.</p>
 <label htmlFor={`${id}-x`}>Source anchor X</label><Input id={`${id}-x`} type="number" min="0" max={source.sourceSize[0]} step="any" value={x} disabled={busy||saving} onChange={e=>setX(e.target.value)}/>
 <label htmlFor={`${id}-y`}>Source anchor Y</label><Input id={`${id}-y`} type="number" min="0" max={source.sourceSize[1]} step="any" value={y} disabled={busy||saving} onChange={e=>setY(e.target.value)}/>
 <label htmlFor={`${id}-scale`}>Default prop scale</label><Input id={`${id}-scale`} type="number" min="0" max="4" step="any" value={scale} disabled={busy||saving} onChange={e=>setScale(e.target.value)}/>
 {!source.hasLayout&&<label><Input type="checkbox" checked={confirmed} disabled={busy||saving} onChange={e=>setConfirmed(e.target.checked)}/> Use as non-colliding scenery</label>}
 <p className="hint">{source.hasLayout?`${source.collisionCount} authored collision footprints retained.`:'New settings add no collision. Inspect readability and ground contact in Play Preview.'}</p>
 {!valid&&<p role="alert">Enter an anchor inside the source image and a scale greater than 0, up to 4.</p>}
 <Button type="submit" size="sm" disabled={!valid||busy||saving||(!source.hasLayout&&!confirmed)}>{saving?'Saving anchor…':'Save asset anchor'}</Button>
 </form>}
 {error&&<p role="alert">{error}</p>}{error&&<Button type="button" size="sm" disabled={busy||saving} onClick={()=>setReload(v=>v+1)}>Reload source settings</Button>}
 {notice&&<p role="status">{notice}</p>}
 </details>;
}
