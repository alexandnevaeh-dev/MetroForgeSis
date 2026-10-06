/** Reconcile the bounded Windows export feature against the confirmed GitHub parent. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const source = resolve('.');
const store = 'E:/MetroForgeData/GitHubUpload/20261003/quantum-publish-objectdb';
const parent = '08a2b3ea83d71542b3ec63c8a10ac0d6592c4614';
const output = 'E:/MetroForgeData/GitHubUpload/20261003/quantum-export-' + Date.now();
const tree = join(output,'tree');
const reviewDir = join(output,'review');
const backup = 'E:/MetroForgeData/Backups/20261003-quantum-export';
const report = join(source,'reports/game-tests/20261003-quantum-export-publication');
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
const normalized = bytes=>bytes.toString('utf8').replaceAll('\r\n','\n');
assert.match(source,/^E:[/\\]/i);
const git = args=>execFileSync('git',['-c','core.autocrlf=false','--git-dir='+store,...args],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
assert.equal(git(['rev-parse','refs/heads/codex/metroforge-epic-20261001']).trim(),parent);
mkdirSync(tree,{recursive:true}); mkdirSync(reviewDir,{recursive:true});
const archive = join(output,'parent.tar');
git(['archive','--format=tar','--output='+archive,parent]);
execFileSync('tar.exe',['-xf',archive,'-C',tree],{windowsHide:true});
const inherited = JSON.parse(readFileSync(join(tree,'docs/verification/quantum-generation-20261002/backend-proof.json'),'utf8'));
for (const entry of inherited.sources) assert.equal(sha(readFileSync(join(tree,entry.path))),entry.sha256,'Parent bytes changed: '+entry.path);
const edited = [
 'packages/generation/src/quantum-generation.ts','packages/generation/src/events.ts','packages/godot/src/quantum-assembler.ts',
 'scripts/package-quantum-runtime.mjs','scripts/verify-quantum-create-ui.mjs','scripts/verify-quantum-generation.mjs',
 'apps/desktop/src/studio/CreateScreen.tsx','apps/desktop/src/studio/creation-contract.ts','apps/desktop/src/studio/metroforge-api.ts',
 ...['GeneratedMines','WorldPlayground','CombatPlayground','ProgressionPlayground','Playground'].map(name=>'prototypes/quantum-divergence/scripts/'+name+'.gd')
];
const additions = ['packages/generation/src/quantum-runtime.ts','packages/generation/src/quantum-runtime.test.ts',
 'packages/generation/src/fixtures/quantum-release-evidence.json','scripts/verify-quantum-export.mjs',
 ...['Plugin.gd','RawFiles.gd','plugin.cfg'].map(name=>'prototypes/quantum-divergence/addons/quantum_export/'+name),
 'prototypes/quantum-divergence/export_presets.cfg'];
const review = {parent,source,tree,output,store,files:[],hashes:{},reconciliation:[],conflicts:[],status:'preparing',originalIndexSha256:sha(readFileSync(join(source,'.git/index')))};
const files = new Set();
function admit(file) {
 mkdirSync(dirname(join(tree,file)),{recursive:true}); cpSync(join(source,file),join(tree,file)); files.add(file);
}
for (const file of edited) {
 const flat = file.replaceAll('/','__');
 const beforeFile = join(backup,file.startsWith('prototypes/') && !file.endsWith('GeneratedMines.gd') ? file.split('/').at(-1) : flat);
 assert.ok(existsSync(beforeFile),'Missing pre-change backup: '+file);
 const published = normalized(readFileSync(join(tree,file)));
 const before = normalized(readFileSync(beforeFile));
 const current = normalized(readFileSync(join(source,file)));
 let merged;
 if (published===before || published===current) { admit(file); merged=current; }
 else {
  const prefix=join(reviewDir,flat);
  for (const [suffix,bytes] of [['published',published],['before',before],['current',current]]) writeFileSync(prefix+'.'+suffix,bytes);
  const result=spawnSync('git',['merge-file','-p',prefix+'.published',prefix+'.before',prefix+'.current'],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
  if (result.error || result.status!==0) {review.conflicts.push({file,status:result.status,error:result.error?.message??result.stderr});writeFileSync(prefix+'.conflict',result.stdout??'');continue;}
  merged=result.stdout; assert.ok(!/^(?:<<<<<<<|=======|>>>>>>>)/m.test(merged));
  writeFileSync(join(tree,file),merged); files.add(file);
 }
 review.reconciliation.push({file,priorUnpublished:published!==before,equalsCanonical:merged===current});
}
for (const file of additions) {assert.ok(!existsSync(join(tree,file)),'Unexpected parent addition: '+file);admit(file);}
function template(relative) {
 for (const entry of readdirSync(join(source,relative),{withFileTypes:true})) {
  const file=relative+'/'+entry.name;
  if (entry.isDirectory()) template(file);
  else {assert.ok(entry.isFile(),'Unexpected template link');if (!existsSync(join(tree,file)) || sha(readFileSync(join(tree,file)))!==sha(readFileSync(join(source,file)))) admit(file);}
 }
}
template('templates/godot-quantum-divergence');
const workspaces=[...readdirSync(join(tree,'packages')).map(name=>'packages/'+name),'apps/cli','apps/desktop'].filter(path=>existsSync(join(tree,path,'package.json')));
const names=Object.fromEntries(workspaces.map(path=>[JSON.parse(readFileSync(join(tree,path,'package.json'),'utf8')).name,join(tree,path)]));
function dependencies(path) {
 const origin=join(source,path,'node_modules'),target=join(tree,path,'node_modules');
 if (!existsSync(origin)) return;
 mkdirSync(target,{recursive:true});
 for (const entry of readdirSync(origin,{withFileTypes:true})) {
  if (['.bin','.vite','@metroforge'].includes(entry.name)) continue;
  if (entry.name.startsWith('@')) {mkdirSync(join(target,entry.name),{recursive:true});for (const name of readdirSync(join(origin,entry.name))) symlinkSync(realpathSync(join(origin,entry.name,name)),join(target,entry.name,name),'junction');}
  else symlinkSync(realpathSync(join(origin,entry.name)),join(target,entry.name),'junction');
 }
 mkdirSync(join(target,'@metroforge'),{recursive:true});for (const [name,directory] of Object.entries(names)) symlinkSync(directory,join(target,name),'junction');
}
if (!review.conflicts.length) {dependencies('');for (const path of workspaces) dependencies(path);}
review.files=[...files].sort();review.hashes=Object.fromEntries(review.files.map(file=>[file,sha(readFileSync(join(tree,file)))]));
review.status=review.conflicts.length?'needs-reconciliation':'ready-for-build';
mkdirSync(report,{recursive:true});writeFileSync(join(report,'latest.json'),JSON.stringify(review,null,2));writeFileSync(join(output,'review.json'),JSON.stringify(review,null,2));
console.log(JSON.stringify({status:review.status,tree,files:review.files.length,reconciliation:review.reconciliation,conflicts:review.conflicts}));
if (review.conflicts.length) process.exitCode=1;
