import { useEffect, useState } from 'react';
import type { LootTable } from '@metroforge/schemas';
import { Button, Select } from './ui/index.js';
type LootDraft = { selected: LootTable; revision: string; isNew?: boolean; past: LootTable[]; future: LootTable[] };
const drafts = new Map<string, LootDraft>();
export function LootDefinitionEditor({projectPath}:{projectPath:string}) {
 const [tables,setTables]=useState<LootTable[]>([]),[items,setItems]=useState<Record<string,unknown>[]>([]);
 const [selected,setSelected]=useState<LootTable|null>(null),[revision,setRevision]=useState('');
 const [sources,setSources]=useState<Record<string,unknown>[]>([]),[sourceId,setSourceId]=useState('');
 const source=sources.find(enemy=>enemy.id===sourceId);
 const [isNew,setIsNew]=useState(false);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[supported,setSupported]=useState(false);
 const [past,setPast]=useState<LootTable[]>([]),[future,setFuture]=useState<LootTable[]>([]);
 const baseline=tables.find(t=>t.id===selected?.id);
 const dirty=Boolean(selected&&JSON.stringify(selected)!==JSON.stringify(baseline));
 useEffect(()=>{let alive=true;window.metroforge!.readEditableLoot(projectPath).then(data=>{if(alive){setTables(data.tables as unknown as LootTable[]);setItems(data.items);setSources(data.sources);setRevision(data.revision);setSupported(data.runtimeSupported);const draft=drafts.get(projectPath);if(draft){setSelected(structuredClone(draft.selected));setIsNew(Boolean(draft.isNew));setRevision(draft.revision);setPast(structuredClone(draft.past));setFuture(structuredClone(draft.future));setMessage('Unsaved loot draft restored.');}}}).catch(error=>{if(alive)setMessage(String(error));});return()=>{alive=false;};},[projectPath]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
 useEffect(()=>{if(selected&&dirty)drafts.set(projectPath,{selected:structuredClone(selected),revision,isNew,past:structuredClone(past),future:structuredClone(future)});else if(selected)drafts.delete(projectPath);},[projectPath,selected,dirty,revision,isNew,past,future]);
 const change=(next:LootTable)=>{if(selected)setPast(history=>[...history,structuredClone(selected)].slice(-100));setFuture([]);setSelected(next);};
 const undo=()=>{if(!selected||!past.length)return;setFuture(history=>[structuredClone(selected),...history]);setSelected(structuredClone(past[past.length-1]!));setPast(past.slice(0,-1));};
 const redo=()=>{if(!selected||!future.length)return;setPast(history=>[...history,structuredClone(selected)]);setSelected(structuredClone(future[0]!));setFuture(future.slice(1));};
 const save=async()=>{if(!selected)return;setBusy(true);try{const result=await (isNew?window.metroforge!.createEditableLoot:window.metroforge!.saveEditableLoot)(projectPath,selected,revision);setRevision(result.revision);setPast([]);setFuture([]);drafts.delete(projectPath);setTables(current=>isNew?[...current,structuredClone(selected)]:current.map(t=>t.id===selected.id?structuredClone(selected):t));setIsNew(false);setMessage(result.runtimeSynchronized?'Saved project and Unity runtime definitions. Restart Play Mode to load changes; rebuild exported players.':result.runtimeSupported?'Saved. Restart the game to load drops.':'Saved project definitions only. Runtime synchronization is unavailable for this project.');}catch(error){setMessage(String(error));}finally{setBusy(false);}};
 const reload=async()=>{
  if(dirty||busy)return;
  setBusy(true);
  try{
   const data=await window.metroforge!.readEditableLoot(projectPath);
   const latest=data.tables as unknown as LootTable[];
   setTables(latest);setItems(data.items);setSources(data.sources);setRevision(data.revision);setSupported(data.runtimeSupported);
   setSelected(structuredClone(latest.find(table=>table.id===selected?.id)??null));
   if(!data.sources.some(enemy=>enemy.id===sourceId))setSourceId('');
   setIsNew(false);setPast([]);setFuture([]);drafts.delete(projectPath);setMessage('Loot catalogs reloaded from disk.');
  }catch(error){setMessage(String(error));}finally{setBusy(false);}
 };
 const assign=async(tableId:string|null)=>{
  if(!source||dirty||busy)return;
  setBusy(true);
  try{
   const result=await window.metroforge!.saveEditableLootSource(projectPath,sourceId,tableId,revision);
   setRevision(result.revision);
   setSources(current=>current.map(enemy=>{if(enemy.id!==sourceId)return enemy;const next={...enemy};if(tableId===null)delete next.lootTableId;else next.lootTableId=tableId;return next;}));
   setMessage(result.runtimeSynchronized?'Enemy drops saved to project and Unity runtime. Restart Play Mode; rebuild exported players.':result.runtimeSupported?'Enemy drops saved. Restart the game to load changes.':'Enemy drops saved to project only. Runtime synchronization is unavailable.');
  }catch(error){setMessage(String(error));}finally{setBusy(false);}
 };
 return <details className="panel loot-editor"><summary>Enemy loot and drop quantities</summary>
  <p className="hint">Each item rolls independently. {supported?'Godot loads changes on restart.':'Save feedback confirms whether runtime definitions were synchronized.'}</p>
  <Button disabled={busy||dirty||!revision} onClick={()=>{setIsNew(true);setSelected({id:`loot_${crypto.randomUUID()}`,name:'New drop table',entries:[]});setPast([]);setFuture([]);setMessage('New table draft. Add drops and save; enemy assignment is separate.');}}>New loot table</Button>
  <Button disabled={busy||dirty} onClick={()=>void reload()}>Reload loot catalogs</Button>
  {dirty&&<p className="hint">Save or discard your table draft before reloading catalogs.</p>}
  <label>Drop table<select aria-label="Loot table" disabled={busy||dirty} value={selected?.id??''} onChange={e=>{setIsNew(false);setSelected(structuredClone(tables.find(t=>t.id===e.target.value)??null));setPast([]);setFuture([]);setMessage('');}}><option value="">Select a drop table</option>{isNew&&selected&&<option value={selected.id}>{selected.name} (unsaved)</option>}{tables.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
  {selected&&<fieldset disabled={busy}><legend>{selected.id}</legend>
   <label>Name<input aria-label="Loot table name" aria-invalid={!selected.name.trim()} aria-describedby={!selected.name.trim()?'loot-name-error':undefined} value={selected.name} onChange={e=>change({...selected,name:e.target.value})}/></label>
   {!selected.name.trim()&&<p id="loot-name-error" role="alert">Enter a name for this drop table.</p>}
   {selected.entries.map((entry,index)=><fieldset className="loot-entry" key={index}><legend>Drop {index+1}</legend>
    <label>Item<select aria-label={`Drop ${index+1} item`} value={entry.itemId} onChange={e=>change({...selected,entries:selected.entries.map((row,i)=>i===index?{...row,itemId:e.target.value}:row)})}>{items.map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.name??item.id)}</option>)}</select></label>
    {(['chance','minQuantity','maxQuantity'] as const).map(field=><label key={field}>{field==='chance'?'Chance (0–1)':field==='minQuantity'?'Minimum quantity':'Maximum quantity'}<input aria-label={`Drop ${index+1} ${field}`} type="number" min={field==='chance'?0:1} max={field==='chance'?1:1000000} step={field==='chance'?0.01:1} value={Number.isFinite(entry[field])?entry[field]:''} onChange={e=>change({...selected,entries:selected.entries.map((row,i)=>i===index?{...row,[field]:e.target.valueAsNumber}:row)})}/></label>)}
    <Button onClick={()=>change({...selected,entries:selected.entries.filter((_,i)=>i!==index)})}>Remove drop {index+1}</Button>
   </fieldset>)}
   <Button disabled={!items.some(item=>!selected.entries.some(e=>e.itemId===item.id))} onClick={()=>{const item=items.find(item=>!selected.entries.some(e=>e.itemId===item.id));if(item)change({...selected,entries:[...selected.entries,{itemId:String(item.id),chance:1,minQuantity:1,maxQuantity:1}]});}}>Add drop</Button>
   <Button disabled={!dirty} onClick={()=>{setSelected(structuredClone(baseline??null));setIsNew(false);setPast([]);setFuture([]);drafts.delete(projectPath);}}>Discard loot changes</Button>
   <Button disabled={!past.length} onClick={undo}>Undo loot edit</Button>
   <Button disabled={!future.length} onClick={redo}>Redo loot edit</Button>
   <Button disabled={!dirty||!selected.name.trim()} onClick={()=>void save()}>{isNew?'Create loot table':'Save loot table'}</Button>
   {dirty&&<p role="status">Unsaved changes retained across screens in this session. Save or discard before selecting another table.</p>}
  </fieldset>}
  <fieldset disabled={busy||dirty}><legend>Enemy drop assignment</legend>
   <label>Enemy<Select aria-label="Loot source enemy" value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">Select an enemy</option>{sources.map(enemy=><option key={String(enemy.id)} value={String(enemy.id)}>{String(enemy.name??enemy.id)}</option>)}</Select></label>
   {source&&<p>Current drops: {tables.find(table=>table.id===source.lootTableId)?.name??(source.lootTableId?String(source.lootTableId):'None')}</p>}
   <Button disabled={!source||!selected||isNew||source.lootTableId===selected.id} onClick={()=>selected&&void assign(selected.id)}>Assign selected loot table</Button>
   <Button disabled={!source?.lootTableId} onClick={()=>void assign(null)}>Clear enemy drops</Button>
   <p className="hint">These actions save immediately for every spawn of this enemy type. Save or discard table edits first. Clearing drops keeps the table available.</p>
   {!sources.length&&<p>No enemy definitions are available in this project.</p>}
  </fieldset>
  {message&&<p role="status">{message}</p>}
 </details>;
}
