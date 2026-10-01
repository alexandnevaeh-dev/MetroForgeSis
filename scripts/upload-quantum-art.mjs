import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Explicit source snapshot. Never stage/reset the user's original checkout.
const repo = resolve('.');
const reports = join(repo,'reports/game-tests/20261001-quantum-divergence');
const store = 'E:/MetroForgeData/GitHubUpload/20261001/quantum-saves.git';
const branch = 'refs/heads/codex/metroforge-epic-20261001';
const parent = '2abb0b899500200093a79ae833026e569545d88d';
const files = [
  'docs/development/QUANTUM_DIVERGENCE.md','docs/development/QUANTUM_ART_PIPELINE.md',
  'workers/diffusers_image_worker.py','workers/foreground_isolation.py','workers/u2net_model.py',
  'workers/requirements-quantum-style.txt','workers/test_diffusers_placement.py',
  'scripts/produce-quantum-art.py','scripts/isolate-quantum-art.py','scripts/prepare-quantum-art.py',
  'scripts/install-quantum-style.py','scripts/install-quantum-matte.py','scripts/test-quantum-style.py',
  'scripts/test-conditioning-provenance.py','scripts/test_diffusers_prompt_budget.py',
  'scripts/verify-quantum-art.mjs','scripts/upload-quantum-art.mjs',
  'prototypes/quantum-divergence/scripts/ArtReviewPreview.gd',
  'prototypes/quantum-divergence/scenes/ArtReviewPreview.tscn',
  ...[1,2,3,4].map(version => 'prototypes/quantum-divergence/assets/source-specs/'+
    (version===1 ? 'quantum-art-v1.json' : `quantum-cast-v${version}.json`)),
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const secrets = [/gh[pousr]_[A-Za-z0-9]{35,}/,/github_pat_[A-Za-z0-9_]{70,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/,/nvapi-[A-Za-z0-9_-]{45,}/,/AIza[0-9A-Za-z_-]{35}/,
  /gsk_[A-Za-z0-9]{40,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /copilot\.microsoft\.com\/(?:conversations\/join|chats)\//];
const sourceHashes = files.map(path => {
  const bytes = readFileSync(join(repo,path));
  if (statSync(join(repo,path)).size > 1024*1024 || secrets.some(pattern=>pattern.test(bytes.toString('utf8')))) throw Error('Source review rejected '+path);
  return {path,sha256:hash(bytes)};
});
const proof = JSON.parse(readFileSync(join(reports,'art-latest.json'),'utf8'));
if (proof.style.failed !== 0 || proof.style.passed !== 16 || proof.regressionPassed !== 16 ||
  proof.rejectionPassed !== 2 || Object.keys(proof.native.checks).length !== 10 ||
  Object.values(proof.native.checks).some(value=>value!==true) || proof.productionApproved !== false || proof.animationReady !== false) throw Error('Art verification incomplete');
if (!existsSync(proof.capture)) throw Error('Actual viewport evidence missing');
for (const source of proof.sources) if (hash(readFileSync(join(repo,source.path))) !== source.sha256) throw Error('Art source changed after verification: '+source.path);
if (hash(readFileSync(join(proof.candidate,'manifest.json'))) !== proof.manifestSha256) throw Error('Candidate changed after verification');
const victory = JSON.parse(readFileSync(join(reports,'world-victory-latest.json'),'utf8'));
for (const source of victory.sources) if (hash(readFileSync(join(repo,'prototypes/quantum-divergence',source.path))) !== source.sha256) throw Error('Verified world source changed: '+source.path);
const originalIndex = join(repo,'.git/index');
const indexHash = () => existsSync(originalIndex) ? hash(readFileSync(originalIndex)) : null;
const beforeIndex = indexHash();
const env = {...process.env,GIT_DIR:store,GIT_WORK_TREE:repo,
  GIT_ALTERNATE_OBJECT_DIRECTORIES:join(repo,'.git/objects'),
  GIT_INDEX_FILE:join(reports,'quantum-art-upload-'+Date.now()+'.index'),
  GH_CONFIG_DIR:'E:/MetroForgeData/AppData/GitHubCLI'};
const git = (args,input) => execFileSync('git',args,{env,input,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
if (git(['rev-parse',branch]).trim()!==parent || git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0]!==parent) throw Error('Upload branch changed; reconcile before retry');
git(['read-tree',parent]);
git(['add','--force','--',...files]);
const changes = git(['diff','--cached','--name-status',parent]).trim().split('\n').filter(Boolean);
if (!changes.length || changes.some(line=>line.startsWith('D\t') || !files.includes(line.split('\t').at(-1)))) throw Error('Unexpected snapshot changes');
const tree = git(['write-tree']).trim();
const commit = git(['commit-tree',tree,'-p',parent],
  'Add verified local pixel-art production and static review pipeline\n\nLoad explicitly requested, hash-verified local Pixel Art XL weights before CUDA offload, with separate pipeline identities and fail-closed unsupported conditioning. Add pinned E-resident style/isolation installers, actual U2-Net matte receipts, reviewed-source normalization gates and a native static alpha-anchor review. Preserve failed and rejected source batches locally. Verify 32 worker checks, two source rejection cases and ten RTX viewport checks. No generated candidate is admitted into the playable world; final matching cast, clean boot alpha and animation strips remain pending.\n').trim();
const result = {status:'prepared',commit,parent,files:sourceHashes,tests:{adapter:16,regression:16,rejection:2,native:10},
  productionApproved:false,animationReady:false,workingIndexPreserved:indexHash()===beforeIndex};
writeFileSync(join(reports,'github-quantum-art-upload.json'),JSON.stringify(result,null,2));
if (!result.workingIndexPreserved) throw Error('Original index changed before upload');
git(['update-ref',branch,commit,parent]);
git(['push','origin',branch+':'+branch]);
if (git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0]!==commit || indexHash()!==beforeIndex) throw Error('Post-upload verification failed');
result.status='uploaded';
result.url='https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
writeFileSync(join(reports,'github-quantum-art-upload.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,commit,files:files.length,workingIndexPreserved:true,url:result.url}));
