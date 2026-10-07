import {describe,it,expect} from 'vitest';
import {buildStormglassInteriorMasonry,type RoomAssemblyOptions} from './room-assembler.js';
const options = {width:2048,height:1280,hasTileset:true,tileSize:32,stormglassRoomTheme:'library-reading',connections:[{direction:'left'},{direction:'right'}]} as RoomAssemblyOptions;
describe('Sunken Library enclosure',()=>{
 it('encloses three unequal chamber spans with two clear walking portals',()=>{
  const volumes=buildStormglassInteriorMasonry(options);
  const roofs=volumes.filter(v=>v.name.startsWith('MasonryRoof'));
  expect(roofs.map(v=>[v.x,v.width,v.height])).toEqual([[0,512,896],[512,1024,768],[1536,512,896]]);
  expect(roofs.reduce((sum,v)=>sum+v.width,0)).toBe(2048);
  const piers=volumes.filter(v=>v.name.startsWith('MasonryPier'));
  expect(piers).toHaveLength(2);
  for(const pier of piers)expect(1216-pier.y-pier.height).toBe(192);
  for(const v of volumes){expect(v.x).toBeGreaterThanOrEqual(0);expect(v.x+v.width).toBeLessThanOrEqual(2048);expect(v.y+v.height).toBeLessThan(1216);}
 });
 it('keeps vertical ports and unrelated room themes outside this enclosure',()=>{
  expect(buildStormglassInteriorMasonry({...options,connections:[{direction:'up',targetRoomId:'upper',requirements:[]}]})).toEqual([]);
  expect(buildStormglassInteriorMasonry({...options,stormglassRoomTheme:undefined})).toEqual([]);
  expect(buildStormglassInteriorMasonry({...options,stormglassRoomTheme:'stairwell'})).toEqual([]);
 });
});
