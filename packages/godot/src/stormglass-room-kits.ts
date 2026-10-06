import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {GameDNA,WorldGraph} from '@metroforge/schemas';
import {buildStormglassGalleryBlueprint} from './stormglass-gallery-blueprint.js';
/** Admit the authored kit only for the matching side-view blueprint, after verifying its assets.
 * Existing author-owned room layouts are never overwritten. */
export function configureStormglassGalleryRoomKits(outputDir:string,dna:GameDNA,graph:WorldGraph):boolean {
 if(dna.archetype!=='SIDE_VIEW_METROIDVANIA'||!dna.identity.title.startsWith('Stormglass Reliquary'))return false;
 const blueprint=buildStormglassGalleryBlueprint(),tileSize=dna.technical.tileSize;
 if(!blueprint.rooms.every(room=>{
  const node=graph.nodes.find(n=>n.id===room.id),meta=node?.metadata;
  return meta?.stormglassRoomTheme===room.theme&&Number(meta.targetTileWidth)*tileSize===room.width&&Number(meta.targetTileHeight)*tileSize===room.height;
 }))return false;
 // Geometry labels alone cannot admit a kit whose doors disagree with its blueprint.
 const authoredIds=new Set<string>(blueprint.rooms.map(room=>room.id));
 const opposite:Record<string,string>={left:'right',right:'left',up:'down',down:'up'};
 const sameRequirements=(a:readonly string[],b:readonly string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
 const matches=(edge:WorldGraph['edges'][number],link:typeof blueprint.links[number])=>
  edge.bidirectional===true&&sameRequirements(edge.requirements,link.requirements)&&
  ((edge.from===link.from&&edge.to===link.to&&edge.transition===link.direction)||
   (edge.from===link.to&&edge.to===link.from&&edge.transition===opposite[link.direction]));
 if(!blueprint.links.every(link=>graph.edges.filter(edge=>matches(edge,link)).length===1))return false;
 if(graph.edges.some(edge=>(authoredIds.has(edge.from)||authoredIds.has(edge.to))&&!blueprint.links.some(link=>matches(edge,link))))return false;
 const source=join(outputDir,'data/visual/blueprints/stormglass-gallery-room-kits-v1.json');
 const target=join(outputDir,'data/visual/stormglass-room-kits.json');
 if(!existsSync(source)||existsSync(target))return false;
 try {
 const config=JSON.parse(readFileSync(source,'utf8').replace(/^\uFEFF/,''));
 if(config.version!==1||!config.rooms)return false;
 const campaignRooms=graph.nodes.filter(node=>node.type==='room');
 const fullCampaign=campaignRooms.length===43&&campaignRooms.every(node=>node.metadata.stormglassCampaignLayout==='stormglass-gallery-campaign-v1');
 if(fullCampaign){
  if(Object.keys(config.rooms).length!==campaignRooms.length||campaignRooms.some(node=>!config.rooms[node.id]))return false;
 }else{
  // Legacy opening adapters receive only their matching authored rooms.
  config.rooms=Object.fromEntries(Object.entries(config.rooms).filter(([id])=>authoredIds.has(id)));
 }
 const manifests=new Set<string>(Object.values(config.rooms).flatMap((room:any)=>room.manifests??[]));
 for(const path of manifests){
  if(path.includes('..')||!path.startsWith('assets/architecture/stormglass/kits/'))return false;
  const full=join(outputDir,path);if(!existsSync(full))return false;
  const manifest=JSON.parse(readFileSync(full,'utf8'));
  if(typeof manifest.atlas!=='string'||manifest.atlas.includes('..')||!manifest.atlas.startsWith('assets/architecture/stormglass/kits/'))return false;
  const atlas=join(outputDir,manifest.atlas);if(!existsSync(atlas))return false;
  if(createHash('sha256').update(readFileSync(atlas)).digest('hex').toLowerCase()!==String(manifest.sha256).toLowerCase())return false;
 }
 for(const room of Object.values(config.rooms) as any[]){
  const roles=new Set<string>();
  if(!Array.isArray(room.manifests)||!Array.isArray(room.props))return false;
  for(const path of room.manifests){
   const manifest=JSON.parse(readFileSync(join(outputDir,path),'utf8'));
   for(const entry of manifest.entries??[])roles.add(entry.role);
  }
  if(room.wallRole&&!roles.has(room.wallRole))return false;
  if(['ambientColor','wallTint','columnTint'].some(key=>room[key]!==undefined&&!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(room[key])))return false;
  if(room.props.some((prop:any)=>!roles.has(prop.role)||!Number.isFinite(prop.x)||!Number.isFinite(prop.height)||prop.height<=0||!Number.isFinite(prop.lift??0)))return false;
 }
 writeFileSync(target,JSON.stringify(config,null,2)+'\n');
 return true;
 } catch { return false; }
}

