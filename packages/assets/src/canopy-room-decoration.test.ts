import {describe,it,expect} from 'vitest';
import {generateTopDownWorld,isWalkableTile} from '@metroforge/procedural';
import {decorateCanopyWorld} from './canopy-room-decoration.js';
import {canopyEnvironment} from './topdown-canopy-environment.js';

describe('canopy room composition',()=>{
  const world=()=>generateTopDownWorld({seed:20260930,profile:'TINY_TEST',tileSize:32,layoutStyle:'ruined_canopy'});
  it('uses distinct woodland rooms and aligned material roles instead of castle rooms',()=>{
    const result=world();
    expect(new Set(result.overworld.areas.map(area=>JSON.stringify(area.tiles))).size).toBe(result.overworld.areas.length);
    for(const area of result.overworld.areas){
      expect(area.name).not.toMatch(/castle|chapel|crypt/i);
      expect(area.floorRoles?.length).toBe(area.heightTiles);
      for(let y=0;y<area.heightTiles;y++)for(let x=0;x<area.widthTiles;x++)if(area.floorRoles?.[y]?.[x])expect(area.tiles[y]?.[x]).toBe(1);
    }
    expect(result.worldGraph.regions[0]?.name).toBe('Verdant Ruins');
    expect(result.worldGraph.nodes.filter(node=>node.type==='room').map(node=>node.metadata.environmentArchetype)).toEqual(['forest','sewer','chapel','garden']);
  });
  it('keeps every progression and interaction POI physically reachable',()=>{
    for(const area of world().overworld.areas){
      const start=area.pois.find(poi=>poi.kind==='spawn')!;
      const keys=new Set<string>(),queue:[[number,number]]=[[Math.floor(start.x/32),Math.floor(start.y/32)]];
      for(let i=0;i<queue.length;i++){
        const [x,y]=queue[i]!;const key=`${x},${y}`;
        if(keys.has(key)||!isWalkableTile(area.tiles[y]?.[x]??3))continue;
        keys.add(key);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])queue.push([x+dx!,y+dy!]);
      }
      for(const poi of area.pois)expect(keys.has(`${Math.floor(poi.x/32)},${Math.floor(poi.y/32)}`),poi.id).toBe(true);
    }
  });
  it('places grounded source images and footprints away from interaction landings',()=>{
    const result=world();expect(decorateCanopyWorld(result.overworld)).toBeGreaterThan(20);
    for(const area of result.overworld.areas)for(const prop of area.propPlacements!){
      const kind=prop.image.split('/').pop()!.replace('.png','');const art=canopyEnvironment(kind);
      expect(prop.layout.anchorPx).toEqual(art.anchor);expect(prop.layout.sourceSize).toEqual([art.width,art.height]);
      expect(prop.layout.occlusionFade).toBe(true);
      for(const poi of area.pois)expect(Math.hypot(poi.x-prop.x,poi.y-prop.y)).toBeGreaterThanOrEqual(96);
      if(prop.id.endsWith('_landmark'))expect(prop.y-prop.layout.anchorPx[1]).toBeGreaterThanOrEqual(0);
    }
  });
  it('does not add forest props to unrelated room plans',()=>{
    const other=generateTopDownWorld({seed:42,profile:'TINY_TEST',tileSize:32});const before=JSON.stringify(other);
    expect(decorateCanopyWorld(other.overworld)).toBe(0);expect(JSON.stringify(other)).toBe(before);
  });
  it('repeats the same room and prop plan deterministically for the same seed',()=>{
    const a=world(),b=world();decorateCanopyWorld(a.overworld);decorateCanopyWorld(b.overworld);
    expect(a).toEqual(b);
  });
});
