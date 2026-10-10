import { useEffect, useRef, useState } from 'react';
import './material-color-editor.css';
import { Button, Input, Select } from './ui/index.js';

type Artwork = Awaited<ReturnType<NonNullable<Window['metroforge']>['readMaterialArtwork']>>;
type Preview = Awaited<ReturnType<NonNullable<Window['metroforge']>['previewMaterialArtwork']>>;
type Rule = {region:{x:number;y:number;width:number;height:number};from:string;to:string;tolerance:number;preserveShading:boolean};
const hex = /^#[0-9a-f]{6}$/i;
export function MaterialColorEditor({projectPath,assetId,disabled,open,onOpenChange,onBusy,onSaved}:{projectPath:string;assetId:string;disabled:boolean;open:boolean;onOpenChange:(value:boolean)=>void;onBusy:(value:boolean)=>void;onSaved:()=>Promise<void>}) {
  const [source,setSource]=useState<Artwork|null>(null),[rules,setRules]=useState<Rule[]>([]),[active,setActive]=useState(0);
  const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[status,setStatus]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[zoom,setZoom]=useState(1);
  const [sampleX,setSampleX]=useState(0),[sampleY,setSampleY]=useState(0);
  const canvas=useRef<HTMLCanvasElement>(null), pixels=useRef<ImageData|null>(null), image=useRef<HTMLImageElement|null>(null),mounted=useRef(true),request=useRef(0),action=useRef(false);
  useEffect(()=>()=>{mounted.current=false;request.current++;if(action.current)onBusy(false);},[]);
  const load=async()=>{
    if(action.current)return;const token=++request.current;setLoading(true);setError('');setPreview(null);setStatus('');
    try {
      if(!window.metroforge?.readMaterialArtwork)throw new Error('Color editing is unavailable. Reopen the desktop app and retry.');
      const value=await window.metroforge.readMaterialArtwork(projectPath,assetId);
      const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Source image could not be loaded'));img.src=value.sourceDataUrl;});
      if(!mounted.current||request.current!==token)return;
      image.current=img;setSource(value);setRules([{region:{x:0,y:0,width:value.width,height:value.height},from:'#000000',to:'#292b33',tolerance:24,preserveShading:true}]);setActive(0);setSampleX(Math.floor(value.width/2));setSampleY(Math.floor(value.height/2));
    }catch(e){if(mounted.current&&request.current===token){setSource(null);setError(e instanceof Error?e.message:String(e));}}
    finally{if(mounted.current&&request.current===token)setLoading(false);}
  };
  useEffect(()=>{void load();},[projectPath,assetId]);
  useEffect(()=>{
    if(!source||!image.current||!canvas.current)return;const c=canvas.current;c.width=source.width;c.height=source.height;const context=c.getContext('2d');if(!context)return;
    context.imageSmoothingEnabled=false;context.drawImage(image.current,0,0);pixels.current=context.getImageData(0,0,c.width,c.height);
    const region=rules[active]?.region;if(region){context.strokeStyle=getComputedStyle(c).getPropertyValue('--forge-accent').trim();context.lineWidth=Math.max(1,source.width/256);context.strokeRect(region.x,region.y,region.width,region.height);}
  },[source,rules,active]);
  const update=(patch:Partial<Rule>)=>{setRules(rows=>rows.map((r,i)=>i===active?{...r,...patch}:r));setPreview(null);setStatus('');};
  const sample=(x:number,y:number)=>{
    if(disabled||busy||loading||!source||!pixels.current)return;
    if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>=source.width||y>=source.height){setError('Sample coordinates must stay inside the source image.');return;}
    const i=(y*source.width+x)*4,p=pixels.current.data;if(!p[i+3]){setError('Choose a visible source pixel.');return;}
    setSampleX(x);setSampleY(y);setError('');update({from:'#'+[p[i],p[i+1],p[i+2]].map(v=>v!.toString(16).padStart(2,'0')).join('')});
  };
  const invalid=rules.some(r=>!hex.test(r.from)||!hex.test(r.to)||![r.region.x,r.region.y,r.region.width,r.region.height].every(Number.isSafeInteger)||r.region.x<0||r.region.y<0||r.region.width<1||r.region.height<1||!source||r.region.x+r.region.width>source.width||r.region.y+r.region.height>source.height||!Number.isFinite(r.tolerance)||r.tolerance<0||r.tolerance>255);
  const perform=async(apply:boolean)=>{
    if(action.current||disabled||loading||invalid||!source)return;action.current=true;setBusy(true);onBusy(true);setError('');setStatus(apply?'Saving colors…':'Preparing color preview…');
    try {
      if(!window.metroforge)throw new Error('Desktop connection unavailable. Reopen the app and retry.');
      if(apply){if(!preview)throw new Error('Preview the current colors before applying them.');const result=await window.metroforge.applyMaterialArtwork(projectPath,assetId,preview.draftId);if(!result.success)throw new Error('Colors were not saved. Reload and retry.');if(mounted.current){setPreview(null);setStatus('Colors saved. Restart the game preview and inspect the artwork. Visual review is still required.');await onSaved();const value=await window.metroforge.readMaterialArtwork(projectPath,assetId);if(mounted.current)setSource(value);}}
      else{const result=await window.metroforge.previewMaterialArtwork(projectPath,assetId,source.inspectionHash,rules);if(mounted.current){setPreview(result);setStatus(`${result.changedPixels.toLocaleString()} source pixels changed in this preview. Nothing has been saved.`);}}
    }catch(e){if(mounted.current){setError(e instanceof Error?e.message:String(e));setStatus('');}}
    finally{action.current=false;if(mounted.current){setBusy(false);onBusy(false);}}
  };
  const rule=rules[active],blocked=disabled||busy||loading;
  return <details className="material-color-editor" open={open} onToggle={e=>onOpenChange(e.currentTarget.open)}><summary>Correct actor colors</summary>
    <p className="hint">Select source colors inside a rectangle. The pose is preserved; preview the game image before saving. Original artwork stays in version history.</p>
    {loading&&<p role="status">Loading source artwork…</p>}
    {error&&<p role="alert">{error}</p>}
    <Button size="sm" disabled={blocked} onClick={()=>void load()}>Reload source</Button>
    {source&&rule&&<>
      <div className="material-source-viewport"><Button variant="ghost" className="material-source-pick" disabled={blocked} aria-label="Pick source color; keyboard samples the entered pixel coordinates" onPointerDown={e=>{const box=canvas.current?.getBoundingClientRect();if(box)sample(Math.floor((e.clientX-box.left)*source.width/box.width),Math.floor((e.clientY-box.top)*source.height/box.height));}} onClick={e=>{if(e.detail===0)sample(sampleX,sampleY);}}>
        <canvas ref={canvas} style={{width:256*zoom,height:256*zoom*source.height/source.width}} aria-label="Original source artwork and selected rectangle" />
      </Button></div>
      <label>Source zoom<Select aria-label="Source zoom" value={zoom} disabled={blocked} onChange={e=>setZoom(Number(e.target.value))}>{[1,2,4].map(v=><option key={v} value={v}>{v===1?'Fit':`${v}×`}</option>)}</Select></label>
      <div className="material-fields"><label>Sample X<Input aria-label="Sample X" type="number" value={Number.isNaN(sampleX)?'':sampleX} disabled={blocked} onChange={e=>setSampleX(e.target.value===''?NaN:Number(e.target.value))}/></label><label>Sample Y<Input aria-label="Sample Y" type="number" value={Number.isNaN(sampleY)?'':sampleY} disabled={blocked} onChange={e=>setSampleY(e.target.value===''?NaN:Number(e.target.value))}/></label></div>
      <Button size="sm" disabled={blocked} onClick={()=>sample(sampleX,sampleY)}>Sample pixel</Button>
      <label>Color change<Select aria-label="Color change" value={active} disabled={blocked} onChange={e=>setActive(Number(e.target.value))}>{rules.map((r,i)=><option key={i} value={i}>{i+1}: {r.from} → {r.to}</option>)}</Select></label>
      <div className="material-fields"><label>From color<Input aria-label="From color" value={rule.from} maxLength={7} aria-invalid={!hex.test(rule.from)} disabled={blocked} onChange={e=>update({from:e.target.value})}/></label><label>To color<Input aria-label="To color" value={rule.to} maxLength={7} aria-invalid={!hex.test(rule.to)} disabled={blocked} onChange={e=>update({to:e.target.value})}/></label>
      {(['x','y','width','height'] as const).map(key=><label key={key}>{key[0]!.toUpperCase()+key.slice(1)}<Input aria-label={`Color rectangle ${key}`} type="number" step="1" value={Number.isNaN(rule.region[key])?'':rule.region[key]} disabled={blocked} onChange={e=>update({region:{...rule.region,[key]:e.target.value===''?NaN:Number(e.target.value)}})}/></label>)}</div>
      <label>Color tolerance<Input aria-label="Color tolerance" type="number" min="0" max="255" value={Number.isNaN(rule.tolerance)?'':rule.tolerance} disabled={blocked} onChange={e=>update({tolerance:e.target.value===''?NaN:Number(e.target.value)})}/></label>
      <label>Shading<Select aria-label="Shading" value={rule.preserveShading?'preserve':'flat'} disabled={blocked} onChange={e=>update({preserveShading:e.target.value==='preserve'})}><option value="preserve">Preserve relative shading</option><option value="flat">Use one flat color</option></Select></label>
      {invalid&&<p role="status">Use six-digit hex colors and whole-pixel rectangles inside the source. Tolerance must be 0–255.</p>}
      <div className="row"><Button size="sm" disabled={blocked||rules.length>=16} onClick={()=>{setRules(rows=>[...rows,{...rule,region:{...rule.region}}]);setActive(rules.length);setPreview(null);}}>Add color change</Button><Button size="sm" variant="ghost" disabled={blocked||rules.length<=1} onClick={()=>{setRules(rows=>rows.filter((_,i)=>i!==active));setActive(0);setPreview(null);}}>Remove color change</Button></div>
      <div className="row"><Button disabled={blocked||invalid} onClick={()=>void perform(false)}>Preview colors</Button><Button disabled={blocked||invalid||!preview} onClick={()=>void perform(true)}>Apply colors</Button></div>
      {preview&&<div className="material-result"><figure><img src={preview.sourceDataUrl} alt="Color-corrected source preview"/><figcaption>Source preview</figcaption></figure><figure><img src={preview.imageDataUrl} alt="Color-corrected game image preview"/><figcaption>Game image preview</figcaption></figure></div>}
    </>}
    <div className="material-feedback" role="status" aria-live="polite">{status}</div>
  </details>;
}
