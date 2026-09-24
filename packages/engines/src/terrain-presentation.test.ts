import { describe, it, expect } from 'vitest';
import { parseTerrainPresentation } from './terrain-presentation.js';
describe('terrain editor settings', () => {
  const image = { width: 1024, height: 512 };
  it('preserves authored crop and tint with compatible defaults', () => {
    expect(parseTerrainPresentation({x:150,y:192,width:750,height:125,pixelsPerUnit:6.75,borderTop:20,tintR:.52}, image))
      .toMatchObject({x:150,y:192,width:750,height:125,pixelsPerUnit:6.75,borderTop:20,tintR:.52,tintG:1,tintB:1,smoothFiltering:true});
  });
  it.each([{x:1000},{height:513},{pixelsPerUnit:0},{borderTop:32},{tintB:1.1},{smoothFiltering:'yes'},{width:NaN},{unsupported:1}])('rejects invalid edits %j', patch => {
    expect(()=>parseTerrainPresentation({width:32,height:32,...patch},image)).toThrow();
  });
});
