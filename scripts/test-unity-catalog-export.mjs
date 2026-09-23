import {mkdtempSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {UnityProjectAssembler} from '../packages/unity/dist/assembler.js';
import {generateGameContent} from '../packages/procedural/dist/index.js';
const source=new URL('../GeneratedGames/ashen-covenant-sideview-unity/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,source),'utf8'));
const gameDna=read('game_dna.json'),worldGraph=read('world_graph.json'),progressionGraph=read('progression_graph.json');
const roomIds=read('gameplay.json').rooms.map(room=>room.id);
const gameContent=generateGameContent(gameDna,'TINY_TEST',77,roomIds.at(-1),roomIds);
const outputDir=mkdtempSync('E:/Metroforge/Recovery-Audit/unity-catalog-');
const result=new UnityProjectAssembler().assemble({outputDir,gameDna,worldGraph,progressionGraph,roomIds,gameContent});
assert.equal(result.success,true,JSON.stringify(result.errors));
for(const path of ['items/items.json','loot/loot_tables.json','enemies/enemies.json']) {
 assert.deepEqual(JSON.parse(readFileSync(outputDir+'/Assets/StreamingAssets/data/'+path,'utf8')),JSON.parse(readFileSync(outputDir+'/data/'+path,'utf8')));
}
console.log('PASS Unity assembly preserves generated item, enemy and loot catalogs in StreamingAssets:',outputDir);
