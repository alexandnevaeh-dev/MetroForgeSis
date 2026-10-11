import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validStormglassKitManifest} from '@metroforge/godot';
import type {GameplayRoom} from './types.js';
import type {FurnishingRequest} from './furnishing-layout.js';

type Entry={role:string;region:number[];opaqueBounds:number[]};
type Part={asset:string;entry:Entry};
const safe=(path:unknown):path is string=>typeof path==='string'&&/^assets\/architecture\/stormglass\/kits\/[a-z0-9-]+\/(manifest\.json|atlas\.png)$/.test(path);
/** Read saved author-owned composition. Hash/bounds failures leave the existing presentation intact. */
export function readNativeRoomKit(outputDir:string,room:GameplayRoom){
 const file=join(outputDir,'data/visual/stormglass-room-kits.json');
 if(!existsSync(file)||!room.terrainMaterial)return null;
 try{
  const saved=JSON.parse(readFileSync(file,'utf8')),config=saved.rooms?.[room.id];
  if(saved.version!==1||!config||!Array.isArray(config.manifests)||!Array.isArray(config.props))return null;
  const parts=new Map<string,Part>();
  for(const path of config.manifests){
   if(!safe(path)||!path.endsWith('manifest.json'))return null;
   const manifest=JSON.parse(readFileSync(join(outputDir,path),'utf8'));
   if(!safe(manifest.atlas)||!manifest.atlas.endsWith('atlas.png'))return null;
   if(!validStormglassKitManifest(manifest,readFileSync(join(outputDir,manifest.atlas))))return null;
   for(const entry of manifest.entries as Entry[])parts.set(entry.role,{asset:manifest.atlas,entry});
  }
  const requests:FurnishingRequest[]=[];
  const omissions:{id:string;reason:string}[]=[];
  const add=(id:string,role:string,x:number,floorY:number,height:number,mounting:'floor'|'rear-wall')=>{
   const part=parts.get(role);
   if(!part){omissions.push({id,reason:'missing-kit-role'});return;}
   const [rx,ry]=part.entry.region,[bx,by,bw,bh]=part.entry.opaqueBounds;
   if(![x,floorY,height].every(Number.isFinite)||height<32||height>768){omissions.push({id,reason:'invalid-kit-placement'});return;}
   // Crop to the declared opaque silhouette, so feet and full support width use visible artwork.
   requests.push({id,role,asset:part.asset,x,floorY,width:bw!*height/bh!,height,mounting,
    frameRegion:{x:rx!+bx!,y:ry!+by!,width:bw!,height:bh!,pivotX:.5,pivotY:0},
    renderLayer:mounting==='rear-wall'||['bookcase','bookcase_low','scroll_rack','memorial_niche','star_chart'].includes(role)?'rear':'front'});
  };
  for(const [i,prop] of config.props.entries()){
   if(typeof prop.role!=='string')return null;
   const lift=prop.lift??0;
   add(`KitProp_${i}`,prop.role,prop.x,room.floorTop-lift,prop.height,lift>0?'rear-wall':'floor');
  }
  const bayRoles:Record<string,string>={'book-recess':'bookcase','scribe-desk':'reading_desk','ledger-pedestal':'stone_lectern','scroll-cabinet':'scroll_rack'};
  for(const bay of config.archiveBays??[]){
   const part=parts.get(bayRoles[bay.kind]??'');
   if(!part||![bay.width,bay.height,bay.x].every(Number.isFinite)||bay.width<=0){omissions.push({id:String(bay.id),reason:'invalid-archive-bay'});continue;}
   const bounds=part.entry.opaqueBounds;
   const height=Math.min(bay.height,bay.width*bounds[3]!/bounds[2]!);
   const floorY=bay.floorY??room.floorTop;
   if(typeof floorY!=='number'||!Number.isFinite(floorY)||floorY<0||floorY>room.height){omissions.push({id:String(bay.id),reason:'invalid-archive-anchor'});continue;}
   add(String(bay.id),bayRoles[bay.kind]!,bay.x,floorY,height,'floor');
  }
  // Recessed local modules repeat architectural bays, never a whole-room painting.
  // Fit each rear bay inside the authored room height; physical support stays separate.
  const bayHeight=Math.min(192,room.floorTop-32);
  for(let x=192;x<room.width-96;x+=384){
   add(`KitWall_${x}`,config.wallRole??'marble_wall',x,room.floorTop,bayHeight,'rear-wall');
   add(`KitColumn_${x}`, 'ribbed_column',x-144,room.floorTop,bayHeight,'rear-wall');
  }
  const tint=typeof config.wallTint==='string'&&/^[0-9a-f]{6}$/i.test(config.wallTint)?config.wallTint:'46516b';
  const backdropTint=[0,2,4].map(i=>parseInt(tint.slice(i,i+2),16)/255*.35);
  return {requests,omissions,backdropTint};
 }catch{return null;}
}

