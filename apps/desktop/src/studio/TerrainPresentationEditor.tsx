import { TerrainAppearancePreview } from './TerrainAppearancePreview.js';
import { useEffect, useState, useId } from 'react';
import type { TerrainPresentation } from '@metroforge/engines';
import { Button, Input, InspectorSection, PropertyRow, Checkbox } from './ui/index.js';
type Snapshot = Awaited<ReturnType<NonNullable<Window['metroforge']>['readEditableTerrain']>>;
const drafts = new Map<string, {settings:TerrainPresentation; revision:string}>();
type History = {past: TerrainPresentation[]; future: TerrainPresentation[]};
const histories = new Map<string, History>();
const fields = [['x','Crop left'],['y','Crop bottom'],['width','Crop width'],['height','Crop height'],['pixelsPerUnit','Pixels per unit'],['borderLeft','Left border'],['borderRight','Right border'],['borderTop','Top border'],['borderBottom','Bottom border'],['tintR','Red tint'],['tintG','Green tint'],['tintB','Blue tint']] as const;
export function TerrainPresentationEditor({projectPath,asset,dataUrl}:{projectPath:string;asset:string;dataUrl?:string}) {
 const id=useId();
 const key=JSON.stringify([projectPath,asset]);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [draft,setDraft]=useState<TerrainPresentation|null>(null);
 const [revision,setRevision]=useState('');
 const [history,setHistory]=useState<History>({past:[],future:[]});
 const remember=(value:History)=>{histories.set(key,value);setHistory(value);};
 const clearHistory=()=>{histories.delete(key);setHistory({past:[],future:[]});};
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 useEffect(()=>{let alive=true;void window.metroforge!.readEditableTerrain(projectPath,asset).then(data=>{
  if(!alive)return;const saved=drafts.get(key);setSnapshot(data);setDraft(saved?.settings??data.settings);setRevision(saved?.revision??data.revision);
  setHistory(histories.get(key)??{past:[],future:[]});
  if(saved)setMessage('Unsaved terrain draft restored.');
 }).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[projectPath,asset,key]);
 const dirty=Boolean(draft&&snapshot&&JSON.stringify(draft)!==JSON.stringify(snapshot.settings));
 const applyDraft=(settings:TerrainPresentation)=>{setDraft(settings);if(snapshot&&JSON.stringify(settings)===JSON.stringify(snapshot.settings))drafts.delete(key);else drafts.set(key,{settings,revision});setMessage('');setError('');};
 const update=(settings:TerrainPresentation)=>{if(draft)remember({past:[...history.past,structuredClone(draft)].slice(-100),future:[]});applyDraft(settings);};
 const undo=()=>{if(!draft||!history.past.length)return;const previous=history.past[history.past.length-1]!;remember({past:history.past.slice(0,-1),future:[structuredClone(draft),...history.future]});applyDraft(structuredClone(previous));};
 const redo=()=>{if(!draft||!history.future.length)return;const next=history.future[0]!;remember({past:[...history.past,structuredClone(draft)].slice(-100),future:history.future.slice(1)});applyDraft(structuredClone(next));};
 useEffect(()=>{const protect=(event:BeforeUnloadEvent)=>{if(drafts.size){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[]);
 const save=async()=>{if(!draft)return;setBusy(true);setError('');setMessage('Saving terrain settings…');try{
  const result=await window.metroforge!.saveEditableTerrain(projectPath,asset,draft,revision);
  drafts.delete(key);clearHistory();setSnapshot(result);setDraft(result.settings);setRevision(result.revision);
  setMessage(result.runtimeSynchronized?'Saved project and Unity copies. Restart preview; rebuild exported players.':'Saved project settings. Restart preview; re-export the game.');
 }catch(e){setError(String(e));setMessage('');}finally{setBusy(false);}};
 return <InspectorSection title="Terrain appearance">
  <p className="hint">Crop coordinates start at the image’s bottom-left. Appearance changes require a preview restart.</p>
  {!snapshot&&!error&&<p role="status">Loading terrain settings…</p>}
  {draft&&snapshot&&<fieldset className="terrain-appearance-fields" disabled={busy}>
   <legend>{snapshot.image.width} × {snapshot.image.height} source image</legend><TerrainAppearancePreview dataUrl={dataUrl} settings={draft} />
   {fields.map(([field,label])=><PropertyRow key={field} label={<label htmlFor={`${id}-${field}`}>{label}</label>}><Input id={`${id}-${field}`} aria-label={label} type="number" min={field==='pixelsPerUnit'?0.001:0} max={field.startsWith('tint')?1:undefined} step={field.startsWith('tint')?0.01:'any'} value={Number.isFinite(draft[field])?draft[field]:''} onChange={e=>update({...draft,[field]:e.target.valueAsNumber})}/></PropertyRow>)}
   <Checkbox label="Smooth filtering" checked={draft.smoothFiltering} onChange={e=>update({...draft,smoothFiltering:e.target.checked})}/>
   {dirty&&<p role="status">Unsaved changes · retained when switching assets.</p>}
   <Button disabled={!history.past.length} onClick={undo}>Undo terrain edit</Button>
   <Button disabled={!history.future.length} onClick={redo}>Redo terrain edit</Button>
   <Button disabled={!dirty} onClick={()=>{drafts.delete(key);clearHistory();setDraft(snapshot.settings);setRevision(snapshot.revision);setError('');setMessage('Changes discarded.');}}>Discard terrain changes</Button>
   <Button disabled={!dirty||fields.some(([field])=>!Number.isFinite(draft[field]))} onClick={()=>void save()}>Save terrain appearance</Button>
  </fieldset>}
  {error&&<p role="alert">{error}</p>}
  {message&&<p role="status">{message}</p>}
 </InspectorSection>;
}
