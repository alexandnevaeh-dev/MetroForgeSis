/** Publish only the export feature after fresh isolated backend and real-app proof. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const canonical=resolve('.');
const report=join(canonical,'reports/game-tests/20261003-quantum-export-publication');
const review=JSON.parse(readFileSync(join(report,'latest.json'),'utf8'));
assert.equal(review.parent,'08a2b3ea83d71542b3ec63c8a10ac0d6592c4614');
assert.equal(review.status,'ready-for-build');assert.deepEqual(review.conflicts,[]);assert.match(review.tree,/^E:[/\\]/i);
const root=review.tree;
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const load=path=>JSON.parse(readFileSync(join(root,path),'utf8'));
const ui=load('reports/game-tests/20261002-quantum-create-ui/latest.json');
const backend=load('reports/game-tests/20261001-quantum-divergence/generation-latest.json');
const unit=load('reports/quantum-export-unit-tests.json');
assert.equal(ui.passed,true);assert.equal(ui.checks.length,25);assert.ok(ui.checks.every(check=>check.passed));
assert.equal(backend.checks.length,34);assert.ok(backend.checks.every(check=>check.passed));
assert.equal(unit.success,true);assert.equal(unit.numPassedTests,35);assert.equal(unit.numFailedTests,0);
assert.equal(ui.runtime.waypoints,161);assert.equal(ui.runtime.extracted,true);assert.equal(ui.runtime.hp,76);
assert.equal(ui.standalone.release,true);assert.equal(ui.standalone.waypoints,161);assert.equal(ui.standalone.hp,76);
assert.ok(ui.collisionPreservation.files>=450);assert.deepEqual(ui.collisionPreservation.changed,[]);
assert.ok(ui.resultText.includes('Windows game:'));
for (const project of [ui.generatedProject,backend.project.outputPath]) {
 const engine=JSON.parse(readFileSync(join(project,'engine.json'),'utf8'));
 const actualVersion=readFileSync(join(project,'reports/quantum-generation/runtime-version.log'),'utf8').trim();
 assert.equal(engine.engineVersion,actualVersion);
 assert.match(actualVersion,/^4\.6\.stable\./);
 assert.equal(engine.standaloneBuild,true);
}
for (const [file,sha] of Object.entries(review.hashes)) assert.equal(digest(join(root,file)),sha,'Changed admitted source: '+file);
for (const [file,sha] of Object.entries(ui.sourceHashes)) assert.equal(digest(join(root,file)),sha,'Changed after app test: '+file);
for (const entry of backend.sources) assert.equal(digest(join(root,entry.path)),entry.sha256,'Changed after backend test: '+entry.path);
const template=load('templates/godot-quantum-divergence/quantum-template.json');
assert.equal(digest(join(root,'templates/godot-quantum-divergence/quantum-template.json')),backend.templateSha256);
assert.equal(Object.keys(template.hashes).length,121);
for (const [file,sha] of Object.entries(template.hashes)) assert.equal(digest(join(root,'templates/godot-quantum-divergence',file)),sha);
for (const [build,files] of [[ui.standalone.build,ui.standalone.files],[backend.project.exportPath,backend.standalone.files]]) {
 assert.match(build,/^E:[/\\]/i);
 for (const file of files) assert.equal(digest(join(build,file.path)),file.sha256,'Changed exported artifact');
}
const runtime=JSON.parse(readFileSync(join(ui.generatedProject,'reports/quantum-generation/packaged-gameplay/playground-result.json'),'utf8'));
assert.equal(runtime.generation.package.standalone,true);assert.equal(runtime.generation.package.release,true);assert.equal(runtime.generation.package.integrity,true);
assert.equal(runtime.generation.package.template_sha256,backend.templateSha256);assert.equal(runtime.generation.package.files,121);
assert.equal(runtime.art.floorFailures,0);assert.equal(runtime.art.propFailures,0);assert.equal(runtime.art.propChecks,480);
assert.equal(runtime.full_route.failure,'');assert.equal(runtime.progression.extracted,true);
for (const kind of ['skitter','driller','wraith','golem']) for (const state of ['idle','walk','run','attack','hit','death']) assert.equal(runtime.art.actorStates[kind][state],true);
const evidence='docs/verification/quantum-export-20261003';
mkdirSync(join(root,evidence),{recursive:true});
const files=[...review.files];
function copy(source,name) {cpSync(source,join(root,evidence,name));files.push(evidence+'/'+name);}
copy(join(ui.output,'proof.json'),'app-proof.json');
copy(join(backend.output,'verification.json'),'backend-proof.json');
copy(join(root,'reports/quantum-export-unit-tests.json'),'regression-tests.json');
copy(join(ui.generatedProject,'reports/quantum-generation/packaged-gameplay/playground-result.json'),'standalone-runtime.json');
for (const name of ['03-result.png','04-collision-preserved.png','05-narrow.png']) copy(join(ui.output,name),name);
copy(join(ui.generatedProject,'reports/quantum-generation/packaged-gameplay/playground-5347.png'),'native-boss.png');
const readme=`# Quantum Windows release verification\n\nThis bounded follow-up to ${review.parent} adds real Windows export to normal Quantum creation. The export plugin packs verified original runtime scripts, manifests and PNG bytes, so raw-file readers retain their dependencies. Three build files (game.exe, game.pck and game.console.exe) are copied into a separate folder and played there before standaloneBuild or the export phase can pass. The app result displays the verified build location.\n\nThe first release game started but stalled at waypoint 69: side-effectful setup inside GDScript assert() was removed from release builds. Initialization and failure handling now execute in every build. The retained regression fixture contains critical fields from that failed native run and the corrected run; the shared gameplay gate rejects the former.\n\nThis exact isolated snapshot passed its workspace build, desktop native build and renderer/main typechecks, 35 focused regression tests, 34 backend checks and 25 real hidden Electron workflow checks. The app uses ordinary preload IPC and game-owned movement/aim/interaction requests; no generator mocks, OS input or health/position grants. Both source and copied release games reached 161 waypoints, visited both optional branches, exercised all enemy families, boss attacks and six core animation states, and extracted with 76 HP. The copied app-created release verified all 121 template files, ${runtime.art.floorChecks} floor checks and 480 prop contacts with zero failures. The duplicate-name request changed none of ${ui.collisionPreservation.files} generated files.\n\nExact source, template, bundle and build hashes are in the proofs. Binaries and large generated project folders remain on E: and are not committed. Engine manifests now record the executable's actual version rather than the registry default. Capture dimensions and hidden-window state are recorded in the app proof.\n\nThis is a playable local Godot Windows candidate. Final visual approval, AI-directed content, expanded biomes, programmable-instrument UI, production audio, full-world durable saves and Quantum Unity/Unreal ports remain unfinished. Native cancellation of an active console-wrapper tree is implemented but not claimed as runtime-verified here. The desktop-wide static audit retains nine prior shared-control findings. The canonical index and unrelated local changes are preserved.\n`;
writeFileSync(join(root,evidence,'README.md'),readme);files.push(evidence+'/README.md');
const doc='docs/development/QUANTUM_GENERATION.md';
let text=readFileSync(join(root,doc),'utf8');
text=text.replace('Passing candidate tests is not final artwork approval, stable 60 FPS certification, standalone export readiness or a completed application. The generated raw-PNG loaders still warn about export packaging; no working standalone Quantum export is claimed.','Passing candidate tests is not final artwork approval, stable 60 FPS certification or a completed application. Normal Windows creation now exports the release game, copies its executable, console wrapper and PCK away from the source folder, and verifies the full native route before marking standaloneBuild or export as passed. The result panel displays the verified build location. Missing runtime validation leaves export skipped.');
text=text.replace('Quantum-specific editor/export integrations and broader engine ports','deeper Quantum editor and export-screen integration and broader engine ports');
text+='\n## Windows release package\n\nThe exact isolated export snapshot passed 35 regressions, 34 backend checks and 25 real-app workflow checks. Both the source project and copied release package completed 161 waypoints with living extraction. Release initialization now runs outside assertions, and original raw scripts/manifests/PNG dependencies are packed with bound hashes. See [the release proof](../verification/quantum-export-20261003/README.md). Full-world saves, deeper programming, final art/audio and other engine ports remain pending.\n';
writeFileSync(join(root,doc),text);files.push(doc);
const patterns=[/gh[pousr]_[A-Za-z0-9]{35,}/,/github_pat_[A-Za-z0-9_]{70,}/,/sk-(?:proj-)?[A-Za-z0-9_-]{40,}/,/nvapi-[A-Za-z0-9_-]{45,}/,/AIza[0-9A-Za-z_-]{35}/,/gsk_[A-Za-z0-9]{40,}/,/hf_[A-Za-z0-9]{30,}/,/AKIA[A-Z0-9]{16}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/copilot\.microsoft\.com\/(?:conversations\/join|chats)\//];
assert.equal(new Set(files).size,files.length);
const sources=files.map(file=>{
 assert.ok(review.files.includes(file)||file.startsWith(evidence+'/')||file===doc);
 assert.ok(!file.includes('..')&&!file.startsWith('/')&&/\.(?:ts|tsx|gd|cfg|godot|mjs|json|md|png)$/.test(file));
 const path=join(root,file),bytes=readFileSync(path);
 assert.ok(statSync(path).size<=1024*1024&&!patterns.some(pattern=>pattern.test(bytes.toString('utf8'))),'Unsafe publication file: '+file);
 return {path:file,sha256:digest(path),bytes:bytes.length};
});
const index=join(canonical,'.git/index');assert.equal(digest(index),review.originalIndexSha256);
const env={...process.env,GIT_DIR:review.store,GIT_WORK_TREE:root,GIT_INDEX_FILE:join(report,'export-'+Date.now()+'.index'),GH_CONFIG_DIR:'E:/MetroForgeData/AppData/GitHubCLI'};
const git=(args,input,binary=false)=>execFileSync('git',args,{env,input,encoding:binary?null:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
const branch='refs/heads/codex/metroforge-epic-20261001';
assert.equal(git(['rev-parse',branch]).trim(),review.parent);
assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],review.parent);
git(['read-tree',review.parent]);
for (const source of sources) {
 assert.equal(digest(join(root,source.path)),source.sha256);
 const blob=git(['hash-object','--no-filters','-w','--stdin'],readFileSync(join(root,source.path))).trim();
 git(['update-index','--add','--cacheinfo','100644',blob,source.path]);
 assert.equal(createHash('sha256').update(git(['show',':'+source.path],undefined,true)).digest('hex'),source.sha256);
}
const changed=git(['diff','--cached','--name-status',review.parent]).trim().split('\n').filter(Boolean);
assert.ok(changed.length&&changed.every(line=>!line.startsWith('D\t')&&files.includes(line.split('\t').at(-1))));
const tree=git(['write-tree']).trim();
const commit=git(['commit-tree',tree,'-p',review.parent],'Build and validate standalone Quantum Windows games\n\nPack verified raw runtime dependencies, initialize gameplay outside release-stripped assertions, and require copied release-package gameplay before export success. Show the verified build location and record the actual Godot version. Validate the exact isolated snapshot with 35 regressions, 34 backend checks and 25 real-app checks.\n').trim();
assert.equal(digest(index),review.originalIndexSha256);
const receipt={status:'prepared',parent:review.parent,commit,tree,sourceTree:root,files:sources,changed,originalIndexSha256:review.originalIndexSha256,workingIndexPreserved:true,tests:{unit:35,backend:34,realDesktop:25,unchangedGameFiles:ui.collisionPreservation.files,waypoints:161,hp:76,standaloneRelease:true},productionReady:false};
writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
if (process.argv.includes('--publish')) {
 git(['push','origin',commit+':'+branch]);
 assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],commit);
 git(['update-ref',branch,commit,review.parent]);
 assert.equal(digest(index),review.originalIndexSha256);
 for (const source of sources) assert.equal(createHash('sha256').update(git(['show',commit+':'+source.path],undefined,true)).digest('hex'),source.sha256);
 receipt.status='uploaded';receipt.url='https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
 writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
}
console.log(JSON.stringify({status:receipt.status,commit,files:changed.length,tests:receipt.tests,workingIndexPreserved:true,url:receipt.url}));
