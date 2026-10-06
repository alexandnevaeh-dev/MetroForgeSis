/** Narrow Unity publication. Preserve the canonical tree/index and previous uploads. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
const canonical='E:/Metroforge/MetroForge-Publish';
const parent='9be3005edb102dae91312eb99b17d0c4ffb5226c';
const store='E:/MetroForgeData/GitHubUpload/20261003/unity-upload-objectdb';
const branch='refs/heads/codex/metroforge-epic-20261001';
const report=join(canonical,'reports/game-tests/20261003-unity-publication');
const root='E:/MetroForgeData/GitHubUpload/20261003/unity-route-review-retry';
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const load=path=>JSON.parse(readFileSync(path,'utf8'));
const route=load(join(canonical,'reports/game-tests/20261003-unity-route/run-1791068444284/proof.json'));
const gates=load(join(canonical,'reports/game-tests/20261003-unity-route/gate-physics-fixed.json'));
assert.equal(route.passed,true);assert.equal(route.mode,'capture');assert.equal(route.runtime.status,'PASS');
assert.equal(route.runtime.roomsVisitedCount,35);assert.equal(route.runtimeErrors.length,0);
assert.equal(route.binding.inputsUnchanged,true);assert.equal(route.runtime.captures.length,20);
assert.equal(gates.passed,true);assert.equal(gates.checksPassed,23);assert.equal(gates.checksFailed,0);
for(const [file,hash] of Object.entries(route.sources))assert.equal(sha(join(canonical,file)),hash,'Changed compiled source '+file);
for(const [file,hash] of Object.entries(route.hashes))assert.equal(sha(join(route.output,'portable',file)),hash,'Changed native artifact '+file);
const indexBefore=sha(join(canonical,'.git/index'));
mkdirSync(report,{recursive:true});
assert.ok(!existsSync(root)||process.argv.includes('--resume'),'Preserve the existing review snapshot unless explicitly resuming with hash guards');
mkdirSync(root,{recursive:true});
const files=[];
function admit(from,to){mkdirSync(dirname(join(root,to)),{recursive:true});if(existsSync(join(root,to)))assert.equal(sha(join(root,to)),sha(from),'Preserved snapshot differs: '+to);else cpSync(from,join(root,to));files.push(to);}
const sourceFiles=['templates/unity-metroidvania/Assets/Scripts/GameBootstrap.cs','templates/unity-metroidvania/Assets/Scripts/AcceptanceDriver.cs','tests/unity/SourceBoundBuild.cs','tests/unity/PropGeometryValidation.cs','tests/unity/PropGeometryValidationDriver.cs','scripts/probe-unity-stormglass-route.mjs','scripts/validate-unity-project.ps1','docs/development/UNITY_PROJECT_CONTEXT.md'];
for(const file of sourceFiles)admit(join(canonical,file),file);
const evidence='docs/verification/unity-route-20261003';
admit(join(route.output,'proof.json'),evidence+'/campaign-proof.json');
for(const file of ['geometry-baseline.json','geometry-fixed.json','gate-physics-input-baseline.json','gate-physics-fixed.json'])admit(join(canonical,'reports/game-tests/20261003-unity-route',file),evidence+'/'+file);
admit(join(canonical,'reports/game-tests/20261003-unity-route/build-source-bound-licensed/results.json'),evidence+'/build-results.json');
for(const name of ['spawn','player_run','victory'])admit(join(route.output,'portable/qa/captures',name+'.png'),evidence+'/'+name+'.png');
const readme=[
 '# Unity Stormglass fallback geometry and native campaign',
 'A missing prop image previously scaled the physics root with its visual dimensions: a 32-pixel gate became 1024 pixels wide. Fallback gate, pickup, checkpoint and victory visuals now use sliced SpriteRenderer dimensions while physics roots keep unit scale. Authored collision/trigger sizes stay intact. The acceptance driver collects authored pickups and stops stale forward steering against new enemies.',
 'Unity 6000.3.0f1 rebuilt the Windows Mono player successfully. SourceBoundBuild found authored inputs unchanged during compilation and bound executable, assembly and gameplay hashes. The copied player verified five current runtime sources, reached victory through 35 rooms with zero runtime exceptions, and produced 20 actual offscreen camera captures. Traversal and pickup acquisition use game-owned input; direct damage/respawn/save reload remain separate diagnostics. No OS input/focus/show automation was used.',
 'The separate PlayMode fixture passed 23 checks: 16 fallback geometry checks and seven gate checks, including real-player blocking, actual pickup-trigger acquisition and unlocked crossing. Explicit player positioning is diagnostic setup, not campaign traversal. The campaign gate metric stays inconclusive. The original geometry baseline failed eight size/root checks. A later input-fixture baseline failed two movement checks; configuring background virtual input fixed that fixture without changing production gameplay.',
 'Limits: all-room coverage, NPC interaction, every ability activation, FPS and final art/animation approval remain incomplete. Camera captures reveal placeholder wall blocks and flat platform undersides. An enemy may already be retired at its named capture moment. Editor-only UnityEditor.Search startup exceptions remain in local logs; standalone gameplay logged none. Top-down, Stormglass and Quantum assets remain separate.',
 'To repeat: copy tests/unity/SourceBoundBuild.cs into an isolated generated project Assets/Editor and build with scripts/validate-unity-project.ps1, method SourceBoundBuild.BuildWindows. Probe its Builds/Windows directory with scripts/probe-unity-stormglass-route.mjs --timeout=300 --mode=capture. PropGeometryValidation.cs goes in Assets/Editor, its Driver in Assets/Scripts; run PropGeometryValidation.Run with -propGeometryCheck and isolated E: saves.',
].join('\n\n')+'\n';
mkdirSync(join(root,evidence),{recursive:true});if(existsSync(join(root,evidence,'README.md')))assert.equal(readFileSync(join(root,evidence,'README.md'),'utf8'),readme);else writeFileSync(join(root,evidence,'README.md'),readme);files.push(evidence+'/README.md');
const patterns=[/gh[pousr]_[A-Za-z0-9]{35,}/,/github_pat_[A-Za-z0-9_]{70,}/,/sk-(?:proj-)?[A-Za-z0-9_-]{40,}/,/nvapi-[A-Za-z0-9_-]{45,}/,/AIza[0-9A-Za-z_-]{35}/,/gsk_[A-Za-z0-9]{40,}/,/hf_[A-Za-z0-9]{30,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
for(const file of files){assert.ok(!file.includes('..')&&!/credentials\.enc|(^|\/)\.env($|\.)/.test(file));if(!file.endsWith('.png'))for(const pattern of patterns)assert.ok(!pattern.test(readFileSync(join(root,file),'utf8')),'Secret-like data in '+file);}
const env={...process.env,GIT_INDEX_FILE:join(report,'publication-retry.index'),GH_CONFIG_DIR:'E:/MetroForgeData/AppData/GitHubCLI'};
const git=(args,input,raw=false)=>execFileSync('git',['-c','core.autocrlf=false','--git-dir='+store,'--work-tree='+root,...args],{env,input,encoding:raw?undefined:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],parent);
git(['read-tree',parent]);
const admitted=files.map(path=>({path,sha256:sha(join(root,path))}));
for(const file of files){const blob=git(['hash-object','-w','--stdin'],readFileSync(join(root,file))).trim();git(['update-index','--add','--cacheinfo','100644',blob,file]);}
const changed=git(['diff','--cached','--name-only',parent]).trim().split(/\r?\n/);assert.ok(changed.every(file=>files.includes(file)));
const tree=git(['write-tree']).trim();
const commit=git(['commit-tree',tree,'-p',parent],'Fix Unity fallback prop collision and validate the native campaign\n\nKeep physics roots at unit scale while sizing fallback visuals. Collect authored pickups and stop stale forward steering against new enemies. Bind build inputs to native binaries, complete a 35-room camera-capture route, and verify blocked/unlocked gates in a separate controlled PlayMode fixture.\n').trim();
const receipt={status:'prepared',parent,commit,tree,store,sourceTree:root,files:admitted,changed,originalIndexSha256:indexBefore,workingIndexPreserved:true,tests:{nativeRooms:35,cameraCaptures:20,runtimeErrors:0,propAndGateChecks:23},productionReady:false};
assert.equal(sha(join(canonical,'.git/index')),indexBefore);
writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
if(process.argv.includes('--publish')){
 for(const file of sourceFiles)assert.equal(sha(join(canonical,file)),sha(join(root,file)),'Source changed after review '+file);
 git(['push','origin',commit+':'+branch]);assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],commit);
 git(['update-ref',branch,commit,parent]);assert.equal(sha(join(canonical,'.git/index')),indexBefore);
 for(const file of admitted)assert.equal(createHash('sha256').update(git(['show',commit+':'+file.path],undefined,true)).digest('hex'),file.sha256);
 receipt.status='uploaded';receipt.url='https://github.com/alexandnevaeh-dev/MetroForgeSis/commit/'+commit;
 writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
}
console.log(JSON.stringify({status:receipt.status,commit,changed:changed.length,tests:receipt.tests,url:receipt.url,indexPreserved:true}));
