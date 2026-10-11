import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DiffusersProvider,parseDiffusersWorkerStage} from './diffusers.js';

describe('safe worker stage diagnostics',()=>{
 it('retains only allowed phases and numeric counters',()=>{
   for(const phase of ['health_runtime_loading','health_runtime_ready','prompt_tokenizer_loading','prompt_tokenizer_ready'])expect(parseDiffusersWorkerStage(JSON.stringify({phase,elapsedMs:10,prompt:'private'}))).toEqual({phase,elapsedMs:10});
   expect(parseDiffusersWorkerStage(JSON.stringify({phase:'denoising_complete',elapsedMs:250000,allocatedMb:512,secret:'private-token',prompt:'private prompt'})))
     .toEqual({phase:'denoising_complete',elapsedMs:250000,allocatedMb:512});
   for(const data of [{phase:'private-token',elapsedMs:1},{phase:'encoding',elapsedMs:-1},{phase:'encoding',elapsedMs:1.5},{phase:'encoding',elapsedMs:1,reservedMb:'secret'},{phase:'encoding',elapsedMs:1,allocatedMb:Infinity}])expect(parseDiffusersWorkerStage(JSON.stringify(data))).toBeUndefined();
 });
 it('identifies a startup timeout without exposing worker internals',async()=>{
   const folder=mkdtempSync(join(tmpdir(),'metroforge-startup-stage-')),worker=join(folder,'worker.cjs');
   writeFileSync(worker,`process.stdin.resume();process.stderr.write('private-token\\nMETROFORGE_WORKER_STAGE {"phase":"health_runtime_loading","elapsedMs":5,"prompt":"private"}\\n');setInterval(()=>{},1000);`);
   const provider=new DiffusersProvider({pythonPath:process.execPath,workerPath:worker,backendProbeTimeoutMs:500});
   await expect(provider.generateImage({profile:'ENEMY',prompt:'actor',width:64,height:64})).rejects.toThrow('phase health_runtime_loading after 5ms');
 });
 it('reports the last validated stage on timeout without leaking raw stderr',async()=>{
   const folder=mkdtempSync(join(tmpdir(),'metroforge-stage-'));const worker=join(folder,'worker.cjs');
   writeFileSync(worker,`process.stdin.resume();process.stderr.write('private-prompt private-token\\nMETROFORGE_WORKER_STAGE {"phase":"denoising_complete","elapsedMs":300,"allocatedMb":512,"reservedMb":768,"secret":"private-token"}\\n');setInterval(()=>{},1000);`);
   const provider=new DiffusersProvider({pythonPath:process.execPath,workerPath:worker});
   const run=(provider as unknown as {runWorker:(payload:unknown,options:{timeoutMs:number})=>Promise<unknown>}).runWorker.bind(provider);
   let message='';try{await run({}, {timeoutMs:1000});}catch(error){message=String(error);}
   expect(message).toContain('phase denoising_complete after 300ms');
   expect(message).toContain('GPU allocated 512 MiB, reserved 768 MiB');
   expect(message).not.toContain('private-prompt');expect(message).not.toContain('private-token');
 });
});
