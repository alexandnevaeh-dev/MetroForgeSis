// Read-only credential/transport diagnosis; never emit keys, request URLs or raw bodies.
import {loadConfig} from '../packages/shared/dist/config.js';
import {writeFileSync} from 'node:fs';
loadConfig();
const checks=[
 ['gemini','https://generativelanguage.googleapis.com/v1beta/models',process.env.GEMINI_API_KEY,'x-goog-api-key'],
 ['groq','https://api.groq.com/openai/v1/models',process.env.GROQ_API_KEY,'Authorization'],
 ['openrouter','https://openrouter.ai/api/v1/auth/key',process.env.OPENROUTER_API_KEY,'Authorization'],
 ['nvidia','https://integrate.api.nvidia.com/v1/models',process.env.NVIDIA_API_KEY,'Authorization'],
];
const results=await Promise.all(checks.map(async([provider,url,key,header])=>{
 const start=Date.now();
 if(!key)return {provider,configured:false};
 try {
  const response=await fetch(url,{headers:{[header]:header==='Authorization'?`Bearer ${key}`:key},signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>null);
  const knownModels=(data?.models??data?.data??[]);
  return {provider,configured:true,status:response.status,durationMs:Date.now()-start,
   ...(Array.isArray(knownModels)?{models:knownModels.map(m=>m.id??m.name).filter(Boolean).filter(id=>provider==='groq'||/gemini.*flash|nemotron-3\.5-lightning/.test(id)).slice(0,25)}:{})};
 }catch(error){return {provider,configured:true,durationMs:Date.now()-start,error:error.cause?.code??error.name};}
}));
writeFileSync('reports/game-tests/20261001-canopy-depth/provider-connectivity.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
