/** Probe a source-bound Windows player in a fresh E: copy and save directory. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,statfsSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {readRoutePlan,residentPath,sha,validateSourceBinding} from './lib/unity-route-probe.mjs';

const args=process.argv.slice(2),positional=args.filter(a=>!a.startsWith('--'));
assert.ok(positional.length<=1,'Provide one native build directory');
for(const arg of args.filter(a=>a.startsWith('--')))assert.ok(arg==='--visible'||/^--(timeout|mode|route-plan|output-root)=/.test(arg),'Unknown argument: '+arg);
const option=(name,fallback)=>args.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const repo=residentPath(resolve('.'),'Repository');
const origin=residentPath(resolve(positional[0]??'E:/MetroForgeData/TestArtifacts/engine-gpu-20261001/stormglass-unity/Builds/Windows'),'Native build');
const timeout=Number(option('timeout','180')),mode=option('mode','normal_input'),visible=args.includes('--visible');
assert.ok(Number.isInteger(timeout)&&timeout>=15&&timeout<=600,'Timeout must be 15–600 seconds');
assert.ok(['normal_input','capture','region_route'].includes(mode),'Unsupported probe mode');
const routeFile=option('route-plan',null);
assert.equal(Boolean(routeFile),mode==='region_route','A route plan is required only for region_route');
const route=routeFile?readRoutePlan(residentPath(routeFile,'Route plan')):null;
const bound=validateSourceBinding(repo,origin);
const outputRoot=residentPath(option('output-root',join(repo,'reports/game-tests/20261003-unity-route')),'Output root');
const space=statfsSync(origin);assert.ok(space.bavail*space.bsize>1024*1024*1024,'Need at least 1 GiB free on E:');
const output=join(outputRoot,'run-'+Date.now()+'-'+randomUUID()),portable=join(output,'portable');
mkdirSync(portable,{recursive:true});
for(const entry of readdirSync(origin,{withFileTypes:true})){
 assert.ok(!entry.isSymbolicLink(),'Linked native build entry: '+entry.name);
 if(entry.name!=='qa')cpSync(join(origin,entry.name),join(portable,entry.name),{recursive:entry.isDirectory()});
}
for(const [file,hash] of Object.entries(bound.hashes))assert.equal(sha(join(portable,file)),hash);
const saveDir=join(output,'saves'),token=randomUUID();mkdirSync(saveDir);
if(route)writeFileSync(join(saveDir,'route-probe-isolation.token'),token);
for(const folder of ['temp','appdata','localappdata'])mkdirSync(join(output,folder));
const env={...process.env,TEMP:join(output,'temp'),TMP:join(output,'temp'),APPDATA:join(output,'appdata'),LOCALAPPDATA:join(output,'localappdata'),METROFORGE_GAME_SAVE_DIR:saveDir,METROFORGE_ROUTE_PROBE_TOKEN:route?token:''};
const planPath=route?join(output,'route-plan.json'):null;
if(route){writeFileSync(planPath,readFileSync(routeFile));assert.equal(sha(planPath),route.planSha256,'Route plan changed before launch');}
const log=join(output,'native.log');
const proof={output,origin,...bound,timeout,mode,visibleWindowRequested:visible,sourceSaveSha256:route?.sourceSaveSha256,routePlanSha256:route?.planSha256,scope:route?'Provided-save native input continuation; save hash binds bytes, external provenance establishes earning.':'Normal campaign driver; traversal uses game-owned input with separately labeled direct-damage/save/respawn diagnostics.',visualApproved:false,productionReady:false};
console.log(JSON.stringify({stage:'native-route-starting',output,origin,mode}));
try{
 const code=await new Promise((accept,reject)=>{
  const child=spawn(join(portable,'ConduitFoundry.exe'),[...(visible?['-windowed']:['-batchmode']),'-screen-width','960','-screen-height','600','-acceptance','-acceptanceMode='+mode,'-acceptanceTimeout='+timeout,...(route?['-routeProbePlan='+planPath]:[]),'-logFile',log],{cwd:portable,env,windowsHide:!visible,stdio:'ignore'});
  writeFileSync(join(output,'owned-native.json'),JSON.stringify({pid:child.pid,status:'running'}));
  let error;const timer=setTimeout(()=>{error=new Error('Owned native process exceeded the bounded timeout');const kill=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>child.kill());},(timeout+60)*1000);
  child.on('error',failure=>{clearTimeout(timer);reject(failure);});
  child.on('close',code=>{clearTimeout(timer);writeFileSync(join(output,'owned-native.json'),JSON.stringify({pid:child.pid,status:'terminal',exitCode:code}));if(error)reject(error);else accept(code);});
 });
 proof.exitCode=code;
 const resultFile=join(portable,'qa',route?'region-route-result.json':'acceptance-result.json');
 assert.ok(existsSync(resultFile),'Native result missing');proof.runtime=JSON.parse(readFileSync(resultFile,'utf8'));
 proof.runtimeErrors=readFileSync(log,'utf8').split(/\r?\n/).filter(line=>/Exception:|Destroying GameObjects immediately|error CS\d+/.test(line));
 proof.passed=code===0&&(route?proof.runtime.passed===true:proof.runtime.status==='PASS')&&proof.runtimeErrors.length===0;
 for(const [file,hash] of Object.entries(bound.hashes))assert.equal(sha(join(portable,file)),hash);
 for(const [file,hash] of Object.entries(bound.sources))assert.equal(sha(join(repo,file)),hash,'Runtime template changed during probe: '+file);
 if(route){assert.equal(sha(route.plan.resumeSavePath),route.sourceSaveSha256,'Source save changed');assert.equal(sha(planPath),route.planSha256,'Route plan changed');proof.sourceSaveUnchanged=true;}
 if(!proof.passed)process.exitCode=1;
}catch(error){proof.passed=false;proof.error=String(error.stack??error);process.exitCode=1;}
writeFileSync(join(output,'proof.json'),JSON.stringify(proof,null,2));
writeFileSync(join(outputRoot,'latest.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({passed:proof.passed,output,exitCode:proof.exitCode,room:proof.runtime?.room,rooms:proof.runtime?.roomsVisitedCount,transitions:proof.runtime?.transitions?.length,reason:proof.runtime?.reason,errors:proof.runtimeErrors?.length,error:proof.error}));
