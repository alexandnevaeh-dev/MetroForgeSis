import {describe,it,expect} from 'vitest';
import {buildStormglassInteriorMasonry,type RoomAssemblyOptions} from './room-assembler.js';
const options={width:3072,height:1152,tileSize:32,hasTileset:true,stormglassRoomTheme:'water-refuge',connections:[{direction:'left'},{direction:'right'}],platforms:[{x:1344,y:992,width:96,height:32}]} as RoomAssemblyOptions;
describe('Water Shrine refuge',()=>{
 it('encloses the checkpoint alcove, colonnade and guardian approach',()=>{
  const rects=buildStormglassInteriorMasonry(options);
  expect(rects.filter(r=>r.name.startsWith('MasonryRoof')).map(r=>[r.x,r.width,r.height])).toEqual([[0,640,704],[640,1088,768],[1728,1344,832]]);
  expect(rects.filter(r=>r.name.startsWith('MasonryPier')).map(r=>1088-r.y-r.height)).toEqual([256,256]);
  for(const p of [{x:126,y:960,width:48,height:128},{x:1344,y:912,width:96,height:112}])for(const r of rects)expect(p.x<r.x+r.width&&p.x+p.width>r.x&&p.y<r.y+r.height&&p.y+p.height>r.y).toBe(false);
 });
 it('keeps vertical transition rooms and unrelated sets out of this enclosure',()=>{
  expect(buildStormglassInteriorMasonry({...options,connections:[{direction:'up'}] as RoomAssemblyOptions['connections']})).toEqual([]);
  expect(buildStormglassInteriorMasonry({...options,stormglassRoomTheme:undefined})).toEqual([]);
 });
});
