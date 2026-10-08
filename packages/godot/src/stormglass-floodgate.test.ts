import {describe,it,expect} from 'vitest';
import {buildStormglassInteriorMasonry,type RoomAssemblyOptions} from './room-assembler.js';
describe('Floodgate chamber',()=>{
 it('retains gate ledges and NPC clearance inside enclosed halls',()=>{
  const rects=buildStormglassInteriorMasonry({width:1792,height:768,tileSize:32,hasTileset:true,stormglassRoomTheme:'floodgate-ascent',connections:[{direction:'left'},{direction:'right'}]} as RoomAssemblyOptions);
  expect(rects.map(r=>[r.x,r.width,r.height])).toEqual([[0,640,448],[640,512,320],[1152,640,384]]);
  for(const p of [{x:768,y:528,width:128,height:112},{x:928,y:432,width:128,height:112},{x:1312,y:576,width:64,height:128}])for(const r of rects)expect(p.x<r.x+r.width&&p.x+p.width>r.x&&p.y<r.y+r.height&&p.y+p.height>r.y).toBe(false);
 });
});
