import {describe,it,expect} from 'vitest';
import {buildCastleRegionPlan,supportsCastleRegionPlan} from './castle-region-plan.js';
describe('region compiler plan',()=>{
 it('assembles bounded visual facade modules separately from collision',()=>{
  const plan=buildCastleRegionPlan();
  expect(plan.facadeModules.length).toBeGreaterThan(100);
  expect(plan.facadeModules.length).toBeLessThan(1000);
  for(const module of plan.facadeModules){
   const section=plan.sections.find(section=>section.id===module.sectionId)!;
   expect(module.collision).toBe(false);
   expect(module.width).toBeGreaterThan(0);
   expect(module.width).toBeLessThanOrEqual(256);
   expect(module.height).toBeGreaterThan(0);
   expect(module.height).toBeLessThanOrEqual(256);
   expect(module.x%32).toBe(0);
   expect(module.y%32).toBe(0);
   expect(module.y+module.height).toBeLessThanOrEqual(section.floorY);
   expect(module.x+module.width).toBeLessThanOrEqual(section.x+section.width);
  }
  for(const section of plan.sections){
   const area=plan.facadeModules.filter(module=>module.sectionId===section.id)
    .reduce((total,module)=>total+module.width*module.height,0);
   expect(area).toBe(section.width*(section.floorY-section.ceilingY-32));
  }
 });
 it('publishes furnishings in supported side chambers while keeping encounter halls clear',()=>{
  const plan=buildCastleRegionPlan();
  expect(plan.furnishings).toHaveLength(20);
  expect(new Set(plan.furnishings.map(item=>item.id)).size).toBe(20);
  for(const item of plan.furnishings){
   const section=plan.sections.find(section=>section.id===item.sectionId)!;
   expect(item.floorY).toBe(section.floorY);
   expect(item.x).toBeGreaterThan(section.x+160);
   expect(item.x).toBeLessThan(section.x+section.width-160);
   expect(section.rewardIntent).not.toBeNull();
  }
  expect(plan.furnishings.filter(item=>item.mounting==='rear-wall')).toHaveLength(7);
 });
 it('opens a central return well through every upper floor and ceiling while retaining both landing supports',()=>{
  const plan=buildCastleRegionPlan(), {shaftX,shaftWidth}=plan.returnRoute;
  expect(shaftWidth).toBe(128);
  expect(plan.platforms.some(p=>p.x<shaftX&&p.x+p.width>shaftX)).toBe(false);
  for(const floorY of plan.floors.slice(1)){
   expect(plan.platforms.some(p=>p.y===floorY&&p.x+p.width===shaftX-shaftWidth/2)).toBe(true);
   expect(plan.platforms.some(p=>p.y===floorY&&p.x===shaftX+shaftWidth/2)).toBe(true);
  }
 });
 it('keeps the validated landing support and threshold clearance',()=>{
  const plan=buildCastleRegionPlan();
  for(const route of plan.routes.slice(1)){
   const launch=route.ascent[0]!.launchX;
   expect(plan.platforms.some(p=>p.y===plan.floors[route.from]&&p.x<=launch-12&&p.x+p.width>=launch+12)).toBe(true);
  }
  for(const wall of plan.partitions){
   const chamber=plan.sections.find(s=>s.ceilingY===wall.y&&(s.x===wall.x||s.x+s.width-32===wall.x))!;
   expect(chamber.floorY-(wall.y+wall.height)).toBe(192);
  }
 });
 it('keeps old wings out of the region opt-in and rejects invalid cameras',()=>{
  expect(supportsCastleRegionPlan(4096,1536,32)).toBe(false);
  expect(supportsCastleRegionPlan(16384,6144,16)).toBe(false);
  expect(supportsCastleRegionPlan(16384,6144,32)).toBe(true);
  expect(()=>buildCastleRegionPlan({zoom:0})).toThrow();
 });
});

import {GameDNASchema} from '@metroforge/schemas';
import {buildRoomAssemblyOptions,type RoomAssemblyContext} from './room-assembler.js';
const dna=GameDNASchema.parse({version:'0.1.0',archetype:'SIDE_VIEW_METROIDVANIA',identity:{title:'Stormglass Reliquary',genre:'Metroidvania',tone:'dark',visualStyle:'pixel'},technical:{resolution:{width:1920,height:1080},tileSize:32,targetPlaytimeHours:4,difficulty:'normal'},combat:{style:'melee',meleeEnabled:true,rangedEnabled:false},movement:{walkSpeed:200,runSpeed:350,jumpHeight:120,gravity:980},abilities:[],world:{biomeCount:2,roomCount:20},narrative:{premise:'Test',protagonist:'Hero',centralConflict:'Conflict'},seed:42,profile:'MEDIUM'});
const context: RoomAssemblyContext={roomIds:['room_001'],roomConnections:new Map(),worldGraphNodesById:new Map(),npcsByRoom:new Map(),bossesByRoom:new Map()};
it('compiles region geometry from generation dimensions and keeps ordinary requests unchanged',()=>{
 const requested={...context,worldGraphNodesById:new Map([['room_001',{id:'room_001',type:'room' as const,label:'Region',position:{x:0,y:0},metadata:{archetype:'combat',targetTileWidth:512,targetTileHeight:192}}]])};
 const opts=buildRoomAssemblyOptions('room_001',1,requested,dna,undefined,{value:0},()=>true);
 expect(opts.castleRegionPlan?.sections).toHaveLength(15);
 expect(opts.platforms).toEqual([...buildCastleRegionPlan().platforms,...buildCastleRegionPlan().partitions]);
 expect(opts.pits).toEqual([]);
 const ordinary=buildRoomAssemblyOptions('room_001',1,context,dna,undefined,{value:0},()=>true);
 expect(ordinary.castleRegionPlan).toBeUndefined();
 expect(ordinary.width).toBeLessThan(16384);
});
