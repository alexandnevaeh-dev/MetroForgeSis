import {readFileSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {validStormglassArchiveBays} from '@metroforge/godot';
import {assetFile,commitAssetFiles,lockAssetMutation} from './asset-files.js';

export type ArchiveFurnishing = {id:string;kind:string;x:number;width:number;height:number;floorY?:number;preserveSize?:boolean};
export type ArchiveFurnishingEdit = {id:string;x:number;width:number;height:number;floorY:number|null};
const configRel='data/visual/stormglass-room-kits.json';
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function load(project:string,roomId:string){
  if(!/^room_[A-Za-z0-9_-]{1,64}$/.test(roomId))throw Error('Invalid archive room');
  if(!existsSync(assetFile(project,'project.godot')))throw Error('Archive furnishing editing requires Godot');
  const read=(rel:string,limit=1024*1024)=>{const bytes=readFileSync(assetFile(project,rel));if(bytes.length>limit)throw Error('Archive authoring data exceeds its size limit');return bytes;};
  const dnaBytes=read('game_dna.json'),dna=JSON.parse(dnaBytes.toString('utf8'));
  if(dna.archetype!=='SIDE_VIEW_METROIDVANIA'||typeof dna.identity?.title!=='string'||!dna.identity.title.startsWith('Stormglass Reliquary'))throw Error('Archive furnishings belong to the Stormglass side-view game');
  const bytes=read(configRel),config=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),roomsBytes=read('data/rooms/rooms.json',8*1024*1024),room=JSON.parse(roomsBytes.toString('utf8')).rooms?.[roomId],scene=read('scenes/rooms/'+roomId+'.tscn',4*1024*1024);
  if(config.version!==1||!room||!Number.isFinite(room.width)||!Number.isFinite(room.height)||!validStormglassArchiveBays(config.rooms?.[roomId]?.archiveBays,room.width,room.height))throw Error('This room has no valid authored archive furnishings');
  const bays=config.rooms[roomId].archiveBays as Array<ArchiveFurnishing & Record<string,unknown>>;
  const revision=createHash('sha256').update(bytes).update(roomsBytes).update(scene).update(dnaBytes).digest('hex');
  return {bytes,config,room,bays,revision,sourceHashes:{config:hash(bytes),rooms:hash(roomsBytes),scene:hash(scene),dna:hash(dnaBytes)}};
}
export function readArchiveFurnishings(project:string,roomId:string){
  const state=load(project,roomId);
  return {revision:state.revision,sourceHashes:state.sourceHashes,width:state.room.width as number,height:state.room.height as number,bays:state.bays.map(b=>({id:b.id,kind:b.kind,x:b.x,width:b.width,height:b.height,...(b.preserveSize!==undefined?{preserveSize:b.preserveSize as boolean}:{}),...(b.floorY!==undefined?{floorY:b.floorY}:{})}))};
}
function promote(project:string,roomId:string,state:ReturnType<typeof load>,bytes:Buffer){
  // Retain a byte-exact preimage. No image, scene, collider, graph or reward is rewritten.
  const token=randomUUID(),base='.metroforge/archive_furnishing_history/'+token;
  const writes=new Map<string,Buffer>([
    [assetFile(project,base+'.before.json'),state.bytes],
    [assetFile(project,base+'.record.json'),Buffer.from(JSON.stringify({roomId,beforeHash:hash(state.bytes),afterHash:hash(bytes)},null,2))],
    [assetFile(project,configRel),bytes],
  ]);
  const report=assetFile(project,'validation_report.json');
  if(existsSync(report)){
    const data=JSON.parse(readFileSync(report,'utf8'));
    if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Saved validation report is invalid; furnishings were preserved');
    writes.set(report,Buffer.from(JSON.stringify({...data,passed:false,productionReady:false,validationLevel:'NEEDS_RUNTIME_VALIDATION',invalidationReason:'Furnishings changed; restart and inspect support, clearance and native-camera readability.'},null,2)));
  }
  if(load(project,roomId).revision!==state.revision)throw Error('Project changed. Reload furnishings before saving.');
  commitAssetFiles(writes);
  return {...readArchiveFurnishings(project,roomId),historyToken:token};
}
export function saveArchiveFurnishing(project:string,roomId:string,edit:ArchiveFurnishingEdit,revision:string){
  const release=lockAssetMutation(project);
  try{
    const state=load(project,roomId);
    if(state.revision!==revision)throw Error('Project changed. Reload furnishings before saving.');
    if(!edit||typeof edit!=='object'||Array.isArray(edit)||Object.keys(edit).some(k=>!['id','x','width','height','floorY'].includes(k)))throw Error('Invalid furnishing edit');
    const bay=state.bays.find(b=>b.id===edit.id);if(!bay)throw Error('Choose an existing archive furnishing');
    if(typeof edit.x!=='number'||typeof edit.width!=='number'||typeof edit.height!=='number'||(edit.floorY!==null&&typeof edit.floorY!=='number'))throw Error('Enter valid furnishing dimensions and floor coordinates');
    const next={...bay,x:edit.x,width:edit.width,height:edit.height,preserveSize:true};
    if(edit.floorY===null)delete next.floorY;else next.floorY=edit.floorY;
    const bays=state.bays.map(b=>b.id===edit.id?next:b);
    if(!validStormglassArchiveBays(bays,state.room.width,state.room.height))throw Error('Furnishing dimensions or position exceed this room’s authored bounds');
    state.config.rooms[roomId].archiveBays=bays;
    return promote(project,roomId,state,Buffer.from(JSON.stringify(state.config,null,2)+'\n'));
  }finally{release();}
}
export function restoreArchiveFurnishing(project:string,roomId:string,revision:string,historyToken:string){
  const release=lockAssetMutation(project);
  try{
    if(!/^[a-f0-9-]{36}$/.test(historyToken))throw Error('Invalid furnishing history');
    const state=load(project,roomId);if(state.revision!==revision)throw Error('Project changed. Reload furnishings before restoring.');
    const base='.metroforge/archive_furnishing_history/'+historyToken,record=JSON.parse(readFileSync(assetFile(project,base+'.record.json'),'utf8'));
    if(record.roomId!==roomId||record.afterHash!==hash(state.bytes))throw Error('Furnishing history no longer matches this project');
    const bytes=readFileSync(assetFile(project,base+'.before.json'));
    if(bytes.length>1024*1024||record.beforeHash!==hash(bytes))throw Error('Furnishing history bytes changed');
    const config=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
    if(config.version!==1||!validStormglassArchiveBays(config.rooms?.[roomId]?.archiveBays,state.room.width,state.room.height))throw Error('Furnishing history is invalid');
    return promote(project,roomId,state,bytes);
  }finally{release();}
}
