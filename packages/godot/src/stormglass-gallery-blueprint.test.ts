import {describe,it,expect} from 'vitest';
import {buildStormglassGalleryBlueprint} from './stormglass-gallery-blueprint.js';
describe('Stormglass reference-driven gallery topology',()=>{
 it('uses long halls, compact chambers and narrow shafts rather than repeated storeys',()=>{
  const p=buildStormglassGalleryBlueprint();
  expect(p.rooms.find(r=>r.id==='room_001')!.width).toBeGreaterThan(4*p.rooms.find(r=>r.id==='room_001')!.height);
  expect(p.rooms.filter(r=>r.theme==='stairwell').every(r=>r.height>r.width)).toBe(true);
  expect(new Set(p.rooms.map(r=>`${r.width}:${r.height}`)).size).toBeGreaterThan(3);
 });
 it('makes the ability shrine reachable before any ability gate',()=>{
  const p=buildStormglassGalleryBlueprint(),visited=new Set(['room_000']);
  for(let i=0;i<p.rooms.length;i++)for(const l of p.links){
   if(l.requirements.length)continue;
   if(visited.has(l.from))visited.add(l.to);
   if(visited.has(l.to))visited.add(l.from);
  }
  expect(visited.has(p.abilityRoom)).toBe(true);
  expect(visited.has(p.checkpointRoom)).toBe(true);
 });
 it('closes an actual lower exploration loop beside the checkpoint',()=>{
  const p=buildStormglassGalleryBlueprint();
  const loop=['room_001','room_002','room_004','room_005','room_006','room_001'];
  for(let i=1;i<loop.length;i++)expect(p.links.some(l=>(l.from===loop[i-1]&&l.to===loop[i])||(l.to===loop[i-1]&&l.from===loop[i]))).toBe(true);
  expect(p.links.filter(l=>l.to==='room_007')).toHaveLength(1);
 });
 it('keeps direction-based doors unambiguous in every room',()=>{
  const p=buildStormglassGalleryBlueprint(),doors=new Set<string>();
  const opposite={left:'right',right:'left',up:'down',down:'up'};
  for(const l of p.links)for(const key of [`${l.from}:${l.direction}`,`${l.to}:${opposite[l.direction]}`]){
   expect(doors.has(key)).toBe(false);doors.add(key);
  }
 });
});
