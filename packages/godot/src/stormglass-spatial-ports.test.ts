import {describe,it,expect} from 'vitest';
import {buildStormglassGalleryBlueprint,stormglassGalleryPort} from './stormglass-gallery-blueprint.js';
import {stormglassGalleryDescentPits,buildRoomBoundaryColliders} from './room-assembler.js';
describe('Stormglass shared-world portal alignment',()=>{
 it('rejects wrong directions, separated rooms and corner-only openings',()=>{
  expect(()=>stormglassGalleryPort('room_002','room_003','right')).toThrow(/edges do not touch/);
  expect(()=>stormglassGalleryPort('room_000','room_006','right')).toThrow(/edges do not touch/);
  expect(()=>stormglassGalleryPort('room_000','room_003','down')).toThrow(/shared width/);
  expect(()=>stormglassGalleryPort('room_002','room_003','diagonal')).toThrow(/edges do not touch/);
 });
 it('accepts every internal authored doorway in both directions',()=>{
  const plan=buildStormglassGalleryBlueprint();
  const opposite:Record<string,string>={left:'right',right:'left',up:'down',down:'up'};
  for(const link of plan.links){
   if(!plan.rooms.some(room=>room.id===link.to))continue;
   const forward=stormglassGalleryPort(link.from,link.to,link.direction)!;
   const reverse=stormglassGalleryPort(link.to,link.from,opposite[link.direction]!)!;
   expect(forward).toBeDefined();expect(reverse).toBeDefined();
   const from=plan.rooms.find(room=>room.id===link.from)!;
   const to=plan.rooms.find(room=>room.id===link.to)!;
   if(link.direction==='left'||link.direction==='right')expect(from.y+forward.floorY).toBe(to.y+reverse.floorY);
   else expect(from.x+forward.x).toBe(to.x+reverse.x);
  }
 });
 it('places the stairwell shrine door at the shared chamber floor',()=>{
  expect(stormglassGalleryPort('room_002','room_003','left')).toMatchObject({floorY:704,y:672});
  expect(stormglassGalleryPort('room_003','room_002','right')).toMatchObject({floorY:704,y:672});
  expect(stormglassGalleryPort('room_002','room_004','right')).toMatchObject({floorY:1472,y:1440});
 });
 it('aligns the gallery descent with the stairwell footprint',()=>{
  const down=stormglassGalleryPort('room_001','room_002','down')!;
  const up=stormglassGalleryPort('room_002','room_001','up')!;
  expect(down.x+3072).toBe(up.x+4096);
  expect(stormglassGalleryDescentPits(4096,32,[{direction:'down',targetRoomId:'room_002',requirements:[]}],'gallery','room_001')).toEqual([{x:1472,width:128}]);
 });
 it('cuts only the real middle shrine doorway into the stairwell wall',()=>{
  const connections=[{direction:'left' as const,targetRoomId:'room_003',requirements:[]}];
  const options={width:1024,height:1536,tileSize:32,connections,spatialPorts:[stormglassGalleryPort('room_002','room_003','left')!]};
  const walls=buildRoomBoundaryColliders(options).filter(r=>r.name.startsWith('ShellLeft'));
  expect(walls.map(r=>[r.y,r.height])).toEqual([[0,576],[704,768]]);
 });
 it('leaves unknown external rooms on their existing portal convention',()=>{
  expect(stormglassGalleryPort('room_006','room_008','right')).toBeUndefined();
 });
});
