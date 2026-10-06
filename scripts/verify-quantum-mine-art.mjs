import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const repo = resolve('.');
const project = join(repo,'prototypes/quantum-divergence');
const reports = join(repo,'reports/game-tests/20261001-quantum-divergence');
const output = join(reports,'mine-art-'+Date.now());
assert.match(output,/^E:[/\\]/i);
assert.ok(!existsSync(output));
mkdirSync(output,{recursive:true});
const record = process.argv.includes('--record');
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const ffmpeg = 'E:/MetroForgeData/Runtime/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
const env = {...process.env,TEMP:'E:/MetroForgeData/Temp',TMP:'E:/MetroForgeData/Temp',
  APPDATA:'E:/MetroForgeData/AppData/QuantumGodot',LOCALAPPDATA:'E:/MetroForgeData/AppData/QuantumGodotLocal'};
const digest = path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const paths = ['scripts/MicrocellGrid.gd','scripts/ChunkedGrid.gd','scripts/MineWorld.gd','scripts/MineNavigator.gd',
  'scripts/WorldPlayground.gd','scripts/WorldRunDriver.gd','scripts/WorldVictoryPlayground.gd',
  'scripts/MaterialContact.gd','scripts/PlayerSimulation.gd','scripts/InstrumentSimulation.gd','scripts/EnemySimulation.gd',
  'scripts/MinesProgression.gd','scripts/Playground.gd','scripts/ProgressionPlayground.gd','scripts/CombatPlayground.gd',
  'scripts/SpriteClipPlayer.gd','scripts/EnemyClipBinding.gd','scripts/MineArtTerrain.gd','scripts/MinesArtPlayground.gd',
  'tools/MineKitBaker.gd','tools/DiverRigBaker.gd','tests/MineArtTerrainTests.gd','tests/MinesArtPresentationTests.gd',
  'tests/BranchTests.gd','tests/WorldTests.gd','tests/ChunkTests.gd','scenes/MinesArtPlayground.tscn'];
const sources = paths.map(path=>({path:'prototypes/quantum-divergence/'+path,sha256:digest(join(project,path))}));
for (const path of ['scripts/package-quantum-mine-kit.py','scripts/verify-quantum-mine-art.mjs']) sources.push({path,sha256:digest(join(repo,path))});
const kits = ['mine-kit-candidate-v1','cast-candidate-v2','diver-candidate-v1'].map(name=>{
  const path = join(project,'assets',name);
  const manifest = JSON.parse(readFileSync(join(path,'manifest.json'),'utf8'));
  assert.equal(manifest.genre,'quantum-divergence');
  assert.equal(manifest.candidateOnly,true);
  assert.equal(manifest.productionApproved,false);
  for (const [file,sha] of Object.entries(manifest.hashes)) assert.equal(digest(join(path,file)),sha);
  return {name,path,manifestSha256:digest(join(path,'manifest.json')),manifest};
});
function run(executable,args,name,timeout = 90000) {
  const result = spawnSync(executable,args,{env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:12*1024*1024});
  const logs = String(result.stdout||'')+String(result.stderr||'');
  writeFileSync(join(output,name+'.log'),logs+(result.error?'\n'+result.error:''));
  assert.ifError(result.error);
  assert.equal(result.status,0,name+' failed; retained evidence: '+output);
  assert.ok(!/SCRIPT ERROR:|Parse Error:|Assertion failed/.test(logs),name+' has a native failure');
  return logs;
}
const suites = [];
for (const [script,prefix,count] of [['MineArtTerrainTests.gd','QUANTUM_MINE_ART_TERRAIN_RESULTS ',27],
  ['MinesArtPresentationTests.gd','QUANTUM_MINE_ART_PRESENTATION_RESULTS ',18],
  ['BranchTests.gd','QUANTUM_BRANCH_RESULTS ',6],['ChunkTests.gd','QUANTUM_CHUNK_RESULTS ',23],
  ['WorldTests.gd','QUANTUM_WORLD_RESULTS ',10]]) {
  const logs = run(godot,['--headless','--path',project,'--script','res://tests/'+script],script);
  const line = logs.split(/\r?\n/).find(value=>value.startsWith(prefix));
  assert.ok(line,'Missing suite result: '+script);
  const result = JSON.parse(line.slice(prefix.length));
  assert.equal(result.failed,0);
  assert.equal(result.passed,count);
  suites.push({script,...result});
  console.log(JSON.stringify({suite:script,passed:result.passed}));
}
const avi = join(output,'native-probability-mines.avi');
const mp4 = join(output,'quantum-matching-mines.mp4');
const native = join(output,'native');
run(godot,['--path',project,'--position','-10000,-10000',
  ...(record?['--write-movie',avi,'--fixed-fps','60','--disable-vsync']:[]),
  'res://scenes/MinesArtPlayground.tscn','--','--smoke-test','--capture-dir='+native.replaceAll('\\','/')],'render',360000);
const runtime = JSON.parse(readFileSync(join(native,'playground-result.json'),'utf8'));
assert.equal(runtime.ticks,6186);
assert.equal(runtime.player_hp,76);
assert.equal(runtime.shots,40);
assert.equal(runtime.world.cells,1382400);
assert.equal(runtime.world.rooms,8);
assert.equal(runtime.world.recall_stations,8);
assert.ok(runtime.world.max_active_chunks <= 96 && runtime.world.max_work_cells <= 96*32*32);
assert.equal(runtime.full_route.reached,161);
assert.equal(runtime.full_route.waypoints,161);
assert.equal(runtime.full_route.failure,'');
for (const key of ['anchor_upper','collapse_rift','golem_core','golem_defeated','secret_found','extracted','exit_ready']) assert.equal(runtime.progression[key],true,key);
assert.equal(runtime.progression.crystals_destroyed,3);
assert.deepEqual(runtime.blueprints,['entanglement']);
for (const id of ['200','301','302','303']) assert.ok(runtime.enemy_deaths[id] && runtime.enemy_active_counts[id] > 0);
for (const attack of ['slam','burst','roar']) assert.ok(runtime.boss_active[attack] > 0);
for (const branch of ['echo','survey']) assert.deepEqual(runtime.full_route.branches[branch],{outbound:true,returned:true});
assert.deepEqual(runtime.target_hits,{'101':2,'102':2,'103':2,'200':25,'301':2,'302':3,'303':4});
assert.equal(runtime.art.integrity,true);
assert.equal(runtime.art.floorFailures,0);
assert.equal(runtime.art.floorChecks,23132);
assert.equal(runtime.art.propFailures,0);
assert.equal(runtime.art.propChecks,480);
assert.ok(runtime.art.maxSwatches <= 4096 && runtime.art.maxTerrainTextures <= 45);
assert.equal(runtime.art.kitManifestSha256,kits[0].manifestSha256);
assert.equal(runtime.art.castManifestSha256,kits[1].manifestSha256);
assert.equal(runtime.art.diverManifestSha256,kits[2].manifestSha256);
for (const kind of ['skitter','driller','wraith','golem']) for (const state of ['idle','walk','run','attack','hit','death']) assert.equal(runtime.art.actorStates[kind][state],true,kind+'/'+state);
for (const region of ['Diver Arrival','Upper Probability Mines','Mid Mines Rift','Collapsed Survey Tunnel',
  'Lower Extraction Works','Entanglement Echo Chamber','Probability Golem Foundry','Quantum Lift']) assert.ok(runtime.art.regions[region] > 0);
const captures = runtime.capture_ticks.map(tick=>join(native,'playground-'+String(tick).padStart(3,'0')+'.png'));
assert.equal(captures.length,24);
for (const path of captures) assert.ok(existsSync(path),'Missing native capture');
let video = null;
if (record) {
  run(ffmpeg,['-hide_banner','-loglevel','error','-i',avi,'-an','-c:v','libx264','-preset','fast','-crf','19',
    '-pix_fmt','yuv420p','-movflags','+faststart',mp4],'encode',90000);
  run(ffmpeg,['-hide_banner','-loglevel','error','-i',mp4,'-f','null','-'],'decode',90000);
  video = {path:mp4,sha256:digest(mp4),decoded:true,fps:60};
}
for (const source of sources) assert.equal(digest(join(repo,source.path)),source.sha256,'Source changed during review');
for (const kit of kits) {
  assert.equal(digest(join(kit.path,'manifest.json')),kit.manifestSha256);
  for (const [file,sha] of Object.entries(kit.manifest.hashes)) assert.equal(digest(join(kit.path,file)),sha);
}
const result = {output,sources,suites,runtime,captures,kits:kits.map(({manifest,...value})=>value),video,
  productionApproved:false,scope:runtime.scope};
writeFileSync(join(output,'verification.json'),JSON.stringify(result,null,2));
writeFileSync(join(reports,'mine-art-latest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({output,headlessChecks:suites.reduce((sum,value)=>sum+value.passed,0),waypoints:161,
  hp:76,floorChecks:23132,floorFailures:0,propChecks:480,propFailures:0,video:video?.path,productionApproved:false}));
