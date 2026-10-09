import {describe,it,expect} from 'vitest';
import {buildStormglassGalleryBlueprint,stormglassGalleryPort} from './stormglass-gallery-blueprint.js';
import {stormglassGalleryDescentPits} from './room-assembler.js';
import {buildStormglassArchiveChamber} from './stormglass-archive-chamber.js';
const opposite={left:'right',right:'left',up:'down',down:'up'};
describe('Archive wing physical design contracts',()=>{
 it('keeps the frozen expanded-region bounds and adds upper/lower chambers only to the fresh profile',()=>{
  const frozen=buildStormglassGalleryBlueprint('expanded-region'),fresh=buildStormglassGalleryBlueprint('archive-wing');
  expect(frozen.rooms.find(r=>r.id==='room_044')!.height).toBe(768);
  expect(frozen.rooms.some(r=>r.id==='room_046')).toBe(false);
  expect(fresh.rooms.find(r=>r.id==='room_044')!.height).toBe(1536);
  for(const room of frozen.rooms.filter(r=>r.id!=='room_044'))expect(fresh.rooms.find(r=>r.id===room.id)).toEqual(room);
 });
 it('uses unique supported physical door directions and reciprocal world elevations',()=>{
  const plan=buildStormglassGalleryBlueprint('archive-wing'),doors=new Set<string>();
  for(const link of plan.links){
   for(const key of [link.from+':'+link.direction,link.to+':'+opposite[link.direction]]){expect(doors.has(key),key).toBe(false);doors.add(key);}
   const a=plan.rooms.find(r=>r.id===link.from),b=plan.rooms.find(r=>r.id===link.to);if(!a||!b)continue;
   const forward=stormglassGalleryPort(a.id,b.id,link.direction,'archive-wing')!,reverse=stormglassGalleryPort(b.id,a.id,opposite[link.direction],'archive-wing')!;
   if(['left','right'].includes(link.direction))expect(a.y+forward.floorY).toBe(b.y+reverse.floorY);
   else expect(a.x+forward.x).toBe(b.x+reverse.x);
  }
 });
 it('retains the earned-Dash loop and keeps both new chamber returns free of ability requirements',()=>{
  const plan=buildStormglassGalleryBlueprint('archive-wing');
  for(const id of ['room_046','room_047']){const exits=plan.links.filter(l=>l.from===id||l.to===id);expect(exits).toHaveLength(1);expect(exits[0].requirements).toEqual([]);expect(exits[0].optional).toBe(true);}
  expect(plan.links.find(l=>l.from==='room_001'&&l.to==='room_043')!.requirements).toEqual(['dash']);
  expect(plan.links.some(l=>l.from==='room_045'&&l.to==='room_006')).toBe(true);
 });
 it('keeps the lower reading lane clear and supports both mezzanine and loft approaches',()=>{
  const p=buildStormglassArchiveChamber('room_044')!;
  expect(p.lowerClearance).toBeGreaterThan(48*1.5);
  expect(p.platforms.some(r=>r.y===704&&r.x<=144&&r.x+r.width>=512)).toBe(true);
  expect(p.platforms.some(r=>r.y===128&&r.x<=2804&&r.x+r.width>=2804+24)).toBe(true);
  for(const r of p.platforms)expect(r.x>=3392||r.x+r.width<=3264).toBe(true);
 });
 it('places a measured east return stair on the vault side of the well and joins its exit floor',()=>{
  const p=buildStormglassArchiveChamber('room_044')!,east=p.flights.filter(f=>Math.min(f.from.x,f.to.x)>=3520);
  expect(east).toHaveLength(4);expect(east[0].from.y).toBe(1472);expect(east.at(-1)!.to.y).toBe(704);
  for(const f of east)expect(Math.abs((f.to.y-f.from.y)/(f.to.x-f.from.x))).toBe(192/720);
  expect(p.platforms.some(r=>r.y===704&&r.x<=3520&&r.x+r.width>3520)).toBe(true);
 });
 it('retains the west downward opening only for its exact earned-Dash return and keeps the gate requirement',()=>{
  const connections=[{direction:'down' as const,targetRoomId:'room_001',requirements:['dash']}];
  expect(stormglassGalleryDescentPits(1024,32,connections,'stairwell','room_043','archive-wing')).toEqual([{x:448,width:128}]);
  expect(connections[0].requirements).toEqual(['dash']);
  expect(stormglassGalleryDescentPits(1024,32,[{...connections[0],requirements:['ground_slam']}],'stairwell','room_043','archive-wing')).toEqual([]);
 });
 it('supports an ordinary takeoff directly below the lower vault return sensor with a separate descent lip',()=>{
  const p=buildStormglassArchiveChamber('room_047')!,port=stormglassGalleryPort('room_047','room_044','up','archive-wing')!;
  const x=port.x+12,landing=p.platforms.find(r=>r.y===128&&r.x<=x-12&&r.x+r.width>=x+12);
  expect(landing).toBeDefined();expect(landing!.width).toBeLessThan(512);
  expect(p.platforms.some(r=>r.y===128&&r.x+r.width>landing!.x+landing!.width)).toBe(false);
  expect(p.returnWell!.left).toBeGreaterThan(landing!.x);expect(p.returnWell!.right).toBeLessThan(landing!.x+landing!.width);
 });
 it('leaves continuous downward service clearance through both side chambers',()=>{
  for(const id of ['room_046','room_047']){const p=buildStormglassArchiveChamber(id)!;
   for(const r of p.platforms.filter(r=>r.y>128||id==='room_046'))expect(r.x>=864||r.x+r.width<=672,id).toBe(true);
   for(const f of p.flights)expect(Math.max(f.from.x,f.to.x)<=672||Math.min(f.from.x,f.to.x)>=864,id).toBe(true);
   expect(p.flights.every(f=>Math.abs((f.to.y-f.from.y)/(f.to.x-f.from.x))<=192/720)).toBe(true);
  }
 });
});
