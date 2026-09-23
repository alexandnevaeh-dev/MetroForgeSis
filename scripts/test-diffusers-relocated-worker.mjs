import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {DiffusersProvider} from '../packages/assets/dist/providers/diffusers.js';
const resource=mkdtempSync('E:/Metroforge/Recovery-Audit/provider-resources-');mkdirSync(join(resource,'workers'));
copyFileSync(new URL('../workers/diffusers_image_worker.py',import.meta.url),join(resource,'workers/diffusers_image_worker.py'));
const saved={root:process.env.METROFORGE_RESOURCE_ROOT,python:process.env.DIFFUSERS_PYTHON};
try{
 process.env.METROFORGE_RESOURCE_ROOT=resource;
 process.env.DIFFUSERS_PYTHON='C:/Users/alexa/Documents/Codex/2026-09-16/whe/work/runtime/diffusers/Scripts/python.exe';
 const provider=new DiffusersProvider({modelId:'E:/Metroforge/Recovery-Audit/models/sdxl-base-1.0'});
 const concise=await provider.checkPromptBudget('Orthographic gothic stone platform, horizontal ledge, carved arches, isolated on grey.','perspective, text');
 assert.equal(concise.ok,true,concise.error);assert.equal(concise.anyOverflow,false);
 const overflow=await provider.checkPromptBudget('stone '.repeat(100),'fog '.repeat(90));
 assert.equal(overflow.ok,true,overflow.error);assert.equal(overflow.positive.overflow,true);assert.equal(overflow.negative.overflow,true);
 writeFileSync(join(resource,'result.json'),JSON.stringify({passed:true,scope:'Actual TypeScript provider to relocated Python worker, real local dual SDXL tokenizers; no image generation',concise,overflow},null,2));
 console.log('PASS relocated Diffusers provider/worker prompt checks:',resource);
}finally{
 for(const [key,value]of [['METROFORGE_RESOURCE_ROOT',saved.root],['DIFFUSERS_PYTHON',saved.python]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
