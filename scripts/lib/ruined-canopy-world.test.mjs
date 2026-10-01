import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuinedCanopy } from './ruined-canopy-world.mjs';
const world = buildRuinedCanopy();
const reach = (items = []) => {
  const seen = new Set(['overworld']);
  for (let changed = true; changed;) { changed = false;
    for (const edge of world.worldGraph.edges) if (edge.requirements.every(item => items.includes(item)))
      for (const [a, b] of [[edge.from, edge.to], [edge.to, edge.from]]) if (seen.has(a) && !seen.has(b)) { seen.add(b); changed = true; }
  } return seen;
};
test('sixteen distinct rooms, one original biome, no unreachable mandatory ability', () => {
  assert.equal(new Set(world.roomIds).size, 16);
  assert.equal(new Set(world.overworld.areas.map(area => area.name)).size, 16);
  assert(reach().has('dungeon_000_r1'));
  assert(!reach().has(world.overworld.victoryAreaId));
  assert.equal(reach(['wind_disc']).size, 15);
  assert.equal(reach(['wind_disc','rootward']).size, 16);
  assert(reach(['wind_disc']).has('canopy_cistern'));
  assert(!reach(['wind_disc']).has('canopy_moonwell'));
});
test('runtime portals enforce the same item requirements as the graph', () => {
  for (const edge of world.worldGraph.edges) for (const [a, b] of [[edge.from, edge.to], [edge.to, edge.from]]) {
    const poi = world.overworld.areas.find(area => area.id === a).pois.find(poi => poi.metadata.targetAreaId === b);
    assert(poi);
    assert.equal(poi.kind, edge.requirements.length ? 'locked_door' : 'dungeon_entrance');
    assert.equal(poi.metadata.keyId, edge.requirements[0]);
  }
});

test('reciprocal entry landings fit the real 20px actor after its 56px inward spawn',()=>{
  for(const area of world.overworld.areas)for(const poi of area.pois.filter(poi=>poi.metadata.side)){
    const vx=area.widthTiles*area.tileSize/2-poi.x,vy=area.heightTiles*area.tileSize/2-poi.y,length=Math.hypot(vx,vy);
    const dx=vx/length*56,dy=vy/length*56;
    for(const x of [poi.x+dx-10,poi.x+dx+10])for(const y of [poi.y+dy-10,poi.y+dy+10]){
      assert([0,1].includes(area.tiles[Math.floor(y/32)]?.[Math.floor(x/32)]),`${poi.id}: blocked reciprocal actor landing`);
    }
  }
});
test('every POI has an orthogonal route and agrees with the collision grid', () => {
  for (const area of world.overworld.areas) {
    const spawn = area.pois.find(poi => poi.kind === 'spawn');
    const start = [Math.floor(spawn.x / area.tileSize), Math.floor(spawn.y / area.tileSize)];
    const queue = [start], seen = new Set([start.join(',')]);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
        if ((area.tiles[ny]?.[nx] === 0 || area.tiles[ny]?.[nx] === 1) && !seen.has(`${nx},${ny}`)) {
          seen.add(`${nx},${ny}`); queue.push([nx, ny]);
        }
      }
    }
    for (const poi of area.pois) assert(seen.has(`${Math.floor(poi.x/32)},${Math.floor(poi.y/32)}`), `${area.name}: ${poi.id}`);
    for (const rect of area.collisionRects) assert([2, 3].includes(area.tiles[rect.y/32][rect.x/32]));
  }
});
test('pre-boss save, optional secret and return shortcut are real physical destinations', () => {
  assert(world.overworld.areas.find(area => area.id === 'canopy_approach').pois.some(poi => poi.kind === 'save'));
  assert(world.worldGraph.edges.some(edge => edge.optional && edge.to === 'canopy_secret'));
  assert(world.worldGraph.edges.some(edge => edge.optional && edge.from === 'canopy_bridge' && edge.to === 'canopy_clearing'));
});

test('rooms have sixteen different material layouts and intentional compositions',()=>{
  assert.equal(new Set(world.overworld.areas.map(area=>JSON.stringify(area.tiles))).size,16);
  for(const area of world.overworld.areas) {
    assert.equal(area.compositionVersion,2);
    assert(area.composition.length>40);
    assert.equal(area.floorRoles.length,area.heightTiles);
    assert(area.floorRoles.every(row=>row.length===area.widthTiles));
  }
  assert(world.overworld.areas.find(area=>area.id==='canopy_bridge').floorRoles.some(row=>row.includes('platform')));
});

test('reciprocal passages follow the map and never share a trigger position',()=>{
  const opposite={north:'south',south:'north',east:'west',west:'east'};
  for(const area of world.overworld.areas) {
    const doors=area.pois.filter(poi=>poi.metadata.targetAreaId);
    assert.equal(new Set(doors.map(poi=>`${poi.x},${poi.y}`)).size,doors.length);
    for(const door of doors) {
      const destination=world.overworld.areas.find(area=>area.id===door.metadata.targetAreaId);
      const back=destination.pois.find(poi=>poi.metadata.targetAreaId===area.id);
      assert.equal(back.metadata.side,opposite[door.metadata.side]);
      const a=world.worldGraph.nodes.find(node=>node.id===area.id).metadata.mapPosition;
      const b=world.worldGraph.nodes.find(node=>node.id===destination.id).metadata.mapPosition;
      if(door.metadata.side==='east')assert(b[0]>a[0]);
      if(door.metadata.side==='west')assert(b[0]<a[0]);
      if(door.metadata.side==='south')assert(b[1]>a[1]);
      if(door.metadata.side==='north')assert(b[1]<a[1]);
    }
  }
});
