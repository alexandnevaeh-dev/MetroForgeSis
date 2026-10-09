import {afterEach,describe,it,expect,vi} from 'vitest';
import {GeminiProvider} from './gemini.js';
import {GroqProvider} from './groq.js';
import {NvidiaProvider} from './nvidia.js';

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const configuration={apiKey:'nvapi-FAKE_TEST_ONLY_KEY',baseUrl:'https://provider.invalid',defaultModel:'fixture-model',enabled:true};

describe('provider caller cancellation',()=>{
 for(const [name,factory] of [
   ['Gemini',()=>new GeminiProvider(configuration)],
   ['Groq',()=>new GroqProvider(configuration)],
   ['NVIDIA',()=>new NvidiaProvider({...configuration,maxRetries:3})],
 ] as const){
   it(`${name} propagates an in-flight caller abort without retrying`,async()=>{
     const fetch=vi.fn((_url:unknown,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
       const signal=init!.signal!;
       signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
     }));
     vi.stubGlobal('fetch',fetch);const controller=new AbortController();const reason=new Error('Test-owned cancellation');
     const pending=factory().generateText({prompt:'fixture',signal:controller.signal});controller.abort(reason);
     await expect(pending).rejects.toBe(reason);expect(fetch).toHaveBeenCalledTimes(1);
   });
   it(`${name} does not submit an already cancelled request`,async()=>{
     const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const controller=new AbortController();controller.abort();
     await expect(factory().generateText({prompt:'fixture',signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
     expect(fetch).not.toHaveBeenCalled();
   });
 }
});

describe('explicit provider model selection',()=>{
 for(const [name,env,factory] of [
   ['Gemini','GEMINI_DEFAULT_MODEL',(model:string)=>new GeminiProvider({...configuration,defaultModel:model})],
   ['Groq','GROQ_DEFAULT_MODEL',(model:string)=>new GroqProvider({...configuration,defaultModel:model})],
 ] as const){
   it(`${name} retains environment fallback and explicit configuration precedence`,async()=>{
     vi.stubEnv(env,'environment-model');
     const fetch=vi.fn(async()=>({ok:true,json:async()=>({choices:[{message:{content:'fixture'}}],candidates:[{content:{parts:[{text:'fixture'}]}}]})} as Response));
     vi.stubGlobal('fetch',fetch);
     expect((await factory('').generateText({prompt:'fixture'})).model).toBe('environment-model');
     expect((await factory('configured-model').generateText({prompt:'fixture'})).model).toBe('configured-model');
   });
 }
});

describe('failed model discovery never certifies a healthy connection',()=>{
 for(const [name,factory] of [['Gemini',()=>new GeminiProvider(configuration)],['Groq',()=>new GroqProvider(configuration)]] as const){
   for(const status of [401,500])it(`${name} reports unavailable on discovery HTTP ${status} without exposing the key`,async()=>{
     vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status,statusText:configuration.apiKey} as Response)));
     const provider=factory();
     let message='';try{await provider.listModels();}catch(error){message=error instanceof Error?error.message:String(error);}
     expect(message).toBe(`${provider.name} model discovery failed: ${status}`);
     expect(message).not.toContain(configuration.apiKey);
     expect(await provider.checkHealth()).toBe('unavailable');
   });
 }
});
