import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const stage=process.argv[2] ? resolve(process.argv[2]) : null;
const {DiffusersProvider}=await import(stage ? pathToFileURL(join(stage,'resources/app/node_modules/@metroforge/assets/dist/providers/diffusers.js')).href : '../packages/assets/dist/providers/diffusers.js');
const evidence=mkdtempSync('E:/Metroforge/Recovery-Audit/provider-resources-');
const resource=stage ? join(stage,'resources/metroforge') : evidence;
if(!stage){mkdirSync(join(resource,'workers'));copyFileSync(new URL('../workers/diffusers_image_worker.py',import.meta.url),join(resource,'workers/diffusers_image_worker.py'));}
const saved={root:process.env.METROFORGE_RESOURCE_ROOT,python:process.env.DIFFUSERS_PYTHON};
try{
 process.env.METROFORGE_RESOURCE_ROOT=resource;
 process.env.DIFFUSERS_PYTHON=saved.python ?? 'E:/MetroForgeData/Python/diffusers-native/Scripts/python.exe';
 const provider=new DiffusersProvider({modelId:'E:/Metroforge/Recovery-Audit/models/sdxl-base-1.0'});
 const concise=await provider.checkPromptBudget('Orthographic gothic stone platform, horizontal ledge, carved arches, isolated on grey.','perspective, text');
 assert.equal(concise.ok,true,concise.error);assert.equal(concise.anyOverflow,false);
 const overflow=await provider.checkPromptBudget('stone '.repeat(100),'fog '.repeat(90));
 assert.equal(overflow.ok,true,overflow.error);assert.equal(overflow.positive.overflow,true);assert.equal(overflow.negative.overflow,true);
 writeFileSync(join(evidence,'result.json'),JSON.stringify({passed:true,stage,scope:'Actual TypeScript provider to relocated Python worker, real local dual SDXL tokenizers; no image generation',concise,overflow},null,2));
 console.log('PASS relocated Diffusers provider/worker prompt checks:',evidence);
}finally{
 for(const [key,value]of [['METROFORGE_RESOURCE_ROOT',saved.root],['DIFFUSERS_PYTHON',saved.python]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
