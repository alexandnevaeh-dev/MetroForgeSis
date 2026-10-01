import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repo = resolve('.');
const project = join(repo, 'prototypes/quantum-divergence');
const report = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const captures = join(report, 'combat-' + Date.now());
mkdirSync(captures, { recursive: true });
const env = { ...process.env, TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp',
  APPDATA: 'E:/MetroForgeData/AppData/QuantumGodot', LOCALAPPDATA: 'E:/MetroForgeData/AppData/QuantumGodotLocal' };
const sourcePaths = ['scripts/MicrocellGrid.gd', 'scripts/PlayerSimulation.gd', 'scripts/InstrumentSimulation.gd',
  'scripts/MinesProgression.gd', 'scripts/Playground.gd', 'scripts/ProgressionPlayground.gd',
  'scripts/EnemySimulation.gd', 'scripts/CombatPlayground.gd',
  'tests/SimulationTests.gd', 'tests/GameplayTests.gd', 'tests/ProgressionTests.gd', 'tests/EnemyTests.gd'];
const sources = sourcePaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(join(project, path))).digest('hex') }));
let output;
try {
  output = execFileSync('E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe',
    ['--path', project, '--position', '-10000,-10000', 'res://scenes/CombatPlayground.tscn', '--',
      '--smoke-test', '--capture-dir=' + captures], { env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
} catch (error) {
  writeFileSync(join(captures, 'runtime.log'), String(error.stdout || '') + String(error.stderr || ''));
  console.error('Native live combat failed; retained evidence: ' + captures);
  throw error;
}
writeFileSync(join(captures, 'runtime.log'), output);
const runtime = JSON.parse(readFileSync(join(captures, 'playground-result.json'), 'utf8'));
assert.ok(runtime.player_hp > 0);
assert.deepEqual(runtime.enemy_deaths, { '200': 'golem', '301': 'skitter', '302': 'wraith', '303': 'driller' });
for (const id of ['200', '301', '302', '303']) {
  assert.ok(runtime.enemy_attack_counts[id] >= 1, 'Family never exercised a live attack: ' + id);
  assert.ok(runtime.enemy_active_counts[id] >= 1, 'Family never reached its active attack: ' + id);
  assert.ok(runtime.actor_states[id].includes('death'));
}
for (const attack of ['slam', 'burst', 'roar']) {
  assert.ok(runtime.boss_attacks[attack] >= 1);
  assert.ok(runtime.boss_active[attack] >= 1);
}
for (const flag of ['anchor_upper', 'collapse_rift', 'golem_core', 'golem_defeated', 'secret_found', 'exit_ready', 'extracted']) {
  assert.equal(runtime.progression[flag], true, 'Route did not verify ' + flag);
}
assert.equal(runtime.progression.crystals_destroyed, 3);
assert.deepEqual(runtime.blueprints, ['entanglement']);
assert.equal(runtime.route_stage, 'complete');
assert.ok(runtime.target_hits['200'] >= 25);
const images = runtime.capture_ticks.map(tick => join(captures, 'playground-' + String(tick).padStart(3, '0') + '.png'));
assert.equal(images.length, 3);
for (const path of images) assert.ok(existsSync(path), 'Missing native GPU viewport');
const result = { runtime, captures, images, sources, scope: runtime.scope };
writeFileSync(join(report, 'combat-latest.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
