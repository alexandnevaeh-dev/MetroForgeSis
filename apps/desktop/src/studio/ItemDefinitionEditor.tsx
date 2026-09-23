import { useEffect, useState } from 'react';
import { Button } from './ui/index.js';
type ItemDraft = { item: Record<string,unknown>; effects: string; revision: string };
const itemDrafts = new Map<string, ItemDraft>();
export function ItemDefinitionEditor({projectPath}:{projectPath:string}) {
 const [items,setItems]=useState<Record<string,unknown>[]>([]);
 const [revision,setRevision]=useState('');
 const [selected,setSelected]=useState<Record<string,unknown>|null>(null);
 const [effects,setEffects]=useState('[]');
 const [supported,setSupported]=useState(false);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;void window.metroforge!.readEditableItems(projectPath).then(data=>{if(alive){setItems(data.items);setRevision(data.revision);setSupported(data.runtimeSupported);}}).catch(e=>{if(alive)setMessage(String(e));});return()=>{alive=false;};},[projectPath]);
 const baseline=items.find(item=>item.id===selected?.id);
 const dirty=Boolean(selected && (JSON.stringify(selected)!==JSON.stringify(baseline) || effects!==JSON.stringify(baseline?.effects??[],null,2)));
 useEffect(()=>{
  if(!selected)return;
  const key=JSON.stringify([projectPath,selected.id]);
  if(dirty)itemDrafts.set(key,{item:structuredClone(selected),effects,revision});else itemDrafts.delete(key);
 },[selected,effects,revision,dirty,projectPath]);
 useEffect(()=>{const protect=(event:BeforeUnloadEvent)=>{if(itemDrafts.size){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[]);
 const save=async()=>{if(!selected)return;setBusy(true);try{const item={...selected,effects:JSON.parse(effects)};const result=await window.metroforge!.saveEditableItem(projectPath,item,revision);itemDrafts.delete(JSON.stringify([projectPath,item.id]));setRevision(result.revision);setSelected(item);setEffects(JSON.stringify(item.effects,null,2));setItems(current=>current.map(row=>row.id===item.id?item:row));setMessage(result.runtimeSupported?'Saved. Restart the game to load equipment changes.':'Definition saved. Unity/Unreal runtime item synchronization is not implemented.');}catch(e){setMessage(String(e));}finally{setBusy(false);}};
 return <details className="panel"><summary>Equipment and item definitions</summary>
  <p className="hint">{supported?'Godot loads saved definitions on restart.':'Definitions only: runtime integration for this engine is pending.'}</p>
  <label>Item<select aria-label="Equipment definition" disabled={busy} value={String(selected?.id??'')} onChange={e=>{const item=items.find(i=>i.id===e.target.value);const draft=itemDrafts.get(JSON.stringify([projectPath,item?.id]));setSelected(draft?structuredClone(draft.item):item?structuredClone(item):null);setEffects(draft?.effects??JSON.stringify(item?.effects??[],null,2));if(draft)setRevision(draft.revision);setMessage(draft?'Unsaved draft restored.':'');}}><option value="">Select an item</option>{items.map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.name??item.id)}</option>)}</select></label>
  {selected&&<fieldset disabled={busy}><legend>{String(selected.id)} · {String(selected.category)}</legend>
   {(['name','description'] as const).map(field=><label key={field}>{field}<input aria-label={`Item ${field}`} value={String(selected[field]??'')} onChange={e=>setSelected({...selected,[field]:e.target.value})}/></label>)}
   {(['value','maxStack'] as const).map(field=><label key={field}>{field}<input type="number" aria-label={`Item ${field}`} value={Number(selected[field]??(field==='maxStack'?1:0))} onChange={e=>setSelected({...selected,[field]:e.target.valueAsNumber})}/></label>)}
   <label>Effects (JSON)<textarea aria-label="Item effects" value={effects} onChange={e=>setEffects(e.target.value)}/></label>
   {dirty&&<p role="status">Unsaved changes · retained while switching items and screens in this session.</p>}
   <Button disabled={!dirty} onClick={()=>{if(baseline){itemDrafts.delete(JSON.stringify([projectPath,baseline.id]));setSelected(structuredClone(baseline));setEffects(JSON.stringify(baseline.effects??[],null,2));setMessage('Draft discarded.');}}}>Discard item changes</Button>
   <Button disabled={!dirty} onClick={()=>void save()}>Save item definition</Button>
  </fieldset>}
  {message&&<p role="status">{message}</p>}
 </details>;
}
