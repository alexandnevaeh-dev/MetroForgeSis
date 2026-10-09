import {describe,it,expect} from 'vitest';
import {buildStormglassGalleryBlueprint,stormglassGalleryPort,buildStormglassGalleryStairPlatforms,buildStormglassStairFlights} from './stormglass-gallery-blueprint.js';
import {stormglassGalleryDescentPits} from './room-assembler.js';

describe('opt-in Stormglass expanded region',()=>{
 it('retains the tested gallery dimensions by default',()=>{
  const old=buildStormglassGalleryBlueprint();
  expect(old.rooms).toHaveLength(11);
  expect(old.rooms.find(room=>room.id==='room_001')!.width).toBe(4096);
  expect(old.rooms.find(room=>room.id==='room_002')!.height).toBe(1536);
 });
 it('fits real nonoverlapping chambers and both directed ports, with no ambiguous door sides',()=>{
  const plan=buildStormglassGalleryBlueprint('expanded-region');
  const opposite={left:'right',right:'left',up:'down',down:'up'} as const;
  const sides=new Set<string>();
  for(const [i,a] of plan.rooms.entries())for(const b of plan.rooms.slice(i+1))
   expect(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y,`${a.id}/${b.id}`).toBe(false);
  for(const link of plan.links){
   for(const key of [`${link.from}:${link.direction}`,`${link.to}:${opposite[link.direction]}`]) {
    expect(sides.has(key),key).toBe(false);sides.add(key);
   }
   if(!plan.rooms.some(room=>room.id===link.to))continue;
   const a=plan.rooms.find(room=>room.id===link.from)!,b=plan.rooms.find(room=>room.id===link.to)!;
   const forward=stormglassGalleryPort(a.id,b.id,link.direction,'expanded-region')!;
   const reverse=stormglassGalleryPort(b.id,a.id,opposite[link.direction],'expanded-region')!;
   if(['left','right'].includes(link.direction))expect(a.y+forward.floorY).toBe(b.y+reverse.floorY);
   else expect(a.x+forward.x).toBe(b.x+reverse.x);
  }
 });
 it('keeps the shrine reachable without Dash and exposes the upper branch after earning it',()=>{
  const plan=buildStormglassGalleryBlueprint('expanded-region');
  const reachable=(abilities:string[])=>{
   const visited=new Set(['room_000']);
   for(let i=0;i<plan.rooms.length;i++)for(const link of plan.links){
    if(link.requirements.some(ability=>!abilities.includes(ability)))continue;
    if(visited.has(link.from))visited.add(link.to);
    if(visited.has(link.to))visited.add(link.from);
   }
   return visited;
  };
  // The checkpoint return also exposes the upper loop, so the entry gate is
  // a shortcut gate, not a claim that the whole upstairs wing is ability-locked.
  expect(reachable([]).has(plan.abilityRoom)).toBe(true);
  expect(reachable(['dash']).has('room_044')).toBe(true);
  for(const [from,to] of [['room_001','room_043'],['room_043','room_044'],['room_044','room_045'],['room_045','room_006']])
   expect(plan.links.some(link=>link.from===from&&link.to===to)).toBe(true);
 });
 it('builds deep shafts to the same 128px top landing without stretching their flights',()=>{
  for(const mirrored of [false,true]){
   const platforms=buildStormglassGalleryStairPlatforms(3072,mirrored),flights=buildStormglassStairFlights(3072,mirrored);
   expect(platforms).toHaveLength(16);expect(flights).toHaveLength(15);
   expect(platforms.at(-1)!.y).toBe(128);
   for(let i=0;i<flights.length-1;i++)expect(flights[i]!.to).toEqual(flights[i+1]!.from);
   expect(flights.every(f=>Math.abs(f.from.y-f.to.y)===192&&Math.abs(f.from.x-f.to.x)===720)).toBe(true);
  }
  expect(()=>buildStormglassStairFlights(3000)).toThrow(/384px/);
 });
 it('opens the upper descent floor at the shared gallery footprint',()=>{
  const pits=stormglassGalleryDescentPits(1024,32,[{direction:'down',targetRoomId:'room_001',requirements:[]}],'stairwell','room_043','expanded-region');
  expect(pits).toEqual([{x:448,width:128}]);
 });
 it('leaves a continuous return well through every flight without changing pitch',()=>{
  const flights=buildStormglassStairFlights(3072,false,true);
  expect(flights).toHaveLength(30);
  for(const flight of flights){
   expect(Math.max(flight.from.x,flight.to.x)<=448||Math.min(flight.from.x,flight.to.x)>=576).toBe(true);
   expect(Math.abs((flight.to.y-flight.from.y)/(flight.to.x-flight.from.x))).toBeCloseTo(192/720,8);
  }
 });
});
