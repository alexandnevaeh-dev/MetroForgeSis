import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {DiffusersProvider} from './diffusers.js';

// Protocol-only transport regression. Real CUDA/inference evidence comes from
// the separately recorded native runtime and actual MetroForge workshop.
function provider(delay:number,backendProbeTimeoutMs?:number){
  const root=mkdtempSync(join(tmpdir(),'backend-probe-')),worker=join(root,'worker.mjs');
  writeFileSync(worker,`let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const r=JSON.parse(s);if(r.action==='health'){setTimeout(()=>console.log(JSON.stringify({ok:true,selected_backend:'cuda'})),${delay});}else{console.log(JSON.stringify({ok:true,image_base64:'dGVzdA==',device:r.compute_backend}));}});`);
  return new DiffusersProvider({pythonPath:process.execPath,workerPath:worker,device:'auto',backendProbeTimeoutMs});
}
const request={profile:'CHARACTER' as const,prompt:'test',width:8,height:8,seed:1};
describe('Full backend startup budget',()=>{
  it('accepts a real worker protocol response after the old four-second cutoff',async()=>{
    const result=await provider(4500).generateImage(request);
    expect(result.executionMetadata?.actualDevice).toBe('cuda');
  },12000);
  it('retains a finite configured timeout instead of waiting indefinitely',async()=>{
    await expect(provider(500,120).generateImage(request)).rejects.toThrow('timed out after 120ms');
  });
  it('cancels while discovering the backend and never proceeds to generation',async()=>{
    const controller=new AbortController();
    const promise=provider(3000).generateImage({...request,signal:controller.signal});
    setTimeout(()=>controller.abort(),100);
    await expect(promise).rejects.toThrow(/cancel/i);
  });
  it('rejects invalid budgets and pre-cancelled requests',async()=>{
    for(const value of [0,-1,NaN,Infinity])expect(()=>provider(0,value)).toThrow('positive finite');
    const controller=new AbortController();controller.abort();
    await expect(provider(0).generateImage({...request,signal:controller.signal})).rejects.toThrow(/cancel/i);
  });
});

