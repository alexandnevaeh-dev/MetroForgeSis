import {readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'GeneratedGames/ashen-covenant-sideview-unity');
const meta=JSON.parse(readFileSync(join(root,'project.json'),'utf8'));
assert.equal(meta.slug,'ashen-covenant-sideview-unity'); assert.equal(meta.engine,'unity');
const backup=join(root,'.metroforge','before-veil-step'); mkdirSync(backup,{recursive:true});
const save=(name,value)=>{const file=join(root,name);const copy=join(backup,name);mkdirSync(resolve(copy,'..'),{recursive:true});if(!existsSync(copy))copyFileSync(file,copy);writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const rename=value=>typeof value==='string'?({dash:'phase',ability_dash:'ability_phase',item_dash:'item_phase'}[value]||value):Array.isArray(value)?value.map(rename):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rename(v)])):value;
const pack=JSON.parse(readFileSync(join(root,'gameplay.json'),'utf8'));
pack.title='Ashen Covenant';
for(const ability of pack.abilities)if(ability.id==='dash'||ability.id==='phase'){ability.id='phase';ability.name='Veil Step';}
pack.rooms=rename(pack.rooms);
assert.ok(pack.rooms.some(r=>r.abilityPickup?.id==='phase'));
assert.ok(pack.rooms.some(r=>r.gates.some(g=>g.requiredAbility==='phase')));
assert.ok(pack.sprites.some(s=>s.clip==='dash'),'Preserve animation clip names');
for(const file of ['gameplay.json','Assets/StreamingAssets/gameplay.json'])save(file,pack);
for(const file of ['game_dna.json','world_graph.json','data/world/world_graph.json','progression_graph.json']){
 const data=rename(JSON.parse(readFileSync(join(root,file),'utf8')));
 if(file==='game_dna.json'){
  data.identity.title='Ashen Covenant'; data.narrative.protagonist='The Emberbound Knight';
  for(const ability of data.abilities)if(ability.id==='phase')ability.name='Veil Step';
 }
 save(file,data);
}
copyFileSync('templates/unity-metroidvania/Assets/Scripts/PlayerActor.cs',join(root,'Assets/Scripts/PlayerActor.cs'));
writeFileSync(join(root,'customization-status.json'),JSON.stringify({title:'Ashen Covenant',ability:'phase',displayName:'Veil Step',runtimeTestedInIsolatedFixture:true,fullGameRuntimeValidated:false,priorGenerationProofsStale:true,pending:['new posed animation sets','new production art','Wraith Chain','Ember Seal','NPC dialogue','boss phases','full route regression'],updatedAt:new Date().toISOString()},null,2));
console.log('Integrated Veil Step pickup and gate references; retained dash animation clips. Full-game regression pending.');
