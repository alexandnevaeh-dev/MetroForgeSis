import {describe,it,expect} from 'vitest';
import {buildPlatformerStageLayout} from './platformer-stage-layout.js';
describe('Platformer stage geometry',()=>{
 it('keeps the entry spawn jump clear and gives the first stage a continuous floor',()=>{
  const stage=buildPlatformerStageLayout(1024,384,16,0,'tutorial');
  expect(stage.platforms.every(p=>p.x>=320)).toBe(true);
  expect(stage.platforms.every(p=>p.y+p.height<=352-64)).toBe(true);
  expect(stage.pits).toEqual([]);
  expect(stage.cells.filter(c=>c.y===22)).toHaveLength(64);
 });
 it('keeps the initial rise reachable for 32px tiles too',()=>{
  const stage=buildPlatformerStageLayout(2048,768,32,0,'tutorial');
  expect(704-stage.platforms[0]!.y).toBe(96);
  expect(stage.platforms[0]!.y-stage.platforms[1]!.y).toBe(64);
 });
 it('renders the same short gap that collision carves',()=>{
  const stage=buildPlatformerStageLayout(1024,384,16,1,'traversal');
  expect(stage.pits).toEqual([{x:480,width:64}]);
  expect(stage.cells.some(c=>c.y>=22&&c.x>=30&&c.x<34)).toBe(false);
 });
 it.each(['save','boss'])('keeps %s free of traversal obstacles',(archetype: string)=>{
  const stage=buildPlatformerStageLayout(1024,384,16,7,archetype);
  expect(stage.platforms).toEqual([]);expect(stage.pits).toEqual([]);
 });
});
