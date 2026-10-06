import {describe,it,expect} from 'vitest';
import {WorldGraphSchema,ProgressionGraphSchema} from '@metroforge/schemas';
import {generatePlatformerWorld} from './platformer-world.js';
import {validateWorldReachability,validateReachability} from './world.js';
import {getGenreDefinition,resolveGameArchetype,inferGameArchetypeFromPrompt} from '@metroforge/shared';

describe('Platformer stage contract',()=>{
 it('has a separate open-progression genre and preserves Metroidvania identity',()=>{
  expect(resolveGameArchetype('SIDE_VIEW_PLATFORMER')).toBe('SIDE_VIEW_PLATFORMER');
  expect(inferGameArchetypeFromPrompt('a pixel art plateformer')).toBe('SIDE_VIEW_PLATFORMER');
  expect(inferGameArchetypeFromPrompt('a Metroidvania platformer')).toBe('SIDE_VIEW_METROIDVANIA');
  const genre=getGenreDefinition('SIDE_VIEW_PLATFORMER');
  expect(genre.defaultProgression).toBe('OPEN');
  expect(genre.capabilities.supportsLockedAbilityGates).toBe(false);
  expect(getGenreDefinition('SIDE_VIEW_METROIDVANIA').defaultProgression).toBe('ABILITY_GATED');
 });
 it.each([2,5,16,40])('builds %i ordered stages reachable without upgrades',count=>{
  const result=generatePlatformerWorld({seed:42,roomCount:count,biomeCount:2,abilities:['dash'],bossCount:4,profile:'TINY_TEST'});
  expect(WorldGraphSchema.safeParse(result.worldGraph).success).toBe(true);
  expect(ProgressionGraphSchema.safeParse(result.progressionGraph).success).toBe(true);
  expect(result.worldGraph.edges).toHaveLength(count-1);
  expect(result.worldGraph.edges.every(e=>e.requirements.length===0&&!e.optional&&e.transition==='right')).toBe(true);
  expect(result.progressionGraph.abilities).toEqual([]);
  expect(validateWorldReachability(result.worldGraph,new Set()).reachable).toBe(true);
  expect(validateReachability(result.progressionGraph,new Set()).reachable).toBe(true);
 });
 it('rejects missing or fractional stage counts',()=>{
  for(const roomCount of [1,2.5,NaN])expect(()=>generatePlatformerWorld({seed:42,roomCount,biomeCount:1,abilities:[],bossCount:1})).toThrow();
 });
});
