// Room grammar for one connected woodland. Materials use the engine's existing
// grass/path/water/wall values; optional floor roles select art without changing collision.
export const CANOPY_MAP_POSITIONS = [[0,0],[1,0],[2,0],[3,0],[2,1],[2,2],[3,2],[4,2],[4,0],[5,0],[0,1],[-1,1],[-2,1],[2,3],[3,3],[4,3]];

export { createCanopyLayout } from '../../packages/procedural/dist/topdown/canopy-layout.js';

export function assignCanopyPassages(areas,links) {
  const sides=areas.map(()=>({}));
  for(const [a,b,itemId,optional] of links)for(const [from,to] of [[a,b],[b,a]]) {
    const [ax,ay]=CANOPY_MAP_POSITIONS[from],[bx,by]=CANOPY_MAP_POSITIONS[to];
    const side=Math.abs(bx-ax)>Math.abs(by-ay)?(bx>ax?'east':'west'):(by>ay?'south':'north');
    const slot=sides[from][side]??0;sides[from][side]=slot+1;
    if(slot>1)throw new Error('Too many passages on one edge');
    const [x,y]=side==='east'?[27,11+slot*5]:side==='west'?[2,11+slot*5]:[14+slot*7,side==='north'?2:19];
    areas[from].pois.push({id:`${areas[from].id}_to_${areas[to].id}`,kind:itemId?'locked_door':'dungeon_entrance',areaId:areas[from].id,x:x*32,y:y*32,
      metadata:{targetAreaId:areas[to].id,side,...(itemId?{keyId:itemId}:{}),optional:Boolean(optional)}});
  }
  // A real actor-sized landing around every POI; no metadata-only reachability.
  for(const area of areas)for(const poi of area.pois) {
    const x=Math.floor(poi.x/32),y=Math.floor(poi.y/32);
    const radius=1;
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(x+dx>0&&y+dy>0&&x+dx<29&&y+dy<21) {
      if([2,3].includes(area.tiles[y+dy][x+dx])) {area.tiles[y+dy][x+dx]=0;area.floorRoles[y+dy][x+dx]='';}
    }
    if(['dungeon_entrance','locked_door'].includes(poi.kind)) {
      const vx=area.widthTiles*area.tileSize/2-poi.x,vy=area.heightTiles*area.tileSize/2-poi.y,length=Math.hypot(vx,vy);
      // Clear the full actor footprint along the actual reciprocal-entry offset, not just its trigger point.
      for(let step=0;step<=56;step+=4)for(const px of [-12,0,12])for(const py of [-12,0,12]) {
        const sx=Math.floor((poi.x+vx/length*step+px)/area.tileSize),sy=Math.floor((poi.y+vy/length*step+py)/area.tileSize);
        if(sx>0&&sy>0&&sx<29&&sy<21&&[2,3].includes(area.tiles[sy][sx])) {
          area.floorRoles[sy][sx]=area.tiles[sy][sx]===2?'platform':'path';area.tiles[sy][sx]=1;
        }
      }
    }
  }
}
