import {describe,it,expect} from 'vitest';
import {buildStormglassInteriorMasonry,type RoomAssemblyOptions} from './room-assembler.js';
const platforms=[{x:672,y:1120,width:224,height:32},{x:672,y:1120,width:96,height:32},{x:768,y:1024,width:96,height:32},{x:672,y:928,width:96,height:32}];
const pits=[{x:608,width:64}];
const options={width:2048,height:1280,tileSize:32,hasTileset:true,stormglassRoomTheme:'current-tunnel',connections:[{direction:'left'},{direction:'right'}],platforms,pits} as RoomAssemblyOptions;
describe('Current Tunnel enclosure',()=>{
 it('frames the raised crossing with asymmetric sheltered passages',()=>{
  const masonry=buildStormglassInteriorMasonry(options);
  expect(masonry.filter(r=>r.name.startsWith('MasonryRoof')).map(r=>[r.x,r.width,r.height])).toEqual([[0,512,960],[512,640,704],[1152,896,928]]);
  expect(masonry.filter(r=>r.name.startsWith('MasonryPier')).map(r=>1216-r.y-r.height)).toEqual([192,224]);
 });
 it('keeps the original pit and platforms clear of the new solid masonry',()=>{
  const before=JSON.stringify({platforms,pits});
  const masonry=buildStormglassInteriorMasonry(options);
  for(const p of platforms)for(const r of masonry)expect(p.x<r.x+r.width&&p.x+p.width>r.x&&p.y<r.y+r.height&&p.y+p.height>r.y).toBe(false);
  expect(JSON.stringify({platforms,pits})).toBe(before);
  expect(masonry.filter(r=>r.name.startsWith('MasonryPier')).every(r=>r.x+r.width<=608||r.x>=672)).toBe(true);
 });
});
