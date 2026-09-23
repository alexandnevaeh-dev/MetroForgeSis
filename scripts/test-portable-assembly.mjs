import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const stage=resolve(process.argv[2] || 'E:/Metroforge/Recovery-Audit/portable-1790133463997');
const fixture=resolve(process.argv[3] || 'GeneratedGames/ashen-covenant-sideview-unity');
process.env.METROFORGE_RESOURCE_ROOT=join(stage,'resources/metroforge');
process.env.METROFORGE_DATA_DIR=join(stage,'MetroForgeData/.metroforge');
process.env.METROFORGE_ENV_FILE=join(process.env.METROFORGE_DATA_DIR,'.env');
const imported=name=>import(pathToFileURL(join(stage,'resources/app/node_modules/@metroforge',name,'dist/index.js')).href);
const {generateGameContent}=await imported('procedural');
const {UnityProjectAssembler}=await imported('unity');
const {UnrealProjectAssembler}=await imported('unreal');
const {GodotProjectAssembler}=await imported('godot');
const {readUnityRoomEdit,saveUnityRoomEdit}=await imported('engines');
const read=name=>JSON.parse(readFileSync(join(fixture,name),'utf8'));
const gameDna=read('game_dna.json'),worldGraph=read('world_graph.json'),progressionGraph=read('progression_graph.json');
const roomIds=read('gameplay.json').rooms.map(room=>room.id);
const gameContent=generateGameContent(gameDna,'TINY_TEST',77,roomIds.at(-1),roomIds);
const output=mkdtempSync('E:/Metroforge/Recovery-Audit/portable-assembly-');
process.chdir(output);
const results=[];
for(const [engine,assembler,entry] of [['unity',new UnityProjectAssembler(),'Assets/StreamingAssets/gameplay.json'],['unreal',new UnrealProjectAssembler(),'MetroForgeGame.uproject'],['godot',new GodotProjectAssembler(),'project.godot']]){
 const outputDir=join(output,engine);
 try{
  const result=assembler.assemble({outputDir,gameDna,worldGraph,progressionGraph,roomIds,gameContent});
  assert.equal(result.success,true,JSON.stringify(result.errors));assert.ok(existsSync(join(outputDir,entry)),entry);
  if(engine==='unity')for(const name of ['items/items.json','loot/loot_tables.json','enemies/enemies.json'])assert.deepEqual(JSON.parse(readFileSync(join(outputDir,'Assets/StreamingAssets/data',name),'utf8')),JSON.parse(readFileSync(join(outputDir,'data',name),'utf8')));
  let roomEditing;
  if(engine==='unity'){
   const pack=JSON.parse(readFileSync(join(outputDir,'gameplay.json'),'utf8'));
   const room=pack.rooms.find(room=>room.solids.length>0);assert.ok(room);
   const state=readUnityRoomEdit(outputDir,room.id);assert.ok(state.objects.length>0);
   const originalX=state.objects[0].x;state.objects[0].x=originalX+8;
   const saved=saveUnityRoomEdit(outputDir,room.id,state.objects,state.fingerprints);
   assert.equal(saved.restartRequired,true);
   assert.equal(readUnityRoomEdit(outputDir,room.id).objects[0].x,originalX+8);
   assert.equal(readFileSync(join(outputDir,'gameplay.json'),'utf8'),readFileSync(join(outputDir,'Assets/StreamingAssets/gameplay.json'),'utf8'));
   assert.ok(existsSync(join(saved.backup,'0.json')));
   assert.throws(()=>saveUnityRoomEdit(outputDir,room.id,state.objects,state.fingerprints),/changed/);
   roomEditing='PASS save/reload, root/runtime mirrors, backup, stale-revision rejection, explicit restart';
  }
  results.push({engine,passed:true,warnings:result.warnings,roomEditing});
 }catch(error){results.push({engine,passed:false,error:error.message});}
}
const receipt={scope:'Staged dependency and template export using existing authored DNA/graphs and regenerated deterministic content; not native engine gameplay or prompt generation',output,results};
writeFileSync(join(output,'result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
process.exitCode=results.every(result=>result.passed)?0:1;
