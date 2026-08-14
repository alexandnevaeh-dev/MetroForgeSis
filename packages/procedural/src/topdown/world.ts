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
  /** First dungeon's reward item — kept for callers that only care about a single dungeon
   *  (e.g. TINY_TEST, which only ever has one). Prefer `dungeonItemsById` for multi-dungeon
   *  profiles. */
  dungeonItemId: string;
  /** dungeonId ("dungeon_002") -> reward item id, one entry per generated dungeon. */
  dungeonItemsById: Record<string, string>;
}

export interface TopDownWorldGenResult extends WorldGenResult {
  overworld: TopDownOverworld;
}

const CHUNK_W = 16;
const CHUNK_H = 12;
const TILE = 16;
const ROOMS_PER_DUNGEON = 4;

export function generateTopDownWorld(options: {
  seed: number;
  profile: GenerationProfile;
  tileSize?: number;
}): TopDownWorldGenResult {
  const rng = new SeededRNG(options.seed);
  const defaults = TOP_DOWN_PROFILE_DEFAULTS[options.profile];
  const tileSize = options.tileSize ?? TILE;
  const items = pickTopDownDungeonItems(options.profile);
  const dungeonCount = Math.max(1, Math.min(defaults.dungeonCount, items.length));

  const overworldW = defaults.chunkCols * CHUNK_W;
  const overworldH = defaults.chunkRows * CHUNK_H;
  const overworldTiles = carveField(overworldW, overworldH, rng);

  // The fixed spawn-cluster POIs (spawn/npc/chest/save/enemy — placeOverworldPois below) all sit
  // within ~120px of map center. Without excluding that cluster, a scattered dungeon entrance
  // could land on top of it — on a small (TINY_TEST) map this reliably did, so simply walking
  // toward the chest immediately triggered an unwanted dungeon transition (AreaPortal is a plain
  // walk-over trigger, not gated), freeing the player instance mid-walk.
  const spawnCluster = { x: (overworldW * tileSize) / 2, y: (overworldH * tileSize) / 2 };
  const dungeonSlots = scatterPoints(dungeonCount, overworldW, overworldH, tileSize, rng, [spawnCluster]);
  const townSlots = scatterPoints(defaults.townCount, overworldW, overworldH, tileSize, rng, [
    spawnCluster,
    ...dungeonSlots,
  ]);

  const overworldPois = placeOverworldPois(overworldW, overworldH, tileSize, dungeonSlots, townSlots);
  const overworld = buildArea({
    id: 'overworld',
    name: 'Sunken Marches',
    kind: 'overworld',
    tiles: overworldTiles,
    tileSize,
    pois: overworldPois,
  });

  const dungeonAreas: TopDownArea[] = [];
  const dungeonItemsById: Record<string, string> = {};
  const worldGraphEdges: WorldGraph['edges'] = [
    {
      id: 'e_overworld_dungeon_0',
      from: 'overworld',
      to: 'dungeon_000_r0',
      requirements: [],
      optional: false,
      bidirectional: true,
    },
  ];

  for (let d = 0; d < dungeonCount; d++) {
    const dungeonId = `dungeon_${d.toString().padStart(3, '0')}`;
    const rewardItemId = items[d]!.id;
    dungeonItemsById[dungeonId] = rewardItemId;
    // Every dungeon after the first requires the previous dungeon's item to enter — the same
    // "item-gated progression" TOP_DOWN_ACTION_ADVENTURE's design calls for (classic
    // action-adventure dungeon order), expressed with the same WorldGraph edge `requirements`
    // mechanism generateWorldTopology (world.ts) already uses for metroidvania ability gates.
    const requiresItemId = d === 0 ? null : items[d - 1]!.id;
    // Only the LAST dungeon's boss is named so GameManager._on_boss_defeated() treats its death
    // as the win condition (boss_id == "boss_final" or begins with "final") — earlier dungeons
    // get real, distinct, non-final boss ids so defeating them doesn't end the game early.
    const isFinalDungeon = d === dungeonCount - 1;
    const bossId = isFinalDungeon ? 'boss_final' : `boss_${dungeonId}`;
    const rooms = buildDungeonRooms(dungeonId, tileSize, rewardItemId, bossId);
    dungeonAreas.push(...rooms);

    if (d > 0) {
      worldGraphEdges.push({
        id: `e_overworld_${dungeonId}`,
        from: 'overworld',
        to: `${dungeonId}_r0`,
        requirements: requiresItemId ? [requiresItemId] : [],
        optional: false,
        bidirectional: true,
      });
    }
    for (let r = 0; r < ROOMS_PER_DUNGEON - 1; r++) {
      worldGraphEdges.push({
        id: `e_${dungeonId}_r${r}_r${r + 1}`,
        from: `${dungeonId}_r${r}`,
        to: `${dungeonId}_r${r + 1}`,
        requirements: [],
        optional: false,
        bidirectional: true,
      });
    }
  }

  const areas = [overworld, ...dungeonAreas];
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
      grantsAbilities: area.pois
        .filter((p) => p.kind === 'boss')
        .map((p) => String(p.metadata.rewardItemId ?? ''))
        .filter(Boolean),
    },
  }));

  const worldGraph: WorldGraph = {
    version: PRODUCT.schemaVersion,
    seed: options.seed,
    nodes,
    edges: worldGraphEdges,
    regions: [
      {
        id: 'region_0',
        name: 'Sunken Marches',
        biomeId: 'biome_0',
        roomIds,
      },
    ],
  };

  const finalDungeonId = `dungeon_${(dungeonCount - 1).toString().padStart(3, '0')}`;
  const finalRoomId = `${finalDungeonId}_r${ROOMS_PER_DUNGEON - 1}`;

  const progressionNodes: ProgressionGraph['nodes'] = [
    { id: 'overworld', type: 'room', label: 'Start', required: true },
    // type: 'ability' (not 'key') is load-bearing — validateReachability (world.ts) only adds a
    // node's label to unlockedAbilities when it visits an 'ability'-typed node; any other type
    // is inert and the requirement it gates could never be satisfied.
    ...items.slice(0, dungeonCount).map((item) => ({
      id: `item_${item.id}`,
      type: 'ability' as const,
      label: item.id,
      required: true,
    })),
    { id: finalRoomId, type: 'boss', label: 'Final Boss', required: true },
  ];
  const progressionEdges: ProgressionGraph['edges'] = [];
  for (let i = 0; i < progressionNodes.length - 1; i++) {
    const fromNode = progressionNodes[i]!;
    const requires = fromNode.type === 'ability' ? [fromNode.label] : [];
    progressionEdges.push({ from: fromNode.id, to: progressionNodes[i + 1]!.id, requires });
  }

  const progressionGraph: ProgressionGraph = {
    version: PRODUCT.schemaVersion,
    seed: options.seed,
    startNodeId: 'overworld',
    endNodeId: finalRoomId,
    nodes: progressionNodes,
    edges: progressionEdges,
    abilities: items.slice(0, dungeonCount).map((item) => item.id),
    criticalPath: progressionNodes.map((n) => n.id),
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
      victoryAreaId: finalRoomId,
      chunkCols: defaults.chunkCols,
      chunkRows: defaults.chunkRows,
      chunkWidthTiles: CHUNK_W,
      chunkHeightTiles: CHUNK_H,
      regions: [{ id: 'region_0', name: 'Sunken Marches', theme: 'marsh' }],
      areas,
      dungeonItemId: items[0]!.id,
      dungeonItemsById,
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

/** Deterministically scatters `count` points across the overworld on a coarse grid so multiple
 *  dungeon/town entrances never overlap, avoiding cells already taken by `avoid`. */
/**
 * Places `count` points across the map, each attempting to clear `minSeparation` from every
 * point in `avoid` and every point already placed this call. Always returns exactly `count`
 * points — a required dungeon entrance silently missing (the original grid-cell version could
 * drop a point entirely if its one candidate cell was too close to `avoid`) is worse than one
 * that's merely closer than ideal, so a fully-blocked attempt falls back to its least-bad
 * candidate rather than being skipped.
 */
function scatterPoints(
  count: number,
  overworldW: number,
  overworldH: number,
  tileSize: number,
  rng: SeededRNG,
  avoid: Array<{ x: number; y: number }> = [],
): Array<{ x: number; y: number }> {
  if (count <= 0) return [];
  const mapW = overworldW * tileSize;
  const mapH = overworldH * tileSize;
  const margin = tileSize * 2;
  const minSeparation = Math.min(mapW, mapH) * 0.18;
  const placed: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < count; i++) {
    const exclusions = [...avoid, ...placed];
    let best: { x: number; y: number } = { x: mapW / 2, y: mapH / 2 };
    let bestDistance = -Infinity;
    for (let attempt = 0; attempt < 24; attempt++) {
      const candidate = {
        x: rng.int(margin, Math.max(margin, mapW - margin)),
        y: rng.int(margin, Math.max(margin, mapH - margin)),
      };
      const nearest =
        exclusions.length === 0
          ? Infinity
          : Math.min(...exclusions.map((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y)));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = candidate;
      }
      if (nearest >= minSeparation) break;
    }
    placed.push(best);
  }
  return placed;
}

function buildDungeonRooms(
  dungeonId: string,
  tileSize: number,
  rewardItemId: string,
  bossId: string,
): TopDownArea[] {
  const w = 16;
  const h = 12;
  const cx = (w / 2) * tileSize;
  const cy = (h / 2) * tileSize;

  return [
    buildArea({
      id: `${dungeonId}_r0`,
      name: `${dungeonId} Entrance`,
      kind: 'dungeon',
      tiles: carveRoom(w, h),
      tileSize,
      pois: [
        { id: `${dungeonId}_exit`, kind: 'dungeon_entrance', areaId: `${dungeonId}_r0`, x: cx, y: h * tileSize - tileSize * 2, metadata: { targetAreaId: 'overworld' } },
        { id: `${dungeonId}_to_r1`, kind: 'dungeon_entrance', areaId: `${dungeonId}_r0`, x: cx, y: tileSize * 2, metadata: { targetAreaId: `${dungeonId}_r1` } },
        { id: `${dungeonId}_enemy_0`, kind: 'enemy', areaId: `${dungeonId}_r0`, x: cx + 48, y: cy, metadata: { enemyId: `enemy_${dungeonId}_0` } },
      ],
    }),
    buildArea({
      id: `${dungeonId}_r1`,
      name: `${dungeonId} Switch Crypt`,
      kind: 'dungeon',
      tiles: carveRoom(w, h),
      tileSize,
      pois: [
        { id: `${dungeonId}_back1`, kind: 'dungeon_entrance', areaId: `${dungeonId}_r1`, x: cx, y: h * tileSize - tileSize * 2, metadata: { targetAreaId: `${dungeonId}_r0` } },
        { id: `${dungeonId}_switch`, kind: 'switch', areaId: `${dungeonId}_r1`, x: cx - 48, y: cy, metadata: { opensDoorId: `${dungeonId}_door` } },
        { id: `${dungeonId}_chest`, kind: 'chest', areaId: `${dungeonId}_r1`, x: cx + 48, y: cy, metadata: { itemId: `${dungeonId}_key`, locked: false } },
        { id: `${dungeonId}_door`, kind: 'locked_door', areaId: `${dungeonId}_r1`, x: cx, y: tileSize * 2, metadata: { keyId: `${dungeonId}_key`, targetAreaId: `${dungeonId}_r2` } },
      ],
    }),
    buildArea({
      id: `${dungeonId}_r2`,
      name: `${dungeonId} Quiet Annex`,
      kind: 'dungeon',
      tiles: carveRoom(w, h),
      tileSize,
      pois: [
        { id: `${dungeonId}_back2`, kind: 'dungeon_entrance', areaId: `${dungeonId}_r2`, x: cx, y: h * tileSize - tileSize * 2, metadata: { targetAreaId: `${dungeonId}_r1` } },
        { id: `${dungeonId}_to_boss`, kind: 'dungeon_entrance', areaId: `${dungeonId}_r2`, x: cx, y: tileSize * 2, metadata: { targetAreaId: `${dungeonId}_r3` } },
        { id: `${dungeonId}_save`, kind: 'save', areaId: `${dungeonId}_r2`, x: cx - 64, y: cy, metadata: {} },
      ],
    }),
    buildArea({
      id: `${dungeonId}_r3`,
      name: `${dungeonId} Hollow Heart`,
      kind: 'dungeon',
      tiles: carveRoom(w, h),
      tileSize,
      pois: [
        { id: `${dungeonId}_back3`, kind: 'dungeon_entrance', areaId: `${dungeonId}_r3`, x: cx, y: h * tileSize - tileSize * 2, metadata: { targetAreaId: `${dungeonId}_r2` } },
        { id: `${dungeonId}_boss`, kind: 'boss', areaId: `${dungeonId}_r3`, x: cx, y: cy - 16, metadata: { bossId, rewardItemId } },
        { id: `${dungeonId}_victory`, kind: 'victory', areaId: `${dungeonId}_r3`, x: cx, y: tileSize * 3, metadata: { requiresBoss: bossId } },
      ],
    }),
  ];
}

function placeOverworldPois(
  w: number,
  h: number,
  tileSize: number,
  dungeonSlots: Array<{ x: number; y: number }>,
  townSlots: Array<{ x: number; y: number }>,
): TopDownPoi[] {
  const cx = (w / 2) * tileSize;
  const cy = (h / 2) * tileSize;
  const pois: TopDownPoi[] = [
    { id: 'spawn', kind: 'spawn', areaId: 'overworld', x: cx, y: cy, metadata: {} },
    { id: 'npc_000', kind: 'npc', areaId: 'overworld', x: cx + 80, y: cy, metadata: { npcId: 'npc_000' } },
    { id: 'ow_chest', kind: 'chest', areaId: 'overworld', x: cx - 80, y: cy + 48, metadata: { itemId: 'health_vial', locked: false } },
    { id: 'ow_save', kind: 'save', areaId: 'overworld', x: cx - 80, y: cy - 48, metadata: {} },
    { id: 'ow_enemy', kind: 'enemy', areaId: 'overworld', x: cx + 120, y: cy + 80, metadata: { enemyId: 'enemy_001' } },
  ];

  dungeonSlots.forEach((pos, i) => {
    const dungeonId = `dungeon_${i.toString().padStart(3, '0')}`;
    pois.push({
      id: `ow_dungeon_${i}`,
      kind: 'dungeon_entrance',
      areaId: 'overworld',
      x: pos.x,
      y: pos.y,
      metadata: { targetAreaId: `${dungeonId}_r0` },
    });
  });

  townSlots.forEach((pos, i) => {
    pois.push({
      id: `ow_town_${i}_npc`,
      kind: 'npc',
      areaId: 'overworld',
      x: pos.x,
      y: pos.y,
      metadata: { npcId: `npc_town_${i}` },
    });
    pois.push({
      id: `ow_town_${i}_save`,
      kind: 'save',
      areaId: 'overworld',
      x: pos.x + 24,
      y: pos.y,
      metadata: {},
    });
  });

  if (dungeonSlots.length > 1) {
    // A second dungeon onward is gated by the previous dungeon's item, matching the
    // WorldGraph edge requirement built in generateTopDownWorld — this barrier is the visible,
    // in-world counterpart on the free-roam overworld itself (distinct from the per-dungeon
    // entrance edge requirement, which gates the discrete area transition).
    pois.push({
      id: 'ow_gate',
      kind: 'item_gate',
      areaId: 'overworld',
      x: w * tileSize - tileSize * 4,
      y: cy,
      metadata: { itemId: 'wind_disc' },
    });
  }

  return pois;
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
