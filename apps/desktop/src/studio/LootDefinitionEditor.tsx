import { useEffect, useState } from 'react';
import type { LootTable } from '@metroforge/schemas';
import { Button } from './ui/index.js';
type LootDraft = { selected: LootTable; revision: string; past: LootTable[]; future: LootTable[] };
const drafts = new Map<string, LootDraft>();
export function LootDefinitionEditor({projectPath}:{projectPath:string}) {
 const [tables,setTables]=useState<LootTable[]>([]),[items,setItems]=useState<Record<string,unknown>[]>([]);
 const [selected,setSelected]=useState<LootTable|null>(null),[revision,setRevision]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[supported,setSupported]=useState(false);
 const [past,setPast]=useState<LootTable[]>([]),[future,setFuture]=useState<LootTable[]>([]);
 const baseline=tables.find(t=>t.id===selected?.id);
 const dirty=Boolean(selected&&JSON.stringify(selected)!==JSON.stringify(baseline));
 useEffect(()=>{let alive=true;window.metroforge!.readEditableLoot(projectPath).then(data=>{if(alive){setTables(data.tables as unknown as LootTable[]);setItems(data.items);setRevision(data.revision);setSupported(data.runtimeSupported);const draft=drafts.get(projectPath);if(draft){setSelected(structuredClone(draft.selected));setRevision(draft.revision);setPast(structuredClone(draft.past));setFuture(structuredClone(draft.future));setMessage('Unsaved loot draft restored.');}}}).catch(error=>{if(alive)setMessage(String(error));});return()=>{alive=false;};},[projectPath]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
 useEffect(()=>{if(selected&&dirty)drafts.set(projectPath,{selected:structuredClone(selected),revision,past:structuredClone(past),future:structuredClone(future)});else if(selected)drafts.delete(projectPath);},[projectPath,selected,dirty,revision,past,future]);
 const change=(next:LootTable)=>{if(selected)setPast(history=>[...history,structuredClone(selected)].slice(-100));setFuture([]);setSelected(next);};
 const undo=()=>{if(!selected||!past.length)return;setFuture(history=>[structuredClone(selected),...history]);setSelected(structuredClone(past[past.length-1]!));setPast(past.slice(0,-1));};
 const redo=()=>{if(!selected||!future.length)return;setPast(history=>[...history,structuredClone(selected)]);setSelected(structuredClone(future[0]!));setFuture(future.slice(1));};
 const save=async()=>{if(!selected)return;setBusy(true);try{const result=await window.metroforge!.saveEditableLoot(projectPath,selected,revision);setRevision(result.revision);setPast([]);setFuture([]);drafts.delete(projectPath);setTables(current=>current.map(t=>t.id===selected.id?structuredClone(selected):t));setMessage(result.runtimeSynchronized?'Saved project and Unity runtime definitions. Restart Play Mode to load changes; rebuild exported players.':result.runtimeSupported?'Saved. Restart the game to load drops.':'Saved project definitions only. Runtime synchronization is unavailable for this project.');}catch(error){setMessage(String(error));}finally{setBusy(false);}};
 return <details className="panel loot-editor"><summary>Enemy loot and drop quantities</summary>
  <p className="hint">Each item rolls independently. {supported?'Godot loads changes on restart.':'Save feedback confirms whether runtime definitions were synchronized.'}</p>
  <label>Drop table<select aria-label="Loot table" disabled={busy||dirty} value={selected?.id??''} onChange={e=>{setSelected(structuredClone(tables.find(t=>t.id===e.target.value)??null));setPast([]);setFuture([]);setMessage('');}}><option value="">Select a drop table</option>{tables.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
  {selected&&<fieldset disabled={busy}><legend>{selected.id}</legend>
   <label>Name<input aria-label="Loot table name" value={selected.name} onChange={e=>change({...selected,name:e.target.value})}/></label>
   {selected.entries.map((entry,index)=><fieldset className="loot-entry" key={index}><legend>Drop {index+1}</legend>
    <label>Item<select aria-label={`Drop ${index+1} item`} value={entry.itemId} onChange={e=>change({...selected,entries:selected.entries.map((row,i)=>i===index?{...row,itemId:e.target.value}:row)})}>{items.map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.name??item.id)}</option>)}</select></label>
    {(['chance','minQuantity','maxQuantity'] as const).map(field=><label key={field}>{field==='chance'?'Chance (0–1)':field==='minQuantity'?'Minimum quantity':'Maximum quantity'}<input aria-label={`Drop ${index+1} ${field}`} type="number" min={field==='chance'?0:1} max={field==='chance'?1:1000000} step={field==='chance'?0.01:1} value={Number.isFinite(entry[field])?entry[field]:''} onChange={e=>change({...selected,entries:selected.entries.map((row,i)=>i===index?{...row,[field]:e.target.valueAsNumber}:row)})}/></label>)}
    <Button onClick={()=>change({...selected,entries:selected.entries.filter((_,i)=>i!==index)})}>Remove drop {index+1}</Button>
   </fieldset>)}
   <Button disabled={!items.some(item=>!selected.entries.some(e=>e.itemId===item.id))} onClick={()=>{const item=items.find(item=>!selected.entries.some(e=>e.itemId===item.id));if(item)change({...selected,entries:[...selected.entries,{itemId:String(item.id),chance:1,minQuantity:1,maxQuantity:1}]});}}>Add drop</Button>
   <Button disabled={!dirty} onClick={()=>{setSelected(structuredClone(baseline??null));setPast([]);setFuture([]);drafts.delete(projectPath);}}>Discard loot changes</Button>
   <Button disabled={!past.length} onClick={undo}>Undo loot edit</Button>
   <Button disabled={!future.length} onClick={redo}>Redo loot edit</Button>
   <Button disabled={!dirty} onClick={()=>void save()}>Save loot table</Button>
   {dirty&&<p role="status">Unsaved changes retained across screens in this session. Save or discard before selecting another table.</p>}
  </fieldset>}
  {message&&<p role="status">{message}</p>}
 </details>;
}
