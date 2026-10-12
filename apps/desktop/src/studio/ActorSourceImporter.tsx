import {useEffect,useRef,useState} from 'react';
import {Button,Input,Select} from './ui/index.js';
import './material-color-editor.css';

type Preview=Awaited<ReturnType<NonNullable<Window['metroforge']>['previewImportedActorSource']>>;
export function ActorSourceImporter({projectPath,assetId,disabled,onBusy,onSaved}:{projectPath:string;assetId:string;disabled:boolean;onBusy:(value:boolean)=>void;onSaved:()=>Promise<void>}){
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const [scope,setScope]=useState('full'),[region,setRegion]=useState({x:0,y:0,width:1,height:1}),[sourceSize,setSourceSize]=useState<{width:number;height:number}|null>(null);
 const invalidate=()=>{selection.current++;setPreview(null);setError('');setStatus('');};
 const mounted=useRef(true),action=useRef(false),selection=useRef(0);
 useEffect(()=>()=>{mounted.current=false;selection.current++;if(action.current)onBusy(false);},[]);
 const perform=async(apply:boolean)=>{
  if(disabled||action.current||!file)return;
  const token=selection.current;action.current=true;setBusy(true);onBusy(true);setError('');
  try{
   const api=window.metroforge;if(!api)throw Error('Desktop connection unavailable. Reopen the app and retry.');
   if(apply){
    if(!preview)throw Error('Preview the source before importing it.');
    const result=await api.applyMaterialArtwork(projectPath,assetId,preview.draftId);
    if(!result.success)throw Error('Source was not imported. Reload and retry.');
    if(mounted.current&&selection.current===token){setPreview(null);setStatus('Source imported. Original art is in version history. Restart the preview and review the game image.');await onSaved();}
   }else{
    if(file.size>16_777_216)throw Error('Choose a PNG source no larger than 16 MiB.');
    const source=await api.readMaterialArtwork(projectPath,assetId);
    if(mounted.current)setSourceSize({width:source.width,height:source.height});
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Source file could not be read'));reader.readAsDataURL(file);});
    const value=await api.previewImportedActorSource(projectPath,assetId,source.inspectionHash,data,file.name,scope==='region'?region:undefined);
    if(mounted.current&&selection.current===token){setPreview(value);setStatus(`${value.width} × ${value.height} source preview.${value.region?' Pixels outside the rectangle stay unchanged.':''} Nothing has been saved.`);}
   }
  }catch(e){if(mounted.current&&selection.current===token){setError(e instanceof Error?e.message:String(e));setStatus('');}}
  finally{action.current=false;if(mounted.current){setBusy(false);onBusy(false);}}
 };
 const blocked=disabled||busy;
 return <details className="material-color-editor"><summary>Import corrected actor source</summary>
  <p className="hint">Choose a transparent PNG of this actor. Preview it at game size before saving. Both original images and their canvas settings stay in version history.</p>
  <label>Actor source PNG<input type="file" accept="image/png,.png" aria-label="Actor source PNG" disabled={blocked} onChange={event=>{selection.current++;setFile(event.currentTarget.files?.[0]??null);setPreview(null);setError('');setStatus('');}}/></label>
  <label>Import area<Select aria-label="Import area" value={scope} disabled={blocked} onChange={event=>{invalidate();setScope(event.target.value);}}><option value="full">Whole source image</option><option value="region">Selected source rectangle</option></Select></label>
  {scope==='region'&&<><p className="hint">The imported PNG must use the original source canvas. RGBA pixels outside this rectangle are preserved exactly. Preview the compiled game image too.</p><div className="material-fields">{(['x','y','width','height'] as const).map(field=><label key={field}>Region {field}<Input type="number" step={1} min={field==='width'||field==='height'?1:0} aria-label={`Region ${field}`} disabled={blocked} value={Number.isFinite(region[field])?region[field]:''} onChange={event=>{const number=event.currentTarget.value===''?NaN:Number(event.currentTarget.value);invalidate();setRegion(value=>({...value,[field]:number}));}}/></label>)}</div>{sourceSize&&<p className="hint">Original source canvas: {sourceSize.width} × {sourceSize.height}</p>}</>}
  <div className="row"><Button disabled={blocked||!file} onClick={()=>void perform(false)}>Preview imported source</Button><Button disabled={blocked||!preview} onClick={()=>void perform(true)}>Import this source</Button></div>
  {error&&<p role="alert">{error}</p>}
  {preview&&<div className="material-result"><figure><img src={preview.sourceDataUrl} alt="Imported actor source preview"/><figcaption>Source preview</figcaption></figure><figure><img src={preview.imageDataUrl} alt="Imported actor game image preview"/><figcaption>Game image preview · review required</figcaption></figure></div>}
  <div className="material-feedback" role="status" aria-live="polite">{status}</div>
 </details>;
}

