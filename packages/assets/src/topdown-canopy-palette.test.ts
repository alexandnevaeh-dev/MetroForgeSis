import {describe,it,expect} from 'vitest';
import {buildCanopyActorFamily} from './topdown-canopy-art.js';
import {decodePngRgba} from './png.js';
describe('canopy coral hero identity',()=>{
 it('retains coral coat clusters across every generic and directional state',()=>{
  const family=buildCanopyActorFamily('hero',true);
  expect(family.sheets.size).toBe(63);
  for(const [clip,png] of family.sheets){
   const image=decodePngRgba(png);let coral=0;
   for(let i=0;i<image.rgba.length;i+=4)if(image.rgba[i]===208&&image.rgba[i+1]===100&&image.rgba[i+2]===101&&image.rgba[i+3]===255)coral++;
   expect(coral,clip).toBeGreaterThan(30);
  }
 });
});
