import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {buildCanopyActorFamily} from './topdown-canopy-art.js';
import {decodePngRgba} from './png.js';

describe('crisp canopy casting',()=>{
  it('exports twelve distinct grounded poses for all eight facings at 24fps',()=>{
    const family=buildCanopyActorFamily('hero',true);
    expect(family.metadata.cast).toEqual({frameCount:12,fps:24,loop:false});
    for(const facing of ['N','NE','E','SE','S','SW','W','NW']){
      const image=decodePngRgba(family.sheets.get('cast_'+facing)!);
      expect([image.width,image.height]).toEqual([768,64]);
      const hashes=new Set<string>();
      for(let frame=0;frame<12;frame++){
        const pixels=Buffer.alloc(64*64*4);
        for(let row=0;row<64;row++)pixels.set(image.rgba.subarray((row*768+frame*64)*4,(row*768+frame*64+64)*4),row*64*4);
        hashes.add(createHash('sha256').update(pixels).digest('hex'));
        const groundAlpha=Array.from({length:64},(_,x)=>pixels[(60*64+x)*4+3]);
        expect(groundAlpha.some(alpha=>alpha>0)).toBe(true);
      }
      expect(hashes.size).toBe(12);
    }
  });
  it('keeps the enemy and boss six-state animation contracts intact',()=>{
    for(const kind of ['melee','ranged','boss'] as const){
      const family=buildCanopyActorFamily(kind);
      expect(Object.keys(family.metadata)).toEqual(['idle','walk','run','attack','hurt','death']);
      expect(family.metadata.run.fps).toBe(24);
      expect(family.metadata.attack.loop).toBe(false);
      expect(family.metadata.death.loop).toBe(false);
    }
  });
});
