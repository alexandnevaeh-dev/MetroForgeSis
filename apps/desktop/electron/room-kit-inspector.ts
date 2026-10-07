import {existsSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
export type RoomKitSummary={wallRole:string;propRoles:string[]};
/** Inspector metadata only; never mutates authored room or asset records. */
export function readActiveRoomKits(projectPath:string,roomIds:string[]):Record<string,RoomKitSummary>{
 const result:Record<string,RoomKitSummary>={};
 const path=join(projectPath,'data/visual/stormglass-room-kits.json');
 if(!existsSync(path)||statSync(path).size>1024*1024)return result;
 try{
  const settings=join(projectPath,'project.godot');
  if(!existsSync(settings)||statSync(settings).size>1024*1024||!/^config\/name\s*=\s*"Stormglass Reliquary/m.test(readFileSync(settings,'utf8')))return result;
  const data=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
  if(data.version!==1||!data.rooms||typeof data.rooms!=='object')return result;
  const role=(value:unknown):value is string=>typeof value==='string'&&/^[a-z0-9_]{1,64}$/.test(value);
  for(const id of roomIds){
   if(!/^room_[a-zA-Z0-9_-]+$/.test(id))continue;
   const kit=data.rooms[id],scene=join(projectPath,'scenes/rooms',`${id}.tscn`);
   if(!kit||!existsSync(scene)||!Array.isArray(kit.manifests)||kit.manifests.length===0||kit.manifests.length>16)continue;
   // Native RoomTileMap creates the kit at runtime after admitting its manifests.
   const assetPath=(value:unknown):value is string=>typeof value==='string'&&value.startsWith('assets/architecture/stormglass/kits/')&&!value.includes('..')&&!value.includes('\\');
   const complete=kit.manifests.every((relative:unknown)=>{
    if(!assetPath(relative))return false;
    const manifestPath=join(projectPath,relative);
    if(!existsSync(manifestPath)||statSync(manifestPath).size>1024*1024)return false;
    const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    return Array.isArray(manifest.entries)&&assetPath(manifest.atlas)&&existsSync(join(projectPath,manifest.atlas));
   });
   if(!complete)continue;
   result[id]={wallRole:role(kit.wallRole)?kit.wallRole:'marble_wall',propRoles:Array.isArray(kit.props)?[...new Set<string>(kit.props.slice(0,128).map((p:unknown)=>typeof p==='object'&&p!==null?(p as {role?:unknown}).role:undefined).filter(role))]:[]};
  }
 }catch{return {};}
 return result;
}
