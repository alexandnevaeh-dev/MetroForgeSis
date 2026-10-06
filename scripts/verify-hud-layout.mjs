import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const base = resolve(process.argv[2]);
assert.match(base, /^E:[\\/]/i);
const project = join(base, 'games/stormglass-castle');
if (!process.argv.includes('--import')) {
  assert.ok(
    !existsSync(join(base, 'native-summary.json')),
    'Preserve completed run evidence; use a new candidate',
  );
  assert.ok(
    !existsSync(join(project, 'qa/hud-layout/proof.json')),
    'Preserve existing native proof',
  );
}
for (const dir of ['temp', 'appdata', 'localappdata'])
  mkdirSync(join(base, dir), { recursive: true });
const env = {
  ...process.env,
  TEMP: join(base, 'temp'),
  TMP: join(base, 'temp'),
  APPDATA: join(base, 'appdata'),
  LOCALAPPDATA: join(base, 'localappdata'),
};
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const args = process.argv.includes('--import')
  ? ['--headless', '--path', project, '--editor', '--import', '--quit']
  : [
      '--verbose',
      '--path',
      project,
      '--rendering-driver',
      'opengl3',
      '--audio-driver',
      'Dummy',
      '--position',
      '-10000,-10000',
      '--resolution',
      '1280x720',
      'res://scenes/test/HudLayoutValidation.tscn',
    ];
const child = spawn(godot, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
console.log(
  JSON.stringify({
    pid: child.pid,
    base,
    mode: process.argv.includes('--import') ? 'import' : 'controlled-hudLayout',
  }),
);
for (const pipe of [child.stdout, child.stderr])
  pipe.on('data', (chunk) => {
    const text = chunk.toString();
    log += text;
    writeFileSync(
      join(base, process.argv.includes('--import') ? 'import.log' : 'journey.log'),
      log,
    );
    for (const line of text.split(/\r?\n/))
      if (/HUD_LAYOUT_|Parse Error|SCRIPT ERROR|Using Device:/.test(line)) console.log(line);
  });
const watchdog = setTimeout(() => {
  console.error('Owned native journey timed out at 15 minutes');
  child.kill();
}, 900000);
const code = await new Promise((resolve) => {
  child.once('exit', resolve);
  child.once('error', (error) => {
    log += String(error);
    resolve(127);
  });
});
clearTimeout(watchdog);
const result = {
  code,
  base,
  scriptErrors: /Parse Error|SCRIPT ERROR/.test(log),
  nativeErrors: log.split(/\r?\n/).filter((line) => /^ERROR:/.test(line)),
  warnings: log.split(/\r?\n/).filter((line) => /^WARNING:/.test(line)),
  scope: process.argv.includes('--import')
    ? 'Headless syntax/cache import only'
    : 'Controlled actual HUD layout with explicitly seeded abilities; not gameplay traversal',
};
if (!process.argv.includes('--import')) {
  result.nvidia = /Using Device: NVIDIA - NVIDIA GeForce RTX 5060 Laptop GPU/.test(log);
  const proof = join(project, 'qa/hud-layout/proof.json');
  if (existsSync(proof)) result.hudLayout = JSON.parse(readFileSync(proof, 'utf8'));
}
writeFileSync(
  join(base, process.argv.includes('--import') ? 'import-summary.json' : 'native-summary.json'),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify({
    base,
    code,
    scriptErrors: result.scriptErrors,
    passed: result.hudLayout?.passed,
    steps: result.hudLayout?.outcome?.steps,
  }),
);
process.exitCode =
  code === 0 &&
  !result.scriptErrors &&
  result.nativeErrors.length === 0 &&
  (process.argv.includes('--import') ||
    (result.nvidia === true && result.hudLayout?.passed === true))
    ? 0
    : 1;
