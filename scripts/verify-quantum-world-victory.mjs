import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repo = resolve('.');
const project = join(repo, 'prototypes/quantum-divergence');
const reports = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const output = join(reports, 'world-victory-' + Date.now());
mkdirSync(output, { recursive: true });
const env = { ...process.env, TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp',
  APPDATA: 'E:/MetroForgeData/AppData/QuantumGodot', LOCALAPPDATA: 'E:/MetroForgeData/AppData/QuantumGodotLocal' };
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const paths = ['scripts/MicrocellGrid.gd', 'scripts/ChunkedGrid.gd', 'scripts/MineWorld.gd', 'scripts/MineNavigator.gd',
  'scripts/WorldPlayground.gd', 'scripts/WorldRunDriver.gd', 'scripts/WorldVictoryPlayground.gd',
  'scripts/PlayerSimulation.gd', 'scripts/InstrumentSimulation.gd', 'scripts/EnemySimulation.gd',
  'scripts/MinesProgression.gd', 'scripts/Playground.gd', 'scripts/ProgressionPlayground.gd', 'scripts/CombatPlayground.gd',
  'tests/BranchTests.gd', 'scenes/WorldVictoryPlayground.tscn'];
const sources = paths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(join(project, path))).digest('hex') }));
function run(args, name, timeout = 300000) {
  try {
    const logs = execFileSync(godot, args, { env, windowsHide: true, encoding: 'utf8', timeout });
    writeFileSync(join(output, name + '.log'), logs);
    assert.ok(!/SCRIPT ERROR:|Parse Error:/.test(logs), 'Native script errors cannot count as a passed test');
    return logs;
  } catch (error) {
    writeFileSync(join(output, name + '-failed.log'), String(error.stdout || '') + String(error.stderr || '') + '\n' + String(error));
    console.error('World victory verification failed; retained evidence: ' + output);
    throw error;
  }
}
const branchLog = run(['--headless', '--path', project, '--script', 'res://tests/BranchTests.gd'], 'branches');
const line = branchLog.split(/\r?\n/).find(line => line.startsWith('QUANTUM_BRANCH_RESULTS '));
assert.ok(line, 'Branch result missing');
const branches = JSON.parse(line.slice('QUANTUM_BRANCH_RESULTS '.length));
assert.equal(branches.failed, 0);
assert.equal(branches.passed, 6);
console.log(JSON.stringify({ suite: 'branches', passed: branches.passed }));
run(['--path', project, '--position', '-10000,-10000', 'res://scenes/WorldVictoryPlayground.tscn', '--',
  '--smoke-test', '--capture-dir=' + output], 'render');
const runtime = JSON.parse(readFileSync(join(output, 'playground-result.json'), 'utf8'));
assert.equal(runtime.world.cells, 1382400);
assert.equal(runtime.world.rooms, 8);
assert.equal(runtime.world.recall_stations, 8, 'Every visited station must register through the real E action');
assert.ok(runtime.world.max_active_chunks <= 96);
assert.ok(runtime.world.max_work_cells <= 96 * 32 * 32);
assert.ok(runtime.player_hp > 0);
for (const key of ['anchor_upper', 'collapse_rift', 'golem_core', 'golem_defeated', 'secret_found', 'extracted', 'exit_ready']) {
  assert.equal(runtime.progression[key], true, 'Objective missing: ' + key);
}
assert.equal(runtime.progression.crystals_destroyed, 3);
assert.deepEqual(runtime.blueprints, ['entanglement']);
assert.deepEqual(runtime.enemy_deaths, { '200': 'golem', '301': 'skitter', '302': 'wraith', '303': 'driller' });
for (const id of ['200', '301', '302', '303']) assert.ok(runtime.enemy_active_counts[id] > 0, 'No actual attack from ' + id);
for (const attack of ['slam', 'burst', 'roar']) assert.ok(runtime.boss_active[attack] > 0, 'Missing boss active attack: ' + attack);
assert.deepEqual(runtime.target_hits, { '101': 2, '102': 2, '103': 2, '200': 25, '301': 2, '302': 3, '303': 4 });
assert.ok(runtime.shots >= 40);
assert.equal(runtime.full_route.failure, '');
assert.equal(runtime.full_route.reached, runtime.full_route.waypoints);
for (const id of ['echo', 'survey']) assert.deepEqual(runtime.full_route.branches[id], { outbound: true, returned: true });
for (const region of ['Diver Arrival', 'Upper Probability Mines', 'Mid Mines Rift', 'Collapsed Survey Tunnel',
  'Lower Extraction Works', 'Entanglement Echo Chamber', 'Probability Golem Foundry', 'Quantum Lift']) {
  assert.ok(runtime.full_route.regions.includes(region), 'Region not visited: ' + region);
}
const captures = runtime.capture_ticks.map(tick => join(output, 'playground-' + String(tick).padStart(3, '0') + '.png'));
assert.ok(captures.length >= 6);
for (const path of captures) assert.ok(existsSync(path), 'Missing native viewport capture: ' + path);
for (const source of sources) assert.equal(createHash('sha256').update(readFileSync(join(project, source.path))).digest('hex'), source.sha256);
const result = { output, runtime, branches, captures, sources, scope: runtime.scope };
writeFileSync(join(reports, 'world-victory-latest.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, ticks: runtime.ticks, hp: runtime.player_hp, shots: runtime.shots, route: runtime.full_route, scope: runtime.scope }));
