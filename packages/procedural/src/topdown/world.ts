import type { ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import {
  PRODUCT,
  TOP_DOWN_PROFILE_DEFAULTS,
  pickTopDownDungeonItems,
  type GenerationProfile,
} from '@metroforge/shared';
import { SeededRNG } from '../rng.js';
import type { WorldGenResult } from '../world.js';

export const TILE_GRASS = 0;
export const TILE_DIRT = 1;
export const TILE_WATER = 2;
export const TILE_WALL = 3;

export type TopDownPoiKind =
  | 'spawn'
  | 'npc'
  | 'chest'
  | 'dungeon_entrance'
  | 'item_gate'
  | 'save'
  | 'enemy'
  | 'switch'
  | 'locked_door'
  | 'boss'
  | 'victory';

export interface TopDownPoi {
  id: string;
  kind: TopDownPoiKind;
  areaId: string;
  x: number;
  y: number;
  metadata: Record<string, string | number | boolean>;
}

export interface TopDownArea {
  id: string;
  name: string;
  kind: 'overworld' | 'dungeon';
  widthTiles: number;
  heightTiles: number;
  tileSize: number;
  tiles: number[][];
  collisionRects: Array<{ x: number; y: number; w: number; h: number }>;
  pois: TopDownPoi[];
}

export interface TopDownOverworld {
  version: string;
  seed: number;
  worldStyle: 'continuous' | 'screen_by_screen';
  startAreaId: string;
  victoryAreaId: string;
  chunkCols: number;
  chunkRows: number;
  chunkWidthTiles: number;
  chunkHeightTiles: number;
  regions: Array<{ id: string; name: string; theme: string }>;
  areas: TopDownArea[];
  dungeonItemId: string;
}

export interface TopDownWorldGenResult extends WorldGenResult {
  overworld: TopDownOverworld;
}

const CHUNK_W = 16;
const CHUNK_H = 12;
const TILE = 16;

export function generateTopDownWorld(options: {
  seed: number;
  profile: GenerationProfile;
  tileSize?: number;
}): TopDownWorldGenResult {
  const rng = new SeededRNG(options.seed);
  const defaults = TOP_DOWN_PROFILE_DEFAULTS[options.profile];
  const tileSize = options.tileSize ?? TILE;
  const dungeonItem = pickTopDownDungeonItems(options.profile)[0]!;

  const overworldW = defaults.chunkCols * CHUNK_W;
  const overworldH = defaults.chunkRows * CHUNK_H;
  const overworldTiles = carveField(overworldW, overworldH, rng);
  const overworld = buildArea({
    id: 'overworld',
    name: 'Sunken Marches',
    kind: 'overworld',
    tiles: overworldTiles,
    tileSize,
    pois: placeOverworldPois(overworldW, overworldH, tileSize),
  });

  const dungeonRooms = buildTinyDungeon(tileSize, dungeonItem.id);
  const areas = [overworld, ...dungeonRooms];

  const roomIds = areas.map((area) => area.id);
  const nodes: WorldGraph['nodes'] = areas.map((area) => ({
    id: area.id,
    type: area.kind === 'overworld' ? ('zone' as const) : ('room' as const),
    label: area.name,
    metadata: {
      archetype: area.pois.some((p) => p.kind === 'boss')
        ? 'boss'
        : area.kind === 'overworld'
          ? 'hub'
          : 'combat',
      grantsAbilities: area.pois.some((p) => p.kind === 'boss') ? [dungeonItem.id] : [],
    },
  }));

  const edges: WorldGraph['edges'] = [
    {
      id: 'e_overworld_dungeon',
      from: 'overworld',
      to: 'dungeon_000_r0',
      requirements: [],
      optional: false,
      bidirectional: true,
    },
    {
      id: 'e_d0_d1',
      from: 'dungeon_000_r0',
      to: 'dungeon_000_r1',
      requirements: [],
      optional: false,
      bidirectional: true,
    },
    {
      id: 'e_d1_d2',
      from: 'dungeon_000_r1',
      to: 'dungeon_000_r2',
      requirements: [],
      optional: false,
      bidirectional: true,
    },
    {
      id: 'e_d2_d3',
      from: 'dungeon_000_r2',
      to: 'dungeon_000_r3',
      requirements: [],
      optional: false,
      bidirectional: true,
    },
  ];

  const worldGraph: WorldGraph = {
    version: PRODUCT.schemaVersion,
    seed: options.seed,
    nodes,
    edges,
    regions: [
      {
        id: 'region_0',
        name: 'Sunken Marches',
        biomeId: 'biome_0',
        roomIds,
      },
    ],
  };

  const progressionGraph: ProgressionGraph = {
    version: PRODUCT.schemaVersion,
    seed: options.seed,
    startNodeId: 'overworld',
    endNodeId: 'dungeon_000_r3',
    nodes: roomIds.map((id) => ({
      id,
      type: id.endsWith('_r3') ? ('boss' as const) : ('room' as const),
      label: id,
      required: true,
    })),
    edges: edges.map((e) => ({ from: e.from, to: e.to, requires: e.requirements })),
    abilities: [dungeonItem.id],
    criticalPath: roomIds,
  };

  return {
    worldGraph,
    progressionGraph,
    roomIds,
    overworld: {
      version: PRODUCT.schemaVersion,
      seed: options.seed,
      worldStyle: 'continuous',
      startAreaId: 'overworld',
      victoryAreaId: 'dungeon_000_r3',
      chunkCols: defaults.chunkCols,
      chunkRows: defaults.chunkRows,
      chunkWidthTiles: CHUNK_W,
      chunkHeightTiles: CHUNK_H,
      regions: [{ id: 'region_0', name: 'Sunken Marches', theme: 'marsh' }],
      areas,
      dungeonItemId: dungeonItem.id,
    },
  };
}

function carveField(w: number, h: number, rng: SeededRNG): number[][] {
  const tiles: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        row.push(TILE_WALL);
      } else if (rng.next() < 0.08) {
        row.push(TILE_WATER);
      } else if (rng.next() < 0.12) {
        row.push(TILE_DIRT);
      } else {
        row.push(TILE_GRASS);
      }
    }
    tiles.push(row);
  }
  // Keep a clear spawn/path band so TINY_TEST is never boxed in.
  for (let x = 2; x < w - 2; x++) {
    tiles[Math.floor(h / 2)]![x] = TILE_GRASS;
    tiles[Math.floor(h / 2) - 1]![x] = TILE_GRASS;
  }
  for (let y = 2; y < h - 2; y++) {
    tiles[y]![Math.floor(w / 2)] = TILE_GRASS;
  }
  return tiles;
}

function carveRoom(w: number, h: number): number[][] {
  const tiles: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      row.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? TILE_WALL : TILE_DIRT);
    }
    tiles.push(row);
  }
  return tiles;
}

function buildTinyDungeon(tileSize: number, dungeonItemId: string): TopDownArea[] {
  const w = 16;
  const h = 12;
  const cx = (w / 2) * tileSize;
  const cy = (h / 2) * tileSize;

  return [
    buildArea({
      id: 'dungeon_000_r0',
      name: 'Ash Hollow Entrance',
      kind: 'dungeon',
      tiles: carveRoom(w, h),
      tileSize,
      pois: [
        { id: 'd0_exit', kind: 'dungeon_entrance', areaId: 'dungeon_000_r0', x: cx, y: h * tileSize - tileSize * 2, metadata: { targetAreaId: 'overworld' } },
        { id: 'd0_to_r1', kind: 'dungeon_entrance', areaId: 'dungeon_000_r0', x: cx, y: tileSize * 2, metadata: { targetAreaId: 'dungeon_000_r1' } },
        { id: 'd0_enemy', kind: 'enemy', areaId: 'dungeon_000_r0', x: cx + 48, y: cy, metadata: { enemyId: 'enemy_000' } },
      ],
    }),
    buildArea({
      id: 'dungeon_000_r1',
      name: 'Switch Crypt',
      kind: 'dungeon',
      tiles: carveRoom(w, h),
      tileSize,
      pois: [
        { id: 'd1_back', kind: 'dungeon_entrance', areaId: 'dungeon_000_r1', x: cx, y: h * tileSize - tileSize * 2, metadata: { targetAreaId: 'dungeon_000_r0' } },
        { id: 'd1_switch', kind: 'switch', areaId: 'dungeon_000_r1', x: cx - 48, y: cy, metadata: { opensDoorId: 'd1_door' } },
        { id: 'd1_chest', kind: 'chest', areaId: 'dungeon_000_r1', x: cx + 48, y: cy, metadata: { itemId: 'rusted_key', locked: false } },
        { id: 'd1_door', kind: 'locked_door', areaId: 'dungeon_000_r1', x: cx, y: tileSize * 2, metadata: { keyId: 'rusted_key', targetAreaId: 'dungeon_000_r2' } },
      ],
    }),
    buildArea({
      id: 'dungeon_000_r2',
      name: 'Quiet Annex',
      kind: 'dungeon',
      tiles: carveRoom(w, h),
      tileSize,
      pois: [
        { id: 'd2_back', kind: 'dungeon_entrance', areaId: 'dungeon_000_r2', x: cx, y: h * tileSize - tileSize * 2, metadata: { targetAreaId: 'dungeon_000_r1' } },
        { id: 'd2_to_boss', kind: 'dungeon_entrance', areaId: 'dungeon_000_r2', x: cx, y: tileSize * 2, metadata: { targetAreaId: 'dungeon_000_r3' } },
        { id: 'd2_save', kind: 'save', areaId: 'dungeon_000_r2', x: cx - 64, y: cy, metadata: {} },
      ],
    }),
    buildArea({
      id: 'dungeon_000_r3',
      name: 'Hollow Heart',
      kind: 'dungeon',
      tiles: carveRoom(w, h),
      tileSize,
      pois: [
        { id: 'd3_back', kind: 'dungeon_entrance', areaId: 'dungeon_000_r3', x: cx, y: h * tileSize - tileSize * 2, metadata: { targetAreaId: 'dungeon_000_r2' } },
        { id: 'd3_boss', kind: 'boss', areaId: 'dungeon_000_r3', x: cx, y: cy - 16, metadata: { bossId: 'boss_final', rewardItemId: dungeonItemId } },
        { id: 'd3_victory', kind: 'victory', areaId: 'dungeon_000_r3', x: cx, y: tileSize * 3, metadata: { requiresBoss: 'boss_final' } },
      ],
    }),
  ];
}

function placeOverworldPois(w: number, h: number, tileSize: number): TopDownPoi[] {
  const cx = (w / 2) * tileSize;
  const cy = (h / 2) * tileSize;
  return [
    { id: 'spawn', kind: 'spawn', areaId: 'overworld', x: cx, y: cy, metadata: {} },
    { id: 'npc_000', kind: 'npc', areaId: 'overworld', x: cx + 80, y: cy, metadata: { npcId: 'npc_000' } },
    { id: 'ow_chest', kind: 'chest', areaId: 'overworld', x: cx - 80, y: cy + 48, metadata: { itemId: 'health_vial', locked: false } },
    { id: 'ow_save', kind: 'save', areaId: 'overworld', x: cx - 80, y: cy - 48, metadata: {} },
    {
      id: 'ow_dungeon',
      kind: 'dungeon_entrance',
      areaId: 'overworld',
      x: cx,
      y: tileSize * 3,
      metadata: { targetAreaId: 'dungeon_000_r0' },
    },
    { id: 'ow_enemy', kind: 'enemy', areaId: 'overworld', x: cx + 120, y: cy + 80, metadata: { enemyId: 'enemy_001' } },
    {
      id: 'ow_gate',
      kind: 'item_gate',
      areaId: 'overworld',
      x: w * tileSize - tileSize * 4,
      y: cy,
      metadata: { itemId: 'wind_disc' },
    },
  ];
}

function buildArea(opts: {
  id: string;
  name: string;
  kind: 'overworld' | 'dungeon';
  tiles: number[][];
  tileSize: number;
  pois: TopDownPoi[];
}): TopDownArea {
  return {
    id: opts.id,
    name: opts.name,
    kind: opts.kind,
    widthTiles: opts.tiles[0]?.length ?? 0,
    heightTiles: opts.tiles.length,
    tileSize: opts.tileSize,
    tiles: opts.tiles,
    collisionRects: collisionRectsFromTiles(opts.tiles, opts.tileSize),
    pois: opts.pois,
  };
}

export function collisionRectsFromTiles(
  tiles: number[][],
  tileSize: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  const blocked = new Set([TILE_WALL, TILE_WATER]);
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y]!;
    let runStart = -1;
    for (let x = 0; x <= row.length; x++) {
      const isBlocked = x < row.length && blocked.has(row[x]!);
      if (isBlocked && runStart < 0) runStart = x;
      if (!isBlocked && runStart >= 0) {
        rects.push({
          x: runStart * tileSize,
          y: y * tileSize,
          w: (x - runStart) * tileSize,
          h: tileSize,
        });
        runStart = -1;
      }
    }
  }
  return rects;
}

export function isWalkableTile(tile: number): boolean {
  return tile === TILE_GRASS || tile === TILE_DIRT;
}
