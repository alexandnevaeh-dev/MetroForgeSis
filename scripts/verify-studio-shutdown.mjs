import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = resolve(process.argv[2]),
  base = resolve(process.argv[3]);
assert.match(base, /^E:[\\/]/i);
assert.ok(!existsSync(base), 'Use a fresh fixture root');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const results = [];
for (const withAudio of [true, false]) {
  const project = join(base, withAudio ? 'with-audio' : 'standalone');
  mkdirSync(project, { recursive: true });
  for (const name of ['StudioRuntimeBridge', ...(withAudio ? ['AudioManager'] : [])])
    cpSync(
      join(root, 'templates/godot-metroidvania/scripts/core', name + '.gd'),
      join(project, name + '.gd'),
    );
  if (withAudio) {
    const file = join(project, 'audio/music/boss.wav');
    mkdirSync(dirname(file), { recursive: true });
    cpSync(join(source, 'audio/music/boss.wav'), file);
  }
  writeFileSync(
    join(project, 'project.godot'),
    `config_version=5
[application]
config/name="Studio shutdown fixture"
run/main_scene="res://Probe.tscn"
[autoload]
StudioRuntimeBridge="*res://StudioRuntimeBridge.gd"
${withAudio ? 'AudioManager="*res://AudioManager.gd"' : ''}
[rendering]
renderer/rendering_method="gl_compatibility"
`,
  );
  writeFileSync(
    join(project, 'Probe.tscn'),
    '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://Probe.gd" id="1"]\n[node name="Probe" type="Node"]\nscript = ExtResource("1")\n',
  );
  writeFileSync(
    join(project, 'Probe.gd'),
    `extends Node
func _ready() -> void:
 var audio = get_node_or_null("/root/AudioManager")
 if audio:
  audio.play_music("boss")
  print("STUDIO_FIXTURE_MUSIC ", audio._music_player.playing)
 else:
  print("STUDIO_FIXTURE_STANDALONE")
`,
  );
  const env = {
    ...process.env,
    TEMP: join(base, 'temp'),
    TMP: join(base, 'temp'),
    APPDATA: join(project, 'appdata'),
    LOCALAPPDATA: join(project, 'localappdata'),
  };
  for (const path of [env.TEMP, env.APPDATA, env.LOCALAPPDATA])
    mkdirSync(path, { recursive: true });
  async function run(name, extraEnv = {}) {
    let log = '';
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        godot,
        [
          '--headless',
          '--audio-driver',
          'Dummy',
          '--verbose',
          '--path',
          project,
          ...(name === 'import' ? ['--editor', '--import', '--quit'] : []),
        ],
        { env: { ...env, ...extraEnv }, cwd: project, windowsHide: true },
      );
      child.stdout.on('data', (b) => (log += b));
      child.stderr.on('data', (b) => (log += b));
      child.once('error', reject);
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Owned Studio fixture timed out'));
      }, 30000);
      child.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    writeFileSync(join(project, name + '.log'), log);
    const diagnostics = log
      .split(/\r?\n/)
      .filter((line) => /^(ERROR:|SCRIPT ERROR:|WARNING:)|Leaked instance:/.test(line));
    assert.equal(code, 0);
    assert.deepEqual(diagnostics, []);
    return log;
  }
  await run('import');
  let authentications = 0,
    authError = '';
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    let buffer = '';
    socket.on('data', (bytes) => {
      buffer += bytes;
      if (!buffer.includes('\n')) return;
      const message = JSON.parse(buffer.split('\n')[0]);
      buffer = '';
      if (message.cmd !== 'auth' || message.token !== 'synthetic-studio-fixture') {
        authError = 'Unexpected fixture auth';
        socket.destroy();
        return;
      }
      authentications++;
      socket.write(JSON.stringify({ cmd: 'auth', ok: true }) + '\n');
      setTimeout(() => socket.end(), 500);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const log = await run('disconnect', {
      METROFORGE_STUDIO_BRIDGE: '1',
      METROFORGE_BRIDGE_TOKEN: 'synthetic-studio-fixture',
      METROFORGE_BRIDGE_PORT: String(server.address().port),
    });
    assert.equal(authentications, 1);
    assert.equal(authError, '');
    assert.ok(log.includes(withAudio ? 'STUDIO_FIXTURE_MUSIC true' : 'STUDIO_FIXTURE_STANDALONE'));
    results.push({
      withAudio,
      passed: true,
      authentications,
      nativeErrors: [],
      scope:
        'Actual loopback Studio auth/disconnect with production bridge; headless Dummy audio, no listening or visual claim',
    });
    console.log(JSON.stringify(results.at(-1)));
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}
writeFileSync(join(base, 'summary.json'), JSON.stringify({ passed: true, results }, null, 2));
