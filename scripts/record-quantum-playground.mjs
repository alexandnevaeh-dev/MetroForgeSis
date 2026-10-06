import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repo = resolve('.');
const progression = process.argv.includes('--progression');
const combat = process.argv.includes('--combat');
const save = process.argv.includes('--save');
const world = process.argv.includes('--world');
const victory = process.argv.includes('--world-victory');
assert.ok(Number(progression) + Number(combat) + Number(save) + Number(world) + Number(victory) <= 1, 'Choose one recording scene');
const output = join(repo, 'reports/game-tests/20261001-quantum-divergence/' + (victory ? 'world-victory-recording-' : world ? 'world-recording-' : save ? 'save-recording-' : combat ? 'combat-recording-' : progression ? 'progression-recording-' : 'recording-') + Date.now());
mkdirSync(output, { recursive: true });
const env = { ...process.env, TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp',
  APPDATA: 'E:/MetroForgeData/AppData/QuantumGodot', LOCALAPPDATA: 'E:/MetroForgeData/AppData/QuantumGodotLocal' };
const avi = join(output, 'native-playground.avi');
const mp4 = join(output, victory ? 'quantum-mines-full-run.mp4' : world ? 'quantum-mines-world.mp4' : save ? 'quantum-save-restart.mp4' : combat ? 'quantum-combat.mp4' : progression ? 'quantum-progression.mp4' : 'quantum-mechanics.mp4');
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const ffmpeg = 'E:/MetroForgeData/Runtime/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
assert.ok(existsSync(ffmpeg), 'Use the already installed E: video runtime');
let runtimeOutput;
try { runtimeOutput = execFileSync(godot, ['--path', join(repo, 'prototypes/quantum-divergence'),
  '--position', '-10000,-10000', '--write-movie', avi, '--fixed-fps', '60', '--disable-vsync',
  ...(victory ? ['res://scenes/WorldVictoryPlayground.tscn'] : world ? ['res://scenes/WorldPlayground.tscn'] : save ? ['res://scenes/SavePlayground.tscn'] : combat ? ['res://scenes/CombatPlayground.tscn'] : progression ? ['res://scenes/ProgressionPlayground.tscn'] : []), '--',
  '--smoke-test', '--capture-dir=' + output], { env, encoding: 'utf8', windowsHide: true, timeout: victory ? 300000 : 150000 });
} catch (error) {
  writeFileSync(join(output, 'recording-failed.log'), String(error.stdout || '') + String(error.stderr || '') + '\n' + String(error));
  throw error;
}
writeFileSync(join(output, 'recording.log'), runtimeOutput);
const runtime = JSON.parse(readFileSync(join(output, 'playground-result.json'), 'utf8'));
if (victory) {
  assert.equal(runtime.world.cells,1382400);
  assert.equal(runtime.progression.extracted,true);
  assert.equal(runtime.progression.secret_found,true);
  assert.ok(runtime.player_hp > 0);
  assert.equal(runtime.full_route.reached,runtime.full_route.waypoints);
  assert.equal(runtime.world.recall_stations,8);
  for (const id of ['echo','survey']) assert.deepEqual(runtime.full_route.branches[id],{outbound:true,returned:true});
  for (const id of ['200','301','302','303']) assert.ok(runtime.enemy_active_counts[id] > 0);
  for (const attack of ['slam','burst','roar']) assert.ok(runtime.boss_active[attack] > 0);
} else if (world) {
  assert.equal(runtime.world.cells,1382400);
  assert.equal(runtime.progression.anchor_upper,true);
  assert.ok(runtime.player_hp > 0);
  assert.ok(runtime.world.visited_waypoints >= 16);
} else if (save) {
  assert.equal(runtime.save_phase, 'complete');
  assert.equal(Object.keys(runtime.save_checks).length, 13);
  for (const passed of Object.values(runtime.save_checks)) assert.equal(passed, true);
  assert.ok(runtime.death_tick > runtime.checkpoint_tick);
  assert.deepEqual(runtime.blueprints, ['entanglement']);
} else if (combat) {
  assert.equal(runtime.progression.extracted, true);
  assert.ok(runtime.player_hp > 0);
  assert.deepEqual(runtime.enemy_deaths, { '200': 'golem', '301': 'skitter', '302': 'wraith', '303': 'driller' });
  for (const attack of ['slam', 'burst', 'roar']) assert.ok(runtime.boss_attacks[attack] > 0);
} else if (progression) {
  assert.equal(runtime.shots, 33);
  assert.deepEqual(runtime.target_hits, { '101': 2, '102': 2, '103': 2, '200': 25 });
  assert.equal(runtime.progression.extracted, true);
} else {
  assert.equal(runtime.shots, 3);
  assert.equal(runtime.recalls, 1);
}
execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', avi, '-an', '-c:v', 'libx264',
  '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
  { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
assert.ok(existsSync(mp4));
execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', mp4, '-f', 'null', '-'],
  { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
const result = { output, avi, mp4, fps: 60, scope: 'Actual native viewport recording with scripted prototype controls; not final sprite animation approval or app-generated game evidence', runtime };
writeFileSync(join(repo, 'reports/game-tests/20261001-quantum-divergence/' + (victory ? 'world-victory-recording-latest.json' : world ? 'world-recording-latest.json' : save ? 'save-recording-latest.json' : combat ? 'combat-recording-latest.json' : progression ? 'progression-recording-latest.json' : 'recording-latest.json')), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ mp4, scope: result.scope }));
