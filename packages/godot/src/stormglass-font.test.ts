import {describe,it,expect} from 'vitest';
import {buildStormglassInteriorMasonry,type RoomAssemblyOptions} from './room-assembler.js';
const platforms=[{x:896,y:1120,width:128,height:32},{x:1056,y:1024,width:128,height:32}];
const options={width:2048,height:1280,tileSize:32,hasTileset:true,stormglassRoomTheme:'font-sanctuary',connections:[{direction:'left'},{direction:'right'}],platforms} as RoomAssemblyOptions;
describe('Font sanctuary architecture',()=>{
 it('encloses the pickup alcove, high nave and library exit',()=>{
  const rects=buildStormglassInteriorMasonry(options);
  expect(rects.filter(r=>r.name.startsWith('MasonryRoof')).map(r=>[r.x,r.width,r.height])).toEqual([[0,640,832],[640,768,576],[1408,640,896]]);
  expect(rects.filter(r=>r.name.startsWith('MasonryPier')).map(r=>1216-r.y-r.height)).toEqual([256,256]);
  // Ordinary pickup access and original practice platforms stay out of solids.
  for(const p of [...platforms,{x:196,y:1124,width:128,height:64}])for(const r of rects)expect(p.x<r.x+r.width&&p.x+p.width>r.x&&p.y<r.y+r.height&&p.y+p.height>r.y).toBe(false);
 });
 it('preserves open vertical transitions and isolates the new theme',()=>{
  expect(buildStormglassInteriorMasonry({...options,connections:[{direction:'up'}] as RoomAssemblyOptions['connections']})).toEqual([]);
  expect(buildStormglassInteriorMasonry({...options,stormglassRoomTheme:undefined})).toEqual([]);
 });
});
