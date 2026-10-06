import assert from 'node:assert/strict';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runRuntimeGateAsync } from '../packages/qa/dist/index.js';

const repo = resolve('.');
const source = resolve(process.argv[2] || 'GeneratedGames/AppInAction/canopy-first-light-live');
const base = resolve(process.argv[3] || 'E:/MetroForgeData/TestArtifacts/app-generated-QA-20261001');
assert.match(base, /^E:[\\/]/i);
assert.ok(existsSync(join(source, 'generation_events.jsonl')), 'Input must be an actual generated project');
const fixture = join(base, basename(source) + '-capture-' + Date.now());
const report = join(fixture, 'control-results');
const sourceEvents = readFileSync(join(source, 'generation_events.jsonl'));
cpSync(source, fixture, { recursive: true, filter: path => !/[\\/](\.godot|\.qa|qa|checkpoints)([\\/]|$)/.test(path) });
mkdirSync(report, { recursive: true });
copyFileSync(join(repo, 'templates/godot-topdown-adventure/scripts/test/RuntimeSmokeTest.gd'),
  join(fixture, 'scripts/test/RuntimeSmokeTest.gd'));
const godot = process.env.GODOT_EXECUTABLE || 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const userDataDir = join(fixture, 'isolated-user-data');
process.env.METROFORGE_RESOURCE_ROOT = repo;
let heartbeats = 0;
const timer = setInterval(() => { heartbeats++; }, 50);
const gates = [];
try {
  for (const [method, args] of [
    ['validateGodotHeadless', [godot, fixture, { userDataDir }]],
    ['validateGodotRuntime', [godot, fixture, { userDataDir }]],
  ]) {
    const gate = await runRuntimeGateAsync(method, args);
    gates.push(gate);
    console.log(JSON.stringify({ gate: gate.gate, passed: gate.passed, message: gate.message }));
  }
  const runtime = gates.find(gate => gate.gate === 'godot_runtime');
  const capture = await runRuntimeGateAsync('validateGameplayScreenshot', [fixture,
    { godotPath: godot, headlessOutput: String(runtime?.details?.output || ''), userDataDir, required: true }]);
  gates.push(capture);
  console.log(JSON.stringify({ gate: capture.gate, passed: capture.passed, message: capture.message }));
} finally {
  clearInterval(timer);
  const result = { fixture, source, scope: 'Isolated capture regression on an existing app-generated game; not a fresh app generation or a visual approval',
    originalEventsUnchanged: readFileSync(join(source, 'generation_events.jsonl')).equals(sourceEvents),
    heartbeats, gates };
  writeFileSync(join(report, 'result.json'), JSON.stringify(result, null, 2));
  writeFileSync(join(repo, 'reports/game-tests/20261001-canopy-depth/app-capture-control-location.json'),
    JSON.stringify({ fixture, result: join(report, 'result.json'), screenshot: join(fixture, 'qa/screenshot_gameplay.png') }, null, 2));
  console.log(JSON.stringify({ fixture, heartbeats, originalEventsUnchanged: result.originalEventsUnchanged }));
}
assert.ok(heartbeats > 20, 'Caller must remain responsive while real engine checks execute');
assert.ok(gates.every(gate => gate.passed), 'Native capture regression failed; inspect retained evidence');
assert.ok(existsSync(join(fixture, 'qa/screenshot_gameplay.png')));
console.log('PASS: actual app-generated fixture imports, runs, captures pixels, and keeps the caller responsive');
