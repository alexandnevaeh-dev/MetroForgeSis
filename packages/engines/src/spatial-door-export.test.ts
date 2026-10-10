import {describe,it,expect} from 'vitest';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GameDNASchema} from '@metroforge/schemas';
import {buildStormglassGalleryBlueprint,stormglassGalleryPort} from '../../godot/src/stormglass-gallery-blueprint.js';
import {buildGameplayPack} from './gameplay-pack.js';
const dna=GameDNASchema.parse({version:'0.1.0',archetype:'SIDE_VIEW_METROIDVANIA',identity:{title:'Stormglass Reliquary',genre:'Metroidvania',tone:'dark',visualStyle:'pixel art'},technical:{resolution:{width:1920,height:1080},tileSize:32,targetPlaytimeHours:1,difficulty:'normal'},combat:{style:'melee',meleeEnabled:true,rangedEnabled:false},movement:{walkSpeed:220,runSpeed:380,jumpHeight:160,gravity:980},abilities:[{id:'dash',name:'Dash',category:'movement',enabled:true}],world:{biomeCount:1,roomCount:48},narrative:{premise:'Archive',protagonist:'Courier',centralConflict:'Return'},seed:42,profile:'MEDIUM'});
function pack(profile:'gallery'|'expanded-region'|'archive-wing', middleGate=false) {
 const plan=buildStormglassGalleryBlueprint(profile),roomIds=plan.rooms.map(r=>r.id);
 return buildGameplayPack({outputDir:join(tmpdir(),'spatial-export-'+profile),gameDna:dna,roomIds,worldGraph:{version:'0.1.0',seed:42,regions:[],nodes:plan.rooms.map(r=>({id:r.id,type:'room',label:r.name,metadata:{archetype:r.theme==='rest'?'save':r.theme==='stairwell'?'traversal':'combat',stormglassRoomTheme:r.theme,stormglassRegionProfile:profile,stormglassCampaignLayout:'stormglass-gallery-campaign-v1',targetTileWidth:r.width/32,targetTileHeight:r.height/32}})),edges:plan.links.map((l,i)=>({id:'edge_'+i,from:l.from,to:l.to,transition:l.direction,requirements:middleGate&&l.from==='room_043'&&l.to==='room_044'?['dash']:l.requirements,optional:l.optional,bidirectional:true}))},progressionGraph:{version:'0.1.0',seed:42,startNodeId:roomIds[0]!,endNodeId:roomIds.at(-1)!,nodes:[],edges:[],abilities:[],criticalPath:roomIds},textureFiles:new Map([['assets/tilesets/biome_0/source.png',Buffer.from('presence')]])});
}
describe('authored spatial doors in shared engine packs',()=>{
 it.each(['gallery','expanded-region','archive-wing'] as const)('preserves every %s authored sensor and reciprocal anchor',profile=>{
  const result=pack(profile);let ports=0;
  for(const room of result.rooms)for(const door of room.doors){const port=stormglassGalleryPort(room.id,door.targetRoomId,door.direction,profile);if(!port){expect(door.spatial).toBeUndefined();continue;}ports++;expect(door).toMatchObject({x:port.x,y:port.y,width:24,height:80,spatial:{authored:true,floorY:port.floorY}});if(port.arrivalX!==undefined)expect(door.spatial).toMatchObject({hasArrivalX:true,arrivalX:port.arrivalX});else expect(door.spatial?.hasArrivalX).toBeUndefined();}
  expect(ports).toBeGreaterThan(20);
 });
 it('keeps the west shaft side door at its middle landing and the east hall at its upper landing',()=>{
  const result=pack('archive-wing');expect(result.rooms.find(r=>r.id==='room_043')!.doors.find(d=>d.targetRoomId==='room_044')).toMatchObject({x:952,y:1440,spatial:{floorY:1472}});
  expect(result.rooms.find(r=>r.id==='room_044')!.doors.find(d=>d.targetRoomId==='room_045')).toMatchObject({y:672,spatial:{floorY:704}});
 });
 it('retains locked route requirements and aligns each spatial side gate with its authored floor',()=>{
  const result=pack('archive-wing',true);expect(result.rooms.find(r=>r.id==='room_043')!.gates.find(g=>g.targetRoomId==='room_044')).toMatchObject({y:1344,height:128,requiredAbility:'dash'});const lock=result.rooms.find(r=>r.id==='room_001')!.doors.find(d=>d.targetRoomId==='room_043')!;expect(lock.requirements).toEqual(['dash']);expect(lock.optional).toBe(true);
  for(const room of result.rooms)for(const gate of room.gates){const door=room.doors.find(d=>d.targetRoomId===gate.targetRoomId&&d.spatial);if(door)expect(gate.y+gate.height).toBe(door.spatial!.floorY);}
 });
});

