import type {TileCell} from './room-assembler.js';
import type {PlatformRect,PitGap} from './tile-layout.js';

/** Basic-jump stage grammar: a clear entry runway, modest rises and short gaps.
 * Save/finish stages keep the main floor continuous. No upgrade is assumed. */
export function buildPlatformerStageLayout(width:number,height:number,tileSize:number,index:number,archetype:string) {
  const floor=height-tileSize*2;
  const firstRise=Math.ceil(80/tileSize)*tileSize;
  const secondRise=firstRise+Math.ceil(48/tileSize)*tileSize;
  const platforms:PlatformRect[]=archetype==='boss'||archetype==='save'?[]:
    [0,1,2].map(i=>({x:(20+i*10)*tileSize,y:floor-(i===1?secondRise:firstRise),width:6*tileSize,height:tileSize}));
  const pits:PitGap[]=index>0&&archetype==='traversal'?[{x:30*tileSize,width:4*tileSize}]:[];
  const cells:TileCell[]=[];
  for(let x=0;x<width/tileSize;x++){
    cells.push({x,y:0,col:2,row:0});
    for(let y=floor/tileSize;y<height/tileSize;y++)
      if(!pits.some(p=>x*tileSize>=p.x&&x*tileSize<p.x+p.width))cells.push({x,y,col:0,row:0});
  }
  for(let y=1;y<floor/tileSize-8;y++){
    cells.push({x:0,y,col:1,row:0},{x:width/tileSize-1,y,col:1,row:0});
  }
  for(const p of platforms)for(let x=p.x/tileSize;x<(p.x+p.width)/tileSize;x++)cells.push({x,y:p.y/tileSize,col:3,row:0});
  return {platforms,pits,cells};
}
