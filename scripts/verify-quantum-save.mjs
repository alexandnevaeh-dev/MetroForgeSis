import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repo = resolve('.');
const project = join(repo, 'prototypes/quantum-divergence');
const report = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const captures = join(report, 'save-control-' + Date.now());
mkdirSync(captures, { recursive: true });
const env = { ...process.env, TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp',
  APPDATA: 'E:/MetroForgeData/AppData/QuantumGodot', LOCALAPPDATA: 'E:/MetroForgeData/AppData/QuantumGodotLocal' };
const paths = ['scripts/MicrocellGrid.gd', 'scripts/MaterialContact.gd', 'scripts/PlayerSimulation.gd', 'scripts/InstrumentSimulation.gd',
  'scripts/MinesProgression.gd', 'scripts/EnemySimulation.gd', 'scripts/Playground.gd',
  'scripts/ProgressionPlayground.gd', 'scripts/CombatPlayground.gd', 'scripts/RunState.gd',
  'scripts/SaveStore.gd', 'scripts/RunSession.gd', 'scripts/SavePlayground.gd', 'tests/SaveTests.gd'];
const sources = paths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(join(project,path))).digest('hex') }));
let output;
try {
  output = execFileSync('E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe',
    ['--path', project, '--position', '-10000,-10000', 'res://scenes/SavePlayground.tscn', '--',
      '--smoke-test', '--capture-dir=' + captures], { env, encoding: 'utf8', windowsHide: true, timeout: 150000 });
} catch (error) {
  writeFileSync(join(captures,'runtime.log'),String(error.stdout || '') + String(error.stderr || ''));
  console.error('Save control failed; evidence retained: ' + captures);
  throw error;
}
writeFileSync(join(captures,'runtime.log'),output);
const runtime = JSON.parse(readFileSync(join(captures,'playground-result.json'),'utf8'));
assert.equal(runtime.save_phase,'complete');
assert.equal(Object.keys(runtime.save_checks).length,13);
for (const [name,passed] of Object.entries(runtime.save_checks)) assert.equal(passed,true,name);
assert.ok(runtime.death_tick > runtime.checkpoint_tick);
assert.equal(runtime.ticks,60);
assert.deepEqual(runtime.blueprints,['entanglement']);
const images = [9001,9003,9004].map(tick=>join(captures,'playground-' + tick + '.png'));
for (const path of images) assert.ok(existsSync(path),'Missing rendered save/death/restart proof');
const result = { runtime, captures, images, sources, scope: runtime.scope };
writeFileSync(join(report,'save-control-latest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
