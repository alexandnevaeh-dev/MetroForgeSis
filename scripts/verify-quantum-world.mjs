import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync,readFileSync,writeFileSync,existsSync } from 'node:fs';
import { resolve,join } from 'node:path';
const repo = resolve('.');
const project = join(repo,'prototypes/quantum-divergence');
const report = join(repo,'reports/game-tests/20261001-quantum-divergence');
const captures = join(report,'world-' + Date.now());
mkdirSync(captures,{recursive:true});
const env = {...process.env,TEMP:'E:/MetroForgeData/Temp',TMP:'E:/MetroForgeData/Temp',APPDATA:'E:/MetroForgeData/AppData/QuantumGodot',LOCALAPPDATA:'E:/MetroForgeData/AppData/QuantumGodotLocal'};
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const paths = ['scripts/ChunkedGrid.gd','scripts/MineWorld.gd','scripts/MineNavigator.gd','scripts/WorldPlayground.gd',
  'scripts/MicrocellGrid.gd','scripts/PlayerSimulation.gd','scripts/EnemySimulation.gd','scripts/InstrumentSimulation.gd',
  'scripts/MinesProgression.gd','scripts/Playground.gd','scripts/ProgressionPlayground.gd','scripts/CombatPlayground.gd','tests/ChunkTests.gd','tests/WorldTests.gd'];
const sources = paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(join(project,path))).digest('hex')}));
const suites = [];
function run(args,name,timeout = 180000) {
  try {
    const output = execFileSync(godot,args,{env,encoding:'utf8',windowsHide:true,timeout});
    writeFileSync(join(captures,name + '.log'),output);
    return output;
  } catch(error) {
    writeFileSync(join(captures,name + '.log'),String(error.stdout || '') + String(error.stderr || ''));
    console.error('World verification failed; retained evidence: ' + captures);
    throw error;
  }
}
for (const [script,prefix,name] of [['ChunkTests.gd','QUANTUM_CHUNK_RESULTS ','chunk'],['WorldTests.gd','QUANTUM_WORLD_RESULTS ','world']]) {
  const output = run(['--headless','--path',project,'--script','res://tests/' + script],name);
  const line = output.split(/\r?\n/).find(line=>line.startsWith(prefix));
  assert.ok(line,name + ' result missing');
  const result = JSON.parse(line.slice(prefix.length));
  assert.equal(result.failed,0);
  suites.push({suite:name,...result});
  console.log(JSON.stringify({suite:name,passed:result.passed,steps:result.steps}));
}
run(['--path',project,'--position','-10000,-10000','res://scenes/WorldPlayground.tscn','--','--smoke-test','--capture-dir=' + captures],'render');
const runtime = JSON.parse(readFileSync(join(captures,'playground-result.json'),'utf8'));
assert.equal(runtime.world.cells,1382400);
assert.deepEqual(runtime.world.pixels,[5760,3840]);
assert.equal(runtime.world.rooms,8);
assert.ok(runtime.world.max_active_chunks <= 96);
assert.equal(runtime.progression.anchor_upper,true);
assert.ok(runtime.player_hp > 0);
assert.ok(runtime.world.visited_waypoints >= 16);
assert.ok(runtime.world.recall_stations >= 2,'Standing at a station must not reject the player as its own blocker');
const images = [60,240,480].map(tick=>join(captures,'playground-' + String(tick).padStart(3,'0') + '.png'));
for (const path of images) assert.ok(existsSync(path),'Missing actual world viewport');
const result = {runtime,suites,captures,images,sources,scope:runtime.scope};
writeFileSync(join(report,'world-latest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({captures,runtime}));
