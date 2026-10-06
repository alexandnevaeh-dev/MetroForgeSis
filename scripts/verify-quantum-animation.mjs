import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve('.');
const project = join(repo, 'prototypes/quantum-divergence');
const reports = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const candidate = resolve(option('candidate') || join(project, 'assets/diver-candidate-v1'));
const background = resolve(option('background') || join(project, 'assets/review-reference-v3/mine-wall.png'));
const record = process.argv.includes('--record');
const output = join(reports, 'diver-animation-' + Date.now());
for (const path of [repo, candidate, background, output]) assert.match(path, /^E:[/\\]/i, 'All inputs and evidence must reside on E:');
assert.ok(!existsSync(output));
mkdirSync(output, { recursive: true });
const env = { ...process.env, TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp',
  APPDATA: 'E:/MetroForgeData/AppData/QuantumGodot', LOCALAPPDATA: 'E:/MetroForgeData/AppData/QuantumGodotLocal' };
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const ffmpeg = 'E:/MetroForgeData/Runtime/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const paths = ['scripts/MaterialContact.gd', 'scripts/PlayerSimulation.gd', 'scripts/EnemySimulation.gd',
  'scripts/MicrocellGrid.gd', 'scripts/InstrumentSimulation.gd', 'scripts/SpriteClipPlayer.gd',
  'scripts/DiverAnimationReview.gd', 'tools/DiverRigBaker.gd', 'tests/ContactTests.gd',
  'tests/SpriteClipTests.gd', 'scenes/DiverAnimationReview.tscn'];
const sources = paths.map(path => ({ path: 'prototypes/quantum-divergence/' + path, sha256: digest(join(project, path)) }));
sources.push({ path: 'scripts/package-quantum-diver.py', sha256: digest(join(repo, 'scripts/package-quantum-diver.py')) });
sources.push({ path: 'scripts/verify-quantum-animation.mjs', sha256: digest(join(repo, 'scripts/verify-quantum-animation.mjs')) });
const manifestSha256 = digest(join(candidate, 'manifest.json'));
const backgroundSha256 = digest(background);

function run(executable, args, name, timeout = 90000) {
  const result = spawnSync(executable, args, { env, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 });
  const logs = String(result.stdout || '') + String(result.stderr || '');
  writeFileSync(join(output, name + '.log'), logs + (result.error ? '\n' + result.error : ''));
  assert.ifError(result.error);
  assert.equal(result.status, 0, name + ' did not finish successfully; evidence: ' + output);
  assert.ok(!/SCRIPT ERROR:|Parse Error:|Assertion failed|ANIMATION_REVIEW_TIMEOUT/.test(logs), name + ' contains native script failure');
  return logs;
}
const suites = [];
for (const [script, prefix, expected] of [['ContactTests.gd', 'QUANTUM_CONTACT_RESULTS ', 22],
  ['SpriteClipTests.gd', 'QUANTUM_SPRITE_CLIP_RESULTS ', 18]]) {
  const logs = run(godot, ['--headless', '--path', project, '--script', 'res://tests/' + script], script);
  const line = logs.split(/\r?\n/).find(value => value.startsWith(prefix));
  assert.ok(line, 'Suite result missing: ' + script);
  const result = JSON.parse(line.slice(prefix.length));
  assert.equal(result.failed, 0);
  assert.equal(result.passed, expected);
  suites.push({ script, ...result });
  console.log(JSON.stringify({ suite: script, passed: result.passed }));
}
const avi = join(output, 'native-diver-animation.avi');
const mp4 = join(output, 'quantum-diver-animation.mp4');
const native = join(output, 'native');
run(godot, ['--path', project, '--position', '-10000,-10000',
  ...(record ? ['--write-movie', avi, '--fixed-fps', '60', '--disable-vsync'] : []),
  'res://scenes/DiverAnimationReview.tscn', '--', '--candidate=' + candidate.replaceAll('\\', '/'),
  '--background=' + background.replaceAll('\\', '/'), '--capture-dir=' + native.replaceAll('\\', '/')], 'render', 150000);
const runtime = JSON.parse(readFileSync(join(native, 'animation-result.json'), 'utf8'));
assert.equal(runtime.ticks, 540);
assert.equal(Object.keys(runtime.checks).length, 10);
for (const [name, value] of Object.entries(runtime.checks)) assert.equal(value, true, name);
assert.equal(runtime.groundFailures, 0);
assert.deepEqual(runtime.groundFailureSamples, []);
assert.ok(runtime.groundChecks > 300);
assert.equal(runtime.shots, 3);
assert.match(runtime.renderDevice, /NVIDIA/i);
assert.equal(runtime.backgroundSha256, backgroundSha256);
assert.equal(runtime.sourceScriptSha256, digest(join(project, 'scripts/DiverAnimationReview.gd')));
assert.equal(runtime.captures.length, 4);
for (const path of runtime.captures) assert.ok(existsSync(path), 'Native capture missing');
let video = null;
if (record) {
  assert.ok(existsSync(ffmpeg));
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', avi, '-an', '-c:v', 'libx264', '-preset', 'fast',
    '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], 'encode', 60000);
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', mp4, '-f', 'null', '-'], 'decode', 60000);
  video = { path: mp4, sha256: digest(mp4), fps: 60, decoded: true };
}
for (const source of sources) assert.equal(digest(join(repo, source.path)), source.sha256, 'Source changed during review');
assert.equal(digest(join(candidate, 'manifest.json')), manifestSha256);
assert.equal(digest(background), backgroundSha256);
const result = { output, candidate, manifestSha256, background, backgroundSha256, sources, suites, runtime, video,
  productionApproved: false, completeCast: false, scope: runtime.scope };
writeFileSync(join(output, 'verification.json'), JSON.stringify(result, null, 2));
writeFileSync(join(reports, 'diver-animation-latest.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, passed: 50, floorChecks: runtime.groundChecks, floorFailures: 0, video: video?.path,
  scope: result.scope }));
