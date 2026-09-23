import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readEditableItems,saveEditableItem} from '../packages/generation/dist/item-edit-service.js';
import {readEditableLoot,saveEditableLoot} from '../packages/generation/dist/loot-edit-service.js';
const originalRename=fs.renameSync,originalWrite=fs.writeFileSync;
for(const kind of ['item','loot'])for(const rollbackFailure of [false,true]){
 const dir=fs.mkdtempSync('E:/Metroforge/Recovery-Audit/catalog-rollback-');
 const armor={id:'plate',name:'Plate',description:'Armor',category:'armor',effects:[{type:'armor',value:25}]};
 const table={id:'guard',name:'Guard',entries:[{itemId:'plate',chance:0.1,minQuantity:1,maxQuantity:1}]};
 for(const base of ['data','Assets/StreamingAssets/data'])for(const [path,data] of [['items/items.json',{items:[armor]}],['loot/loot_tables.json',{tables:[table]}],['enemies/enemies.json',{enemies:[{id:'enemy',lootTableId:'guard'}]}]]){
  const file=join(dir,base,path);fs.mkdirSync(join(file,'..'),{recursive:true});fs.writeFileSync(file,JSON.stringify(data));
 }
 const relative=kind==='item'?'items/items.json':'loot/loot_tables.json';
 const root=join(dir,'data',relative),mirror=join(dir,'Assets/StreamingAssets/data',relative);
 const before=fs.readFileSync(root,'utf8');const read=kind==='item'?readEditableItems:readEditableLoot;
 const save=kind==='item'?saveEditableItem:saveEditableLoot;
 const revision=read(dir).revision;let rootReplaced=false;
 fs.renameSync=(from,to)=>{if(to===mirror)throw new Error('Injected mirror replacement failure');const result=originalRename(from,to);if(to===root)rootReplaced=true;return result;};
 fs.writeFileSync=(file,...args)=>{if(rollbackFailure&&rootReplaced&&file===root)throw new Error('Injected rollback failure');return originalWrite(file,...args);};
 syncBuiltinESMExports();
 try{assert.throws(()=>save(dir,kind==='item'?{...armor,name:'Edited'}:{...table,name:'Edited'},revision),rollbackFailure?/restore backups/:/Injected mirror replacement failure/);}
 finally{fs.renameSync=originalRename;fs.writeFileSync=originalWrite;syncBuiltinESMExports();}
 assert.equal(rootReplaced,true,'Must exercise failure after authoritative replacement');
 assert.equal(fs.readFileSync(mirror,'utf8'),before);
 if(!rollbackFailure){assert.equal(fs.readFileSync(root,'utf8'),before);assert.equal(read(dir).revision,revision);}
 const backups=join(dir,'.metroforge',kind+'-edit-backups');
 const entries=fs.readdirSync(backups);assert.equal(entries.length,2);
 for(const entry of entries)assert.equal(fs.readFileSync(join(backups,entry),'utf8'),before);
 for(const folder of [join(root,'..'),join(mirror,'..')])assert.ok(fs.readdirSync(folder).every(name=>!name.endsWith('.tmp')));
 console.log(`PASS ${kind}: ${rollbackFailure?'rollback failure reports retained recovery backups':'partial replacement restored both originals'}`);
}
