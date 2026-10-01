import {describe,it,expect} from 'vitest';
import {canopyIcon,canopyPickup} from './topdown-canopy-art.js';
import {decodePngRgba} from './png.js';
import {createHash} from 'node:crypto';

describe('canopy world interactables',()=>{
  it('paints a ground-contact pixel on the actual bottom row at both runtime sizes',()=>{
    for(const height of [32,48])for(const kind of ['chest','chest_open','gate','portal','disc','seed']){
      const image=decodePngRgba(canopyIcon(kind,height));
      expect(image.width).toBe(32);expect(image.height).toBe(height);
      expect(Array.from({length:32},(_,x)=>image.rgba[((height-1)*32+x)*4+3]).some(alpha=>alpha===255)).toBe(true);
      if(height===48)expect(image.rgba.slice(0,16*32*4).every(byte=>byte===0)).toBe(true);
    }
    for(const kind of ['health','scrap']){
      const image=decodePngRgba(canopyPickup(kind));
      expect(image.rgba[(31*32+16)*4+3]).toBe(255);
    }
  });
  it('keeps chest state, portal, shrine, gate and field-tool silhouettes distinct',()=>{
    const hashes=['chest','chest_open','gate','portal','disc','seed'].map(kind=>createHash('sha256').update(canopyIcon(kind)).digest('hex'));
    expect(new Set(hashes).size).toBe(6);
  });
});
