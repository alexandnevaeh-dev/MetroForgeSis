import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DiffusersProvider,parseDiffusersWorkerStage} from './diffusers.js';

describe('safe worker stage diagnostics',()=>{
 it('retains only allowed phases and numeric counters',()=>{
   expect(parseDiffusersWorkerStage(JSON.stringify({phase:'denoising_complete',elapsedMs:250000,allocatedMb:512,secret:'private-token',prompt:'private prompt'})))
     .toEqual({phase:'denoising_complete',elapsedMs:250000,allocatedMb:512});
   for(const data of [{phase:'private-token',elapsedMs:1},{phase:'encoding',elapsedMs:-1},{phase:'encoding',elapsedMs:1.5},{phase:'encoding',elapsedMs:1,reservedMb:'secret'},{phase:'encoding',elapsedMs:1,allocatedMb:Infinity}])expect(parseDiffusersWorkerStage(JSON.stringify(data))).toBeUndefined();
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
