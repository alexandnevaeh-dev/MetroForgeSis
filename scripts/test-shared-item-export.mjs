import {mkdtempSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {writeSharedProjectData} from '../packages/engines/dist/shared-data.js';
const source=new URL('../GeneratedGames/ashen-covenant-sideview-unity/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,source),'utf8'));
const pack=read('gameplay.json');const item={id:'plate',name:'Ash plate',description:'Armor',category:'armor',effects:[{type:'armor',value:40}],stackable:false,maxStack:1,value:25};
const table={id:'abbey',name:'Abbey loot',entries:[{itemId:'plate',chance:0.5,minQuantity:1,maxQuantity:2}]};
for(const content of [{items:[item],enemies:[],lootTables:[table]},undefined]){
 const outputDir=mkdtempSync('E:/Metroforge/Recovery-Audit/catalog-export-');
 writeSharedProjectData({outputDir,gameDna:read('game_dna.json'),worldGraph:read('world_graph.json'),progressionGraph:read('progression_graph.json'),roomIds:pack.rooms.map(r=>r.id),gameContent:content},pack);
 assert.deepEqual(JSON.parse(readFileSync(outputDir+'/data/items/items.json','utf8')).items,content?.items??[]);
 assert.deepEqual(JSON.parse(readFileSync(outputDir+'/data/loot/loot_tables.json','utf8')).tables,content?.lootTables??[]);
}
console.log('PASS shared export preserves equipment definitions and emits empty catalog when absent');
