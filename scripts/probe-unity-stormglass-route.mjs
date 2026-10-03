/** Stage a standalone Unity route probe so prior builds, QA and saves remain untouched. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,statfsSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const repo=resolve('.');
const origin=resolve(process.argv[2]||'E:/MetroForgeData/TestArtifacts/engine-gpu-20261001/stormglass-unity/Builds/Windows');
const timeoutArgument=process.argv.find(argument=>argument.startsWith('--timeout='));
const timeout=timeoutArgument?Number(timeoutArgument.slice('--timeout='.length)):180;
assert.ok(Number.isInteger(timeout)&&timeout>=15&&timeout<=600);
const modeArgument=process.argv.find(argument=>argument.startsWith('--mode='));
const mode=modeArgument?modeArgument.slice('--mode='.length):'normal_input';
assert.ok(['normal_input','capture'].includes(mode));
assert.match(origin,/^E:[/\\]/i);
const bindingFile=join(origin,'source-binding.json');
assert.ok(existsSync(bindingFile),'Build through SourceBoundBuild.BuildWindows before probing; a source-binding manifest is required');
const binding=JSON.parse(readFileSync(bindingFile,'utf8'));
assert.equal(binding.schema,'metroforge.unity.source-binding.v1');
assert.equal(binding.inputsUnchanged,true,'Authored inputs changed during native build');
const output=join(repo,'reports/game-tests/20261003-unity-route','run-'+Date.now());
const portable=join(output,'portable');
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const space=statfsSync(origin);assert.ok(space.bavail*space.bsize>1024*1024*1024,'Need at least 1 GiB free on E:');
mkdirSync(portable,{recursive:true});
for(const entry of readdirSync(origin,{withFileTypes:true})) {
 assert.ok(!entry.isSymbolicLink());
 if(entry.name==='qa')continue;
 cpSync(join(origin,entry.name),join(portable,entry.name),{recursive:entry.isDirectory()});
}
const hashes=Object.fromEntries(['ConduitFoundry.exe','UnityPlayer.dll','ConduitFoundry_Data/Managed/Assembly-CSharp.dll','ConduitFoundry_Data/StreamingAssets/gameplay.json'].map(file=>[file,sha(join(portable,file))]));
const sources=Object.fromEntries(['GameBootstrap','PlayerActor','EnemyActor','BossController','AcceptanceDriver'].map(name=>['templates/unity-metroidvania/Assets/Scripts/'+name+'.cs',sha(join(repo,'templates/unity-metroidvania/Assets/Scripts/'+name+'.cs'))]));
for(const [file,hash] of Object.entries(hashes))assert.equal(binding.artifacts.find(entry=>entry.path===file)?.sha256,hash,'Native artifact differs from the source-bound build: '+file);
for(const [file,hash] of Object.entries(sources))assert.equal(binding.inputs.find(entry=>entry.path===file.replace('templates/unity-metroidvania/',''))?.sha256,hash,'Current template differs from the compiled source: '+file);
const proof={output,origin,hashes,sources,bindingSha256:sha(bindingFile),binding,timeout,mode,scope:'Copied source-bound Unity Windows player; game-owned Input System events; no OS input, warps or health grants for traversal. Existing generic driver has separately labeled direct damage/save probes. Capture mode renders the actual native camera offscreen, not an OS window screenshot.',productionReady:false};
const env={...process.env,TEMP:'E:/MetroForgeData/Temp',TMP:'E:/MetroForgeData/Temp',METROFORGE_GAME_SAVE_DIR:join(output,'saves'),APPDATA:'E:/MetroForgeData/AppData/UnityRoute',LOCALAPPDATA:'E:/MetroForgeData/AppData/UnityRouteLocal'};
const log=join(output,'native.log');
console.log(JSON.stringify({stage:'native-route-starting',output,origin}));
try {
 const code=await new Promise((accept,reject)=>{
  const child=spawn(join(portable,'ConduitFoundry.exe'),['-batchmode','-screen-width','960','-screen-height','600','-acceptance','-acceptanceMode='+mode,'-acceptanceTimeout='+timeout,'-logFile',log],{cwd:portable,env,windowsHide:true,stdio:'ignore'});
  let error;const timer=setTimeout(()=>{error=new Error('Owned Unity route process exceeded its bounded timeout');const kill=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>child.kill());},(timeout+60)*1000);
  child.on('error',failure=>{clearTimeout(timer);reject(failure);});
  child.on('close',code=>{clearTimeout(timer);if(error)reject(error);else accept(code);});
 });
 proof.exitCode=code;
 assert.ok(existsSync(join(portable,'qa/acceptance-result.json')),'Native result missing');
 proof.runtime=JSON.parse(readFileSync(join(portable,'qa/acceptance-result.json'),'utf8'));
 const logs=readFileSync(log,'utf8');
 proof.runtimeErrors=logs.split(/\r?\n/).filter(line=>/Exception:|Destroying GameObjects immediately|error CS\d+/.test(line));
 proof.passed=code===0&&proof.runtime.status==='PASS'&&proof.runtimeErrors.length===0;
 for(const [file,hash]of Object.entries(hashes))assert.equal(sha(join(portable,file)),hash);
 if(!proof.passed)process.exitCode=1;
}catch(error){proof.passed=false;proof.error=String(error.stack??error);process.exitCode=1;}
mkdirSync(join(repo,'reports/game-tests/20261003-unity-route'),{recursive:true});
writeFileSync(join(output,'proof.json'),JSON.stringify(proof,null,2));
writeFileSync(join(repo,'reports/game-tests/20261003-unity-route/latest.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({passed:proof.passed,output,exitCode:proof.exitCode,room:proof.runtime?.room,rooms:proof.runtime?.roomsVisitedCount,reason:proof.runtime?.reason,errors:proof.runtimeErrors?.length,error:proof.error}));
