import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const repo = resolve('.');
const output = join(repo, 'reports/game-tests/20261001-quantum-divergence/recording-' + Date.now());
mkdirSync(output, { recursive: true });
const env = { ...process.env, TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp',
  APPDATA: 'E:/MetroForgeData/AppData/QuantumGodot', LOCALAPPDATA: 'E:/MetroForgeData/AppData/QuantumGodotLocal' };
const avi = join(output, 'native-playground.avi');
const mp4 = join(output, 'quantum-mechanics.mp4');
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const ffmpeg = 'E:/MetroForgeData/Runtime/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
assert.ok(existsSync(ffmpeg), 'Use the already installed E: video runtime');
const runtimeOutput = execFileSync(godot, ['--path', join(repo, 'prototypes/quantum-divergence'),
  '--position', '-10000,-10000', '--write-movie', avi, '--fixed-fps', '60', '--disable-vsync', '--',
  '--smoke-test', '--capture-dir=' + output], { env, encoding: 'utf8', windowsHide: true, timeout: 90000 });
writeFileSync(join(output, 'recording.log'), runtimeOutput);
const runtime = JSON.parse(readFileSync(join(output, 'playground-result.json'), 'utf8'));
assert.equal(runtime.shots, 3);
assert.equal(runtime.recalls, 1);
execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', avi, '-an', '-c:v', 'libx264',
  '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
  { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
assert.ok(existsSync(mp4));
const result = { output, avi, mp4, fps: 60, scope: 'Actual native viewport recording with scripted prototype controls; not final sprite animation approval or app-generated game evidence', runtime };
writeFileSync(join(repo, 'reports/game-tests/20261001-quantum-divergence/recording-latest.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ mp4, scope: result.scope }));
