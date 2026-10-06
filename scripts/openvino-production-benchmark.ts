import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DiffusersProvider } from '../packages/assets/src/providers/diffusers.js';

const output=resolve('test-artifacts/asset-pipeline-v2-modern-cohesion/inference'); mkdirSync(output,{recursive:true});
const dimensions=(process.env.METROFORGE_BENCHMARK_DIMENSIONS??'128,256,384').split(',').map(Number);
const device=process.env.METROFORGE_OPENVINO_DEVICE??'GPU'; const results:Array<Record<string,unknown>>=[];
process.env.METROFORGE_OPENVINO_DIAGNOSTIC_PATH=join(output,`progress-${device.toLowerCase()}.jsonl`);
const provider=new DiffusersProvider({device:'openvino_gpu',modelId:'sd-1.5',generationTimeoutMs:Number(process.env.METROFORGE_BENCHMARK_TIMEOUT_MS??900000)});
for(const size of dimensions){
  const started=Date.now();
  try{
    const result=await provider.generateImage({profile:'CHARACTER',prompt:'modern premium 2D side-view futuristic underground metro operator, isolated full body, graphite armor, restrained cyan accents, crisp silhouette, no text',negativePrompt:'photorealism, text, watermark, scenery, cropped',width:size,height:size,seed:950000+size});
    const hash=createHash('sha256').update(result.image).digest('hex'); const path=join(output,`benchmark-${device.toLowerCase()}-${size}.png`); writeFileSync(path,result.image);
    results.push({size,steps:Number(process.env.METROFORGE_OPENVINO_STEPS??6),device,success:true,totalWallMs:Date.now()-started,hash,path,executionMetadata:result.executionMetadata});
  }catch(error){results.push({size,steps:Number(process.env.METROFORGE_OPENVINO_STEPS??6),device,success:false,totalWallMs:Date.now()-started,error:error instanceof Error?error.message:String(error)});}
  writeFileSync(join(output,`benchmark-${device.toLowerCase()}.json`),JSON.stringify({device,results},null,2));
}
await provider.unloadOpenVinoRuntime().catch(()=>undefined);
console.log(JSON.stringify({device,results},null,2));
