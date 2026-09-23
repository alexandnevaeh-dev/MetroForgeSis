import {mkdtempSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {writeSharedProjectData} from '../packages/engines/dist/shared-data.js';
const source=new URL('../GeneratedGames/ashen-covenant-sideview-unity/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,source),'utf8'));
const pack=read('gameplay.json');const item={id:'plate',name:'Ash plate',description:'Armor',category:'armor',effects:[{type:'armor',value:40}],stackable:false,maxStack:1,value:25};
for(const content of [{items:[item],enemies:[]},undefined]){
 const outputDir=mkdtempSync('E:/Metroforge/Recovery-Audit/catalog-export-');
 writeSharedProjectData({outputDir,gameDna:read('game_dna.json'),worldGraph:read('world_graph.json'),progressionGraph:read('progression_graph.json'),roomIds:pack.rooms.map(r=>r.id),gameContent:content},pack);
 assert.deepEqual(JSON.parse(readFileSync(outputDir+'/data/items/items.json','utf8')).items,content?.items??[]);
}
console.log('PASS shared export preserves equipment definitions and emits empty catalog when absent');
