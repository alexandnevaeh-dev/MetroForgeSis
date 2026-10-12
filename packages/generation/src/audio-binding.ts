import {createHash,randomUUID} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {assetFile,commitAssetFiles,lockAssetMutation} from './asset-files.js';
import {inspectLocalAudioWav,listLocalAudioAlternatives} from './local-audio-authoring.js';

const HISTORY='.metroforge/audio-bindings.json';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
type Binding={sourcePath:string;sourceSha256:string;commandId:string};
type Command={id:string;targetPath:string;sourcePath:string;beforeSha256:string;afterSha256:string;sourceMetadataBefore:string;sourceMetadataBeforeSha256:string;sourceMetadataAfterSha256:string;previousBinding:Binding|null;displaced?:{path:string;before:string;beforeSha256:string;afterSha256:string}};
type History={version:1;bindings:Record<string,Binding>;undo:Command[];events:Array<{id:string;action:string;at:string}>};
export type AudioBindingTarget={path:string;id:string;kind:'sfx'|'music';sha256:string;sourcePath?:string};
export type AudioBindingSnapshot={supported:boolean;reason?:string;revision:string;targets:AudioBindingTarget[];undoTarget?:string;sourceError?:string;source?:{path:string;sha256:string;kind:'sfx'|'music'}};

function bytes(project:string,path:string,max=64*1024*1024):Buffer{
 const file=assetFile(project,path),info=statSync(file);if(!info.isFile()||info.size>max)throw Error('Audio file is missing or exceeds its size limit');return readFileSync(file);
}
function identity(project:string){
 const raw=bytes(project,'game_dna.json',2*1024*1024),dna=JSON.parse(raw.toString('utf8'));
 if(!['SIDE_VIEW_METROIDVANIA','TOP_DOWN_ACTION_ADVENTURE'].includes(dna.archetype))throw Error('Select a side-view or top-down game for audio binding');
 const engine=JSON.parse(bytes(project,'engine.json',65536).toString('utf8'));
 if(engine.engine!=='godot')throw Error('Game event binding for this engine needs its own authoring adapter');
 return {raw,dna};
}
function history(project:string):{raw:Buffer|null;value:History}{
 const file=assetFile(project,HISTORY);if(!existsSync(file))return {raw:null,value:{version:1,bindings:{},undo:[],events:[]}};
 const raw=bytes(project,HISTORY,4*1024*1024),value=JSON.parse(raw.toString('utf8'));
 if(value?.version!==1||!value.bindings||typeof value.bindings!=='object'||Array.isArray(value.bindings)||!Array.isArray(value.undo)||!Array.isArray(value.events)||value.undo.length>100)throw Error('Audio binding history needs review before editing');
 return {raw,value};
}
function snapshot(project:string,sourcePath?:string){
 const {raw:dnaRaw,dna}=identity(project),h=history(project),targets:AudioBindingTarget[]=[];
 for(const kind of ['sfx','music'] as const){
  const path='audio/'+kind,directory=assetFile(project,path);if(!existsSync(directory))continue;
  for(const name of readdirSync(directory).sort()){
   if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}\.wav$/.test(name))continue;
   const target=path+'/'+name;targets.push({path:target,id:name.slice(0,-4),kind,sha256:hash(bytes(project,target)),sourcePath:h.value.bindings[target]?.sourcePath});
  }
 }
 let source:AudioBindingSnapshot['source'],sourceError:string|undefined;let sourceRaw:Buffer|undefined,metadataRaw:Buffer|undefined;
 if(sourcePath){
  try{
  const take=listLocalAudioAlternatives(project).find(row=>row.path===sourcePath);if(!take)throw Error('Select a saved local audio take');
  sourceRaw=bytes(project,sourcePath);if(hash(sourceRaw)!==take.sha256)throw Error('Saved take changed; regenerate or review its receipt before applying');inspectLocalAudioWav(sourceRaw);
  metadataRaw=bytes(project,take.metadataPath,16384);const metadata=JSON.parse(metadataRaw.toString('utf8'));
  if(metadata.archetype!==dna.archetype||metadata.sourceDnaSha256!==hash(dnaRaw))throw Error('Game identity changed since this take was generated; create a new take');
  source={path:sourcePath,sha256:take.sha256,kind:take.request.kind};
  }catch(error){sourceError=error instanceof Error?error.message:'Saved take is unavailable';source=undefined;sourceRaw=undefined;metadataRaw=undefined;}
 }
 const boundMetadata=Object.values(h.value.bindings).map(binding=>{
  if(!/^assets\/generated\/audio\/(sfx|music)\/[0-9a-f-]{36}\.wav$/.test(binding.sourcePath))throw Error('Audio binding history contains an invalid source');
  return [binding.sourcePath,hash(bytes(project,binding.sourcePath.replace(/\.wav$/,'.json'),16384))];
 });
 const revision=hash(JSON.stringify({dna:hash(dnaRaw),history:h.raw?hash(h.raw):null,targets,boundMetadata,selectedSource:sourcePath??null,sourceError,source:source?{...source,metadataHash:hash(metadataRaw!)}:null}));
 return {h,sourceRaw,metadataRaw,publicState:{supported:true,revision,targets,source,sourceError,undoTarget:h.value.undo.at(-1)?.targetPath} as AudioBindingSnapshot};
}
export function readAudioBindings(project:string,sourcePath?:string):AudioBindingSnapshot{
 try{return snapshot(project,sourcePath).publicState;}catch(error){return {supported:false,reason:error instanceof Error?error.message:'Audio bindings unavailable',revision:'',targets:[]};}
}
function invalidateAudio(project:string,writes:Map<string,Buffer>){
 const file=assetFile(project,'validation_report.json');if(!existsSync(file))return;
 const previous=JSON.parse(bytes(project,'validation_report.json',16*1024*1024).toString('utf8'));
 writes.set(file,Buffer.from(JSON.stringify({...previous,passed:false,productionReady:false,validationLevel:'NEEDS_RUNTIME_VALIDATION',invalidationReason:'Audio changed; restart the game and validate playback before accepting it.'},null,2)));
}
export function applyAudioBinding(project:string,sourcePath:string,targetPath:string,revision:string):AudioBindingSnapshot{
 const release=lockAssetMutation(project);try{
  const state=snapshot(project,sourcePath);if(state.publicState.revision!==revision)throw Error('Audio changed since selection; refresh and review before applying');
  if(!state.publicState.source)throw Error(state.publicState.sourceError||'Select a valid saved take');
  const target=state.publicState.targets.find(row=>row.path===targetPath);if(!target||target.kind!==state.publicState.source!.kind)throw Error('Choose an existing event of the same audio type');
  if(state.h.value.undo.length>=100)throw Error('Audio history is full; preserve or review it before further edits');
  const id=randomUUID(),previous=bytes(project,targetPath),metadata=JSON.parse(state.metadataRaw!.toString('utf8'));
  const uses=Object.entries(state.h.value.bindings).filter(([path,binding])=>path!==targetPath&&binding.sourcePath===sourcePath).map(([path])=>path).concat(targetPath);
  const metadataNext=Buffer.from(JSON.stringify({...metadata,gameplayApplied:true,bindingUses:uses,approved:false,productionReady:false},null,2));
  if(metadataNext.length>16384)throw Error('Take metadata is full; preserve it before further edits');
  const command:Command={id,targetPath,sourcePath,beforeSha256:hash(previous),afterSha256:hash(state.sourceRaw!),sourceMetadataBefore:state.metadataRaw!.toString('base64'),sourceMetadataBeforeSha256:hash(state.metadataRaw!),sourceMetadataAfterSha256:hash(metadataNext),previousBinding:state.h.value.bindings[targetPath]??null};
  state.h.value.bindings[targetPath]={sourcePath,sourceSha256:command.afterSha256,commandId:id};state.h.value.undo.push(command);state.h.value.events.push({id,action:'apply',at:new Date().toISOString()});
  const writes=new Map<string,Buffer>([[assetFile(project,targetPath),state.sourceRaw!],[assetFile(project,sourcePath.replace(/\.wav$/,'.json')),metadataNext],[assetFile(project,'.metroforge/audio-binding-history/'+id+'.wav'),previous],[assetFile(project,HISTORY),Buffer.from(JSON.stringify(state.h.value,null,2))]]);
  if(command.previousBinding&&command.previousBinding.sourcePath!==sourcePath){
   const oldPath=command.previousBinding.sourcePath.replace(/\.wav$/,'.json'),oldRaw=bytes(project,oldPath,16384),oldValue=JSON.parse(oldRaw.toString('utf8'));
   const oldUses=Object.entries(state.h.value.bindings).filter(([,binding])=>binding.sourcePath===command.previousBinding!.sourcePath).map(([path])=>path);
   const oldNext=Buffer.from(JSON.stringify({...oldValue,gameplayApplied:oldUses.length>0,bindingUses:oldUses,approved:false,productionReady:false},null,2));
   if(oldNext.length>16384)throw Error('Previous take metadata is full; preserve it before further edits');
   command.displaced={path:oldPath,before:oldRaw.toString('base64'),beforeSha256:hash(oldRaw),afterSha256:hash(oldNext)};writes.set(assetFile(project,oldPath),oldNext);
   writes.set(assetFile(project,HISTORY),Buffer.from(JSON.stringify(state.h.value,null,2)));
  }
  if(writes.get(assetFile(project,HISTORY))!.length>4*1024*1024)throw Error('Audio history is full; preserve it before further edits');
  invalidateAudio(project,writes);commitAssetFiles(writes);return snapshot(project,sourcePath).publicState;
 }finally{release();}
}
export function undoAudioBinding(project:string,sourcePath:string|undefined,revision:string):AudioBindingSnapshot{
 const release=lockAssetMutation(project);try{
  const state=snapshot(project,sourcePath);if(state.publicState.revision!==revision)throw Error('Audio changed since selection; refresh before Undo');
  const command=state.h.value.undo.at(-1);if(!command)throw Error('No audio change to undo');
  if(!/^[0-9a-f-]{36}$/.test(command.id)||!state.publicState.targets.some(row=>row.path===command.targetPath)||!/^assets\/generated\/audio\/(sfx|music)\/[0-9a-f-]{36}\.wav$/.test(command.sourcePath))throw Error('Audio history command is invalid');
  const metadataPath=command.sourcePath.replace(/\.wav$/,'.json');
  if(hash(bytes(project,command.targetPath))!==command.afterSha256||hash(bytes(project,metadataPath,16384))!==command.sourceMetadataAfterSha256)throw Error('Audio or take metadata changed after Apply; Undo will preserve those edits');
  const backup=bytes(project,'.metroforge/audio-binding-history/'+command.id+'.wav');if(hash(backup)!==command.beforeSha256)throw Error('Audio backup changed; preserve it for recovery');
  const metadataBefore=Buffer.from(command.sourceMetadataBefore,'base64');if(metadataBefore.length>16384||hash(metadataBefore)!==command.sourceMetadataBeforeSha256)throw Error('Audio metadata backup changed');
  state.h.value.undo.pop();if(command.previousBinding)state.h.value.bindings[command.targetPath]=command.previousBinding;else delete state.h.value.bindings[command.targetPath];state.h.value.events.push({id:command.id,action:'undo',at:new Date().toISOString()});
  const writes=new Map<string,Buffer>([[assetFile(project,command.targetPath),backup],[assetFile(project,metadataPath),metadataBefore],[assetFile(project,HISTORY),Buffer.from(JSON.stringify(state.h.value,null,2))]]);
  if(command.displaced){
   if(!/^assets\/generated\/audio\/(sfx|music)\/[0-9a-f-]{36}\.json$/.test(command.displaced.path)||hash(bytes(project,command.displaced.path,16384))!==command.displaced.afterSha256)throw Error('Previous take metadata changed; Undo will preserve it');
   const oldBefore=Buffer.from(command.displaced.before,'base64');if(oldBefore.length>16384||hash(oldBefore)!==command.displaced.beforeSha256)throw Error('Previous take metadata backup changed');writes.set(assetFile(project,command.displaced.path),oldBefore);
  }
  if(writes.get(assetFile(project,HISTORY))!.length>4*1024*1024)throw Error('Audio history is full; preserve it before Undo');
  invalidateAudio(project,writes);commitAssetFiles(writes);return snapshot(project,sourcePath).publicState;
 }finally{release();}
}
