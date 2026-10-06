/** Exercise the in-package native GUI fixture against a copied release PCK. */
import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const repo=resolve('.'),project=resolve(process.argv[2]||'');
assert.ok(process.argv[2]);assert.match(project,/^E:[/\\]/i);
const output=join(repo,'reports/game-tests/20261003-quantum-programming/packaged-workbench-'+Date.now());
const portable=join(output,'portable'),captures=join(output,'captures');mkdirSync(portable,{recursive:true});
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const standalone=JSON.parse(readFileSync(join(project,'reports/quantum-generation/standalone.json'),'utf8'));
assert.equal(standalone.passed,true);assert.equal(standalone.release,true);
for (const file of standalone.files) {assert.equal(sha(join(project,'build/windows',file.path)),file.sha256);cpSync(join(project,'build/windows',file.path),join(portable,file.path));}
assert.deepEqual(readdirSync(portable).sort(),['game.console.exe','game.exe','game.pck']);
const paths=['prototypes/quantum-divergence/tests/WorkbenchTests.gd','prototypes/quantum-divergence/scripts/WorkbenchRunDriver.gd','scripts/build-quantum-workbench-probe.mjs','scripts/verify-quantum-packaged-workbench.mjs'];
const derived=spawnSync(process.execPath,[join(repo,'scripts/build-quantum-workbench-probe.mjs'),'--check'],{cwd:repo,windowsHide:true,encoding:'utf8'});
assert.ifError(derived.error);assert.equal(derived.status,0,derived.stderr);
const proof={output,project,files:standalone.files,sourceHashes:Object.fromEntries(paths.map(path=>[path,sha(join(repo,path))])),productionReady:false,scope:'Copied executables/PCK only; verified in-package fixture drives actual native release Controls and game-owned input. No OS input, external script or source-asset fallback.'};
try {
 const env={...process.env,TEMP:'E:/MetroForgeData/Temp',TMP:'E:/MetroForgeData/Temp',APPDATA:'E:/MetroForgeData/AppData/QuantumGenerated',LOCALAPPDATA:'E:/MetroForgeData/AppData/QuantumGeneratedLocal'};
 const logs=await new Promise((accept,reject)=>{
  const child=spawn(join(portable,'game.console.exe'),['--position','-10000,-10000','--','--workbench-probe','--capture-dir='+captures.replaceAll('\\','/')],{cwd:portable,env,windowsHide:true});
  let logs='',error;const timer=setTimeout(()=>{error=new Error('Packaged workbench timed out');const kill=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>child.kill());},90000);
  child.stdout.on('data',bytes=>logs+=bytes.toString());child.stderr.on('data',bytes=>logs+=bytes.toString());child.on('error',failure=>error=failure);
  child.on('close',code=>{clearTimeout(timer);writeFileSync(join(output,'native.log'),logs);if(error||code!==0||/SCRIPT ERROR:|Parse Error:|ERROR:/.test(logs))reject(error??new Error('Packaged workbench failed: '+logs.slice(-2000)));else accept(logs);});
 });
 const marker='QUANTUM_WORKBENCH_RESULTS ';
 const line=logs.split(/\r?\n/).find(line=>line.startsWith(marker));assert.ok(line);
 proof.runtime=JSON.parse(line.slice(marker.length));assert.equal(proof.runtime.failed,0);assert.equal(proof.runtime.passed,22);
 assert.equal(proof.runtime.package.template_sha256,standalone.templateSha256);assert.equal(proof.runtime.package.integrity,true);
 for (const [file,hash] of Object.entries(proof.sourceHashes)) assert.equal(sha(join(repo,file)),hash);
 for (const file of proof.files) assert.equal(sha(join(portable,file.path)),file.sha256);
 proof.captures=['01-workbench.png','02-locked-blueprint.png','03-program-applied.png'].map(file=>({path:join(captures,file),sha256:sha(join(captures,file))}));
 proof.passed=true;
} catch(error) {proof.passed=false;proof.error=String(error.stack??error);process.exitCode=1;}
writeFileSync(join(output,'proof.json'),JSON.stringify(proof,null,2));writeFileSync(join(repo,'reports/game-tests/20261003-quantum-programming/packaged-latest.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({passed:proof.passed,checks:proof.runtime?.passed,output,error:proof.error}));
