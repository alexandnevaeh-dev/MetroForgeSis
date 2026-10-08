import {describe,it,expect} from 'vitest';
import {buildStormglassInteriorMasonry,type RoomAssemblyOptions} from './room-assembler.js';
describe('Collapsed Vestibule chambers',()=>{
 it('preserves all nine original ledges with headroom and connects the halls',()=>{
  const rects=buildStormglassInteriorMasonry({width:1792,height:768,tileSize:32,hasTileset:true,stormglassRoomTheme:'archive-vestibule',connections:[{direction:'left'},{direction:'right'}]} as RoomAssemblyOptions);
  expect(rects.filter(r=>r.name.startsWith('MasonryRoof')).map(r=>[r.x,r.width,r.height])).toEqual([[0,576,256],[576,576,160],[1152,640,256]]);
  expect(rects.filter(r=>r.name.startsWith('MasonryPier')).map(r=>704-r.y-r.height)).toEqual([320,320]);
  for(const offset of [0,576,1152])for(const p of [{x:160+offset,y:528,width:96,height:112},{x:256+offset,y:432,width:96,height:112},{x:352+offset,y:336,width:160,height:112}])for(const r of rects)expect(p.x<r.x+r.width&&p.x+p.width>r.x&&p.y<r.y+r.height&&p.y+p.height>r.y).toBe(false);
 });
});
