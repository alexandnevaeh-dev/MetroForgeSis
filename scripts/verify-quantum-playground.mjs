import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repo = resolve('.');
const project = join(repo, 'prototypes/quantum-divergence');
const report = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const captures = join(report, 'mechanics-' + Date.now());
mkdirSync(captures, { recursive: true });
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const env = { ...process.env, TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp',
  APPDATA: 'E:/MetroForgeData/AppData/QuantumGodot', LOCALAPPDATA: 'E:/MetroForgeData/AppData/QuantumGodotLocal' };
const results = [];
for (const [script, prefix, name] of [
  ['SimulationTests.gd', 'QUANTUM_SIMULATION_RESULTS ', 'simulation'],
  ['GameplayTests.gd', 'QUANTUM_GAMEPLAY_RESULTS ', 'gameplay'],
]) {
  const output = execFileSync(godot, ['--headless', '--path', project, '--script', 'res://tests/' + script],
    { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  writeFileSync(join(report, name + '.log'), output);
  const line = output.split(/\r?\n/).find(line => line.startsWith(prefix));
  assert.ok(line, name + ' did not return a result');
  const result = JSON.parse(line.slice(prefix.length));
  assert.equal(result.failed, 0);
  writeFileSync(join(report, name + '-results.json'), JSON.stringify(result, null, 2));
  results.push({ suite: name, passed: result.passed, failed: result.failed });
  console.log(JSON.stringify(results.at(-1)));
}
// Real GPU viewport, positioned offscreen; no injected desktop/browser input.
const output = execFileSync(godot, ['--path', project, '--position', '-10000,-10000', '--',
  '--smoke-test', '--capture-dir=' + captures], { env, encoding: 'utf8', windowsHide: true, timeout: 90000 });
writeFileSync(join(captures, 'runtime.log'), output);
const runtime = JSON.parse(readFileSync(join(captures, 'playground-result.json'), 'utf8'));
for (const tick of [60, 330, 425]) assert.ok(existsSync(join(captures, 'playground-' + String(tick).padStart(3, '0') + '.png')), 'Missing actual viewport capture ' + tick);
assert.equal(runtime.shots, 3);
assert.equal(runtime.recalls, 1);
assert.ok(runtime.player_hp > 0);
const result = { results, runtime, captures, scope: runtime.scope };
writeFileSync(join(report, 'mechanics-latest.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ runtime, captures }));
