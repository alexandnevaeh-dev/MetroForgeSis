import {describe,it,expect} from 'vitest';
import {stormglassGalleryPort} from './stormglass-gallery-blueprint.js';
import {stormglassGalleryDescentPits,buildRoomBoundaryColliders} from './room-assembler.js';
describe('Stormglass shared-world portal alignment',()=>{
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
