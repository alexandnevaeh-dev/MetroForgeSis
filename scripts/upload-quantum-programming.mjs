/** Publish the bounded programming feature from a tested E: snapshot, preserving the working index. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const canonical = resolve('.');
const report = join(canonical, 'reports/game-tests/20261003-quantum-programming-publication');
const review = JSON.parse(readFileSync(join(report, 'latest.json'), 'utf8'));
assert.equal(review.parent, 'c65dfee26b08b27f47593a79dfb0af5b44d6db3e');
assert.equal(review.status, 'ready-for-build');
assert.deepEqual(review.conflicts, []);
assert.match(review.tree, /^E:[/\\]/i);
const root = review.tree;
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const load = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const ui = load('reports/game-tests/20261002-quantum-create-ui/latest.json');
const backend = load('reports/game-tests/20261001-quantum-divergence/generation-latest.json');
const native = load('reports/game-tests/20261003-quantum-programming/latest.json');
const packaged = load('reports/game-tests/20261003-quantum-programming/packaged-latest.json');
const unit = load('reports/quantum-programming-unit-tests.json');
assert.equal(ui.passed, true);
assert.equal(ui.checks.length, 25);
assert.ok(ui.checks.every(check => check.passed));
assert.equal(backend.checks.length, 35);
assert.ok(backend.checks.every(check => check.passed));
assert.equal(unit.success, true);
assert.equal(unit.numPassedTests, 35);
assert.equal(unit.numFailedTests, 0);
assert.equal(native.passed, true);
assert.equal(native.reusedUnits, undefined, 'This publication requires fresh native suites');
assert.deepEqual(native.suites.map(suite => suite.name), ['Simulation','Gameplay','Contact','Progression','Enemy','Save','Chunk','Programming']);
assert.equal(native.suites.reduce((sum, suite) => sum + suite.passed, 0), 259);
assert.ok(native.suites.every(suite => suite.failed === 0));
assert.equal(native.workbench.passed, 21);
assert.equal(native.workbench.failed, 0);
assert.equal(packaged.passed, true);
assert.equal(packaged.project, ui.generatedProject);
assert.equal(packaged.runtime.passed, 22);
assert.equal(packaged.runtime.failed, 0);
for (const proof of [ui, native, packaged]) for (const [file, hash] of Object.entries(proof.sourceHashes)) {
  assert.equal(sha(join(root, file)), hash, 'Changed verified source: ' + file);
}
for (const entry of backend.sources) assert.equal(sha(join(root, entry.path)), entry.sha256);
for (const [file, hash] of Object.entries(review.hashes)) assert.equal(sha(join(root, file)), hash);
const template = load('templates/godot-quantum-divergence/quantum-template.json');
const templateSha = sha(join(root, 'templates/godot-quantum-divergence/quantum-template.json'));
assert.equal(templateSha, backend.templateSha256);
assert.equal(templateSha, packaged.runtime.package.template_sha256);
assert.equal(Object.keys(template.hashes).length, 125);
assert.equal(packaged.runtime.package.files, 125);
assert.equal(packaged.runtime.package.integrity, true);
assert.equal(packaged.runtime.package.release, true);
assert.equal(packaged.runtime.package.standalone, true);
for (const [file, hash] of Object.entries(template.hashes)) assert.equal(sha(join(root, 'templates/godot-quantum-divergence', file)), hash);
assert.equal(ui.runtime.waypoints, 161);
assert.equal(ui.runtime.extracted, true);
assert.equal(ui.runtime.hp, 76);
assert.equal(ui.standalone.waypoints, 161);
assert.equal(ui.standalone.hp, 76);
assert.equal(ui.standalone.release, true);
assert.deepEqual(ui.collisionPreservation.changed, []);
assert.ok(ui.collisionPreservation.files >= 450);
assert.ok(ui.resultText.includes('Windows game:'));
for (const [directory, files] of [[ui.standalone.build,ui.standalone.files],[backend.project.exportPath,backend.standalone.files],[join(packaged.output,'portable'),packaged.files]]) {
  assert.match(directory, /^E:[/\\]/i);
  for (const file of files) assert.equal(sha(join(directory, file.path)), file.sha256);
}
for (const project of [ui.generatedProject, backend.project.outputPath]) {
  const engine = JSON.parse(readFileSync(join(project, 'engine.json'), 'utf8'));
  assert.equal(engine.engineVersion, readFileSync(join(project, 'reports/quantum-generation/runtime-version.log'), 'utf8').trim());
  assert.match(engine.engineVersion, /^4\.6\.stable\./);
  assert.equal(engine.standaloneBuild, true);
}
const runtime = JSON.parse(readFileSync(join(ui.generatedProject, 'reports/quantum-generation/packaged-gameplay/playground-result.json'), 'utf8'));
assert.equal(runtime.generation.package.template_sha256, templateSha);
assert.equal(runtime.full_route.failure, '');
assert.equal(runtime.progression.extracted, true);
assert.equal(runtime.art.floorFailures, 0);
assert.equal(runtime.art.propFailures, 0);
assert.equal(runtime.art.propChecks, 480);
assert.deepEqual([...runtime.programming.blueprints].sort(), ['entanglement','tunneling']);
for (const kind of ['skitter','driller','wraith','golem']) for (const state of ['idle','walk','run','attack','hit','death']) assert.equal(runtime.art.actorStates[kind][state], true);

const evidence = 'docs/verification/quantum-programming-20261003';
mkdirSync(join(root, evidence), { recursive: true });
const files = [...review.files];
function copy(source, name) { cpSync(source, join(root, evidence, name)); files.push(evidence + '/' + name); }
copy(join(ui.output, 'proof.json'), 'app-proof.json');
copy(join(backend.output, 'verification.json'), 'backend-proof.json');
copy(join(root, 'reports/quantum-programming-unit-tests.json'), 'regression-tests.json');
copy(join(native.output, 'proof.json'), 'native-proof.json');
copy(join(packaged.output, 'proof.json'), 'release-workbench-proof.json');
copy(join(ui.generatedProject, 'reports/quantum-generation/packaged-gameplay/playground-result.json'), 'standalone-runtime.json');
for (const name of ['03-result.png','04-collision-preserved.png','05-narrow.png']) copy(join(ui.output,name), name);
copy(join(ui.generatedProject, 'reports/quantum-generation/packaged-gameplay/playground-5347.png'), 'native-boss.png');
for (const capture of packaged.captures) {
  assert.equal(sha(capture.path), capture.sha256);
  copy(capture.path, capture.path.split(/[\\/]/).at(-1));
}
const readme = `# Quantum station programming verification\n\nThe station workbench edits two independent instruments through waveform, operator, state and trigger slots. A strict compiler previews real damage, energy, windup, cooldown, range and projectile capacity. It pauses the world, rejects unsafe station use, discards unapplied edits on cancellation and prevents menu input from leaking into combat. Changed recipes bind to shots at firing time. Discovery unlocks Entanglement and Tunneling: living-target pairs transfer 50% damage once without recursion; bounded tunneling counts occupied microcells, attenuates every eight and stops at protected matter.\n\nThis exact isolated snapshot passed workspace and desktop builds/typechecks, 35 focused regressions, 259 fresh native behavior checks, 21 fresh native workbench checks, 35 backend checks and 25 real hidden Electron creation checks. Normal app creation drove both the source game and a copied Windows release through 161 waypoints, both optional branches, combat/objectives and living extraction with 76 HP. All six core enemy states and grounded actor/prop contacts passed. Rejected duplicate creation preserved all ${ui.collisionPreservation.files} generated files.\n\nA separate bounded run tested the workbench inside the app-created release PCK: 22 checks and three actual GPU viewport captures passed. It uses native Control selection signals and game-owned keyboard/mouse events. It uses no OS input, external script injection or player position/health grants. The explicit --workbench-probe QA entry is packaged because official release templates disable external script/path overrides. Both release gameplay and the GUI probe verify all 125 template dependencies; the probe does not run during ordinary play. Exact source, template and exported binary hashes accompany these proofs. Binaries and large generated folders stay on E: rather than GitHub.\n\nEarlier canonical attempts are retained on E:. The synchronous WorldTests harness exceeded both 60- and 180-second budgets; these are unresolved harness failures, not passes. Full-world acceptance here is the normal generated source/release control route. An earlier GUI assertion expected a different reason word; the corrected assertion checks the actual admission reason, and every suite was rerun fresh here. Two earlier release GUI launch attempts failed because external main-pack/script overrides are unavailable; the final in-package probe supplies new release evidence.\n\nProgramming lasts for the current run. Durable full-world suspension, persistent programmed loadouts, final art/audio, expanded biomes, AI-directed generation and Quantum Unity/Unreal ports remain unfinished. Compact v1 saves reject nondefault recipes or active links rather than silently dropping state. Passing tests does not approve artwork or certify a production 60 FPS budget. Top-down and Stormglass assets remain separate and unchanged by this batch.\n`;
writeFileSync(join(root,evidence,'README.md'), readme);
files.push(evidence+'/README.md');
const generationDoc = 'docs/development/QUANTUM_GENERATION.md';
let generation = readFileSync(join(root,generationDoc),'utf8');
generation = generation.replace('programming UI, audio, durable full-world saves', 'expanded compiler/editor workflows, audio, durable full-world saves');
generation += '\n## Station programming\n\nPress P near a safe stabilizer to edit the waveform, operator, state and trigger of either equipped instrument. The compiler previews the actual firing behavior and price; Apply changes only that slot and Escape cancels unapplied edits. Gameplay remains paused during editing. The survey secret unlocks Entanglement and the three-crystal rift unlocks Tunneling. Recipes and blueprints currently last for this connected-world run; permanent loadout/profile storage and full-world saves remain pending. Compact v1 saves explicitly reject programmed state. The exact isolated snapshot passed 259 native behavior checks, 21 native GUI checks, 35 regressions, 35 backend checks, 25 real-app checks and 22 workbench checks in the exported release. See [the programming proof](../verification/quantum-programming-20261003/README.md).\n';
writeFileSync(join(root,generationDoc), generation);
files.push(generationDoc);
const designDoc = 'docs/development/QUANTUM_DIVERGENCE.md';
let design = readFileSync(join(root,designDoc),'utf8');
design = design.replace('- [ ] Station compiler/preview and discoverable entanglement/tunneling modules.', '- [x] Station compiler/preview and discoverable entanglement/tunneling modules in the connected-world candidate.');
design = design.replace('- [ ] Station programming preview and chunk-scale saves.', '- [x] Station programming preview.\n- [ ] Chunk-scale saves and durable programmed loadouts.');
design = design.replace('- [ ] Add genre schemas, capability registry, own assembler/template and app UI only when the runtime exists.', '- [x] Add genre schemas, capability registry, own assembler/template and app UI only when the runtime exists.');
design = design.replace('- [ ] Generate through MetroForge\'s real app UI, play through all three objectives, show gameplay/animation captures and retain failures honestly.', '- [x] Generate through MetroForge\'s real app UI, play through all three objectives, show gameplay/animation captures and retain failures honestly.');
design += '\n## Station programming milestone, 2026-10-03\n\nThe separate Quantum candidate now implements the four-slot compiler, native paused stabilizer workbench, discovered Entanglement and Tunneling operators, living-target links and occupied-cell attenuation. Custom recipes bind to queued shots; editing another recipe cannot rewrite a shot already in flight. Grounding, safe distance, pending attacks, hurt state and hostile projectiles all guard station access. Application consumes no energy; actual firing uses the displayed price. Defaults retain their existing simulation/save behavior. Full-world durable saves and profile/loadout persistence remain pending. [Exact native, app and release evidence](../verification/quantum-programming-20261003/README.md).\n';
writeFileSync(join(root,designDoc), design);
files.push(designDoc);

const patterns = [/gh[pousr]_[A-Za-z0-9]{35,}/,/github_pat_[A-Za-z0-9_]{70,}/,/sk-(?:proj-)?[A-Za-z0-9_-]{40,}/,/nvapi-[A-Za-z0-9_-]{45,}/,/AIza[0-9A-Za-z_-]{35}/,/gsk_[A-Za-z0-9]{40,}/,/hf_[A-Za-z0-9]{30,}/,/AKIA[A-Z0-9]{16}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/copilot\.microsoft\.com\/(?:conversations\/join|chats)\//];
assert.equal(new Set(files).size, files.length);
const sources = files.map(file => {
  assert.ok(review.files.includes(file) || file.startsWith(evidence+'/') || [generationDoc,designDoc].includes(file));
  assert.ok(!file.includes('..') && !file.startsWith('/') && /\.(?:ts|tsx|gd|cfg|godot|mjs|json|md|png)$/.test(file));
  const path = join(root,file), bytes = readFileSync(path);
  assert.ok(statSync(path).size <= 1024*1024 && !patterns.some(pattern => pattern.test(bytes.toString('utf8'))), 'Unsafe publication file: '+file);
  return {path:file,sha256:sha(path),bytes:bytes.length};
});
const index = join(canonical,'.git/index');
assert.equal(sha(index), review.originalIndexSha256);
const env = {...process.env,GIT_DIR:review.store,GIT_WORK_TREE:root,GIT_INDEX_FILE:join(report,'programming-'+Date.now()+'.index'),GH_CONFIG_DIR:'E:/MetroForgeData/AppData/GitHubCLI',TEMP:'E:/MetroForgeData/Temp',TMP:'E:/MetroForgeData/Temp'};
const git = (args,input,binary=false) => execFileSync('git',args,{env,input,encoding:binary?null:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
const branch = 'refs/heads/codex/metroforge-epic-20261001';
assert.equal(git(['rev-parse',branch]).trim(), review.parent);
assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0], review.parent);
git(['read-tree',review.parent]);
for (const source of sources) {
  assert.equal(sha(join(root,source.path)), source.sha256);
  const blob = git(['hash-object','--no-filters','-w','--stdin'],readFileSync(join(root,source.path))).trim();
  git(['update-index','--add','--cacheinfo','100644',blob,source.path]);
  assert.equal(createHash('sha256').update(git(['show',':'+source.path],undefined,true)).digest('hex'), source.sha256);
}
const changed = git(['diff','--cached','--name-status',review.parent]).trim().split('\n').filter(Boolean);
assert.ok(changed.length && changed.every(line => !line.startsWith('D\t') && files.includes(line.split('\t').at(-1))));
const tree = git(['write-tree']).trim();
const commit = git(['commit-tree',tree,'-p',review.parent], 'Add tested Quantum station instrument programming\n\nCompile four-slot recipes, unlock living-target Entanglement and bounded Tunneling, and edit two instruments through a paused native stabilizer workbench. Verify normal MetroForge creation, copied Windows release gameplay and the in-package workbench with source-bound evidence. Keep programmed loadouts and full-world saves explicitly pending.\n').trim();
assert.equal(sha(index),review.originalIndexSha256);
const receipt = {status:'prepared',parent:review.parent,commit,tree,sourceTree:root,files:sources,changed,originalIndexSha256:review.originalIndexSha256,workingIndexPreserved:true,tests:{unit:35,native:259,nativeGui:21,backend:35,realDesktop:25,releaseGui:22,unchangedGameFiles:ui.collisionPreservation.files,waypoints:161,hp:76,templateFiles:125},productionReady:false};
writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
if (process.argv.includes('--publish')) {
  git(['push','origin',commit+':'+branch]);
  assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],commit);
  git(['update-ref',branch,commit,review.parent]);
  assert.equal(sha(index),review.originalIndexSha256);
  for (const source of sources) assert.equal(createHash('sha256').update(git(['show',commit+':'+source.path],undefined,true)).digest('hex'),source.sha256);
  receipt.status='uploaded';
  receipt.url='https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
  writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
}
console.log(JSON.stringify({status:receipt.status,commit,files:changed.length,tests:receipt.tests,workingIndexPreserved:true,url:receipt.url}));
