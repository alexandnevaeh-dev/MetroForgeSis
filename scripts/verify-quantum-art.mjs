import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { decodePngRgba } from '../packages/assets/dist/png.js';

const repo = resolve('.');
const candidate = resolve(process.argv.find(value => value.startsWith('--candidate='))?.slice(12) || '');
assert.ok(/^E:[\\/]/i.test(candidate) && existsSync(join(candidate,'manifest.json')), 'Provide an E: candidate pack');
const reports = join(repo,'reports/game-tests/20261001-quantum-divergence');
const output = join(reports,'art-review-' + Date.now());
mkdirSync(output,{recursive:true});
const env = {...process.env,TEMP:'E:/MetroForgeData/Temp',TMP:'E:/MetroForgeData/Temp',
  APPDATA:'E:/MetroForgeData/AppData/QuantumGodot',LOCALAPPDATA:'E:/MetroForgeData/AppData/QuantumGodotLocal',
  TORCH_DEVICE_BACKEND_AUTOLOAD:'0'};
const paths = ['workers/diffusers_image_worker.py','workers/foreground_isolation.py','workers/u2net_model.py',
  'scripts/produce-quantum-art.py','scripts/isolate-quantum-art.py','scripts/prepare-quantum-art.py',
  'scripts/install-quantum-style.py','scripts/install-quantum-matte.py','scripts/test-quantum-style.py',
  'scripts/test-conditioning-provenance.py','workers/test_diffusers_placement.py','scripts/test_diffusers_prompt_budget.py',
  'scripts/verify-quantum-art.mjs','prototypes/quantum-divergence/scripts/ArtReviewPreview.gd',
  'prototypes/quantum-divergence/scenes/ArtReviewPreview.tscn'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = paths.map(path => ({path,sha256:hash(readFileSync(join(repo,path)))}));
function run(exe,args,name,timeout=120000) {
  const result = spawnSync(exe,args,{env,windowsHide:true,encoding:'utf8',timeout,maxBuffer:4*1024*1024});
  const logs = (result.stdout || '') + (result.stderr || '');
  writeFileSync(join(output,name + '.log'),logs + (result.error ? '\n'+String(result.error) : ''));
  assert.equal(result.status,0, name + ' failed; evidence: ' + output);
  assert.ok(!/SCRIPT ERROR:|Parse Error:/.test(logs));
  return logs;
}
const python = 'E:/MetroForgeData/Python/diffusers-native/Scripts/python.exe';
const style = JSON.parse(run(python,['scripts/test-quantum-style.py'],'adapter').trim());
assert.equal(style.failed,0);
assert.equal(style.passed,16);
let regressionPassed = 0;
for (const [path,name] of [['scripts/test-conditioning-provenance.py','conditioning'],
  ['workers/test_diffusers_placement.py','placement'],['scripts/test_diffusers_prompt_budget.py','prompt']]) {
  const logs = run(python,[path],name);
  assert.ok(/\bOK\b/.test(logs));
  regressionPassed += Number(logs.match(/Ran (\d+) tests?/)[1]);
}
const manifest = JSON.parse(readFileSync(join(candidate,'manifest.json'),'utf8'));
assert.equal(manifest.genre,'quantum-divergence');
assert.equal(manifest.candidateOnly,true);
assert.equal(manifest.productionApproved,false);
assert.equal(manifest.animationReady,false);
const rejectionCases = [
  ['rejected-art',review => {review.jobs['diver-seed-b'].status='rejected';}],
  ['changed-review-source',review => {review.jobs['diver-seed-b'].sourceSha256='0'.repeat(64);}],
];
const isolation = JSON.parse(readFileSync(join(candidate,'isolation-receipts.json'),'utf8'));
let rejectionPassed = 0;
for (const [name,mutate] of rejectionCases) {
  const review = JSON.parse(readFileSync(join(candidate,'visual-review.json'),'utf8'));
  mutate(review);
  const reviewPath = join(output,name+'.json');
  writeFileSync(reviewPath,JSON.stringify(review));
  const rejectedOutput = join(output,name+'-must-not-exist');
  const result = spawnSync(python,['scripts/prepare-quantum-art.py','--source',isolation.source,
    '--output',rejectedOutput,'--diver-job','diver-seed-b','--actors','diver',
    '--review',reviewPath],{env,windowsHide:true,encoding:'utf8',timeout:30000});
  writeFileSync(join(output,name+'.log'),(result.stdout || '')+(result.stderr || ''));
  assert.equal(result.status,1,'Rejected source cannot be normalized');
  assert.ok(/Unreviewed\/rejected\/changed source/.test(result.stderr));
  assert.equal(existsSync(rejectedOutput),false,'Reject before publishing any candidate files');
  rejectionPassed++;
}
const godot = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const renderLog = run(godot,['--path',join(repo,'prototypes/quantum-divergence'),
  '--position','-10000,-10000','res://scenes/ArtReviewPreview.tscn','--',
  '--candidate='+candidate,'--capture-dir='+output],'native');
assert.ok(/NVIDIA GeForce RTX 5060/.test(renderLog),'Require the actual GPU renderer');
const native = JSON.parse(readFileSync(join(output,'art-review-result.json'),'utf8'));
assert.equal(Object.keys(native.checks).length,10);
assert.ok(Object.values(native.checks).every(value => value === true));
const png = decodePngRgba(readFileSync(join(output,'art-review.png')));
assert.equal(png.width,960);
assert.equal(png.height,600);
for (const source of sources) assert.equal(hash(readFileSync(join(repo,source.path))),source.sha256,'Source changed during verification');
const result = {output,candidate,sources,manifestSha256:hash(readFileSync(join(candidate,'manifest.json'))),
  style,regressionPassed,rejectionPassed,native,capture:join(output,'art-review.png'),
  productionApproved:false,animationReady:false,
  scope:'32 Python adapter/regression checks, 2 real rejection checks and 10 native static alpha-anchor/floor checks. Not visual approval, complete animations, full-world replacement or MetroForge app generation.'};
writeFileSync(join(reports,'art-latest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({output,adapter:style.passed,regression:regressionPassed,
  rejection:rejectionPassed,native:Object.keys(native.checks).length,capture:result.capture,scope:result.scope}));
