import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameDNA, Room, WorldGraph } from '@metroforge/schemas';
import type { GameContent } from '@metroforge/procedural';
import { buildMovementJson, movementFeasibilityStats } from '@metroforge/shared';
import { buildRoomTileCells, floorTopPx, type PlatformRect, type PitGap } from './tile-layout.js';

export interface RoomConnection {
  direction: 'left' | 'right' | 'up' | 'down';
  targetRoomId: string;
  optional?: boolean;
  requirements: string[];
}

export interface RoomAssemblyContext {
  roomIds: string[];
  roomConnections: Map<string, RoomConnection[]>;
  worldGraphNodesById: Map<string, WorldGraph['nodes'][number]>;
  npcsByRoom: Map<string, { id: string; name: string; role: string; questIds: string[]; shopId?: string }[]>;
  bossesByRoom: Map<string, string>;
}

export interface RoomAssemblyOptions {
  hasEnemy: boolean;
  enemyIndex: number;
  hasAbilityPickup: boolean;
  abilityPickups: string[];
  isBossRoom: boolean;
  bossId: string;
  hasSavePoint: boolean;
  width: number;
  height: number;
  biomeIndex: number;
  connections: RoomConnection[];
  biomeTexturePath?: string;
  hasTileset: boolean;
  tileSize: number;
  npcs: { id: string; name: string; role: string; questIds: string[]; shopId?: string }[];
  hasItemPickup: boolean;
  itemId: string;
  itemAmount: number;
  worldGraphArchetype?: string;
  tileCells?: TileCell[];
  /** Real, collidable platforms derived from tileCells — the painted tiles alone carry no
   *  physics, so these drive an actual StaticBody2D per platform (see generateRoomScene). */
  platforms?: PlatformRect[];
  /** Real gaps carved into the main floor collider (see buildFloorSection). */
  pits?: PitGap[];
  backgroundLayers?: { far?: string; mid?: string; near?: string; overlay?: string; foreground?: string };
  propSprites?: string[];
  uniquenessSalt?: number;
}

export interface TileCell {
  x: number;
  y: number;
  col: number;
  row: number;
}

export interface PublishedRoomRecord {
  id: string;
  index: number;
  biomeId: string;
  archetype: Room['archetype'];
  /** Original world-graph archetype before assembly overrides (boss, npc, pickups, etc.). */
  worldArchetype?: string;
  width: number;
  height: number;
  connections: { direction: string; targetRoomId: string }[];
  enemies: string[];
  npcs: string[];
  collectibles: string[];
  tileCells?: TileCell[];
  weakFloors?: { x: number; width: number; targetRoomId: string }[];
  platforms?: PlatformRect[];
  pits?: PitGap[];
}

/**
 * Abilities the player has actually picked up by the time they can reach a given room index,
 * assuming the main-spine/critical-path room order (ctx.roomIds — the same order abilities are
 * gated against in world.ts's abilityGateRoomIndex). This is a real, verifiable per-room signal
 * (not a guess) used to keep dash-reach-sized geometry (pits) out of rooms the player visits
 * before dash is actually unlocked — dash is gated behind GameManager.has_ability("dash") at
 * runtime (see templates/godot-metroidvania/scripts/player/abilities/DashAbility.gd), so placing
 * a dash-only-crossable gap before that room is a real softlock, not a cosmetic issue.
 */
function abilitiesAvailableBeforeRoom(ctx: RoomAssemblyContext, index: number): string[] {
  const abilities = new Set<string>();
  for (let i = 0; i < index && i < ctx.roomIds.length; i++) {
    const grants = ctx.worldGraphNodesById.get(ctx.roomIds[i]!)?.metadata?.grantsAbilities as
      | string[]
      | undefined;
    if (Array.isArray(grants)) for (const a of grants) abilities.add(a);
  }
  return [...abilities];
}

/** Deterministic per-room seed derived from the world seed + roomId + room index, so two rooms
 *  sharing an archetype still get independently-varied tile-layout geometry (FNV-1a-style mix;
 *  packages/procedural's SeededRNG then consumes this as its single numeric seed). */
export function deriveRoomTileSeed(worldSeed: number, roomId: string, index: number): number {
  let h = (worldSeed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < roomId.length; i++) {
    h ^= roomId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h = (h ^ Math.imul(index + 1, 2654435761)) >>> 0;
  return h || 1;
}

const VALID_ARCHETYPES = new Set<Room['archetype']>([
  'connector',
  'traversal',
  'combat',
  'arena',
  'puzzle',
  'ability_gate',
  'npc',
  'shop',
  'save',
  'ability_shrine',
  'secret',
  'treasure',
  'challenge',
  'boss',
  'miniboss',
  'set_piece',
  'tutorial',
  'transition',
]);

export function deriveRoomIds(worldGraph: WorldGraph, existing?: string[]): string[] {
  const fromGraph = worldGraph.nodes.filter((n) => n.type === 'room').map((n) => n.id);
  if (!existing?.length) return fromGraph;
  const seen = new Set(existing);
  const merged = [...existing];
  for (const id of fromGraph) {
    if (!seen.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  }
  return merged;
}

function spawnSideForEntry(exitDirection: RoomConnection['direction']): string {
  switch (exitDirection) {
    case 'up':
      return 'bottom';
    case 'down':
      return 'top';
    case 'right':
      return 'left';
    case 'left':
      return 'right';
  }
}

function reverseDirection(direction: RoomConnection['direction']): RoomConnection['direction'] {
  switch (direction) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function inferHorizontalDirection(fromIdx: number, toIdx: number): 'left' | 'right' {
  return toIdx > fromIdx ? 'right' : 'left';
}

export function buildRoomConnections(
  roomIds: string[],
  edges: WorldGraph['edges'],
): Map<string, RoomConnection[]> {
  const indexMap = new Map(roomIds.map((id, i) => [id, i]));
  const connections = new Map<string, RoomConnection[]>();
  for (const roomId of roomIds) connections.set(roomId, []);

  for (const edge of edges) {
    if (!connections.has(edge.from) || !connections.has(edge.to)) continue;
    const fromIdx = indexMap.get(edge.from);
    const toIdx = indexMap.get(edge.to);
    const outDirection =
      edge.transition ??
      (fromIdx !== undefined && toIdx !== undefined
        ? inferHorizontalDirection(fromIdx, toIdx)
        : 'right');

    const fromList = connections.get(edge.from)!;
    if (!fromList.some((c) => c.targetRoomId === edge.to && c.direction === outDirection)) {
      fromList.push({
        direction: outDirection,
        targetRoomId: edge.to,
        optional: edge.optional,
        requirements: edge.requirements ?? [],
      });
    }

    if (edge.bidirectional) {
      const inDirection = reverseDirection(outDirection);
      const toList = connections.get(edge.to)!;
      if (!toList.some((c) => c.targetRoomId === edge.from && c.direction === inDirection)) {
        toList.push({
          direction: inDirection,
          targetRoomId: edge.from,
          optional: edge.optional,
          requirements: edge.requirements ?? [],
        });
      }
    }
  }

  return connections;
}

export function prepareRoomAssemblyContext(
  worldGraph: WorldGraph,
  gameContent: GameContent | undefined,
  roomIds: string[],
): RoomAssemblyContext {
  const npcsByRoom = new Map<
    string,
    { id: string; name: string; role: string; questIds: string[]; shopId?: string }[]
  >();
  for (const npc of gameContent?.npcs ?? []) {
    const list = npcsByRoom.get(npc.roomId) ?? [];
    list.push({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      questIds: npc.questIds,
      shopId: npc.shopId,
    });
    npcsByRoom.set(npc.roomId, list);
  }

  const bossesByRoom = new Map<string, string>();
  for (const boss of gameContent?.bosses ?? []) {
    bossesByRoom.set(boss.arenaRoomId, boss.id);
  }

  return {
    roomIds,
    roomConnections: buildRoomConnections(roomIds, worldGraph.edges),
    worldGraphNodesById: new Map(worldGraph.nodes.map((n) => [n.id, n])),
    npcsByRoom,
    bossesByRoom,
  };
}

export function resolvePublishedArchetype(opts: {
  isBossRoom: boolean;
  hasAbilityPickup: boolean;
  hasSavePoint: boolean;
  roomNpcs: Array<{ role?: string }>;
  hasItemPickup: boolean;
  worldGraphArchetype?: string;
}): Room['archetype'] {
  if (opts.isBossRoom) return 'boss';
  if (opts.hasAbilityPickup) return 'ability_shrine';
  if (opts.hasSavePoint) return 'save';
  if (opts.roomNpcs.some((npc) => npc.role === 'merchant')) return 'shop';
  if (opts.roomNpcs.length > 0) return 'npc';
  if (opts.hasItemPickup) return 'treasure';
  if (opts.worldGraphArchetype && VALID_ARCHETYPES.has(opts.worldGraphArchetype as Room['archetype'])) {
    return opts.worldGraphArchetype as Room['archetype'];
  }
  return 'combat';
}

export interface RoomArchetypeFidelityIssue {
  roomId: string;
  worldArchetype: string;
  publishedArchetype: string;
  reason: string;
}

/** Flags rooms where the published archetype collapsed to combat despite a distinct world-graph tag. */
export function auditRoomArchetypeFidelity(
  worldGraph: WorldGraph,
  rooms: Record<string, { archetype?: string; worldArchetype?: string }>,
): {
  passed: boolean;
  issues: RoomArchetypeFidelityIssue[];
  preserved: number;
  overridden: number;
} {
  const issues: RoomArchetypeFidelityIssue[] = [];
  let preserved = 0;
  let overridden = 0;

  for (const node of worldGraph.nodes) {
    if (node.type !== 'room') continue;
    const published = rooms[node.id];
    if (!published?.archetype) continue;

    const worldArchetype =
      published.worldArchetype ?? (node.metadata?.archetype as string | undefined);
    if (!worldArchetype) continue;

    if (published.archetype === worldArchetype) {
      preserved++;
      continue;
    }

    overridden++;

    if (
      published.archetype === 'combat' &&
      worldArchetype !== 'combat' &&
      worldArchetype !== 'arena' &&
      worldArchetype !== 'challenge'
    ) {
      issues.push({
        roomId: node.id,
        worldArchetype,
        publishedArchetype: published.archetype,
        reason: 'world-graph archetype collapsed to combat in rooms.json',
      });
    }
  }

  return { passed: issues.length === 0, issues, preserved, overridden };
}

function shouldSpawnEnemy(
  worldGraphArchetype: string | undefined,
  index: number,
  isBossRoom: boolean,
  override?: boolean,
): boolean {
  if (override !== undefined) return override;
  if (isBossRoom || index === 0) return false;
  switch (worldGraphArchetype) {
    case 'arena':
    case 'challenge':
    case 'combat':
    case 'miniboss':
      return true;
    case 'puzzle':
    case 'connector':
    case 'traversal':
    case 'tutorial':
    case 'npc':
    case 'shop':
    case 'save':
    case 'secret':
    case 'ability_shrine':
    case 'ability_gate':
    case 'transition':
    case 'set_piece':
    case 'treasure':
      return false;
    default:
      return index % 2 === 0;
  }
}

function wantsArchetypeItemPickup(
  worldGraphArchetype: string | undefined,
  isBossRoom: boolean,
  hasAbilityPickup: boolean,
  hasSavePoint: boolean,
): boolean {
  if (isBossRoom || hasAbilityPickup || hasSavePoint) return false;
  return worldGraphArchetype === 'treasure' || worldGraphArchetype === 'secret';
}

/** Secret rooms prefer unique collectibles. Treasure rooms keep equipment (not currency/quest). */
export function pickRoomPickupItem(
  items: Array<{ id: string; category: string }>,
  worldGraphArchetype: string | undefined,
  roomIndex: number,
): { id: string; category: string } | null {
  const worldItems = items.filter((item) => item.category !== 'currency' && item.category !== 'quest');
  const collectibles = worldItems.filter((item) => item.category === 'collectible');
  const equipment = worldItems.filter((item) => item.category !== 'collectible');
  const pool =
    worldGraphArchetype === 'secret' && collectibles.length > 0
      ? collectibles
      : equipment.length > 0
        ? equipment
        : worldItems;
  if (pool.length === 0) return null;
  return pool[roomIndex % pool.length]!;
}

function defaultRoomWidth(worldGraphArchetype: string | undefined, override?: number): number {
  if (override !== undefined) return override;
  if (worldGraphArchetype === 'set_piece' || worldGraphArchetype === 'traversal') return 960;
  if (worldGraphArchetype === 'boss' || worldGraphArchetype === 'arena' || worldGraphArchetype === 'miniboss') return 960;
  return 800;
}

function defaultRoomHeight(worldGraphArchetype: string | undefined, override?: number): number {
  if (override !== undefined) return override;
  if (worldGraphArchetype === 'challenge' || worldGraphArchetype === 'traversal') return 900;
  if (worldGraphArchetype === 'ability_gate' || worldGraphArchetype === 'ability_shrine') return 780;
  if (worldGraphArchetype === 'set_piece' || worldGraphArchetype === 'boss' || worldGraphArchetype === 'miniboss') return 720;
  return 600;
}

export function buildRoomAssemblyOptions(
  roomId: string,
  index: number,
  ctx: RoomAssemblyContext,
  gameDna: GameDNA,
  gameContent: GameContent | undefined,
  enemyCounter: { value: number },
  textureExists: (relPath: string) => boolean,
  overrides?: Partial<Pick<RoomAssemblyOptions, 'hasEnemy' | 'width' | 'height' | 'uniquenessSalt'>>,
): RoomAssemblyOptions {
  const bossId = ctx.bossesByRoom.get(roomId);
  const isBossRoom = bossId !== undefined;
  const grantsAbilities =
    (ctx.worldGraphNodesById.get(roomId)?.metadata?.grantsAbilities as string[] | undefined) ?? [];
  const hasAbilityPickup = grantsAbilities.length > 0;
  const worldGraphArchetype = ctx.worldGraphNodesById.get(roomId)?.metadata?.archetype as
    | string
    | undefined;
  const hasSavePoint = !isBossRoom && !hasAbilityPickup && worldGraphArchetype === 'save';
  const wantsItemPickup = wantsArchetypeItemPickup(
    worldGraphArchetype,
    isBossRoom,
    hasAbilityPickup,
    hasSavePoint,
  );
  const pickupItem = wantsItemPickup
    ? pickRoomPickupItem(gameContent?.items ?? [], worldGraphArchetype, index)
    : null;
  const hasItemPickup = pickupItem !== null;
  const hasEnemy = shouldSpawnEnemy(
    worldGraphArchetype,
    index,
    isBossRoom,
    overrides?.hasEnemy,
  );
  const enemyIndex = hasEnemy ? enemyCounter.value++ : 0;
  const biomeIndex =
    (ctx.worldGraphNodesById.get(roomId)?.metadata?.biomeIndex as number | undefined) ??
    index % gameDna.world.biomeCount;
  const biomeTexRel = `assets/tilesets/biome_${biomeIndex}/source.png`;
  const hasTileset = textureExists(biomeTexRel);
  const width = defaultRoomWidth(worldGraphArchetype, overrides?.width);
  const height = defaultRoomHeight(worldGraphArchetype, overrides?.height);
  const tileSize = gameDna.technical.tileSize;
  const far = `assets/backgrounds/biome_${biomeIndex}/far.png`;
  const mid = `assets/backgrounds/biome_${biomeIndex}/mid.png`;
  const near = `assets/backgrounds/biome_${biomeIndex}/near.png`;
  const overlay = `assets/backgrounds/biome_${biomeIndex}/overlay.png`;
  const foreground = `assets/backgrounds/biome_${biomeIndex}/foreground.png`;
  const connections = ctx.roomConnections.get(roomId) ?? [];
  const movementStats = movementFeasibilityStats(buildMovementJson(gameDna.movement));
  const layout = buildRoomTileCells({
    width,
    height,
    tileSize,
    archetype: worldGraphArchetype,
    seed: deriveRoomTileSeed(gameDna.seed, roomId, index),
    movement: movementStats,
    connections,
    availableAbilities: abilitiesAvailableBeforeRoom(ctx, index),
    uniquenessSalt: overrides?.uniquenessSalt ?? 0,
  });

  return {
    hasEnemy,
    enemyIndex,
    hasAbilityPickup,
    abilityPickups: grantsAbilities,
    isBossRoom,
    bossId: bossId ?? '',
    hasSavePoint,
    width,
    height,
    biomeIndex,
    connections: ctx.roomConnections.get(roomId) ?? [],
    biomeTexturePath: hasTileset ? biomeTexRel : undefined,
    hasTileset,
    tileSize,
    npcs: ctx.npcsByRoom.get(roomId) ?? [],
    hasItemPickup,
    itemId: pickupItem?.id ?? '',
    itemAmount: pickupItem?.category === 'currency' ? 15 : 1,
    worldGraphArchetype,
    tileCells: layout.cells,
    platforms: layout.platforms,
    pits: layout.pits,
    backgroundLayers: {
      far: textureExists(far) ? far : undefined,
      mid: textureExists(mid) ? mid : undefined,
      near: textureExists(near) ? near : undefined,
      overlay: textureExists(overlay) ? overlay : undefined,
      foreground: textureExists(foreground) ? foreground : undefined,
    },
    propSprites: Array.from({ length: 6 }, (_, i) => `assets/props/biome_${biomeIndex}/biome_${biomeIndex}_prop_${i}.png`).filter(
      (p) => textureExists(p),
    ),
  };
}

export function buildPublishedRoomRecord(
  roomId: string,
  index: number,
  opts: RoomAssemblyOptions,
): PublishedRoomRecord {
  const enemyId = opts.hasEnemy && !opts.isBossRoom
    ? `enemy_${opts.enemyIndex.toString().padStart(3, '0')}`
    : null;

  return {
    id: roomId,
    index,
    biomeId: `biome_${opts.biomeIndex}`,
    archetype: resolvePublishedArchetype({
      isBossRoom: opts.isBossRoom,
      hasAbilityPickup: opts.hasAbilityPickup,
      hasSavePoint: opts.hasSavePoint,
      roomNpcs: opts.npcs,
      hasItemPickup: opts.hasItemPickup,
      worldGraphArchetype: opts.worldGraphArchetype,
    }),
    worldArchetype: opts.worldGraphArchetype,
    width: opts.width,
    height: opts.height,
    connections: opts.connections.map((c) => ({
      direction: c.direction,
      targetRoomId: c.targetRoomId,
    })),
    enemies: enemyId ? [enemyId] : opts.isBossRoom && opts.bossId ? [opts.bossId] : [],
    npcs: opts.npcs.map((n) => n.id),
    collectibles: opts.hasItemPickup && opts.itemId ? [opts.itemId] : [],
    tileCells: opts.tileCells,
    weakFloors: deriveWeakFloors(opts.connections, opts.width).map((wf) => ({
      x: wf.x,
      width: wf.width,
      targetRoomId: wf.targetRoomId,
    })),
    platforms: opts.platforms,
    pits: opts.pits,
  };
}

export interface WeakFloorPlacement {
  x: number;
  width: number;
  targetRoomId: string;
}

export function deriveWeakFloors(
  connections: RoomConnection[],
  platformWidth: number,
): WeakFloorPlacement[] {
  const placements: WeakFloorPlacement[] = [];
  for (const conn of connections) {
    if (conn.direction === 'down' && conn.requirements.includes('ground_slam')) {
      placements.push({
        x: platformWidth / 2,
        width: 128,
        targetRoomId: conn.targetRoomId,
      });
    }
  }
  return placements;
}

export interface GrapplePointPlacement {
  x: number;
  y: number;
  targetRoomId: string;
}

export interface WaterZonePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  targetRoomId: string;
}

export interface PhaseBarrierPlacement {
  x: number;
  y: number;
  height: number;
  targetRoomId: string;
}

export function deriveGrapplePoints(
  connections: RoomConnection[],
  platformWidth: number,
  floorY: number,
): GrapplePointPlacement[] {
  const placements: GrapplePointPlacement[] = [];
  for (const conn of connections) {
    if (!conn.requirements.includes('grapple')) continue;
    placements.push({
      x: conn.direction === 'left' ? 96 : platformWidth - 96,
      y: floorY - 180,
      targetRoomId: conn.targetRoomId,
    });
  }
  return placements;
}

export function deriveWaterZones(
  connections: RoomConnection[],
  platformWidth: number,
  floorY: number,
): WaterZonePlacement[] {
  const placements: WaterZonePlacement[] = [];
  for (const conn of connections) {
    if (!conn.requirements.includes('swim')) continue;
    placements.push({
      x: platformWidth / 2,
      y: floorY - 120,
      width: Math.min(platformWidth - 120, 420),
      height: 120,
      targetRoomId: conn.targetRoomId,
    });
  }
  return placements;
}

export function derivePhaseBarriers(
  connections: RoomConnection[],
  platformWidth: number,
  floorY: number,
): PhaseBarrierPlacement[] {
  const placements: PhaseBarrierPlacement[] = [];
  for (const conn of connections) {
    if (!conn.requirements.includes('phase')) continue;
    placements.push({
      x: conn.direction === 'left' ? 160 : platformWidth - 160,
      y: floorY - 80,
      height: 160,
      targetRoomId: conn.targetRoomId,
    });
  }
  return placements;
}

/** A generic center-x/width floor gap. WeakFloorPlacement (ability-gated, gets a WeakFloor
 *  scene) and PitGap (plain, unconditional) both funnel through this so the floor collider
 *  always has a matching real hole rather than an invisible full-width platform under a painted
 *  pit. */
interface FloorGap {
  x: number;
  width: number;
}

function buildFloorSection(
  platformWidth: number,
  floorY: number,
  gaps: FloorGap[],
  hideFloorVisual = false,
  thickness = 64,
): { subResources: string; nodes: string; extraSubResources: number } {
  const visual = hideFloorVisual ? 'Color(0.3, 0.32, 0.38, 0)' : 'Color(0.3, 0.32, 0.38, 1)';
  const visualVisible = hideFloorVisual ? 'false' : 'true';
  const half = thickness / 2;

  // Merge overlapping/adjacent gaps (a weak floor and a pit could in principle sit near each
  // other) into disjoint spans, sorted left-to-right, clipped to the room's own width.
  const spans = gaps
    .map((g) => ({ left: Math.max(0, g.x - g.width / 2), right: Math.min(platformWidth, g.x + g.width / 2) }))
    .filter((g) => g.right > g.left)
    .sort((a, b) => a.left - b.left)
    .reduce<{ left: number; right: number }[]>((acc, g) => {
      const last = acc[acc.length - 1];
      if (last && g.left <= last.right) last.right = Math.max(last.right, g.right);
      else acc.push({ ...g });
      return acc;
    }, []);

  if (spans.length >= 2) {
    let subResources = '';
    let nodes = '';
    let segCount = 0;
    const bounds = [0, ...spans.flatMap((s) => [s.left, s.right]), platformWidth];
    for (let i = 0; i < bounds.length; i += 2) {
      const segLeft = bounds[i]!;
      const segRight = bounds[i + 1]!;
      const segWidth = segRight - segLeft;
      if (segWidth <= 0) continue;
      segCount++;
      const name = `FloorSeg${segCount}`;
      const shapeId = `floor_seg_${segCount}_shape`;
      subResources += `[sub_resource type="RectangleShape2D" id="${shapeId}"]
size = Vector2(${segWidth}, ${thickness})

`;
      nodes += `[node name="${name}" type="StaticBody2D" parent="."]
position = Vector2(${segLeft + segWidth / 2}, ${floorY})

[node name="CollisionShape2D" type="CollisionShape2D" parent="${name}"]
shape = SubResource("${shapeId}")

[node name="FloorVisual" type="ColorRect" parent="${name}"]
visible = ${visualVisible}
offset_left = -${segWidth / 2}.0
offset_top = -${half}.0
offset_right = ${segWidth / 2}.0
offset_bottom = ${half}.0
color = ${visual}

`;
    }
    return { subResources, nodes, extraSubResources: Math.max(0, segCount - 1) };
  }

  if (spans.length === 0) {
    return {
      subResources: `[sub_resource type="RectangleShape2D" id="floor_shape"]
size = Vector2(${platformWidth}, ${thickness})
`,
      nodes: `[node name="Floor" type="StaticBody2D" parent="."]
position = Vector2(${platformWidth / 2}, ${floorY})

[node name="CollisionShape2D" type="CollisionShape2D" parent="Floor"]
shape = SubResource("floor_shape")

[node name="FloorVisual" type="ColorRect" parent="Floor"]
visible = ${visualVisible}
offset_left = -${platformWidth / 2}.0
offset_top = -${half}.0
offset_right = ${platformWidth / 2}.0
offset_bottom = ${half}.0
color = ${visual}

`,
      extraSubResources: 0,
    };
  }

  const gapLeft = spans[0]!.left;
  const gapRight = spans[0]!.right;
  const leftWidth = Math.max(gapLeft, 0);
  const rightWidth = Math.max(platformWidth - gapRight, 0);
  let subResources = '';
  let nodes = '';

  if (leftWidth > 0) {
    subResources += `[sub_resource type="RectangleShape2D" id="floor_left_shape"]
size = Vector2(${leftWidth}, ${thickness})

`;
    nodes += `[node name="FloorLeft" type="StaticBody2D" parent="."]
position = Vector2(${leftWidth / 2}, ${floorY})

[node name="CollisionShape2D" type="CollisionShape2D" parent="FloorLeft"]
shape = SubResource("floor_left_shape")

[node name="FloorVisual" type="ColorRect" parent="FloorLeft"]
visible = ${visualVisible}
offset_left = -${leftWidth / 2}.0
offset_top = -${half}.0
offset_right = ${leftWidth / 2}.0
offset_bottom = ${half}.0
color = ${visual}

`;
  }

  if (rightWidth > 0) {
    subResources += `[sub_resource type="RectangleShape2D" id="floor_right_shape"]
size = Vector2(${rightWidth}, ${thickness})

`;
    nodes += `[node name="FloorRight" type="StaticBody2D" parent="."]
position = Vector2(${gapRight + rightWidth / 2}, ${floorY})

[node name="CollisionShape2D" type="CollisionShape2D" parent="FloorRight"]
shape = SubResource("floor_right_shape")

[node name="FloorVisual" type="ColorRect" parent="FloorRight"]
visible = ${visualVisible}
offset_left = -${rightWidth / 2}.0
offset_top = -${half}.0
offset_right = ${rightWidth / 2}.0
offset_bottom = ${half}.0
color = ${visual}

`;
  }

  const extraSubResources = leftWidth > 0 && rightWidth > 0 ? 1 : 0;
  return { subResources, nodes, extraSubResources };
}

/** Real StaticBody2D + CollisionShape2D per painted platform — the TileMapLayer's tiles carry no
 *  physics on their own (no physics layer on the generated TileSet, see RoomTileMap.gd), so this
 *  is what actually makes a painted platform something the player can stand on. */
function buildPlatformColliders(platforms: PlatformRect[]): {
  subResources: string;
  nodes: string;
} {
  let subResources = '';
  let nodes = '';
  platforms.forEach((p, i) => {
    const shapeId = `platform_${i}_shape`;
    subResources += `[sub_resource type="RectangleShape2D" id="${shapeId}"]
size = Vector2(${p.width}, ${p.height})

`;
    nodes += `[node name="Platform_${i}" type="StaticBody2D" parent="."]
position = Vector2(${p.x + p.width / 2}, ${p.y + p.height / 2})

[node name="CollisionShape2D" type="CollisionShape2D" parent="Platform_${i}"]
shape = SubResource("${shapeId}")

`;
  });
  return { subResources, nodes };
}

export function generateRoomScene(roomId: string, _index: number, options: RoomAssemblyOptions): string {
  const tileSize = options.tileSize || 16;
  const floorThickness = options.hasTileset ? tileSize * 2 : 64;
  const floorTop = options.hasTileset
    ? floorTopPx(options.height, tileSize)
    : options.height - 96;
  const floorY = floorTop + floorThickness / 2;
  const platformWidth = options.width;
  const weakFloors = deriveWeakFloors(options.connections, platformWidth);
  const grapplePoints = deriveGrapplePoints(options.connections, platformWidth, floorY);
  const waterZones = deriveWaterZones(options.connections, platformWidth, floorY);
  const phaseBarriers = derivePhaseBarriers(options.connections, platformWidth, floorY);
  // Pits/platforms are painted-tile features — only carve real collision for them when a tileset
  // actually exists to render them, otherwise they'd be invisible floating collision volumes.
  const pitGaps: FloorGap[] = options.hasTileset
    ? (options.pits ?? []).map((p) => ({ x: p.x + p.width / 2, width: p.width }))
    : [];
  const realPlatforms = options.hasTileset ? (options.platforms ?? []) : [];
  const floorSection = buildFloorSection(
    platformWidth,
    floorY,
    [...weakFloors.map((wf) => ({ x: wf.x, width: wf.width })), ...pitGaps],
    options.hasTileset,
    floorThickness,
  );
  const platformSection = buildPlatformColliders(realPlatforms);
  const layers = options.backgroundLayers ?? {};
  // Far is an opaque room-space plate so clear color cannot leak. Mid/near are true
  // Parallax2D layers with distinct scroll scales and transparent air.
  const farPath = layers.far;
  let loadSteps = 6 + floorSection.extraSubResources + realPlatforms.length;
  if (weakFloors.length > 0) loadSteps += 1;
  if (grapplePoints.length > 0) loadSteps += 1;
  if (waterZones.length > 0) loadSteps += 1;
  if (phaseBarriers.length > 0) loadSteps += 1;
  if (options.hasTileset) loadSteps += 2;
  if (options.hasSavePoint) loadSteps += 1;
  if (options.npcs.length > 0) loadSteps += 1;
  if (options.hasItemPickup) loadSteps += 1;
  if (options.abilityPickups.length > 0) loadSteps += options.abilityPickups.length;
  if (farPath) loadSteps += 1;
  if (layers.mid) loadSteps += 1;
  if (layers.near) loadSteps += 1;
  const propSprites = options.propSprites ?? [];
  if (propSprites.length > 0) loadSteps += propSprites.length;

  let scene = `[gd_scene load_steps=${loadSteps} format=3]

[ext_resource type="PackedScene" uid="uid://player_scene" path="res://scenes/player/Player.tscn" id="1_player"]
[ext_resource type="PackedScene" uid="uid://enemy_scene" path="res://scenes/enemies/Enemy.tscn" id="2_enemy"]
[ext_resource type="PackedScene" uid="uid://boss_scene" path="res://scenes/bosses/Boss.tscn" id="3_boss"]
[ext_resource type="PackedScene" uid="uid://ability_pickup" path="res://scenes/world/AbilityPickup.tscn" id="4_pickup"]
[ext_resource type="PackedScene" uid="uid://room_transition" path="res://scenes/world/RoomTransition.tscn" id="5_transition"]
`;

  if (options.hasSavePoint) {
    scene += `[ext_resource type="PackedScene" uid="uid://save_point" path="res://scenes/world/SavePoint.tscn" id="8_savepoint"]
`;
  }
  if (options.npcs.length > 0) {
    scene += `[ext_resource type="PackedScene" uid="uid://npc_scene" path="res://scenes/world/NPC.tscn" id="9_npc"]
`;
  }
  if (options.hasItemPickup) {
    scene += `[ext_resource type="PackedScene" uid="uid://item_pickup" path="res://scenes/world/ItemPickup.tscn" id="10_item"]
`;
  }
  if (options.hasTileset) {
    scene += `[ext_resource type="Script" path="res://scripts/world/RoomTileMap.gd" id="6_tilemap"]
`;
  }
  if (weakFloors.length > 0) {
    scene += `[ext_resource type="PackedScene" uid="uid://weak_floor" path="res://scenes/world/WeakFloor.tscn" id="11_weakfloor"]
`;
  }
  if (grapplePoints.length > 0) {
    scene += `[ext_resource type="PackedScene" uid="uid://grapple_point" path="res://scenes/world/GrapplePoint.tscn" id="12_grapple"]
`;
  }
  if (waterZones.length > 0) {
    scene += `[ext_resource type="PackedScene" uid="uid://water_zone" path="res://scenes/world/WaterZone.tscn" id="13_water"]
`;
  }
  if (phaseBarriers.length > 0) {
    scene += `[ext_resource type="PackedScene" uid="uid://phase_barrier" path="res://scenes/world/PhaseBarrier.tscn" id="14_phase"]
`;
  }
  if (farPath) {
    scene += `[ext_resource type="Texture2D" path="res://${farPath}" id="21_bg_far"]
`;
  }
  if (layers.mid) {
    scene += `[ext_resource type="Texture2D" path="res://${layers.mid}" id="22_bg_mid"]
`;
  }
  if (layers.near) {
    scene += `[ext_resource type="Texture2D" path="res://${layers.near}" id="23_bg_near"]
`;
  }
  propSprites.forEach((rel, i) => {
    scene += `[ext_resource type="Texture2D" path="res://${rel}" id="30_prop_${i}"]
`;
  });

  scene += `
${floorSection.subResources}${platformSection.subResources}
[node name="${roomId}" type="Node2D"]

`;

  if (options.hasTileset) {
    scene += `[node name="Ground" type="TileMapLayer" parent="."]
z_index = 0
texture_filter = 0
script = ExtResource("6_tilemap")
biome_id = "biome_${options.biomeIndex}"
room_width = ${platformWidth}
room_height = ${options.height}
tile_size = ${options.tileSize}
room_archetype = "${(options.worldGraphArchetype ?? 'combat').replace(/"/g, '')}"
`;
    if (options.tileCells?.length) {
      const encoded = JSON.stringify(
        options.tileCells.map((c) => [c.x, c.y, c.col, c.row]),
      );
      scene += `painted_cells_json = "${encoded.replace(/"/g, '\\"')}"
`;
    }
    if (pitGaps.length > 0) {
      // Tell RoomTileMap.gd's visual backfill (_paint_visual_mass) which columns are a real
      // pit so it doesn't silently repaint solid ground back over the carved-out floor gap.
      const pitCols = pitGaps.map((g) => [
        Math.round((g.x - g.width / 2) / options.tileSize),
        Math.round((g.x + g.width / 2) / options.tileSize),
      ]);
      scene += `pit_columns_json = "${JSON.stringify(pitCols).replace(/"/g, '\\"')}"
`;
    }
    scene += `
`;
  }

  const shadow = 0.08 + ((options.biomeIndex + _index) % 3) * 0.02;
  const steel = 0.12 + (options.biomeIndex % 2) * 0.03;
  const hideSkyRect = Boolean(farPath);
  scene += `[node name="Background" type="ColorRect" parent="."]
z_index = -20
visible = ${hideSkyRect ? 'false' : 'true'}
offset_left = -240.0
offset_top = -180.0
offset_right = ${options.width + 240}.0
offset_bottom = ${options.height + 180}.0
mouse_filter = 2
color = Color(${shadow.toFixed(3)}, ${steel.toFixed(3)}, ${(0.16 + (options.biomeIndex % 4) * 0.02).toFixed(3)}, ${hideSkyRect ? '0' : '1'})

`;

  if (farPath) {
    const farScale = Math.max(options.width / 640, options.height / 360) * 1.4;
    scene += `[node name="FarSky" type="Sprite2D" parent="."]
z_index = -80
z_as_relative = false
texture_filter = 0
position = Vector2(${options.width / 2}, ${options.height / 2})
texture = ExtResource("21_bg_far")
centered = true
scale = Vector2(${farScale.toFixed(4)}, ${farScale.toFixed(4)})

`;
  }
  if (layers.mid) {
    scene += `[node name="ParallaxMid" type="Parallax2D" parent="."]
z_index = -40
z_as_relative = false
scroll_scale = Vector2(0.3, 0.12)
repeat_size = Vector2(640, 0)
repeat_times = 4

[node name="Sprite" type="Sprite2D" parent="ParallaxMid"]
texture_filter = 0
texture = ExtResource("22_bg_mid")
centered = true
position = Vector2(320, ${Math.round(options.height * 0.72)})

`;
  }
  if (layers.near) {
    scene += `[node name="ParallaxNear" type="Parallax2D" parent="."]
z_index = -20
z_as_relative = false
scroll_scale = Vector2(0.65, 0.2)
repeat_size = Vector2(640, 0)
repeat_times = 4

[node name="Sprite" type="Sprite2D" parent="ParallaxNear"]
texture_filter = 0
texture = ExtResource("23_bg_near")
centered = true
position = Vector2(320, ${Math.round(options.height * 0.82)})

`;
  }
  propSprites.forEach((rel, i) => {
    const x = Math.round(options.width * (0.22 + (i % 4) * 0.18));
    const y = floorTop - 8;
    scene += `[node name="EnvProp_${i}" type="Sprite2D" parent="."]
z_index = 3
texture_filter = 0
position = Vector2(${x}, ${y})
texture = ExtResource("30_prop_${i}")
centered = true

`;
    void rel;
  });

  scene += floorSection.nodes;
  scene += platformSection.nodes;

  if (weakFloors.length > 0) {
    const wf = weakFloors[0]!;
    scene += `
[node name="WeakFloor_${wf.targetRoomId}" parent="." instance=ExtResource("11_weakfloor")]
position = Vector2(${wf.x}, ${floorY})
floor_width = ${wf.width}

`;
  }

  if (grapplePoints.length > 0) {
    const gp = grapplePoints[0]!;
    scene += `
[node name="GrapplePoint_${gp.targetRoomId}" parent="." instance=ExtResource("12_grapple")]
position = Vector2(${gp.x}, ${gp.y})

`;
  }

  if (waterZones.length > 0) {
    const wz = waterZones[0]!;
    scene += `
[node name="WaterZone_${wz.targetRoomId}" parent="." instance=ExtResource("13_water")]
position = Vector2(${wz.x}, ${wz.y})

`;
  }

  if (phaseBarriers.length > 0) {
    const pb = phaseBarriers[0]!;
    scene += `
[node name="PhaseBarrier_${pb.targetRoomId}" parent="." instance=ExtResource("14_phase")]
position = Vector2(${pb.x}, ${pb.y})

`;
  }

  scene += `[node name="Player" parent="." instance=ExtResource("1_player")]
position = Vector2(100, ${floorTop})
`;

  if (options.hasEnemy && !options.isBossRoom) {
    const enemyId = `enemy_${options.enemyIndex.toString().padStart(3, '0')}`;
    scene += `
[node name="Enemy" parent="." instance=ExtResource("2_enemy")]
position = Vector2(${platformWidth - 150}, ${floorTop})
enemy_id = "${enemyId}"

[node name="Sprite" parent="Enemy"]
sheet_path = "assets/enemies/${enemyId}_walk.png"
frame_size = Vector2i(64, 64)
frame_count = 4
hurt_sheet_path = "assets/enemies/${enemyId}_hurt.png"
death_sheet_path = "assets/enemies/${enemyId}_death.png"
attack_sheet_path = "assets/enemies/${enemyId}_attack.png"
`;
  }

  if (options.isBossRoom) {
    const bossId = options.bossId;
    const bossFrame = bossId === 'boss_final' || bossId.includes('final') ? 128 : 96;
    scene += `
[node name="Boss" parent="." instance=ExtResource("3_boss")]
position = Vector2(${platformWidth / 2}, ${floorTop})
boss_id = "${bossId}"

[node name="Sprite" parent="Boss"]
sheet_path = "assets/bosses/${bossId}_walk.png"
frame_size = Vector2i(${bossFrame}, ${bossFrame})
frame_count = 3
hurt_sheet_path = "assets/bosses/${bossId}_hurt.png"
death_sheet_path = "assets/bosses/${bossId}_death.png"
attack_sheet_path = "assets/bosses/${bossId}_attack.png"
`;
  }

  if (options.abilityPickups.length > 0) {
    for (let pi = 0; pi < options.abilityPickups.length; pi++) {
      const abilityId = options.abilityPickups[pi]!;
      // Keep pickups off the room center: up/down transitions and water volumes
      // are placed at platformWidth/2, and a center pickup overlaps those sensors.
      const x = 220 + pi * 40;
      scene += `
[node name="AbilityPickup_${abilityId}" parent="." instance=ExtResource("4_pickup")]
position = Vector2(${x}, ${floorTop - 28})
ability_id = "${abilityId}"
display_name = "${abilityId}"
`;
    }
  }

  if (options.hasSavePoint) {
    scene += `
[node name="SavePoint" parent="." instance=ExtResource("8_savepoint")]
position = Vector2(150, ${floorTop})
`;
  }

  options.npcs.forEach((npc, npcIdx) => {
    scene += `
[node name="NPC_${npcIdx}" parent="." instance=ExtResource("9_npc")]
position = Vector2(${platformWidth * 0.75 - npcIdx * 60}, ${floorTop})
npc_id = "${npc.id}"
npc_name = "${npc.name.replace(/"/g, '\\"')}"
role = "${npc.role}"${npc.questIds.length > 0 ? `\nquest_ids = PackedStringArray(${npc.questIds.map((q) => `"${q}"`).join(', ')})` : ''}${npc.shopId ? `\nshop_id = "${npc.shopId}"` : ''}

[node name="Sprite" parent="NPC_${npcIdx}"]
sheet_path = "assets/npcs/${npc.id}_walk.png"
frame_size = Vector2i(64, 64)
frame_count = 4
`;
  });

  if (options.hasItemPickup) {
    scene += `
[node name="ItemPickup" parent="." instance=ExtResource("10_item")]
position = Vector2(${platformWidth * 0.5 + 100}, ${floorTop - 12})
item_id = "${options.itemId}"
amount = ${options.itemAmount}
`;
  }

  const directionSlot: Record<string, number> = {};
  const hasLeft = options.connections.some((c) => c.direction === 'left');
  const hasRight = options.connections.some((c) => c.direction === 'right');
  for (const conn of options.connections) {
    const spawnSide = spawnSideForEntry(conn.direction);
    const slot = directionSlot[conn.direction] ?? 0;
    directionSlot[conn.direction] = slot + 1;
    let x = 0;
    let y = floorY - 80;
    switch (conn.direction) {
      case 'up':
        x = platformWidth / 2 - 12 + slot * 48;
        y = 48;
        break;
      case 'down':
        x = platformWidth / 2 - 12 + slot * 48;
        y = weakFloors.some((wf) => wf.targetRoomId === conn.targetRoomId)
          ? floorY + 96
          : hasLeft && hasRight
            ? 120
            : floorY - 96;
        break;
      case 'right':
        x = platformWidth - 24 - slot * 48;
        y = floorY - 80;
        break;
      case 'left':
        x = slot * 48;
        y = floorY - 80;
        break;
    }
    scene += `
[node name="Transition_${conn.direction}_${conn.targetRoomId}" parent="." instance=ExtResource("5_transition")]
position = Vector2(${x}, ${y})
target_room_id = "${conn.targetRoomId}"
spawn_side = "${spawnSide}"
transition_direction = "${conn.direction}"
is_optional = ${conn.optional ? 'true' : 'false'}${conn.requirements.length > 0 ? `\nrequired_abilities = PackedStringArray(${conn.requirements.map((r) => `"${r}"`).join(', ')})` : ''}
`;
  }

  return scene;
}

export interface RecompileRoomsInput {
  outputDir: string;
  gameDna: GameDNA;
  worldGraph: WorldGraph;
  gameContent?: GameContent;
  roomIds?: string[];
  targetRoomIds: string[];
  roomOverrides?: Record<
    string,
    Partial<Pick<RoomAssemblyOptions, 'hasEnemy' | 'width' | 'height' | 'tileCells'>>
  >;
}

export interface RecompileRoomsResult {
  success: boolean;
  recompiled: string[];
  errors: string[];
}

export function recompileRooms(input: RecompileRoomsInput): RecompileRoomsResult {
  const errors: string[] = [];
  const recompiled: string[] = [];
  const roomsDir = join(input.outputDir, 'scenes', 'rooms');
  mkdirSync(roomsDir, { recursive: true });

  const roomIds = deriveRoomIds(input.worldGraph, input.roomIds);
  const ctx = prepareRoomAssemblyContext(input.worldGraph, input.gameContent, roomIds);
  const enemyCounter = { value: 0 };
  const textureExists = (rel: string) => existsSync(join(input.outputDir, rel.replace(/\//g, '\\')));

  let roomsData: Record<string, PublishedRoomRecord> = {};
  const roomsJsonPath = join(input.outputDir, 'data', 'rooms', 'rooms.json');
  if (existsSync(roomsJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(roomsJsonPath, 'utf-8')) as {
        rooms?: Record<string, PublishedRoomRecord>;
      };
      roomsData = parsed.rooms ?? {};
    } catch {
      errors.push('Could not parse existing rooms.json');
    }
  }

  const targets = new Set(input.targetRoomIds);
  for (let i = 0; i < roomIds.length; i++) {
    const roomId = roomIds[i]!;
    if (!targets.has(roomId)) continue;
    try {
      const override = input.roomOverrides?.[roomId];
      // Rebuild layout from the seeded assembler. Restoring rooms.json tileCells would
      // re-bake previous wallpaper infills into every interior cell.
      const opts = buildRoomAssemblyOptions(
        roomId,
        i,
        ctx,
        input.gameDna,
        input.gameContent,
        enemyCounter,
        textureExists,
        override,
      );
      if (override?.tileCells?.length) {
        // Hand-edited cells (room editor) have no matching auto-generated collision geometry —
        // clear it rather than risk mismatched/floating platform or pit collision.
        opts.tileCells = override.tileCells;
        opts.platforms = [];
        opts.pits = [];
      }
      const scene = generateRoomScene(roomId, i, opts);
      writeFileSync(join(roomsDir, `${roomId}.tscn`), scene);
      roomsData[roomId] = buildPublishedRoomRecord(roomId, i, opts);
      recompiled.push(roomId);
    } catch (err) {
      errors.push(`${roomId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  mkdirSync(join(input.outputDir, 'data', 'rooms'), { recursive: true });
  writeFileSync(roomsJsonPath, JSON.stringify({ rooms: roomsData }, null, 2));

  return { success: errors.length === 0, recompiled, errors };
}
