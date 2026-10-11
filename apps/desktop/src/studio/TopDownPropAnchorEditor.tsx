import {useEffect,useId,useState} from 'react';
import {Button,Input} from './ui/index.js';
import type {TopDownPropAuthoring} from './metroforge-api.js';
type FootprintDraft={x:string;y:string;width:string;height:string};
const fields=['x','y','width','height'] as const;

export function TopDownPropAnchorEditor({projectPath,assetPath,busy,onSaved}:{projectPath:string;assetPath:string;busy:boolean;onSaved:()=>void}){
 const id=useId();const [source,setSource]=useState<TopDownPropAuthoring|null>(null),[x,setX]=useState(''),[y,setY]=useState(''),[scale,setScale]=useState(''),[confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 const [editFootprints,setEditFootprints]=useState(false),[footprints,setFootprints]=useState<FootprintDraft[]>([]);
 useEffect(()=>{setEditFootprints(false);setFootprints([])},[projectPath,assetPath,reload]);
 useEffect(()=>{let cancelled=false;setSource(null);setError('');setNotice('');setConfirmed(false);void window.metroforge!.getTopDownPropAuthoring(projectPath,assetPath).then(result=>{if(cancelled)return;setSource(result);setX(String(result.anchorPx[0]));setY(String(result.anchorPx[1]));setScale(String(result.displayScale));}).catch(e=>{if(!cancelled)setError(String(e))});return()=>{cancelled=true}},[projectPath,assetPath,reload]);
 const valid=source&&[x,y,scale].every(v=>v.trim()!==''&&Number.isFinite(Number(v)))&&Number(x)>=0&&Number(x)<=source.sourceSize[0]&&Number(y)>=0&&Number(y)<=source.sourceSize[1]&&Number(scale)>0&&Number(scale)<=4;
 const rectangles=footprints.map(r=>({x:Number(r.x),y:Number(r.y),width:Number(r.width),height:Number(r.height)}));
 const validFootprints=!editFootprints||(source&&footprints.length<=16&&footprints.every((r,i)=>fields.every(k=>r[k].trim()!==''&&Number.isFinite(rectangles[i]![k]))&&rectangles[i]!.width>0&&rectangles[i]!.height>0&&Math.abs(rectangles[i]!.x)+rectangles[i]!.width<=source.sourceSize[0]*2&&Math.abs(rectangles[i]!.y)+rectangles[i]!.height<=source.sourceSize[1]*2));
 const declared=source?.hasLayout||(editFootprints&&rectangles.length>0&&validFootprints)||confirmed;
 return <details><summary>Asset ground anchor</summary>
 {!source&&!error&&<p role="status">Loading source settings…</p>}
 {source&&<form noValidate onSubmit={async event=>{event.preventDefault();if(!valid||!validFootprints||!declared||busy||saving)return;setSaving(true);setError('');setNotice('');try{const result=await window.metroforge!.saveTopDownPropAnchor(projectPath,assetPath,{anchorX:Number(x),anchorY:Number(y),displayScale:Number(scale),nonCollidingScenery:confirmed,...(editFootprints?{collisionRectsPx:rectangles}:{})},source.revision);setSource(result);setNotice('Saved asset anchor. Existing room placements and artwork are unchanged.');onSaved();}catch(e){setError(String(e))}finally{setSaving(false)}}}>
 <p className="hint">Source: {source.sourceSize[0]} × {source.sourceSize[1]} pixels. The anchor meets the room ground position. Layers are retained; collision changes only when explicitly edited.</p>
 <SourceAnchorPreview imageUrl={source.previewDataUrl} width={source.sourceSize[0]} height={source.sourceSize[1]} x={x} y={y} saved={source.anchorPx} rectangles={editFootprints?rectangles.filter((_,i)=>fields.every(k=>footprints[i]![k].trim()!=='')):source.collisionRectsPx} disabled={busy||saving} helpId={`${id}-preview-help`} onChange={(nextX,nextY)=>{setX(String(nextX));setY(String(nextY));setNotice('');}}/>
 <label htmlFor={`${id}-x`}>Source anchor X</label><Input id={`${id}-x`} type="number" min="0" max={source.sourceSize[0]} step="any" value={x} disabled={busy||saving} onChange={e=>setX(e.target.value)}/>
 <label htmlFor={`${id}-y`}>Source anchor Y</label><Input id={`${id}-y`} type="number" min="0" max={source.sourceSize[1]} step="any" value={y} disabled={busy||saving} onChange={e=>setY(e.target.value)}/>
 <label htmlFor={`${id}-scale`}>Default prop scale</label><Input id={`${id}-scale`} type="number" min="0" max="4" step="any" value={scale} disabled={busy||saving} onChange={e=>setScale(e.target.value)}/>
 <label><Input type="checkbox" style={{width:16,height:16,marginRight:6,accentColor:"var(--forge-accent)"}} checked={editFootprints} disabled={busy||saving} onChange={e=>{setEditFootprints(e.target.checked);setFootprints(source.collisionRectsPx.map(r=>({x:String(r.x),y:String(r.y),width:String(r.width),height:String(r.height)})));}}/> Edit collision footprints</label>
 {editFootprints&&<>
 <p className="hint">Offsets are source pixels from the ground anchor. Width and height define a solid base, independent of the artwork. Removing all footprints makes future placements non-colliding.</p>
 {footprints.map((r,i)=><fieldset key={i} disabled={busy||saving} style={{margin:"8px 0",padding:8,border:"1px solid var(--forge-border)",borderRadius:4}}><legend>Footprint {i+1}</legend>{fields.map(k=><label key={k} htmlFor={`${id}-rect-${i}-${k}`}>Footprint {i+1} {k==='x'?'X':k==='y'?'Y':k==='width'?'Width':'Height'}<Input id={`${id}-rect-${i}-${k}`} type="number" step="any" value={r[k]} onChange={e=>setFootprints(rows=>rows.map((row,n)=>n===i?{...row,[k]:e.target.value}:row))}/></label>)}<Button type="button" size="sm" onClick={()=>setFootprints(rows=>rows.filter((_,n)=>n!==i))}>Remove footprint {i+1}</Button></fieldset>)}
 <Button type="button" size="sm" disabled={busy||saving||footprints.length>=16} onClick={()=>setFootprints(rows=>[...rows,{x:'',y:'',width:'',height:''}])}>Add footprint</Button>
 {!validFootprints&&<p role="alert">Complete every footprint with finite offsets and positive dimensions. Offset plus size must fit within twice the source dimensions.</p>}
 </>}
 {!source.hasLayout&&(!editFootprints||rectangles.length===0)&&<label><Input type="checkbox" style={{width:16,height:16,marginRight:6,accentColor:"var(--forge-accent)"}} checked={confirmed} disabled={busy||saving} onChange={e=>setConfirmed(e.target.checked)}/> Use as non-colliding scenery</label>}
 <p className="hint">{editFootprints?`${footprints.length} draft collision footprints.`:`${source.collisionCount} authored collision footprints retained.`} Asset defaults apply to future placements. Edit or re-place existing room props explicitly. Collision validity does not prove support or visual readability; inspect Play Preview.</p>
 {!valid&&<p role="alert">Enter an anchor inside the source image and a scale greater than 0, up to 4.</p>}
 <Button type="submit" size="sm" disabled={!valid||!validFootprints||!declared||busy||saving}>{saving?'Saving anchor…':'Save asset anchor'}</Button>
 </form>}
 {error&&<p role="alert">{error}</p>}{error&&<Button type="button" size="sm" disabled={busy||saving} onClick={()=>setReload(v=>v+1)}>Reload source settings</Button>}
 {notice&&<p role="status">{notice}</p>}
 </details>;
}

function SourceAnchorPreview({imageUrl,width,height,x,y,saved,rectangles,disabled,helpId,onChange}:{imageUrl:string;width:number;height:number;x:string;y:string;saved:[number,number];rectangles:TopDownPropAuthoring['collisionRectsPx'];disabled:boolean;helpId:string;onChange:(x:number,y:number)=>void}){
 const position=[x,y].map((value,i)=>value.trim()!==''&&Number.isFinite(Number(value))?Number(value):saved[i]!);
 const inside=[x,y].every(value=>value.trim()!==''&&Number.isFinite(Number(value)))&&position[0]!>=0&&position[0]!<=width&&position[1]!>=0&&position[1]!<=height;
 const margin=Math.max(width,height)*0.08;
 const visibleRects=inside?rectangles.filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0&&Math.abs(r.x)+r.width<=width*2&&Math.abs(r.y)+r.height<=height*2):[];
 const left=Math.min(0,...visibleRects.map(r=>position[0]!+r.x))-margin,top=Math.min(0,...visibleRects.map(r=>position[1]!+r.y))-margin;
 const right=Math.max(width,...visibleRects.map(r=>position[0]!+r.x+r.width))+margin,bottom=Math.max(height,...visibleRects.map(r=>position[1]!+r.y+r.height))+margin;
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
 <svg role="img" aria-label="Source artwork with draft ground anchor" viewBox={`${left} ${top} ${right-left} ${bottom-top}`} style={{width:'100%',maxHeight:220,display:'block'}}>
 <rect x={left} y={top} width={right-left} height={bottom-top} fill="var(--forge-bg-panel)"/>
 <image href={imageUrl} x="0" y="0" width={width} height={height} style={{imageRendering:'pixelated'}}/>
 <rect x="0" y="0" width={width} height={height} fill="none" stroke="var(--forge-border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
 {inside&&visibleRects.map((r,i)=><rect key={i} data-footprint={i+1} x={position[0]!+r.x} y={position[1]!+r.y} width={r.width} height={r.height} fill="none" stroke="var(--forge-info)" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}
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
