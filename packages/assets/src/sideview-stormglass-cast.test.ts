import { describe,expect,it } from 'vitest';
import { decodePngRgba } from './png.js';
import { generateStormglassEnemySheet,generateStormglassProp,stormglassEnemyFrameCount,type StormglassEnemyAction } from './sideview-stormglass-cast.js';
describe('Stormglass cast and props',()=>{
  const actions:StormglassEnemyAction[]=['idle','walk','attack','hurt','death'];
  it.each(actions)('%s enemy strip matches its contract',(action)=>{const im=decodePngRgba(generateStormglassEnemySheet(action));expect(im.height).toBe(64);expect(im.width).toBe(64*stormglassEnemyFrameCount(action));});
  it('authors five distinct enemy-family silhouettes instead of palette-swapped boxes',()=>{
    const signatures=[] as string[];
    for(const variant of [0,4,8,12,16]){
      const im=decodePngRgba(generateStormglassEnemySheet('idle',variant));
      const occupiedByRow:number[]=[];
      for(let y=0;y<64;y++){
        let occupied=0;
        for(let x=0;x<64;x++) if(im.rgba[(y*im.width+x)*4+3]!>0) occupied++;
        occupiedByRow.push(occupied);
      }
      signatures.push(occupiedByRow.join(','));
      expect(occupiedByRow.filter((value)=>value>0).length).toBeGreaterThan(18);
    }
    expect(new Set(signatures).size).toBe(5);
  });
  it('creates twelve visible transparent props',()=>{for(let i=0;i<12;i++){const im=decodePngRgba(generateStormglassProp(i));expect(im.rgba.some((v,n)=>n%4===3&&v>0)).toBe(true);expect(im.rgba.some((v,n)=>n%4===3&&v===0)).toBe(true);}});
});
