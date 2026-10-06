/** Visible native input QA. All logs/cache paths are E: and earlier runs are preserved. */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const game = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
assert.ok(process.argv[2] && process.argv[3]);
assert.match(game, /^E:[\\/]/i);
assert.match(output, /^E:[\\/]/i);
assert.ok(!existsSync(output), 'Use a fresh evidence directory');
assert.ok(existsSync(join(game, 'scenes/test/CastleRoomFamilyInput.tscn')));
for (const directory of ['', 'temp', 'appdata', 'localappdata']) mkdirSync(join(output, directory), { recursive: true });
const proofPath = join(game, 'qa/castle-room-family-input/proof.json');
if (existsSync(proofPath)) copyFileSync(proofPath, join(output, 'previous-proof.json'));
const started = Date.now();
const args = ['--verbose', '--path', game, '--rendering-driver', 'opengl3', '--audio-driver', 'Dummy', '--position', '80,80', 'res://scenes/test/CastleRoomFamilyInput.tscn', '--'];
if (process.argv.includes('--stairs')) args.push('--stairs');
const child = spawn('E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe', args, {
  windowsHide: true,
  env: { ...process.env, TEMP: join(output, 'temp'), TMP: join(output, 'temp'), APPDATA: join(output, 'appdata'), LOCALAPPDATA: join(output, 'localappdata') },
});
let log = '';
for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => {
  log += chunk.toString();
  writeFileSync(join(output, 'native.log'), log);
});
const timeout = setTimeout(() => child.kill(), 180000);
const code = await new Promise(resolveCode => {
  child.once('exit', resolveCode);
  child.once('error', error => { log += String(error); resolveCode(127); });
});
clearTimeout(timeout);
let proof = null;
if (existsSync(proofPath)) {
  proof = JSON.parse(readFileSync(proofPath, 'utf8'));
  copyFileSync(proofPath, join(output, 'proof.json'));
}
const errors = log.split(/\r?\n/).filter(line => /^ERROR:/.test(line));
const warnings = log.split(/\r?\n/).filter(line => /^WARNING:/.test(line));
const expected = process.argv.includes('--stairs') ? 104 : 40;
const freshProof = existsSync(proofPath) && statSync(proofPath).mtimeMs >= started;
const passed = freshProof && code === 0 && !/Parse Error|SCRIPT ERROR/.test(log) && proof?.passed === true && proof.checks.length === expected;
const report = { passed, freshProof, code, checks: proof?.checks.length, errors, warnings, durationMs: Date.now() - started, game, scope: proof?.scope, nativeLogClean: errors.length === 0 && warnings.length === 0 };
writeFileSync(join(output, 'summary.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
process.exitCode = passed ? 0 : 1;
