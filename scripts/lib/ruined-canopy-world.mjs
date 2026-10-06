// Original ten-area action-adventure slice. Runtime POIs and graph share one edge list.
import { createCanopyLayout, assignCanopyPassages, CANOPY_MAP_POSITIONS } from './ruined-canopy-layout.mjs';
export const CANOPY_ROOMS = [
  ['overworld', 'Rootbound Entrance', 'tutorial', 'root_arch'],
  ['dungeon_000_r0', 'Fallen Idol Crossing', 'combat', 'idol'],
  ['canopy_clearing', 'Mosslight Clearing', 'hub', 'mushrooms'],
  ['dungeon_000_r2', 'Vine-Choked Gate', 'gate', 'vine_gate'],
  ['canopy_hollow', 'Whispering Hollow', 'combat', 'rune_tree'],
  ['canopy_bridge', 'Overlook Bridge', 'traversal', 'bridge'],
  ['dungeon_000_r1', 'Shrine of the First Seed', 'ability', 'seed_shrine'],
  ['canopy_secret', 'Lantern Grotto', 'secret', 'lantern'],
  ['canopy_approach', 'Elder Roots Approach', 'save', 'elder_roots'],
  ['dungeon_000_r3', 'The Hollow Crown', 'boss', 'crown'],
  ['canopy_hamlet','Lastlight Hamlet','town','lantern'],
  ['canopy_archive','The Silent Bell Archive','lore','idol'],
  ['canopy_observatory','Emberwatch Observatory','spell','seed_shrine'],
  ['canopy_gardens','The Drowned Gardens','traversal','rune_tree'],
  ['canopy_cistern','The Root Cistern','spell','elder_roots'],
  ['canopy_moonwell','Moonwell Sanctuary','spell','seed_shrine'],
];
export const CANOPY_LINKS = [
  [0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6],
  [6, 7, 'wind_disc', true], [5, 2, 'wind_disc', true],
  [3, 8, 'wind_disc'], [8, 9],
  [2,10],[10,11],[11,12],[5,13],[13,14],[14,15,'rootward',true],
];

export function buildRuinedCanopy(seed = 20260930) {
  const tileSize = 32, widthTiles = 30, heightTiles = 22;
  const xy = (x, y) => ({ x: x * tileSize, y: y * tileSize });
  const areas = CANOPY_ROOMS.map(([id, name, purpose, landmark], index) => {
    const layout=createCanopyLayout(index,widthTiles,heightTiles);
    const {tiles}=layout;
    const pois = [{ id: `${id}_spawn`, kind: 'spawn', areaId: id, ...xy(4, 11), metadata: { roomPurpose: purpose, environmentArchetype: 'forest' } }];
    const add = (kind, x, y, metadata = {}) => pois.push({ id: `${id}_${kind}_${pois.length}`, kind, areaId: id, ...xy(x, y), metadata });
    if ([0, 6, 8].includes(index)) add('save', 6, 9);
    if (index === 0) { add('npc', 11, 8, { npcId: 'npc_000' }); add('chest', 11, 14, { itemId: 'health_vial' }); }
    if ([1, 2, 4, 5, 8].includes(index)) add('enemy', index === 5 ? 26 : index === 4 ? 24 : 20, 14, { enemyId: index === 4 ? 'enemy_001' : 'enemy_000' });
    if (index === 5) add('enemy', 23, 8, { enemyId: 'enemy_001' });
    if (index === 6) add('chest', 15, 8, { itemId: 'wind_disc' });
    if (index === 7) add('chest', 15, 8, { itemId: 'power_charm' });
    if (index === 9) { add('boss', 20, 11, { bossId: 'boss_final', rewardItemId: 'wind_disc' }); add('victory', 25, 11); }
    if(index===10){add('npc',13,10,{npcId:'npc_001'});add('save',18,13);}
    if(index===11){add('npc',15,10,{npcId:'npc_002'});add('chest',20,16,{itemId:'memory_bell'});}
    if(index===12){add('chest',13,10,{itemId:'seedflare'});add('chest',18,16,{itemId:'memory_crown'});}
    if(index===14)add('chest',15,11,{itemId:'rootward'});
    if(index===15){add('chest',17,11,{itemId:'bloomstep'});add('save',12,10);}
    return { id, name, kind: index === 0 ? 'overworld' : 'dungeon', widthTiles, heightTiles, tileSize,
      ...layout, pois, landmark, purpose, propPlacements: [] };
  });
  // Complete the aqueduct's new south branch without changing its existing approaches.
  for(let y=11;y<=19;y++)for(let x=13;x<=15;x++){areas[5].tiles[y][x]=1;areas[5].floorRoles[y][x]='platform';}
  areas[10].buildings=[{id:'lastlight_house',x:240,y:256,width:96,depth:64,height:64},{id:'keeper_house',x:720,y:256,width:96,depth:64,height:80}];
  assignCanopyPassages(areas,CANOPY_LINKS);
  for(const building of areas[10].buildings)for(let y=(building.y-building.depth/2)/32;y<(building.y+building.depth/2)/32;y++)for(let x=(building.x-building.width/2)/32;x<(building.x+building.width/2)/32;x++)areas[10].tiles[y][x]=3;
  for (const area of areas) {
    // Collision is derived from the final material grid, after all routes were authored.
    area.collisionRects = [];
    area.tiles.forEach((row, y) => row.forEach((tile, x) => {
      if (tile === 2 || tile === 3) area.collisionRects.push({ x: x * tileSize, y: y * tileSize, w: tileSize, h: tileSize });
    }));
  }
  const roomIds = areas.map(area => area.id);
  const edges = CANOPY_LINKS.map(([a, b, item, optional], index) => ({ id: `canopy_edge_${index}`, from: roomIds[a], to: roomIds[b],
    requirements: item ? [item] : [], optional: Boolean(optional), bidirectional: true }));
  return { roomIds,
    overworld: { version: '0.1.0', seed, worldStyle: 'screen_by_screen', startAreaId: roomIds[0], victoryAreaId: roomIds[9],
      chunkCols: 1, chunkRows: 1, chunkWidthTiles: widthTiles, chunkHeightTiles: heightTiles,
      regions: [{ id: 'region_0', name: 'The Ruined Canopy', theme: 'woodland_ruins' }], areas,
      dungeonItemId: 'wind_disc', dungeonItemsById: { dungeon_000: 'wind_disc' } },
    worldGraph: { version: '0.1.0', seed, nodes: areas.map((area,index) => ({ id: area.id, type: area.kind === 'overworld' ? 'zone' : 'room',
      label: area.name, metadata: { archetype: area.purpose, biomeId: 'biome_0', landmark: area.landmark,
        mapPosition:CANOPY_MAP_POSITIONS[index],
        grantsAbilities: area.id === 'dungeon_000_r1' ? ['wind_disc'] : [] } })), edges,
      regions: [{ id: 'region_0', name: 'The Ruined Canopy', biomeId: 'biome_0', roomIds }] },
    progressionGraph: { version: '0.1.0', seed, startNodeId: roomIds[0], endNodeId: roomIds[9], abilities: ['wind_disc'],
      nodes: [{ id: roomIds[0], type: 'room', label: 'Arrival', required: true },
        { id: 'item_wind_disc', type: 'ability', label: 'wind_disc', required: true },
        { id: roomIds[9], type: 'boss', label: 'The Hollow Crown', required: true }],
      edges: [{ from: roomIds[0], to: 'item_wind_disc', requires: [] }, { from: 'item_wind_disc', to: roomIds[9], requires: ['wind_disc'] }],
      criticalPath: [roomIds[0], roomIds[1], roomIds[2], roomIds[4], roomIds[5], roomIds[6], roomIds[5], roomIds[2], roomIds[3], roomIds[8], roomIds[9]] },
  };
}
