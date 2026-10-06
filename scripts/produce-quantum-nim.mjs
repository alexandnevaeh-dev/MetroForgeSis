import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { NvidiaImageProvider } from '../packages/assets/dist/providers/nvidia-image.js';
import { decodePngRgba } from '../packages/assets/dist/png.js';

const repo = resolve('.');
const option = name => process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const specPath = resolve(option('spec') || '');
const output = resolve(option('output') || '');
assert.ok(/^E:[\\/]/i.test(specPath) && /^E:[\\/]/i.test(output) && !existsSync(output),'Use an E: specification and a fresh E: destination');
const bytes = readFileSync(specPath);
const spec = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
assert.equal(spec.genre,'quantum-divergence');
assert.equal(spec.backend,'hosted-nvidia-genai');
assert.equal(spec.model,'black-forest-labs/flux.1-dev');
assert.equal(spec.productionApproved,false);
assert.ok(Array.isArray(spec.jobs) && spec.jobs.length>0 && spec.jobs.length<=5,'Bounded source-only test');
assert.equal(new Set(spec.jobs.map(job=>job.id)).size,spec.jobs.length);
for (const job of spec.jobs) {
  assert.ok(/^[a-z][a-z0-9-]*$/.test(job.id));
  assert.equal(job.width,1024);
  assert.equal(job.height,1024);
  assert.ok(['CHARACTER','ENEMY','BOSS','BACKGROUND'].includes(job.profile));
  assert.ok(typeof job.prompt==='string' && job.prompt.trim().length>0 && job.prompt.length<5000);
  assert.ok(Number.isSafeInteger(job.seed) && job.seed>=0 && job.seed<2**31);
}
// Only the configured secret goes in the intended NVIDIA Authorization header.
// No environment contents are printed or persisted with the public specification.
if (existsSync(join(repo,'.env'))) process.loadEnvFile(join(repo,'.env'));
assert.ok(process.env.NVIDIA_API_KEY,'The configured NVIDIA key is required');
for (const [name,folder] of Object.entries({TEMP:'Temp',TMP:'Temp',HF_HOME:'HuggingFace',TORCH_HOME:'Torch',
  XDG_CACHE_HOME:'Cache',CUDA_CACHE_PATH:'CudaCache',PIP_CACHE_DIR:'PipCache'})) {
  const path = 'E:/MetroForgeData/'+folder;
  mkdirSync(path,{recursive:true});
  process.env[name]=path;
}
const provider = new NvidiaImageProvider({apiKey:process.env.NVIDIA_API_KEY,enabled:true,
  modelId:spec.model,imageApiBaseUrl:'https://ai.api.nvidia.com/v1/genai',maxRetries:0,
  pythonPath:'E:/MetroForgeData/Python/diffusers-native/Scripts/python.exe'});
const hash = data=>createHash('sha256').update(data).digest('hex');
mkdirSync(output,{recursive:true});
writeFileSync(join(output,'spec.json'),JSON.stringify(spec,null,2));
const summary = {genre:spec.genre,backend:spec.backend,productionApproved:false,animationReady:false,jobs:[]};
for (const job of spec.jobs) {
  const directory = join(output,job.id);
  mkdirSync(directory);
  const request = {profile:job.profile,prompt:job.prompt,width:1024,height:1024,seed:job.seed,modelOverride:spec.model};
  writeFileSync(join(directory,'request.json'),JSON.stringify(request,null,2));
  console.log(JSON.stringify({job:job.id,state:'started',backend:spec.backend}));
  const started = Date.now();
  try {
    const result = await provider.generateImage(request);
    assert.equal(result.fallbackGenerated,false);
    assert.equal(result.provider,'nvidia-image');
    const decoded = decodePngRgba(result.image);
    assert.equal(decoded.width,1024);
    assert.equal(decoded.height,1024);
    writeFileSync(join(directory,'source.png'),result.image);
    const receipt = {ok:true,provider:result.provider,model_id:result.modelId,seed:result.seed,
      device:'hosted-nvidia-genai',localGpuVerified:false,fallbackGenerated:false,
      requestId:result.requestId,width:decoded.width,height:decoded.height,
      execution_path:'metroforge_nvidia_image_provider',wallSeconds:(Date.now()-started)/1000,
      specSha256:hash(bytes),sourceSha256:hash(result.image),productionApproved:false,animationReady:false,
      usage:'Development source candidate under hosted NVIDIA trial/model terms; not final asset admission'};
    writeFileSync(join(directory,'receipt.json'),JSON.stringify(receipt,null,2));
    summary.jobs.push({id:job.id,source:join(directory,'source.png'),receipt:join(directory,'receipt.json')});
    console.log(JSON.stringify({job:job.id,state:'generated',source:join(directory,'source.png'),productionApproved:false}));
  } catch(error) {
    const message = String(error).split(process.env.NVIDIA_API_KEY).join('[redacted]');
    const receipt = {ok:false,error:message,specSha256:hash(bytes),productionApproved:false,wallSeconds:(Date.now()-started)/1000};
    writeFileSync(join(directory,'receipt.json'),JSON.stringify(receipt,null,2));
    summary.failed={id:job.id,receipt:join(directory,'receipt.json')};
    writeFileSync(join(output,'result.json'),JSON.stringify(summary,null,2));
    console.error(JSON.stringify({job:job.id,state:'failed',receipt:join(directory,'receipt.json')}));
    process.exitCode=1;
    break;
  }
  writeFileSync(join(output,'result.json'),JSON.stringify(summary,null,2));
}
