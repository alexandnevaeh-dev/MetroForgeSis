import type {WorldGraph,ProgressionGraph} from '@metroforge/schemas';
import type {WorldGenOptions,WorldGenResult} from './world.js';

/** Ordered jump stages, with no inherited Metroidvania locks or shortcuts. */
export function generatePlatformerWorld(options:WorldGenOptions):WorldGenResult {
  if (!Number.isSafeInteger(options.roomCount) || options.roomCount < 2) throw new Error('Platformer needs at least two stages');
  if (!Number.isSafeInteger(options.biomeCount) || options.biomeCount < 1) throw new Error('Platformer needs a positive biome count');
  const roomIds=Array.from({length:options.roomCount},(_,i)=>`room_${String(i).padStart(3,'0')}`);
  const nodes:WorldGraph['nodes']=roomIds.map((id,i)=>{
    const worldIndex=Math.min(options.biomeCount-1,Math.floor(i*options.biomeCount/roomIds.length));
    return {id,type:'room',label:`Stage ${i+1}`,metadata:{
    archetype:i===0?'tutorial':i===roomIds.length-1?'boss':i%4===3?'save':'traversal',
    environmentArchetype:'corridor',roomPurpose:i===roomIds.length-1?'Finish encounter':'Jump traversal and stage progression',
    biomeIndex:worldIndex,regionIndex:worldIndex,
    grantsAbilities:[],platformerStage:true,stageIndex:i,targetTileWidth:64,targetTileHeight:24,
  }};
  });
  const edges:WorldGraph['edges']=roomIds.slice(0,-1).map((id,i)=>({id:`stage_edge_${i}`,from:id,to:roomIds[i+1]!,requirements:[],optional:false,bidirectional:true,transition:'right'}));
  const regions=Array.from({length:options.biomeCount},(_,i)=>({id:`region_${i}`,name:`World ${i+1}`,biomeId:`biome_${i}`,roomIds:nodes.filter(n=>n.metadata?.biomeIndex===i).map(n=>n.id)}));
  const progressionGraph:ProgressionGraph={version:'0.1.0',seed:options.seed,startNodeId:roomIds[0]!,endNodeId:roomIds.at(-1)!,
    nodes:roomIds.map((id,i)=>({id,type:i===roomIds.length-1?'boss':'room',label:`Stage ${i+1}`,required:true})),
    edges:edges.map(e=>({from:e.from,to:e.to,requires:[]})),abilities:[],criticalPath:roomIds};
  return {worldGraph:{version:'0.1.0',seed:options.seed,nodes,edges,regions},progressionGraph,roomIds};
}
