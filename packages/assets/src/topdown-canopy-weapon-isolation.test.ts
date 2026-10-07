import {describe,it,expect} from 'vitest';
import {canopyActor,CANOPY_ACTION_FRAMES,type CanopyAction,type CanopyFacing} from './topdown-canopy-art.js';
import {decodePngRgba} from './png.js';
describe('top-down canopy weapon cell isolation',()=>{
 for(const kind of ['hero','melee'] as const)it(`${kind} retains transparent horizontal gutters throughout six states and eight facings`,()=>{
  for(const action of ['idle','walk','run','attack','hurt','death'] as CanopyAction[])for(const facing of ['N','NE','E','SE','S','SW','W','NW'] as CanopyFacing[]){
   const count=CANOPY_ACTION_FRAMES[action];const image=decodePngRgba(canopyActor(kind,action,facing,count));
   expect([image.width,image.height]).toEqual([count*64,64]);
   for(let frame=0;frame<count;frame++){
    let left=64,right=-1;
    for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(image.rgba[(y*image.width+frame*64+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);}
    expect(left,`${action}/${facing}/${frame} left margin`).toBeGreaterThanOrEqual(4);
    expect(63-right,`${action}/${facing}/${frame} right margin`).toBeGreaterThanOrEqual(4);
    expect(right).toBeGreaterThan(left);
   }
  }
 });
});
