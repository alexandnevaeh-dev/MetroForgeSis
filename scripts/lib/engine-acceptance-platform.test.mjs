import assert from 'node:assert/strict';
import { nativeBuildPlan, playtestPassed, freshCaptureEvidence } from './engine-acceptance-platform.mjs';

for (const [platform, binary, suffix, method] of [
  ['win32', '/engines/UE/Engine/Binaries/Win64/UnrealEditor.exe', 'BatchFiles/Build.bat', 'BuildWindows'],
  ['darwin', '/engines/UE/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor', 'BatchFiles/Mac/Build.sh', 'BuildMacOS'],
  ['linux', '/engines/UE/Engine/Binaries/Linux/UnrealEditor', 'BatchFiles/Linux/Build.sh', 'BuildLinux'],
]) {
  const plan = nativeBuildPlan(platform, binary, '/games/test');
  assert.equal(plan.command.replaceAll('\\', '/'), `/engines/UE/Engine/Build/${suffix}`);
  assert.equal(plan.unityMethod, method);
  assert.equal(plan.args[0], 'MetroForgeGameEditor');
}
assert.throws(() => nativeBuildPlan('unknown', '', ''), /Unsupported/);
assert.equal(playtestPassed(0, null, 100), false, 'Exit zero without evidence cannot pass');
assert.equal(playtestPassed(0, { data: { status: 'PASS' }, modifiedAt: 99 }, 100), false, 'Stale evidence cannot pass');
assert.equal(playtestPassed(1, { data: { status: 'PASS' }, modifiedAt: 101 }, 100), false, 'Failed process cannot pass');
assert.equal(playtestPassed(0, { data: { status: 'FAIL' }, modifiedAt: 101 }, 100), false);
assert.equal(playtestPassed(0, { data: { status: 'PASS' }, modifiedAt: 101 }, 100), true);
console.log('PASS: platform build plans and five playtest evidence cases');

const { mkdtempSync, mkdirSync, writeFileSync, utimesSync } = await import('node:fs');
const { join } = await import('node:path');
const { tmpdir } = await import('node:os');
const fixture = mkdtempSync(join(tmpdir(), 'metroforge-capture-evidence-'));
const captureRoot = join(fixture, 'captures');
mkdirSync(captureRoot);
const capture = join(captureRoot, 'play.png');
const png = Buffer.alloc(24);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.write('IHDR', 12); png.writeUInt32BE(16, 16); png.writeUInt32BE(16, 20);
writeFileSync(capture, png);
const startedAt = Date.now() - 1000;
const evidence = (captures) => ({ modifiedAt: Date.now(), data: { captures } });
assert.equal(freshCaptureEvidence(null, startedAt, captureRoot), false);
assert.equal(freshCaptureEvidence(evidence([]), startedAt, captureRoot), false);
assert.equal(freshCaptureEvidence(evidence([capture]), startedAt, captureRoot), true);
assert.equal(freshCaptureEvidence({ ...evidence([capture]), modifiedAt: startedAt - 1 }, startedAt, captureRoot), false);
assert.equal(freshCaptureEvidence(evidence([join(captureRoot, 'missing.png')]), startedAt, captureRoot), false);
const outside = join(fixture, 'outside.png'); writeFileSync(outside, png);
assert.equal(freshCaptureEvidence(evidence([outside]), startedAt, captureRoot), false);
writeFileSync(capture, 'not an image');
assert.equal(freshCaptureEvidence(evidence([capture]), startedAt, captureRoot), false);
writeFileSync(capture, png); utimesSync(capture, new Date(0), new Date(0));
assert.equal(freshCaptureEvidence(evidence([capture]), startedAt, captureRoot), false);
console.log('PASS: fresh capture evidence rejects empty, stale, missing, outside and invalid captures');

const { gameplayComplete } = await import('./engine-acceptance-platform.mjs');
const allFeatures = Object.fromEntries(['traversal', 'containment', 'combat', 'abilities', 'gates',
  'npc_interaction', 'save_continue', 'respawn', 'boss_phases', 'victory'].map(key => [key, 'passed']));
assert.equal(gameplayComplete({features: allFeatures, notImplemented: []}), true);
for (const value of ['partial', 'pending', 'inconclusive', 'not_implemented', 'failed']) {
  assert.equal(gameplayComplete({features: {...allFeatures, combat: value}, notImplemented: []}), false);
}
assert.equal(gameplayComplete({features: allFeatures, notImplemented: ['boss phases']}), false);
assert.equal(gameplayComplete({features: {...allFeatures, combat_kill: 'failed'}, notImplemented: []}), false);
assert.equal(gameplayComplete({features: {}, notImplemented: []}), false);
assert.equal(gameplayComplete(null), false);
console.log('PASS: complete gameplay requires all required and reported features with no unimplemented work');
