import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repo = resolve('.');
const project = join(repo, 'prototypes/quantum-divergence');
const report = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const captures = join(report, 'progression-' + Date.now());
mkdirSync(captures, { recursive: true });
const env = { ...process.env, TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp',
  APPDATA: 'E:/MetroForgeData/AppData/QuantumGodot', LOCALAPPDATA: 'E:/MetroForgeData/AppData/QuantumGodotLocal' };
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const sourcePaths = ['scripts/MicrocellGrid.gd', 'scripts/PlayerSimulation.gd', 'scripts/InstrumentSimulation.gd',
  'scripts/MinesProgression.gd', 'scripts/Playground.gd', 'scripts/ProgressionPlayground.gd',
  'tests/SimulationTests.gd', 'tests/GameplayTests.gd', 'tests/ProgressionTests.gd'];
const sources = sourcePaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(join(project, path))).digest('hex') }));
const output = execFileSync(godot, ['--path', project, '--position', '-10000,-10000',
  'res://scenes/ProgressionPlayground.tscn', '--', '--smoke-test', '--capture-dir=' + captures],
  { env, encoding: 'utf8', windowsHide: true, timeout: 90000 });
writeFileSync(join(captures, 'runtime.log'), output);
const runtime = JSON.parse(readFileSync(join(captures, 'playground-result.json'), 'utf8'));
assert.equal(runtime.shots, 33, '31 damaging shots plus two real material impacts');
assert.deepEqual(runtime.target_hits, { '101': 2, '102': 2, '103': 2, '200': 25 });
assert.equal(runtime.impacts, 2, 'The seeded fluid barrier must intercept the first two shots');
assert.deepEqual(runtime.impact_positions.map(point => point.map(value => Math.round(value))), [[532, 301], [532, 301]]);
assert.ok(runtime.player_hp > 0);
for (const flag of ['anchor_upper', 'collapse_rift', 'golem_core', 'golem_defeated', 'secret_found', 'exit_ready', 'extracted']) {
  assert.equal(runtime.progression[flag], true, 'Route did not verify ' + flag);
}
assert.equal(runtime.progression.crystals_destroyed, 3);
assert.deepEqual(runtime.blueprints, ['entanglement']);
assert.equal(runtime.route_stage, 'complete');
assert.equal(runtime.capture_ticks.length, 3);
const images = runtime.capture_ticks.map(tick => join(captures, 'playground-' + String(tick).padStart(3, '0') + '.png'));
for (const path of images) {
  assert.ok(existsSync(path), 'Missing actual GPU viewport capture');
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32BE(16), 960);
  assert.equal(bytes.readUInt32BE(20), 600);
}
const result = { runtime, captures, images, sources, scope: runtime.scope };
writeFileSync(join(report, 'progression-latest.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
