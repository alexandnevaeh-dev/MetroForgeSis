import type {GameDNA,WorldGraph} from '@metroforge/schemas';
import {buildStormglassGalleryBlueprint} from './stormglass-gallery-blueprint.js';
/** Adapt the established Stormglass opening while preserving the later campaign.
 * Incompatible generated campaigns are left intact; callers can offer an explicit layout choice. */
export function applyStormglassGalleryBlueprint(dna:GameDNA,input:WorldGraph):WorldGraph|null {
 if(dna.archetype!=='SIDE_VIEW_METROIDVANIA'||!dna.identity.title.startsWith('Stormglass Reliquary'))return null;
 const plan=buildStormglassGalleryBlueprint();
 const shrine=input.nodes.find(n=>n.id===plan.abilityRoom);
 if(!Array.isArray(shrine?.metadata.grantsAbilities)||!shrine.metadata.grantsAbilities.includes('dash'))return null;
 if(!input.nodes.find(n=>n.id===plan.externalBossRoom)?.metadata.bossArena)return null;
 const opening=new Set<string>(plan.rooms.filter(r=>Number(r.id.slice(-3))<8).map(r=>r.id));
 if([...opening].some(id=>!input.nodes.some(n=>n.id===id)))return null;
 if(plan.rooms.filter(r=>!opening.has(r.id)).some(r=>input.nodes.some(n=>n.id===r.id)))return null;
 // An extra connection into the later campaign requires an authored port design, not silent deletion.
 if(input.edges.some(e=>(opening.has(e.from)&&!opening.has(e.to)&&e.to!==plan.externalBossRoom)||(opening.has(e.to)&&!opening.has(e.from)&&e.from!==plan.externalBossRoom)))return null;
 const graph=structuredClone(input);
 const parentRegion=graph.regions.find(region=>region.roomIds.includes('room_007'));
 graph.edges=graph.edges.filter(e=>!opening.has(e.from)&&!opening.has(e.to));
 for(const room of plan.rooms){
  let node=graph.nodes.find(n=>n.id===room.id);
  if(!node){
   node=structuredClone(input.nodes.find(n=>n.id==='room_007')!);
   node.id=room.id;
   node.metadata={...node.metadata,grantsAbilities:[],archetype:room.theme==='stairwell'?'traversal':'secret'};
   graph.nodes.push(node);
   if(parentRegion)parentRegion.roomIds.push(room.id);
  }
  node.label=room.name;
  node.metadata={...node.metadata,stormglassRoomPosition:{x:room.x,y:room.y},stormglassRoomTheme:room.theme,roomPurpose:room.purpose,targetTileWidth:room.width/dna.technical.tileSize,targetTileHeight:room.height/dna.technical.tileSize};
 }
 plan.links.forEach((link,index)=>graph.edges.push({id:`stormglass_gallery_${index}`,from:link.from,to:link.to,transition:link.direction,requirements:[...link.requirements],optional:link.optional,bidirectional:true,kind:'normal',metadata:{authoredRegion:plan.id}}));
 return graph;
}

