/** Publish only verified connection/workflow changes; use a separate Git index. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
const canonical = 'E:/Metroforge/MetroForge-Publish';
const report = join(canonical,'reports/game-tests/20261003-connections-publication');
const review = JSON.parse(readFileSync(join(report,'latest.json'),'utf8'));
const root = review.tree;
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const load = path => JSON.parse(readFileSync(join(root,path),'utf8'));
const keys = load('reports/game-tests/20261003-connections/latest.json');
const create = load('reports/game-tests/20261002-quantum-create-ui/latest.json');
const unit = load('reports/game-tests/20261003-connections/unit-tests.json');
const audit = load('reports/game-tests/20261003-connections/strict-audit.json');
assert.equal(review.parent,'08cd67fa799ba9d461fb7306bb84447c69ccc759');
assert.equal(keys.passed,true); assert.equal(keys.checks.length,30); assert.ok(keys.checks.every(check=>check.passed));
assert.ok(keys.packaged); assert.equal(sha(keys.packaged.executable),keys.packaged.sha256);
assert.equal(create.passed,true); assert.equal(create.checks.length,28); assert.ok(create.checks.every(check=>check.passed));
assert.equal(create.superseded,undefined); assert.equal(unit.success,true); assert.equal(unit.numPassedTests,30); assert.equal(unit.numFailedTests,0);
assert.equal(audit.summary.errors,0); assert.equal(audit.summary.unresolved,0);
for (const proof of [keys,create]) for (const [path,hash] of Object.entries(proof.sourceHashes)) assert.equal(sha(join(root,path)),hash,'Changed tested source '+path);
for (const [path,hash] of Object.entries(review.hashes)) {
  assert.equal(sha(join(root,path)),hash,'Changed admitted source '+path);
  assert.equal(sha(join(canonical,path)),hash,'Canonical source changed since review '+path);
}
assert.equal(create.runtime.waypoints,161); assert.equal(create.runtime.extracted,true);
assert.equal(create.standalone.waypoints,161); assert.equal(create.standalone.release,true);
assert.deepEqual(create.collisionPreservation.changed,[]);
const evidence='docs/verification/connections-20261003';
mkdirSync(join(root,evidence),{recursive:true});
const files=[...review.files];
function admit(from,to){mkdirSync(dirname(join(root,to)),{recursive:true});cpSync(from,join(root,to));files.push(to);}
admit(join(root,'reports/game-tests/20261003-connections/latest.json'),evidence+'/connections-proof.json');
admit(join(root,'reports/game-tests/20261002-quantum-create-ui/latest.json'),evidence+'/generation-proof.json');
admit(join(root,'reports/game-tests/20261003-connections/unit-tests.json'),evidence+'/unit-tests.json');
admit(join(root,'reports/game-tests/20261003-connections/strict-audit.json'),evidence+'/strict-audit.json');
admit(join(root,'reports/game-tests/20261003-connections/build-validation.json'),evidence+'/build-validation.json');
for(const capture of ['01-api-keys.png','03-narrow.png']) admit(join(keys.output,capture),evidence+'/'+capture);
for(const capture of ['03-result.png','05-narrow.png']) admit(join(create.output,capture),evidence+'/generation-'+capture);
const readme = `# MetroForge connections and workflow validation, 2026-10-03\n\nAPI Keys now provides masked entry, encrypted Windows-account storage, replacement and explicit removal for eight existing hosted providers. Environment keys remain supported. Only key presence/source returns to the renderer. New jobs use acknowledged saved keys; health, quota and provider enablement remain separate. The real packaged executable passed 30 hidden Electron checks with synthetic keys, including restart, disk failure and recovery, environment fallback, keyboard save and a narrow viewport. Packaged renderer, preload, handlers and credential module matched the tested build byte for byte. No OS-level input or focus automation was used.\n\nThe studio navigation leads with task names. Shared forms retain application validation and fixed textarea sizing. Text-provider readiness excludes disabled backends and does not imply engine/image readiness. New Game remains mounted during navigation, and the monitor restores real event history. The frozen build passed 28 real-app creation checks, generated a copied standalone Windows game, completed all 161 route waypoints, and preserved the first game's ${create.collisionPreservation.files} files after a duplicate-title failure.\n\nValidation: full workspace build, renderer/Electron typechecks and native bundle succeeded; 30 focused unit tests passed; strict current-desktop-source audit reported zero findings; the DESIGN.md linter returned zero errors and one warning about the existing prose-only document. Formatting checks passed for the new credential modules. Screenshots are actual hidden webContents captures after frame synchronization.\n\nLimits: synthetic keys prove storage behavior, not service authentication. No new paid provider is enabled. These checks do not approve final game art, animations, audio, full accessibility, performance, native Unreal gameplay or release readiness. Broader MetroForge development remains ongoing. No vaults, keys, .env files, caches, model downloads or generated games are published.\n`;
writeFileSync(join(root,evidence,'README.md'),readme); files.push(evidence+'/README.md');
const patterns=[/gh[pousr]_[A-Za-z0-9]{35,}/,/github_pat_[A-Za-z0-9_]{70,}/,/sk-(?:proj-)?[A-Za-z0-9_-]{40,}/,/nvapi-[A-Za-z0-9_-]{45,}/,/AIza[0-9A-Za-z_-]{35}/,/gsk_[A-Za-z0-9]{40,}/,/hf_[A-Za-z0-9]{30,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
assert.equal(new Set(files).size,files.length);
for(const file of files){assert.ok(!file.includes('..')&&!/credentials\.enc|(^|\/)\.env($|\.)/.test(file));if(!file.endsWith('.png'))for(const pattern of patterns)assert.ok(!pattern.test(readFileSync(join(root,file),'utf8')),'Secret-like data in '+file);}
const index=join(report,'publication.index');
const env={...process.env,GIT_INDEX_FILE:index,GH_CONFIG_DIR:'E:/MetroForgeData/AppData/GitHubCLI'};
const git=(args,input,raw=false)=>execFileSync('git',['-c','core.autocrlf=false','--git-dir='+review.store,'--work-tree='+root,...args],{env,input,encoding:raw?undefined:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
const branch='refs/heads/codex/metroforge-epic-20261001';
assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],review.parent);
assert.equal(sha(join(canonical,'.git/index')),review.originalIndexSha256);
git(['read-tree',review.parent]);
const sources=files.map(path=>({path,sha256:sha(join(root,path))}));
for(const file of files){const blob=git(['hash-object','-w','--stdin'],readFileSync(join(root,file))).trim();git(['update-index','--add','--cacheinfo','100644',blob,file]);}
const changed=git(['diff','--cached','--name-only',review.parent]).trim().split(/\r?\n/);
assert.ok(changed.every(file=>files.includes(file)));
const tree=git(['write-tree']).trim();
const commit=git(['commit-tree',tree,'-p',review.parent],'Add encrypted API key setup and resilient studio navigation\n\nProvide masked connection forms for supported hosted providers, preserve environment fallbacks, and distinguish saved keys from service health. Keep live creation state during navigation, improve task labels and shared form behavior. Validate encrypted storage in the packaged Windows app and complete a fresh app-generated standalone game route.\n').trim();
const receipt={status:'prepared',parent:review.parent,commit,tree,sourceTree:root,files:sources,changed,originalIndexSha256:review.originalIndexSha256,workingIndexPreserved:true,tests:{unit:30,packagedConnections:30,realAppGeneration:28,waypoints:161,unchangedGameFiles:create.collisionPreservation.files,strictAuditErrors:0},productionReady:false};
writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
if(process.argv.includes('--publish')){
  git(['push','origin',commit+':'+branch]);
  assert.equal(git(['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0],commit);
  git(['update-ref',branch,commit,review.parent]);
  assert.equal(sha(join(canonical,'.git/index')),review.originalIndexSha256);
  for(const file of sources)assert.equal(createHash('sha256').update(git(['show',commit+':'+file.path],undefined,true)).digest('hex'),file.sha256);
  receipt.status='uploaded'; receipt.url='https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
  writeFileSync(join(report,'upload.json'),JSON.stringify(receipt,null,2));
}
console.log(JSON.stringify({status:receipt.status,commit,files:changed.length,tests:receipt.tests,url:receipt.url,indexPreserved:true}));
