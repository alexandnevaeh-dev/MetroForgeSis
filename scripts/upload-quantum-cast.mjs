import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Snapshot this reviewed candidate only, using a separate index and object store.
const repo = resolve('.');
const reports = join(repo,'reports/game-tests/20261001-quantum-divergence');
const store = 'E:/MetroForgeData/GitHubUpload/20261001/quantum-saves.git';
const branch = 'refs/heads/codex/metroforge-epic-20261001';
const parent = '6fb551bfa3d1e824c53ea0f0752f7a62ec804188';
const candidate = 'prototypes/quantum-divergence/assets/cast-candidate-v2';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = path => hash(readFileSync(path));
const manifest = JSON.parse(readFileSync(join(repo,candidate,'manifest.json'),'utf8'));
const proof = JSON.parse(readFileSync(join(reports,'cast-animation-latest.json'),'utf8'));
assert.equal(resolve(proof.candidate),resolve(repo,candidate));
assert.equal(proof.manifestSha256,digest(join(repo,candidate,'manifest.json')));
assert.deepEqual(proof.suites.map(value=>[value.passed,value.failed]),[[23,0],[43,0],[22,0],[18,0]]);
assert.equal(Object.keys(proof.runtime.checks).length,21);
for (const value of Object.values(proof.runtime.checks)) assert.equal(value,true);
assert.equal(proof.runtime.floorChecks,1854);
assert.equal(proof.runtime.floorFailures,0);
assert.equal(proof.runtime.ticks,2472);
assert.equal(proof.runtime.captures.length,14);
assert.equal(proof.video.decoded,true);
assert.equal(digest(proof.video.path),proof.video.sha256);
assert.equal(manifest.frameCount,231);
assert.equal(manifest.distinctImages,203);
assert.equal(manifest.productionApproved,false);
assert.equal(manifest.animationReady,false);
assert.equal(manifest.completeCast,false);
for (const source of proof.sources) assert.equal(digest(join(repo,source.path)),source.sha256,'Review source changed: '+source.path);
assert.equal(digest(join(repo,'prototypes/quantum-divergence/assets/diver-candidate-v1/manifest.json')),proof.diverManifestSha256);
assert.equal(digest(join(repo,'prototypes/quantum-divergence/assets/diver-candidate-v1/idle.png')),proof.diverIdleSha256);
const files = ['docs/development/QUANTUM_ART_PIPELINE.md','prototypes/quantum-divergence/README.md',
  'prototypes/quantum-divergence/tools/QuantumActorBaker.gd',
  'prototypes/quantum-divergence/scripts/EnemyClipBinding.gd',
  'prototypes/quantum-divergence/scripts/CastAnimationReview.gd',
  'prototypes/quantum-divergence/tests/EnemyClipBindingTests.gd',
  'prototypes/quantum-divergence/scenes/CastAnimationReview.tscn',
  'scripts/package-quantum-cast.py','scripts/verify-quantum-cast.mjs','scripts/upload-quantum-cast.mjs',
  ...Object.keys(manifest.hashes).map(path=>{
    assert.ok(/^(skitter|driller|wraith|golem)\/[a-z-]+\.(png|json|tscn)$/.test(path));
    assert.equal(digest(join(repo,candidate,path)),manifest.hashes[path]);
    return candidate+'/'+path;
  }), ...['manifest.json','.gitattributes','README.md'].map(path=>candidate+'/'+path)];
assert.equal(new Set(files).size,files.length);
const patterns = [/gh[pousr]_[A-Za-z0-9]{35,}/,/github_pat_[A-Za-z0-9_]{70,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/,/nvapi-[A-Za-z0-9_-]{45,}/,/AIza[0-9A-Za-z_-]{35}/,
  /gsk_[A-Za-z0-9]{40,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /copilot\.microsoft\.com\/(?:conversations\/join|chats)\//];
const sources = files.map(path=>{
  const bytes = readFileSync(join(repo,path));
  assert.ok(statSync(join(repo,path)).size <= 1024*1024 && !patterns.some(pattern=>pattern.test(bytes.toString('utf8'))),'Rejected source: '+path);
  return {path,sha256:hash(bytes)};
});
const originalIndexPath = join(repo,'.git/index');
const originalIndex = ()=>existsSync(originalIndexPath)?digest(originalIndexPath):null;
const before = originalIndex();
const env = {...process.env,GIT_DIR:store,GIT_WORK_TREE:repo,
  GIT_ALTERNATE_OBJECT_DIRECTORIES:join(repo,'.git/objects'),
  GIT_INDEX_FILE:join(reports,'quantum-cast-upload-'+Date.now()+'.index'),
  GH_CONFIG_DIR:'E:/MetroForgeData/AppData/GitHubCLI'};
const git = (args,input)=>execFileSync('git',args,{env,input,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
assert.equal(git(['rev-parse',branch]).trim(),parent,'Local upload branch changed');
assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],parent,'Remote changed; reconcile first');
git(['read-tree',parent]);
git(['add','--force','--',...files]);
const staged = path=>execFileSync('git',['show',':'+path],{env,encoding:null,windowsHide:true,maxBuffer:4*1024*1024});
assert.equal(hash(staged(candidate+'/manifest.json')),proof.manifestSha256);
for (const [path,sha] of Object.entries(manifest.hashes)) assert.equal(hash(staged(candidate+'/'+path)),sha,'Git changed bound asset/source bytes');
for (const kind of Object.keys(manifest.actors)) {
  const receipt = JSON.parse(readFileSync(join(repo,candidate,kind,'native-bake-receipt.json'),'utf8'));
  assert.equal(hash(staged('prototypes/quantum-divergence/tools/QuantumActorBaker.gd')),receipt.sourceScriptSha256);
  assert.equal(hash(staged('prototypes/quantum-divergence/tools/DiverRigBaker.gd')),receipt.helperScriptSha256);
}
const changes = git(['diff','--cached','--name-status',parent]).trim().split('\n').filter(Boolean);
assert.ok(changes.length && changes.every(line=>!line.startsWith('D\t') && files.includes(line.split('\t').at(-1))));
for (const source of sources) assert.equal(digest(join(repo,source.path)),source.sha256);
const tree = git(['write-tree']).trim();
const commit = git(['commit-tree',tree,'-p',parent],
  'Add matching Quantum enemy and boss animation candidates\n\nBake original Skitter, Driller, Wraith and Golem geometry at the Diver material/camera scale. Package 231 fixed-scale frames across 29 clips with hash-bound scenes and receipts. Follow actual AI phases, fit Golem anticipation/impact/recovery windows, resume interrupted attacks at their existing phase and hold terminal death frames. Validate 106 headless checks and 21 native gates over 2472 ticks, all core states and boss attacks, and 1854 exact contacts. Decode the native review recording. Coherent world art, Wraith teleport, final visual approval and MetroForge app generation remain pending; candidate/full-cast flags stay false.\n').trim();
assert.equal(originalIndex(),before);
const result = {status:'prepared',commit,parent,files:sources,changes,workingIndexPreserved:true,
  tests:{headless:106,native:21,ticks:2472,floorChecks:1854,floorFailures:0},frameCount:231,distinctImages:203,
  productionApproved:false,completeCast:false};
writeFileSync(join(reports,'github-quantum-cast-upload.json'),JSON.stringify(result,null,2));
if (process.argv.includes('--publish')) {
  git(['update-ref',branch,commit,parent]);
  git(['push','origin',branch+':'+branch]);
  assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],commit);
  assert.equal(originalIndex(),before);
  result.status = 'uploaded';
  result.url = 'https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
  writeFileSync(join(reports,'github-quantum-cast-upload.json'),JSON.stringify(result,null,2));
}
console.log(JSON.stringify({status:result.status,commit,changedFiles:changes.length,workingIndexPreserved:true,url:result.url}));
