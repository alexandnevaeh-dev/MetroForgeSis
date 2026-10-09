import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {it,expect} from 'vitest';
import {DiffusersProvider} from './diffusers.js';
function provider(mode:string){
  const root=mkdtempSync(join(tmpdir(),'model-preparation-')),file=join(root,'worker.mjs');
  writeFileSync(file,`let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const r=JSON.parse(s);if(r.action!=='prepare_model')throw Error('Unexpected protocol action');process.stderr.write('PRIVATE_TEST_MARKER /private/example\\nFetching files: 50%|xx| 1/2\\r');if('${mode}'==='wait'){setInterval(()=>{},1000);return;}console.log(JSON.stringify('${mode}'==='incomplete'?{ok:true}:{ok:true,model_id:r.model_id,model_path:'E:/test/model',precision:r.precision,variant:'fp16',revision:'test-revision',files:['model_index.json','unet/weights.fp16.safetensors']}));});`);
  return new DiffusersProvider({pythonPath:process.execPath,workerPath:file,modelId:'test/model'});
}
it('uses the preparation protocol and exposes only numeric progress and model provenance',async()=>{
  const progress:unknown[]=[];const result=await provider('ready').prepareModel({onProgress:p=>progress.push(p)});
  expect(result.modelId).toBe('test/model');expect(result.variant).toBe('fp16');expect(result.fileCount).toBe(2);
  expect(progress).toEqual([{completed:1,total:2,percent:50}]);expect(JSON.stringify(progress)).not.toContain('PRIVATE_TEST');
});
it('rejects incomplete preparation instead of claiming model readiness',async()=>{
  await expect(provider('incomplete').prepareModel()).rejects.toThrow('complete local model');
});
it('cancels model preparation with the same transport lifecycle as inference',async()=>{
  const controller=new AbortController(),work=provider('wait').prepareModel({signal:controller.signal});
  setTimeout(()=>controller.abort(),100);await expect(work).rejects.toThrow(/cancel/i);
});
