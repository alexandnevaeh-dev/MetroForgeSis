import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = resolve(process.argv[2]);
const base = resolve(process.argv[3]);
assert.match(base, /^E:[\\/]/i);
assert.ok(!existsSync(base), 'Preserve completed evidence; use a new fixture root');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const results = [];
async function run(project, name, args) {
  let log = '';
  const env = {
    ...process.env,
    TEMP: join(base, 'temp'),
    TMP: join(base, 'temp'),
    APPDATA: join(project, 'appdata'),
    LOCALAPPDATA: join(project, 'localappdata'),
  };
  for (const path of [env.TEMP, env.APPDATA, env.LOCALAPPDATA])
    mkdirSync(path, { recursive: true });
  const code = await new Promise((resolve, reject) => {
    const child = spawn(godot, args, { cwd: project, env, windowsHide: true });
    child.stdout.on('data', (b) => (log += b));
    child.stderr.on('data', (b) => (log += b));
    child.once('error', reject);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Owned fixture exceeded 120s'));
    }, 120000);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  writeFileSync(join(project, name + '.log'), log);
  const errors = log
    .split(/\r?\n/)
    .filter((line) => /^(ERROR:|SCRIPT ERROR:|WARNING:)|Leaked instance:/.test(line));
  const result = { name, code, errors, passed: code === 0 && errors.length === 0 };
  if (name === 'run') {
    const proof = join(project, 'audio-proof.json');
    result.proof = existsSync(proof) ? JSON.parse(readFileSync(proof, 'utf8')) : null;
    result.passed = result.passed && result.proof?.passed === true;
  }
  results.push({ project, ...result });
  console.log(
    JSON.stringify({
      project,
      name,
      code,
      passed: result.passed,
      checks: result.proof?.checks?.length,
      errors,
    }),
  );
  assert.equal(result.passed, true, 'Native audio lifecycle failed; see retained log');
}
for (const mode of ['request-quit', 'paused-close']) {
  const project = join(base, mode);
  mkdirSync(project, { recursive: true });
  for (const path of [
    'scripts/core/AudioManager.gd',
    'scripts/test/AudioLifecycleValidation.gd',
    'scenes/test/AudioLifecycleValidation.tscn',
  ]) {
    mkdirSync(dirname(join(project, path)), { recursive: true });
    cpSync(join(root, 'templates/godot-metroidvania', path), join(project, path));
  }
  for (const path of ['audio/music/boss.wav', 'audio/sfx/hit.wav']) {
    mkdirSync(dirname(join(project, path)), { recursive: true });
    cpSync(join(source, path), join(project, path));
  }
  writeFileSync(
    join(project, 'project.godot'),
    `config_version=5
[application]
config/name="MetroForge audio lifecycle"
run/main_scene="res://scenes/test/AudioLifecycleValidation.tscn"
[autoload]
AudioManager="*res://scripts/core/AudioManager.gd"
[rendering]
renderer/rendering_method="gl_compatibility"
`,
  );
  await run(project, 'import', ['--headless', '--path', project, '--editor', '--import', '--quit']);
  await run(project, 'run', [
    '--headless',
    '--audio-driver',
    'Dummy',
    '--verbose',
    '--path',
    project,
    '--',
    ...(mode === 'paused-close' ? ['--paused-close'] : []),
  ]);
}
writeFileSync(join(base, 'summary.json'), JSON.stringify({ passed: true, results }, null, 2));
