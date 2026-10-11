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
 <SourceAnchorPreview imageUrl={source.previewDataUrl} width={source.sourceSize[0]} height={source.sourceSize[1]} x={x} y={y} saved={source.anchorPx} disabled={busy||saving} helpId={`${id}-preview-help`} onChange={(nextX,nextY)=>{setX(String(nextX));setY(String(nextY));setNotice('');}}/>
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

function SourceAnchorPreview({imageUrl,width,height,x,y,saved,disabled,helpId,onChange}:{imageUrl:string;width:number;height:number;x:string;y:string;saved:[number,number];disabled:boolean;helpId:string;onChange:(x:number,y:number)=>void}){
 const position=[x,y].map((value,i)=>value.trim()!==''&&Number.isFinite(Number(value))?Number(value):saved[i]!);
 const inside=[x,y].every(value=>value.trim()!==''&&Number.isFinite(Number(value)))&&position[0]!>=0&&position[0]!<=width&&position[1]!>=0&&position[1]!<=height;
 const margin=Math.max(width,height)*0.08;
 const update=(nextX:number,nextY:number)=>onChange(Math.max(0,Math.min(width,nextX)),Math.max(0,Math.min(height,nextY)));
 return <>
 <Button type="button" disabled={disabled} aria-label="Edit source ground anchor" aria-describedby={helpId} style={{width:'100%',height:'auto',padding:0,display:'block'}} onClick={event=>{
  if(event.detail===0){update(width/2,height);return;}
  const matrix=event.currentTarget.querySelector('svg')?.getScreenCTM();if(!matrix)return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());update(Math.round(point.x),Math.round(point.y));
 }} onKeyDown={event=>{
  const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const step=delta[event.key];if(!step)return;
  event.preventDefault();event.stopPropagation();const amount=event.shiftKey?10:1;update(position[0]!+step[0]*amount,position[1]!+step[1]*amount);
 }}>
 <svg role="img" aria-label="Source artwork with draft ground anchor" viewBox={`${-margin} ${-margin} ${width+margin*2} ${height+margin*2}`} style={{width:'100%',maxHeight:220,display:'block'}}>
 <rect x={-margin} y={-margin} width={width+margin*2} height={height+margin*2} fill="var(--forge-bg-panel)"/>
 <image href={imageUrl} x="0" y="0" width={width} height={height} style={{imageRendering:'pixelated'}}/>
 <rect x="0" y="0" width={width} height={height} fill="none" stroke="var(--forge-border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
 {inside&&<g data-anchor-x={position[0]} data-anchor-y={position[1]} stroke="var(--forge-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none">
 <path d={`M ${position[0]} 0 V ${height} M 0 ${position[1]} H ${width}`} strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>
 <circle cx={position[0]} cy={position[1]} r={Math.max(width,height)*0.035} vectorEffect="non-scaling-stroke"/>
 </g>}
 </svg>
 </Button>
 <p id={helpId} className="hint">Click to choose the anchor. Arrow keys move 1 source pixel; Shift moves 10. Enter or Space selects bottom center. Save asset anchor applies the draft.</p>
 <output aria-live="polite" className="hint">Draft anchor: X {x||'unset'}, Y {y||'unset'}{inside?'':' — outside source image'}</output>
 </>;
}
