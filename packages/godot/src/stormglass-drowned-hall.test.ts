import {describe,it,expect} from 'vitest';
import {buildStormglassInteriorMasonry,type RoomAssemblyOptions} from './room-assembler.js';
const options={width:2048,height:1280,tileSize:32,hasTileset:true,stormglassRoomTheme:'drowned-hall',connections:[{direction:'left'},{direction:'right'}],platforms:[{x:224,y:1120,width:192,height:32},{x:1472,y:1120,width:128,height:32}]} as RoomAssemblyOptions;
describe('Drowned Hall enclosure',()=>{
 it('builds three broad bays and 256px walking portals without changing platforms',()=>{
  const before=JSON.stringify(options.platforms);
  const masonry=buildStormglassInteriorMasonry(options);
  expect(masonry.filter(r=>r.name.startsWith('MasonryRoof')).map(r=>[r.x,r.width,r.height])).toEqual([[0,640,832],[640,768,704],[1408,640,832]]);
  for(const pier of masonry.filter(r=>r.name.startsWith('MasonryPier')))expect(1216-pier.y-pier.height).toBe(256);
  for(const platform of options.platforms!){
   for(const volume of masonry)expect(platform.x<volume.x+volume.width&&platform.x+platform.width>volume.x&&platform.y<volume.y+volume.height&&platform.y+platform.height>volume.y).toBe(false);
  }
  expect(JSON.stringify(options.platforms)).toBe(before);
 });
 it('leaves upward-port rooms outside enclosed roof construction',()=>{
  expect(buildStormglassInteriorMasonry({...options,connections:[{direction:'up',targetRoomId:'upper',requirements:[]}]})).toEqual([]);
 });
});
