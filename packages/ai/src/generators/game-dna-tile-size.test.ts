import {describe,it,expect} from 'vitest';
import {createDeterministicGameDNA,generateGameDNA} from './game-dna.js';
const input={profile:'TINY_TEST' as const,seed:42,archetype:'TOP_DOWN_ACTION_ADVENTURE' as const};
describe('explicit terrain grid requirements',()=>{
 it('honors supported tile/grid phrases in deterministic designs',()=>{
  for(const prompt of ['woodland pixel art on a 32px terrain grid','32 pixel tiles','tile size: 32','32x32 tiles'])expect(createDeterministicGameDNA({...input,prompt}).technical.tileSize).toBe(32);
  expect(createDeterministicGameDNA({...input,prompt:'16px tiles'}).technical.tileSize).toBe(16);
 });
 it('retains defaults for sprite dimensions, screen resolution, negation and ambiguity',()=>{
  for(const prompt of ['32px sprites on a forest path','1280x720 screen','not 32px tiles','16px tiles or 32px tiles'])expect(createDeterministicGameDNA({...input,prompt}).technical.tileSize).toBe(16);
  expect(createDeterministicGameDNA({...input,profile:'VISUAL_VERTICAL_SLICE',prompt:'forest'}).technical.tileSize).toBe(32);
 });
 it('keeps an explicit user grid when a text provider returns its legacy default',async()=>{
  const old=createDeterministicGameDNA({...input,prompt:'forest'});
  const result=await generateGameDNA({...input,prompt:'forest pixel art on a 32px terrain grid'},{health:'healthy',generateText:async()=>({text:JSON.stringify(old)})});
  expect(result.source).toBe('ai');expect(result.dna.technical.tileSize).toBe(32);
 });
});
