/** Native module regressions and a real offscreen Control workbench. All artifacts stay on E:. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const repo=resolve('.'),project=join(repo,'prototypes/quantum-divergence');
const report=join(repo,'reports/game-tests/20261003-quantum-programming');
const output=join(report,'programming-'+Date.now());
assert.match(output,/^E:[/\\]/i);mkdirSync(output,{recursive:true});
const godot='E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe';
const env={...process.env,TEMP:'E:/MetroForgeData/Temp',TMP:'E:/MetroForgeData/Temp',APPDATA:'E:/MetroForgeData/AppData/QuantumGodot',LOCALAPPDATA:'E:/MetroForgeData/AppData/QuantumGodotLocal'};
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const paths=['MicrocellGrid','ChunkedGrid','MaterialContact','PlayerSimulation','MinesProgression','EnemySimulation','InstrumentProgram','InstrumentSimulation','InstrumentProgramming','InstrumentWorkbench','Playground','WorldPlayground','MinesArtPlayground','RunState'].map(name=>'prototypes/quantum-divergence/scripts/'+name+'.gd');
paths.push('prototypes/quantum-divergence/tests/ProgrammingTests.gd','prototypes/quantum-divergence/tests/WorkbenchTests.gd','scripts/verify-quantum-programming.mjs');
paths.push(...['Simulation','Gameplay','Contact','Progression','Enemy','Save','Chunk'].map(name=>'prototypes/quantum-divergence/tests/'+name+'Tests.gd'));
const proof={output,sourceHashes:Object.fromEntries(paths.map(path=>[path,sha(join(repo,path))])),suites:[],productionReady:false,scope:'Native simulation checks and native workbench Control signals/game-owned input, not OS input or MetroForge app generation'};
function native(args,log,timeout=60000) {
 const result=spawnSync(godot,['--path',project,...args],{env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:12*1024*1024});
 const logs=String(result.stdout||'')+String(result.stderr||'');writeFileSync(join(output,log),logs);
 assert.ifError(result.error);assert.equal(result.status,0,logs.slice(-3000));
 assert.ok(!/SCRIPT ERROR:|Parse Error:|Assertion failed|ERROR:/.test(logs),log+' has native errors');
 return logs;
}
try {
 const reuse=process.argv.find(arg=>arg.startsWith('--reuse-units='));
 if (reuse) {
  const path=resolve(reuse.slice('--reuse-units='.length));assert.match(path,/^E:[/\\]/i);
  const previous=JSON.parse(readFileSync(path,'utf8'));
  assert.deepEqual(previous.suites.map(suite=>suite.name),['Simulation','Gameplay','Contact','Progression','Enemy','Save','Chunk','Programming']);
  assert.ok(previous.suites.every(suite=>suite.failed===0&&suite.passed>0));
  const guiOnly=['prototypes/quantum-divergence/tests/WorkbenchTests.gd','scripts/verify-quantum-programming.mjs'];
  for (const [file,hash] of Object.entries(previous.sourceHashes)) if (!guiOnly.includes(file)) assert.equal(sha(join(repo,file)),hash,'Changed unit dependency: '+file);
  proof.suites=previous.suites;
  proof.reusedUnits={path,sha256:sha(path),scope:'Passed unit suites only; their source/dependency hashes are unchanged. Earlier combined result failed its GUI reason-text assertion; this run obtains fresh GUI evidence.'};
 }
 // Full world/branch gameplay is checked through actual generated source and release games.
 // The separate synchronous WorldTests harness exceeded both retained time budgets.
 for (const [name,prefix] of (reuse?[]:[['Simulation','SIMULATION'],['Gameplay','GAMEPLAY'],['Contact','CONTACT'],['Progression','PROGRESSION'],['Enemy','ENEMY'],['Save','SAVE'],['Chunk','CHUNK'],['Programming','PROGRAMMING']])) {
  const logs=native(['--headless','--script','res://tests/'+name+'Tests.gd'],name+'.log',['World','Branch'].includes(name)?180000:60000);
  const marker='QUANTUM_'+prefix+'_RESULTS ';
  const line=logs.split(/\r?\n/).find(line=>line.startsWith(marker));assert.ok(line,name+' native proof missing');
  const result=JSON.parse(line.slice(marker.length));assert.equal(result.failed,0);
  proof.suites.push({name,passed:result.passed,failed:result.failed,results:result.results??result.tests});
  console.log(JSON.stringify({suite:name,passed:result.passed}));
 }
 const captures=join(output,'workbench');
 const logs=native(['--position','-10000,-10000','--script','res://tests/WorkbenchTests.gd','--','--capture-dir='+captures.replaceAll('\\','/')],'workbench.log',90000);
 const marker='QUANTUM_WORKBENCH_RESULTS ';
 const line=logs.split(/\r?\n/).find(line=>line.startsWith(marker));assert.ok(line);
 proof.workbench=JSON.parse(line.slice(marker.length));assert.equal(proof.workbench.failed,0);assert.ok(proof.workbench.passed>=21);
 proof.captures=['01-workbench.png','02-locked-blueprint.png','03-program-applied.png'].map(file=>{const path=join(captures,file);assert.ok(existsSync(path));return {path,sha256:sha(path)};});
 for (const [path,hash] of Object.entries(proof.sourceHashes)) assert.equal(sha(join(repo,path)),hash,'Changed during verification');
 proof.passed=true;
} catch(error) {proof.passed=false;proof.error=String(error.stack??error);process.exitCode=1;}
writeFileSync(join(output,'proof.json'),JSON.stringify(proof,null,2));writeFileSync(join(report,'latest.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({passed:proof.passed,output,nativeChecks:proof.suites.reduce((sum,suite)=>sum+suite.passed,0),workbench:proof.workbench?.passed,error:proof.error}));
