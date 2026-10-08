import {describe,it,expect} from 'vitest';
import {buildStormglassInteriorMasonry,type RoomAssemblyOptions} from './room-assembler.js';
describe('Under-Arch Cache arrival',()=>{
 it('encloses side bays while keeping the inbound shaft, collectible and exit ledge clear',()=>{
  const rects=buildStormglassInteriorMasonry({width:2048,height:1280,tileSize:32,hasTileset:true,stormglassRoomTheme:'cache-drop',connections:[{direction:'right'}]} as RoomAssemblyOptions);
  expect(rects.map(r=>[r.x,r.y,r.width,r.height])).toEqual([[0,0,768,928],[1280,0,768,832]]);
  for(const p of [{x:768,y:32,width:512,height:1184},{x:1792,y:1008,width:96,height:112}])for(const r of rects)expect(p.x<r.x+r.width&&p.x+p.width>r.x&&p.y<r.y+r.height&&p.y+p.height>r.y).toBe(false);
 });
});
