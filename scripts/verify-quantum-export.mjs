/** Native standalone export: copied binaries/PCK only, separate working folder and full gameplay. */
import assert from 'node:assert/strict';
import { assembleQuantumProject } from '../packages/godot/dist/index.js';
import { exportGodotWindowsBinary } from '../packages/tools/dist/index.js';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const repo = resolve('.');
const output = join(repo, 'reports/game-tests/20261003-quantum-export/candidate-' + Date.now());
const project = join(output, 'project');
const portable = join(output, 'portable');
const proof = { output, checks: [], productionReady: false };
const check = (label, value) => { proof.checks.push({ label, passed: !!value }); assert.ok(value, label); };
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
mkdirSync(portable, { recursive: true });
Object.assign(process.env, { METROFORGE_RESOURCE_ROOT: repo, METROFORGE_GODOT_APPDATA: 'E:/MetroForgeData/AppData/Roaming', METROFORGE_GODOT_LOCALAPPDATA: 'E:/MetroForgeData/AppData/Local', TEMP: 'E:/MetroForgeData/Temp', TMP: 'E:/MetroForgeData/Temp', APPDATA: 'E:/MetroForgeData/AppData/Roaming', LOCALAPPDATA: 'E:/MetroForgeData/AppData/Local' });
async function native(exe, args, log, timeout = 240000) {
  return new Promise((accept, reject) => {
    const child = spawn(exe, args, { cwd: portable, env: process.env, windowsHide: true });
    let logs = ''; let failure;
    const timer = setTimeout(() => { failure = new Error('Native export test timed out'); child.kill(); }, timeout);
    child.stdout.on('data', data => { logs += data.toString(); }); child.stderr.on('data', data => { logs += data.toString(); });
    child.on('error', error => { failure = error; });
    child.on('close', code => {
      clearTimeout(timer); writeFileSync(join(output, log), logs);
      if (failure || code !== 0 || /SCRIPT ERROR:|Parse Error:|Assertion failed|ERROR:/.test(logs)) reject(failure ?? new Error('Native export test failed: ' + log));
      else accept(logs);
    });
  });
}
try {
  const assembly = assembleQuantumProject({ outputDir: project, resourceRoot: repo, spec: { version: 1, archetype: 'QUANTUM_SIMULATION_ROGUELITE', title: 'Quantum Portable Expedition', prompt: 'Stabilize and extract from the Probability Mines.', seed: 0, biome: 'probability-mines', candidateOnly: true, productionApproved: false } });
  proof.assembly = assembly;
  const exported = exportGodotWindowsBinary({ projectPath: project, godotExecutable: 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe', outputExePath: join(output, 'build/game.exe') });
  writeFileSync(join(output, 'export.json'), JSON.stringify(exported, null, 2));
  check('real Windows release export succeeded', exported.success);
  check('export plugin verified and packed original runtime bytes', exported.stdout.includes('QUANTUM_PACKAGE_VERIFIED '));
  for (const name of ['game.exe', 'game.pck', 'game.console.exe', 'game_console.exe']) if (existsSync(join(output, 'build', name))) cpSync(join(output, 'build', name), join(portable, name));
  const executable = ['game.console.exe', 'game_console.exe', 'game.exe'].find(name => existsSync(join(portable, name)));
  proof.portableFiles = readdirSync(portable).map(name => ({ name, sha256: sha(join(portable, name)) }));
  check('portable folder contains only executable, optional console wrapper and PCK', proof.portableFiles.length >= 2 && proof.portableFiles.every(file => /^game(?:\.console|_console)?\.exe$|^game\.pck$/.test(file.name)));
  const logs = await native(join(portable, executable), ['--headless', '--', '--generation-layout-only'], 'layout.log', 90000);
  const line = logs.split(/\r?\n/).find(value => value.startsWith('QUANTUM_GENERATED_LAYOUT '));
  check('copied standalone executable builds its own native world', !!line);
  const layout = JSON.parse(line.slice('QUANTUM_GENERATED_LAYOUT '.length));
  proof.layout = layout;
  check('release template confirms standalone feature', layout.package.standalone && layout.package.release);
  check('all original template files survive in the PCK unchanged', layout.package.integrity && layout.package.files === assembly.files - 2 && layout.package.template_sha256 === assembly.templateSha256);
  check('seed zero and eight connected regions reach portable runtime', layout.seed === 0 && layout.worldGraph.nodes.length === 8 && layout.worldGraph.edges.length === 7);
  const captures = join(output, 'gameplay');
  console.log(JSON.stringify({ stage: 'standalone-gameplay-running', output, files: proof.portableFiles.map(file => file.name) }));
  await native(join(portable, executable), ['--position', '-10000,-10000', '--', '--smoke-test', '--capture-dir=' + captures.replaceAll('\\', '/')], 'gameplay.log');
  const runtime = JSON.parse(readFileSync(join(captures, 'playground-result.json'), 'utf8'));
  proof.runtime = runtime;
  check('portable game completed all 161 waypoints and extracted alive', runtime.world.visited_waypoints === 161 && runtime.progression.extracted && runtime.player_hp > 0 && runtime.full_route.failure === '');
  check('portable game visited both optional branches', ['survey', 'echo'].every(id => runtime.full_route.branches[id].outbound && runtime.full_route.branches[id].returned));
  check('portable game retains configuration and terrain fingerprints', runtime.generation.configuration_sha256 === assembly.configSha256 && runtime.generation.initial_terrain_sha256 === layout.initial_terrain_sha256 && runtime.generation.entry_script_sha256 === sha(join(project, 'scripts/GeneratedMines.gd')));
  check('portable matching artwork passes floor and prop contacts', runtime.art.integrity && runtime.art.floorFailures === 0 && runtime.art.propFailures === 0 && runtime.art.propChecks === 480);
  check('all enemy families keep six animation states', ['skitter','driller','wraith','golem'].every(kind => ['idle','walk','run','attack','hit','death'].every(state => runtime.art.actorStates[kind]?.[state] === true)));
  check('portable native runtime produced its 24 actual captures', readdirSync(captures).filter(name => name.endsWith('.png')).length === 24);
  proof.sourceHashes = Object.fromEntries(['packages/godot/src/quantum-assembler.ts','scripts/package-quantum-runtime.mjs','scripts/verify-quantum-export.mjs','templates/godot-quantum-divergence/quantum-template.json'].map(file => [file, sha(join(repo, file))]));
  proof.passed = true;
} catch (error) { proof.passed = false; proof.error = String(error.stack ?? error); process.exitCode = 1; }
writeFileSync(join(output, 'proof.json'), JSON.stringify(proof, null, 2));
writeFileSync(join(repo, 'reports/game-tests/20261003-quantum-export/latest.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify({ passed: proof.passed, checks: proof.checks.length, output, error: proof.error }));
