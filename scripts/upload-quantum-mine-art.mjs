import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Admit this bounded, verified snapshot through a separate index/object store.
const repo = resolve('.');
assert.match(repo,/^E:[/\\]/i);
const reports = join(repo,'reports/game-tests/20261001-quantum-divergence');
const store = 'E:/MetroForgeData/GitHubUpload/20261001/quantum-saves.git';
const branch = 'refs/heads/codex/metroforge-epic-20261001';
const parent = '2f5456aed842a900eaf0e59f81915536d4b85720';
const candidate = 'prototypes/quantum-divergence/assets/mine-kit-candidate-v1';
const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
const digest = path=>hash(readFileSync(path));
const manifest = JSON.parse(readFileSync(join(repo,candidate,'manifest.json'),'utf8'));
const proof = JSON.parse(readFileSync(join(reports,'mine-art-latest.json'),'utf8'));
assert.deepEqual(proof.suites.map(value=>[value.passed,value.failed]),[[27,0],[18,0],[6,0],[23,0],[10,0]]);
for (const source of proof.sources) assert.equal(digest(join(repo,source.path)),source.sha256,'Reviewed source changed: '+source.path);
assert.equal(proof.productionApproved,false);
assert.equal(proof.runtime.ticks,6186);
assert.equal(proof.runtime.player_hp,76);
assert.equal(proof.runtime.shots,40);
assert.equal(proof.runtime.full_route.reached,161);
assert.equal(proof.runtime.full_route.failure,'');
for (const branch of ['echo','survey']) assert.deepEqual(proof.runtime.full_route.branches[branch],{outbound:true,returned:true});
for (const key of ['anchor_upper','collapse_rift','golem_core','golem_defeated','secret_found','extracted','exit_ready']) assert.equal(proof.runtime.progression[key],true);
assert.equal(proof.runtime.progression.crystals_destroyed,3);
assert.equal(proof.runtime.world.recall_stations,8);
assert.equal(proof.runtime.art.integrity,true);
assert.equal(proof.runtime.art.floorChecks,23132);
assert.equal(proof.runtime.art.floorFailures,0);
assert.equal(proof.runtime.art.propChecks,480);
assert.equal(proof.runtime.art.propFailures,0);
for (const kind of ['skitter','driller','wraith','golem']) for (const state of ['idle','walk','run','attack','hit','death']) assert.equal(proof.runtime.art.actorStates[kind][state],true);
for (const id of ['200','301','302','303']) assert.ok(proof.runtime.enemy_deaths[id] && proof.runtime.enemy_active_counts[id]>0);
for (const attack of ['slam','burst','roar']) assert.ok(proof.runtime.boss_active[attack]>0);
assert.equal(proof.captures.length,24);
for (const path of proof.captures) assert.ok(existsSync(path));
assert.equal(proof.video.decoded,true);
assert.equal(digest(proof.video.path),proof.video.sha256);
assert.equal(Object.keys(manifest.assets).length,14);
assert.equal(manifest.genre,'quantum-divergence');
assert.equal(manifest.candidateOnly,true);
assert.equal(manifest.productionApproved,false);
assert.equal(proof.kits.length,3);
for (const kit of proof.kits) {
  assert.equal(resolve(kit.path),resolve(repo,'prototypes/quantum-divergence/assets',kit.name));
  assert.equal(digest(join(kit.path,'manifest.json')),kit.manifestSha256);
  const data = JSON.parse(readFileSync(join(kit.path,'manifest.json'),'utf8'));
  for (const [file,sha] of Object.entries(data.hashes)) {
    assert.ok(/^[a-z0-9/-]+\.(png|json|tscn)$/.test(file));
    assert.equal(digest(join(kit.path,file)),sha);
  }
}
const files = [
  'docs/development/QUANTUM_ART_PIPELINE.md','prototypes/quantum-divergence/README.md',
  'prototypes/quantum-divergence/tools/MineKitBaker.gd',
  'prototypes/quantum-divergence/scripts/MineArtTerrain.gd',
  'prototypes/quantum-divergence/scripts/MinesArtPlayground.gd',
  'prototypes/quantum-divergence/tests/MineArtTerrainTests.gd',
  'prototypes/quantum-divergence/tests/MinesArtPresentationTests.gd',
  'prototypes/quantum-divergence/scenes/MinesArtPlayground.tscn',
  'prototypes/quantum-divergence/Run Art Mines Preview.cmd',
  'scripts/package-quantum-mine-kit.py','scripts/verify-quantum-mine-art.mjs','scripts/upload-quantum-mine-art.mjs',
  ...Object.keys(manifest.hashes).map(path=>{
    assert.ok(/^[a-z-]+\.(png|json|tscn)$/.test(path));
    assert.equal(digest(join(repo,candidate,path)),manifest.hashes[path]);
    return candidate+'/'+path;
  }),...['manifest.json','.gitattributes','README.md'].map(path=>candidate+'/'+path)
];
assert.equal(new Set(files).size,files.length);
const patterns = [/gh[pousr]_[A-Za-z0-9]{35,}/,/github_pat_[A-Za-z0-9_]{70,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/,/nvapi-[A-Za-z0-9_-]{45,}/,/AIza[0-9A-Za-z_-]{35}/,
  /gsk_[A-Za-z0-9]{40,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /copilot\.microsoft\.com\/(?:conversations\/join|chats)\//];
const sources = files.map(path=>{
  const bytes = readFileSync(join(repo,path));
  assert.ok(statSync(join(repo,path)).size<=1024*1024 && !patterns.some(pattern=>pattern.test(bytes.toString('utf8'))),'Rejected source: '+path);
  return {path,sha256:hash(bytes)};
});
const originalIndexPath = join(repo,'.git/index');
const originalIndex = ()=>existsSync(originalIndexPath)?digest(originalIndexPath):null;
const before = originalIndex();
const env = {...process.env,GIT_DIR:store,GIT_WORK_TREE:repo,
  GIT_ALTERNATE_OBJECT_DIRECTORIES:join(repo,'.git/objects'),
  GIT_INDEX_FILE:join(reports,'quantum-mine-art-upload-'+Date.now()+'.index'),
  GH_CONFIG_DIR:'E:/MetroForgeData/AppData/GitHubCLI'};
const git = (args,input)=>execFileSync('git',args,{env,input,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
assert.equal(git(['rev-parse',branch]).trim(),parent,'Local upload branch changed');
assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],parent,'Remote changed; reconcile first');
git(['read-tree',parent]);
git(['add','--force','--',...files]);
const staged = path=>execFileSync('git',['show',':'+path],{env,encoding:null,windowsHide:true,maxBuffer:4*1024*1024});
const lineEndingConversions = [];
for (const source of proof.sources) {
  const bytes = staged(source.path);
  if (hash(bytes) !== source.sha256) {
    // Git's text filter may canonicalize Windows newlines; no other edit is admitted.
    const normalized = value=>value.toString('utf8').replaceAll('\r\n','\n');
    assert.equal(normalized(bytes),normalized(readFileSync(join(repo,source.path))),'Staged review source differs: '+source.path);
    lineEndingConversions.push({path:source.path,reviewSha256:source.sha256,stagedSha256:hash(bytes)});
  }
}
for (const kit of proof.kits) {
  const prefix = 'prototypes/quantum-divergence/assets/'+kit.name+'/';
  assert.equal(hash(staged(prefix+'manifest.json')),kit.manifestSha256);
  const data = JSON.parse(readFileSync(join(kit.path,'manifest.json'),'utf8'));
  for (const [file,sha] of Object.entries(data.hashes)) assert.equal(hash(staged(prefix+file)),sha,'Git changed bound source/asset bytes');
}
assert.equal(hash(staged('prototypes/quantum-divergence/tools/MineKitBaker.gd')),manifest.sourceScriptSha256);
assert.equal(hash(staged('prototypes/quantum-divergence/tools/DiverRigBaker.gd')),manifest.helperScriptSha256);
const changes = git(['diff','--cached','--name-status',parent]).trim().split('\n').filter(Boolean);
assert.ok(changes.length && changes.every(line=>!line.startsWith('D\t') && files.includes(line.split('\t').at(-1))));
for (const source of sources) assert.equal(digest(join(repo,source.path)),source.sha256);
const tree = git(['write-tree']).trim();
const commit = git(['commit-tree',tree,'-p',parent],
  'Add coherent matching Quantum mine art preview\n\nAuthor fourteen original environment pieces with the Diver palette, native geometry and camera scale. Render authoritative microcells with destruction/seam/heat updates and bounded caches. Integrate the matching cast, grounded machinery, continuous interiors and two-times framing into the existing connected world without changing simulation. Validate 84 focused checks, all 161 route waypoints, all enemy families and boss attacks, extraction with HP 76, 23132 exact actor contacts and 480 prop support checks with zero failures. Fully decode the native recording. Final visual polish, weapon aim, audio, full-world saves and MetroForge app generation remain pending; candidate approval stays false.\n').trim();
assert.equal(originalIndex(),before);
const result = {status:'prepared',commit,parent,files:sources,changes,lineEndingConversions,workingIndexPreserved:true,
  tests:{headless:84,ticks:6186,waypoints:161,hp:76,floorChecks:23132,floorFailures:0,propChecks:480,propFailures:0},
  productionApproved:false};
writeFileSync(join(reports,'github-quantum-mine-art-upload.json'),JSON.stringify(result,null,2));
if (process.argv.includes('--publish')) {
  git(['update-ref',branch,commit,parent]);
  git(['push','origin',branch+':'+branch]);
  assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],commit);
  assert.equal(originalIndex(),before);
  result.status = 'uploaded';
  result.url = 'https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
  writeFileSync(join(reports,'github-quantum-mine-art-upload.json'),JSON.stringify(result,null,2));
}
console.log(JSON.stringify({status:result.status,commit,changedFiles:changes.length,workingIndexPreserved:true,url:result.url}));
