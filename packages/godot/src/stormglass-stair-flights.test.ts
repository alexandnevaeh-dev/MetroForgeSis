import {describe,it,expect} from 'vitest';
import {buildStormglassGalleryStairPlatforms,buildStormglassStairFlights} from './stormglass-gallery-blueprint.js';
describe('Stormglass architectural stair route',()=>{
 it('meets the vault entrance on the right with a mirrored ascending route',()=>{
  const flights=buildStormglassStairFlights(1536,true);
  const platforms=buildStormglassGalleryStairPlatforms(1536,true);
  expect(flights[0]!.from).toEqual({x:880,y:1472});
  expect(flights[0]!.to.x).toBeLessThan(flights[0]!.from.x);
  expect(platforms[0]).toMatchObject({x:880,y:1472,width:48});
  expect(platforms[7]).toMatchObject({x:96,y:128,width:416});
  for(let i=0;i<6;i++)expect(flights[i]!.to).toEqual(flights[i+1]!.from);
 });
 it('keeps the shrine and entry landings at their real portal elevations',()=>{
  const landings=buildStormglassGalleryStairPlatforms(1536);
  expect(landings[4]).toMatchObject({x:96,y:704});
  expect(landings[7]).toMatchObject({x:512,y:128,width:416});
 });
 it('connects every flight end to the next flight start',()=>{
  const flights=buildStormglassStairFlights(1536);
  expect(flights).toHaveLength(7);
  for(let i=0;i<flights.length-1;i++)expect(flights[i]!.to).toEqual(flights[i+1]!.from);
  expect(flights.every(f=>Math.abs(f.to.y-f.from.y)===192&&Math.abs(f.to.x-f.from.x)===720)).toBe(true);
 });
});
