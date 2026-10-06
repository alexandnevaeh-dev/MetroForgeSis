import {readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {buildRoomTileCells,floorTopPx} from '../packages/godot/dist/tile-layout.js';
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(process.argv[2]||join(repository,'GeneratedGames/ashen-covenant-sideview-unity'));
const runtimeFiles=['PlayerActor.cs','EnemyActor.cs','EmberSeal.cs','WraithChain.cs','WraithAnchor.cs','GameplayData.cs','GameBootstrap.cs','AcceptanceDriver.cs'];
const runtimeDirectory=join(repository,'templates/unity-metroidvania/Assets/Scripts');
// Check inputs before modifying the generated project's data.
for(const file of runtimeFiles)assert.ok(existsSync(join(runtimeDirectory,file)),`Missing runtime template: ${file}`);
const meta=JSON.parse(readFileSync(join(root,'project.json'),'utf8'));
assert.equal(meta.slug,'ashen-covenant-sideview-unity'); assert.equal(meta.engine,'unity');
const backup=join(root,'.metroforge','before-veil-step'); mkdirSync(backup,{recursive:true});
const save=(name,value)=>{const file=join(root,name);const copy=join(backup,name);mkdirSync(resolve(copy,'..'),{recursive:true});if(!existsSync(copy))copyFileSync(file,copy);writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const rename=value=>typeof value==='string'?({dash:'phase',ability_dash:'ability_phase',item_dash:'item_phase'}[value]||value):Array.isArray(value)?value.map(rename):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rename(v)])):value;
const pack=JSON.parse(readFileSync(join(root,'gameplay.json'),'utf8'));
pack.title='Ashen Covenant';
for(const ability of pack.abilities)if(ability.id==='dash'||ability.id==='phase'){ability.id='phase';ability.name='Veil Step';}
pack.rooms=rename(pack.rooms);
// Reuse the shared generator for ceiling routes; keep authored doors, gates and entities.
for(const room of pack.rooms.filter(r=>r.doors?.some(d=>d.direction==='up'))){
 const layout=buildRoomTileCells({width:room.width,height:room.height,tileSize:room.tileSize,
  archetype:room.archetype,connections:room.doors,movement:pack.movement,seed:9212040});
 assert.equal(room.floorTop,floorTopPx(room.height,room.tileSize),'Review nonstandard floor before ascent migration');
 room.solids=room.solids.filter(s=>!/^Platform_/.test(s.name)&&!/^FloorSeg/.test(s.name));
 room.solids.push({name:'FloorSeg1',x:0,y:room.floorTop,width:room.width,height:room.tileSize*2},
  ...layout.platforms.map((platform,index)=>({name:`Platform_${index}`,...platform})));
}

const world=JSON.parse(readFileSync(join(root,'world_graph.json'),'utf8'));
// First traversal lesson: keep the existing route open while introducing chain control.
const chainRoom=world.nodes.find(n=>n.id==='room_001');
assert.ok(chainRoom,'Wraith Chain lesson room must exist');
chainRoom.metadata ??= {};
chainRoom.metadata.grantsAbilities=[...new Set([...(chainRoom.metadata.grantsAbilities||[]),'grapple'])];
if(!pack.abilities.some(a=>a.id==='grapple'))pack.abilities.push({id:'grapple',name:'Wraith Chain'});
const lesson=pack.rooms.find(r=>r.id==='room_001');
assert.ok(lesson && lesson.width===960 && lesson.floorTop===864,'Review anchor placement when lesson geometry changes');
lesson.grappleAnchors=[{x:200,y:730},{x:400,y:730}];
const sealRoom=world.nodes.find(n=>n.id==='room_003');
assert.ok(sealRoom,'Ember Seal combat lesson room must exist');
sealRoom.metadata ??= {};
sealRoom.metadata.grantsAbilities=[...new Set([...(sealRoom.metadata.grantsAbilities||[]),'ember_seal'])];
if(!pack.abilities.some(a=>a.id==='ember_seal'))pack.abilities.push({id:'ember_seal',name:'Ember Seal'});

for(const room of pack.rooms){
 const node=world.nodes.find(n=>n.id===room.id);
 const grants=rename(node?.metadata?.grantsAbilities||[]);
 room.abilityPickups=grants.map((id,index)=>({id,x:Math.min(220+index*48,room.width-40),y:room.floorTop-28}));
 room.abilityPickup=room.abilityPickups[0];
}
assert.ok(pack.rooms.some(r=>r.abilityPickup?.id==='phase'));
assert.ok(pack.rooms.some(r=>r.gates.some(g=>g.requiredAbility==='phase')));
assert.ok(pack.sprites.some(s=>s.clip==='dash'),'Preserve animation clip names');
for(const file of ['gameplay.json','Assets/StreamingAssets/gameplay.json'])save(file,pack);
for(const file of ['game_dna.json','world_graph.json','data/world/world_graph.json','progression_graph.json']){
 const data=rename(JSON.parse(readFileSync(join(root,file),'utf8')));
 if(file==='world_graph.json'||file==='data/world/world_graph.json'){
  const lesson=data.nodes.find(n=>n.id==='room_001');
  assert.ok(lesson); lesson.metadata ??= {};
  lesson.metadata.grantsAbilities=[...new Set([...(lesson.metadata.grantsAbilities||[]),'grapple'])];
  const combatLesson=data.nodes.find(n=>n.id==='room_003');
  assert.ok(combatLesson); combatLesson.metadata ??= {};
  combatLesson.metadata.grantsAbilities=[...new Set([...(combatLesson.metadata.grantsAbilities||[]),'ember_seal'])];
 }
 if(file==='progression_graph.json'){
  data.abilities=[...new Set([...data.abilities,'grapple','ember_seal'])];
  if(!data.nodes.some(n=>n.id==='ability_ember_seal'))
   data.nodes.push({id:'ability_ember_seal',type:'ability',label:'Ember Seal',required:false});
  if(!data.edges.some(e=>e.from===data.startNodeId&&e.to==='ability_ember_seal'))
   data.edges.push({from:data.startNodeId,to:'ability_ember_seal',requires:[]});
  if(!data.nodes.some(n=>n.id==='ability_grapple'))
   data.nodes.push({id:'ability_grapple',type:'ability',label:'Wraith Chain',required:false});
  if(!data.edges.some(e=>e.from===data.startNodeId&&e.to==='ability_grapple'))
   data.edges.push({from:data.startNodeId,to:'ability_grapple',requires:[]});
 }
 if(file==='game_dna.json'){
  if(!data.abilities.some(a=>a.id==='ember_seal'))
   data.abilities.push({id:'ember_seal',name:'Ember Seal',category:'combat',enabled:true});
  if(!data.abilities.some(a=>a.id==='grapple'))
   data.abilities.push({id:'grapple',name:'Wraith Chain',category:'movement',enabled:true});
  data.identity.title='Ashen Covenant'; data.narrative.protagonist='The Emberbound Knight';
  for(const ability of data.abilities)if(ability.id==='phase')ability.name='Veil Step';
 }
 save(file,data);
}
for(const file of runtimeFiles)copyFileSync(join(runtimeDirectory,file),join(root,'Assets/Scripts/'+file));
writeFileSync(join(root,'customization-status.json'),JSON.stringify({title:'Ashen Covenant',ability:'phase',displayName:'Veil Step',runtimeTestedInIsolatedFixture:true,fullGameRuntimeValidated:false,priorGenerationProofsStale:true,grappleLessonNativeValidated:false,pending:['Wraith Chain lesson placement and unlock validation','new posed animation sets','new production art','Wraith Chain','Ember Seal','NPC dialogue','boss phases','full route regression'],updatedAt:new Date().toISOString()},null,2));
console.log('Integrated Veil Step pickup and gate references; retained dash animation clips. Full-game regression pending.');
