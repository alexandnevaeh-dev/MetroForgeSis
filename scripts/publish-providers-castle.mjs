/** Publish the source-bound review through a separate object store and index. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const canonical='E:/Metroforge/MetroForge-Publish';
const root='E:/MetroForgeData/GitHubUpload/20261003/providers-castle-review';
const store='E:/MetroForgeData/GitHubUpload/20261003/unity-upload-objectdb';
const branch='refs/heads/codex/metroforge-epic-20261001';
const review=JSON.parse(readFileSync(join(root,'providers-review.json'),'utf8'));
const proof=JSON.parse(readFileSync(join(root,'docs/verification/providers-castle-20261003/summary.json'),'utf8'));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(proof.unitPassed,170);assert.equal(proof.unitFailed,0);
assert.equal(proof.uiPassed,true);assert.equal(proof.uiChecks,44);
assert.equal(proof.godot.requiredPassed,292);assert.equal(proof.godot.requiredFailed,0);
assert.equal(proof.unity.passed,true);assert.equal(proof.unity.checksPassed,78);
assert.equal(hash(join(canonical,'.git/index')),review.originalIndexSha256);
const forbidden=[/gh[pousr]_[A-Za-z0-9]{35,}/,/github_pat_[A-Za-z0-9_]{70,}/,/sk-(?:proj-)?[A-Za-z0-9_-]{40,}/,/nvapi-[A-Za-z0-9_-]{45,}/,/AIza[0-9A-Za-z_-]{35}/,/gsk_[A-Za-z0-9]{40,}/,/hf_[A-Za-z0-9]{30,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
for(const file of review.files){
 assert.ok(!file.includes('..')&&!/credentials\.enc|(^|\/)\.env($|\.)/.test(file));
 assert.equal(hash(join(root,file)),review.hashes[file],'Review source changed '+file);
 if(review.sourceHashes[file])assert.equal(hash(join(canonical,file)),review.sourceHashes[file],'Working source changed '+file);
 if(!file.endsWith('.png'))for(const pattern of forbidden)assert.ok(!pattern.test(readFileSync(join(root,file),'utf8')),'Secret-like data in '+file);
}
const report=join(canonical,'reports/game-tests/20261003-providers-publication');mkdirSync(report,{recursive:true});
const env={...process.env,GIT_INDEX_FILE:join(report,'providers-publication.index'),GH_CONFIG_DIR:'E:/MetroForgeData/AppData/GitHubCLI'};
const git=(args,input,raw=false)=>execFileSync('git',['-c','core.autocrlf=false','--git-dir='+store,'--work-tree='+root,...args],{env,input,encoding:raw?undefined:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],review.parent,'Publication branch moved; preserve and reconcile');
git(['read-tree',review.parent]);
for(const file of review.files){const blob=git(['hash-object','-w','--stdin'],readFileSync(join(root,file))).trim();git(['update-index','--add','--cacheinfo','100644',blob,file]);}
const changed=git(['diff','--cached','--name-only',review.parent]).trim().split(/\r?\n/);
assert.ok(changed.every(file=>review.files.includes(file)));
const tree=git(['write-tree']).trim();
const commit=git(['commit-tree',tree,'-p',review.parent],'Add local and hosted chat connections and expand Stormglass castle rooms\n\nProvide encrypted Together, Cerebras, Mistral and optional LM Studio keys, server/model preferences and filtered connection setup. Expand the separate castle candidate, add collision-bound masonry and preserve readable camera scale. Validate 170 isolated tests, 44 packaged connection checks, 292 required Godot checks and 78 diagnostic Unity terrain checks. Full expanded-world traversal and final art approval remain pending.\n').trim();
const receipt={status:'prepared',parent:review.parent,commit,tree,sourceTree:root,changed,files:review.hashes,originalIndexSha256:review.originalIndexSha256,workingIndexPreserved:true,productionReady:false};
writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
if(process.argv.includes('--publish')){
 git(['push','origin',commit+':'+branch]);assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],commit);
 git(['update-ref',branch,commit,review.parent]);
 assert.equal(hash(join(canonical,'.git/index')),review.originalIndexSha256);
 for(const file of changed)assert.equal(createHash('sha256').update(git(['show',commit+':'+file],undefined,true)).digest('hex'),review.hashes[file]);
 receipt.status='uploaded';receipt.url='https://github.com/alexandnevaeh-dev/MetroForgeSis/commit/'+commit;
 writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
}
console.log(JSON.stringify({status:receipt.status,commit,files:changed.length,url:receipt.url,indexPreserved:true}));
