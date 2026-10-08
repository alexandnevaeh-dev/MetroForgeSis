import {describe,it,expect} from 'vitest';
import {buildStormglassInteriorMasonry,stormglassGalleryDescentPits,collectRoomCollisionRects,type RoomAssemblyOptions} from './room-assembler.js';
const platforms=[{x:352,y:576,width:352,height:32},{x:480,y:608,width:96,height:32},{x:576,y:512,width:96,height:32},{x:480,y:416,width:96,height:32}];
const options={width:1792,height:768,tileSize:32,hasTileset:true,stormglassRoomTheme:'pressure-shaft',connections:[{direction:'left'},{direction:'right'},{direction:'down'}],platforms,pits:[{x:1344,width:64}]} as RoomAssemblyOptions;
describe('Pressure Shaft enclosure',()=>{
 it('carves the ordinary graph-owned cache descent without removing the original pit',()=>{
  const connections=[{direction:'down' as const,targetRoomId:'room_017',requirements:[]}];
  const descent=stormglassGalleryDescentPits(1792,32,connections,'pressure-shaft');
  expect(descent).toEqual([{x:832,width:128}]);
  const pits=[...options.pits!,...descent];
  const floor=collectRoomCollisionRects({...options,connections,pits}).filter(r=>r.name.startsWith('Floor'));
  for(const r of floor)expect(r.x<960&&r.x+r.width>832).toBe(false);
  expect(pits).toContainEqual({x:1344,width:64});
  expect(stormglassGalleryDescentPits(1792,32,[{...connections[0]!,requirements:['ground_slam']}],'pressure-shaft')).toEqual([]);
 });
 it('keeps raised ledges and standing clearance inside its high chamber',()=>{
  const rects=buildStormglassInteriorMasonry(options);
  expect(rects.filter(r=>r.name.startsWith('MasonryRoof')).map(r=>[r.x,r.width,r.height])).toEqual([[0,256,448],[256,576,256],[832,960,416]]);
  for(const p of platforms)for(const r of rects)expect(p.x<r.x+r.width&&p.x+p.width>r.x&&p.y-80<r.y+r.height&&p.y+p.height>r.y).toBe(false);
 });
 it('leaves the original downward floor opening and exit portals clear',()=>{
  const rects=buildStormglassInteriorMasonry(options);
  expect(rects.filter(r=>r.name.startsWith('MasonryPier')).map(r=>704-r.y-r.height)).toEqual([192,224]);
  for(const r of rects)expect(1344<r.x+r.width&&1408>r.x&&704<r.y+r.height).toBe(false);
  expect(options.pits).toEqual([{x:1344,width:64}]);
 });
});
