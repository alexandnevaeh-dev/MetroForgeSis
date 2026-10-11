import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {getResourceRoot} from '@metroforge/shared';
import {assetFile,commitAssetFiles,lockAssetMutation} from './asset-files.js';

export type LocalAudioRequest={kind:'sfx'|'music';prompt:string;duration:number;seed:number};
export type LocalAudioAlternative={path:string;metadataPath:string;model:string;sha256:string;sampleRate:number;duration:number;actualDevice?:'cpu'|'cuda';approved:false;productionReady:false};
type Config={aceBaseUrl?:string;acePythonPath?:string;aceWorkingDirectory?:string;sfxPythonPath?:string};
let busy=false;
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function config():Config{
 const path=process.env.METROFORGE_LOCAL_AUDIO_CONFIG;
 if(!path||!isAbsolute(path)||!existsSync(path))return {};
 const bytes=readFileSync(path);if(bytes.length>16384)throw Error('Local audio configuration exceeds its size limit');
 const c=JSON.parse(bytes.toString('utf8'));if(!c||typeof c!=='object'||Array.isArray(c))throw Error('Invalid local audio configuration');
 return c;
}
export function localAudioBase(value:string):URL{
 const url=new URL(value);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('ACE-Step must use a loopback HTTP endpoint');
 return url;
}
export function validateLocalAudioRequest(r:LocalAudioRequest):void{
 if(!r||typeof r!=='object'||Array.isArray(r)||!['sfx','music'].includes(r.kind)||typeof r.prompt!=='string'||!r.prompt.trim()||r.prompt.length>1500||!Number.isFinite(r.duration)||r.duration<(r.kind==='sfx'?0.25:10)||r.duration>(r.kind==='sfx'?10:120)||!Number.isSafeInteger(r.seed)||r.seed<0||r.seed>2147483647)throw Error('Enter an audio description, valid duration and integer seed');
}
/** ACE-Step returns IEEE float WAV; export finite samples as engine-compatible PCM16. */
export function normalizeLocalAudioWav(source:Buffer):Buffer{
 if(source.length<44||source.length>64*1024*1024||source.toString('ascii',0,4)!=='RIFF'||source.toString('ascii',8,12)!=='WAVE'||source.readUInt32LE(4)+8!==source.length)throw Error('Invalid audio container');
 let format=0,channels=0,rate=0,bits=0,align=0,data:Buffer|undefined;
 for(let o=12;o+8<=source.length;){const n=source.readUInt32LE(o+4),s=o+8;if(s+n>source.length)throw Error('Truncated audio');const id=source.toString('ascii',o,o+4);
  if(id==='fmt '){if(n<16||format)throw Error('Invalid audio format');format=source.readUInt16LE(s);channels=source.readUInt16LE(s+2);rate=source.readUInt32LE(s+4);align=source.readUInt16LE(s+12);bits=source.readUInt16LE(s+14);}
  if(id==='data'){if(data)throw Error('Duplicate audio samples');data=source.subarray(s,s+n);}o=s+n+(n%2);
 }
 if(format===1){inspectLocalAudioWav(source);return source;}
 if(format!==3||bits!==32||![1,2].includes(channels)||rate<8000||rate>96000||align!==channels*4||!data||!data.length||data.length%align)throw Error('Unsupported model audio encoding');
 let peak=0;for(let i=0;i<data.length;i+=4){const sample=data.readFloatLE(i);if(!Number.isFinite(sample))throw Error('Model generated non-finite audio');peak=Math.max(peak,Math.abs(sample));}
 const gain=peak>0.98?0.98/peak:1,pcm=Buffer.alloc(data.length/2);
 for(let i=0;i<data.length;i+=4)pcm.writeInt16LE(Math.round(data.readFloatLE(i)*gain*32767),i/2);
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*channels*2,28);header.writeUInt16LE(channels*2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
 const output=Buffer.concat([header,pcm]);inspectLocalAudioWav(output);return output;
}
export function inspectLocalAudioWav(buffer:Buffer):{sampleRate:number;duration:number}{
 if(buffer.length<44||buffer.length>64*1024*1024||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE'||buffer.readUInt32LE(4)+8!==buffer.length)throw Error('Model output is not a bounded WAV file');
 let rate=0,align=0,channels=0,bits=0,format=0,data:Buffer|undefined;
 for(let offset=12;offset+8<=buffer.length;){const size=buffer.readUInt32LE(offset+4),start=offset+8;if(start+size>buffer.length)throw Error('Truncated model WAV');
  const id=buffer.toString('ascii',offset,offset+4);
  if(id==='fmt '){if(size<16)throw Error('Invalid WAV format');format=buffer.readUInt16LE(start);channels=buffer.readUInt16LE(start+2);rate=buffer.readUInt32LE(start+4);align=buffer.readUInt16LE(start+12);bits=buffer.readUInt16LE(start+14);}
  if(id==='data'){if(data)throw Error('Duplicate WAV sample data');data=buffer.subarray(start,start+size);}
  offset=start+size+(size%2);
 }
 if(!data||![1,2].includes(channels)||rate<8000||rate>96000||format!==1||bits!==16||align!==channels*2||data.length%align||data.length<align*rate/10)throw Error('Expected mono or stereo PCM16 model audio');
 let energy=0;for(let i=0;i<data.length;i+=2){const s=data.readInt16LE(i)/32768;energy+=s*s;}
 if(Math.sqrt(energy/(data.length/2))<0.00001)throw Error('Model generated silent audio');
 return {sampleRate:rate,duration:data.length/align/rate};
}
async function responseBytes(response:Response,max:number):Promise<Buffer>{
 if(!response.ok)throw Error('Local audio provider returned HTTP '+response.status);
 const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();if(!reader)throw Error('Missing audio response');
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max)throw Error('Local audio response exceeds its size limit');chunks.push(r.value);}}finally{await reader.cancel();}
 return Buffer.concat(chunks);
}
async function post(base:URL,path:string,body:unknown,signal:AbortSignal,sessionKey?:string):Promise<any>{
 const bytes=await responseBytes(await fetch(new URL(path,base),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(sessionKey?{Authorization:'Bearer '+sessionKey}:{})},body:JSON.stringify(body),signal}),2*1024*1024);
 return JSON.parse(bytes.toString('utf8'));
}
async function aceHealthy(base:URL):Promise<boolean>{
 try{const response=await fetch(new URL('/health',base),{redirect:'error',signal:AbortSignal.timeout(2000)}),bytes=await responseBytes(response,32768),status=JSON.parse(bytes.toString('utf8'));return status.code===200&&status.data?.service==='ACE-Step API'&&status.data?.status==='ok';}catch{return false;}
}
/** Start only the configured loopback runtime; release its entire owned process tree after the take. */
async function ensureAceRuntime(c:Config,base:URL):Promise<{release:()=>Promise<void>;sessionKey?:string}>{
 if(await aceHealthy(base))return {release:async()=>{},sessionKey:process.env.ACESTEP_API_KEY};
 if(!c.acePythonPath||!c.aceWorkingDirectory||!isAbsolute(c.acePythonPath)||!isAbsolute(c.aceWorkingDirectory)||!existsSync(c.acePythonPath)||!existsSync(join(c.aceWorkingDirectory,'acestep','api_server.py')))throw Error('ACE-Step is unavailable. Configure its local runtime or start its loopback API and retry.');
 if(!base.port||Number(base.port)<1024)throw Error('Owned music runtime needs an explicit loopback port above1023');
 const sessionKey=randomUUID()+randomUUID();
 const child=spawn(c.acePythonPath,[join(getResourceRoot(),'workers','ace_step_api_worker.py')],{cwd:c.aceWorkingDirectory,env:{...process.env,METROFORGE_ACE_SESSION_KEY:sessionKey},windowsHide:true,stdio:['ignore','ignore','ignore']});
 let failed=false;child.on('error',()=>{failed=true;});
 const release=async()=>{
  if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;
  await new Promise<void>((resolve,reject)=>execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},error=>{if(error&&child.exitCode===null&&child.signalCode===null)reject(Error('Owned music runtime cleanup failed; reconcile it before another run'));else resolve();}));
 };
 try{
  const deadline=Date.now()+10*60*1000;
  while(Date.now()<deadline){if(failed||child.exitCode!==null||child.signalCode!==null)throw Error('Local music runtime could not start. Check its isolated dependencies and model weights.');if(await aceHealthy(base))return {release,sessionKey};await new Promise(resolve=>setTimeout(resolve,500));}
  throw Error('Local music runtime startup exceeded10minutes');
 }catch(error){await release();throw error;}
}
async function music(c:Config,r:LocalAudioRequest):Promise<Buffer>{
 if(!c.aceBaseUrl)throw Error('ACE-Step is not configured yet');const base=localAudioBase(c.aceBaseUrl),signal=AbortSignal.timeout(30*60*1000);
 const {release,sessionKey}=await ensureAceRuntime(c,base);
 try{
 const created=await post(base,'/release_task',{prompt:r.prompt,lyrics:'[Instrumental]',thinking:false,use_format:false,sample_mode:false,model:'acestep-v15-turbo',audio_duration:r.duration,batch_size:1,use_random_seed:false,seed:r.seed,inference_steps:8,audio_format:'wav'},signal,sessionKey);
 const id=created.data?.task_id;if(created.code!==200||typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(id))throw Error('ACE-Step did not accept the music job');
 for(;;){signal.throwIfAborted();const queried=await post(base,'/query_result',{task_id_list:[id]},signal,sessionKey),job=queried.data?.find((v:any)=>v.task_id===id);
  if(job?.status===2)throw Error('ACE-Step music generation failed');
  if(job?.status===1){const rows=JSON.parse(job.result);if(!Array.isArray(rows)||rows.length!==1||rows[0].dit_model!=='acestep-v15-turbo'||String(rows[0].seed_value)!==String(r.seed))throw Error('ACE-Step output model or seed differs from the request');
   const url=new URL(rows[0].file,base);if(url.origin!==base.origin||url.pathname!=='/v1/audio'||url.username||url.password)throw Error('ACE-Step returned an unexpected audio location');
   return await responseBytes(await fetch(url,{redirect:'error',signal,headers:sessionKey?{Authorization:'Bearer '+sessionKey}:{}}),64*1024*1024);
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 }finally{await release();}
}
async function effects(c:Config,r:LocalAudioRequest):Promise<{buffer:Buffer;actualDevice:'cpu'|'cuda'}>{
 if(!c.sfxPythonPath||!isAbsolute(c.sfxPythonPath)||!existsSync(c.sfxPythonPath))throw Error('Stable Audio 3 runtime is not configured yet');
 const worker=join(getResourceRoot(),'workers','stable_audio3_worker.py');
 return new Promise((resolve,reject)=>{
  const child=spawn(c.sfxPythonPath!,[worker],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='';let settled=false;
  const finish=(error?:Error,buffer?:Buffer,actualDevice?:'cpu'|'cuda')=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve({buffer:buffer!,actualDevice:actualDevice!});};
  const timer=setTimeout(()=>{child.kill();finish(Error('Stable Audio 3 generation exceeded30minutes'));},30*60*1000);
  child.stdout.on('data',(b:Buffer)=>{stdout+=b.toString('utf8');if(stdout.length>90*1024*1024){child.kill();finish(Error('Stable Audio output exceeds its size limit'));}});child.stderr.resume();
  child.on('error',()=>finish(Error('Cannot start Stable Audio 3 runtime')));child.on('close',code=>{try{const result=JSON.parse(stdout);if(code!==0||result.ok!==true||result.model!=='stabilityai/stable-audio-3-small-sfx'||!['cpu','cuda'].includes(result.actual_device)||typeof result.audio_base64!=='string')throw Error('Stable Audio 3 unavailable. Check runtime and Hugging Face model access.');finish(undefined,Buffer.from(result.audio_base64,'base64'),result.actual_device);}catch(e){finish(e instanceof Error?e:Error('Invalid Stable Audio response'));}});
  child.stdin.on('error',()=>finish(Error('Stable Audio worker closed its input')));child.stdin.end(JSON.stringify(r));
 });
}
export function readLocalAudioConfiguration(){const c=config();return {musicConfigured:!!c.aceBaseUrl,sfxConfigured:!!c.sfxPythonPath,busy};}
export function listLocalAudioAlternatives(project:string):Array<LocalAudioAlternative&{request:LocalAudioRequest}>{
 const rows:Array<LocalAudioAlternative&{request:LocalAudioRequest}>=[];
 for(const kind of ['sfx','music'] as const){
  let directory:string;try{directory=assetFile(project,'assets/generated/audio/'+kind);}catch{continue;}if(!existsSync(directory))continue;
  for(const name of readdirSync(directory)){
   if(!/^[0-9a-f-]{36}\.json$/.test(name))continue;
   try{
    const metadataPath='assets/generated/audio/'+kind+'/'+name,path=metadataPath.replace(/\.json$/,'.wav'),file=assetFile(project,metadataPath);
    if(statSync(file).size>16384)continue;const value=JSON.parse(readFileSync(file,'utf8'));
    if(value.path!==path||value.metadataPath!==metadataPath||value.request?.kind!==kind||value.model!==(kind==='music'?'ACE-Step/acestep-v15-turbo':'stabilityai/stable-audio-3-small-sfx')||typeof value.sha256!=='string'||! /^[0-9a-f]{64}$/.test(value.sha256))continue;
    validateLocalAudioRequest(value.request);if(!Number.isInteger(value.sampleRate)||value.sampleRate<8000||value.sampleRate>96000||!Number.isFinite(value.duration)||value.duration<value.request.duration*0.7||value.duration>value.request.duration+1||value.actualDevice!==undefined&&!['cpu','cuda'].includes(value.actualDevice))continue;
    const wav=assetFile(project,path);if(!existsSync(wav)||statSync(wav).size>64*1024*1024)continue;
    rows.push({...value,approved:false,productionReady:false});
   }catch{ /* A damaged take must not hide the rest of the library or gain approval. */ }
  }
 }
 return rows;
}
export async function generateLocalAudioAlternative(project:string,request:LocalAudioRequest):Promise<LocalAudioAlternative>{
 validateLocalAudioRequest(request);if(busy)throw Error('Another local audio generation is running');
 const dna=readFileSync(assetFile(project,'game_dna.json')),identity=JSON.parse(dna.toString('utf8'));
 if(!['SIDE_VIEW_METROIDVANIA','TOP_DOWN_ACTION_ADVENTURE'].includes(identity.archetype))throw Error('Select a side-view or top-down project for this audio workflow');
 busy=true;try{
  const generated=request.kind==='music'?{buffer:await music(config(),request),actualDevice:undefined}:await effects(config(),request),source=generated.buffer,buffer=normalizeLocalAudioWav(source),quality=inspectLocalAudioWav(buffer);
  if(quality.duration>request.duration+1||quality.duration<request.duration*0.7)throw Error('Audio duration differs from the request');
  const release=lockAssetMutation(project);try{
   if(hash(readFileSync(assetFile(project,'game_dna.json')))!==hash(dna))throw Error('Project changed during audio generation; existing audio was preserved');
   const path='assets/generated/audio/'+request.kind+'/'+randomUUID()+'.wav',metadataPath=path.replace(/\.wav$/,'.json');
   const result:LocalAudioAlternative={path,metadataPath,model:request.kind==='music'?'ACE-Step/acestep-v15-turbo':'stabilityai/stable-audio-3-small-sfx',sha256:hash(buffer),actualDevice:generated.actualDevice,...quality,approved:false,productionReady:false};
   commitAssetFiles(new Map([[assetFile(project,path),buffer],[assetFile(project,metadataPath),Buffer.from(JSON.stringify({...result,request,sourceAudioSha256:hash(source),encoding:'PCM16',archetype:identity.archetype,sourceDnaSha256:hash(dna),createdAt:new Date().toISOString(),gameplayApplied:false},null,2))]]));return result;
  }finally{release();}
 }finally{busy=false;}
}
