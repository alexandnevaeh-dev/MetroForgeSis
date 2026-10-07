import {buildStormglassGalleryBlueprint,buildStormglassGalleryStairPlatforms,buildStormglassStairFlights,stormglassGalleryPort} from './stormglass-gallery-blueprint.js';
import {buildPlatformerStageLayout} from './platformer-stage-layout.js';
import { buildCastleRegionPlan, supportsCastleRegionPlan, type CastleRegionPlan } from './castle-region-plan.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameDNA, Room, WorldGraph } from '@metroforge/schemas';
import type { GameContent } from '@metroforge/procedural';
import { buildMovementJson, movementFeasibilityStats } from '@metroforge/shared';
import { buildRoomTileCells, buildRoomShellColliders, floorTopPx, type PlatformRect, type PitGap } from './tile-layout.js';
import type { RoomBlueprint } from './composition/index.js';
import {
  foundryBackdropCoverScale,
  projectUsesFoundryVisualKit,
  remapTileCellsForFoundry,
} from './foundry-visual-pack.js';
import {
  defaultEntityPlacements,
  findPlacement,
  resolveEntityPlacements,
  type EntityPlacement,
} from './entity-placements.js';

export type { EntityPlacement, EntityKind } from './entity-placements.js';
export {
  defaultEntityPlacements,
  resolveEntityPlacements,
  mergeEntityPlacementsForIds,
  findPlacement,
} from './entity-placements.js';

export interface RoomConnection {
  direction: 'left' | 'right' | 'up' | 'down';
  targetRoomId: string;
  optional?: boolean;
  requirements: string[];
}

/** The authored gallery's ordinary downward branches must remain open before Dash.
 * Ability-gated weak floors/water keep their existing geometry and interaction rules. */
export function stormglassGalleryDescentPits(
  width: number, tileSize: number, connections: RoomConnection[], theme: unknown,roomId?:string,
): PitGap[] {
  if (!['gallery','rest','undercroft','secret'].includes(String(theme))) return [];
  const down = connections.filter(connection => connection.direction === 'down');
  return down.flatMap((connection, slot) => {
    if(connection.requirements.length)return [];
    const port=roomId?stormglassGalleryPort(roomId,connection.targetRoomId,'down'):undefined;
    const center=port?port.x+12:width/2+slot*48;
    return [{x:Math.floor((center-tileSize*2)/tileSize)*tileSize,width:tileSize*4}];
  });
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
  npcs: { id: string; definitionId?: string; name: string; role: string; questIds: string[]; shopId?: string }[];
  hasItemPickup: boolean;
  itemId: string;
  itemAmount: number;
  worldGraphArchetype?: string;
  tileCells?: TileCell[];
  /** Explicit Studio paint, including an empty layout; do not procedurally refill. */
  tileCellsAuthored?: boolean;
  castleRegionPlan?: CastleRegionPlan;
  /** Opt-in authored gallery theme; stairwell exits belong above the top landing. */
  stormglassRoomTheme?: string;
  platformerStage?: boolean;
  stairFlights?: ReturnType<typeof buildStormglassStairFlights>;
  spatialPorts?: {x:number;y:number;floorY:number;direction:string;targetRoomId:string}[];
  /** Real, collidable platforms derived from tileCells — the painted tiles alone carry no
   *  physics, so these drive an actual StaticBody2D per platform (see generateRoomScene). */
  platforms?: PlatformRect[];
  /** Real gaps carved into the main floor collider (see buildFloorSection). */
  pits?: PitGap[];
  backgroundLayers?: { far?: string; mid?: string; near?: string; overlay?: string; foreground?: string };
  propSprites?: string[];
  /** Larger macro-architecture silhouettes (arches, pillars, statues) placed wall-mounted at a
   *  visibly bigger scale than floor props — see buildRoomScene's architectureSprites placement.
   *  Distinct from propSprites (small, floor-level, tile-scale) on purpose: a room with only
   *  32px floor props still reads as "tiled floor with tiny stickers", not "designed place". */
  architectureSprites?: string[];
  uniquenessSalt?: number;
  blueprint?: RoomBlueprint;
  /** When set to foundry, rooms consume the Foundry V3 atlas/backdrop instead of VGF wallpaper. */
  visualKit?: 'foundry';
  /**
   * Authored courier/biome kits ship distinct far/mid/near plates. Foundry V3 pack rooms skip
   * mid/near (one corridor plate). Authored foundry-themed assemble keeps the plates so runtime
   * parallax is in the generated room, not a fixture patch.
   */
  authoredParallax?: boolean;
  /**
   * Studio-authored entity coordinates. Absent/empty → assembler defaults (legacy projects).
   */
  entityPlacements?: EntityPlacement[];
}

/** Floor props stay off the first stride from spawn (player ~100px, not just SPAWN_MARGIN 80px).
 *  rooms dress calm interiors with a few props even when the plan's combat budget is 0; boss
 *  arenas stay clear. */
const SPAWN_EDGE_CLEARANCE = 240;

export function resolveFloorPropPlacements(
  options: Pick<RoomAssemblyOptions, 'width' | 'authoredParallax' | 'isBossRoom' | 'propSprites' | 'blueprint'>,
): Array<{ rel: string; x: number; index: number }> {
  const propSprites = options.propSprites ?? [];
  if (propSprites.length === 0 || options.isBossRoom === true) return [];
  const budget = options.blueprint?.plan?.propBudget;
  const plannedClusters = budget?.clusters ?? 0;
  const zones = options.blueprint?.plan?.decorationZones ?? [];
  const authoredDress = options.authoredParallax === true;
  const perCluster = Math.max(1, budget?.propsPerCluster ?? (authoredDress ? 2 : 1));
  // Authored Foundry still dresses calm interiors, but as workstation clusters — not four isolates.
  const clusters = authoredDress
    ? Math.max(plannedClusters, zones.length > 0 ? Math.min(zones.length, 2) : 1)
    : plannedClusters;
  if (clusters <= 0) return [];
  const width = options.width;
  const placed: Array<{ rel: string; x: number; index: number }> = [];
  let spriteIndex = 0;
  for (let c = 0; c < clusters; c++) {
    const zone = zones[c];
    const n = Math.min(perCluster, propSprites.length - spriteIndex);
    if (n <= 0) break;
    const cx = zone
      ? Math.round(zone.x + zone.width * 0.5)
      : Math.round(SPAWN_EDGE_CLEARANCE + ((width - 2 * SPAWN_EDGE_CLEARANCE) * (c + 1)) / (clusters + 1));
    for (let p = 0; p < n; p++) {
      let x = Math.round(cx + (p - (n - 1) / 2) * 28);
      if (x < SPAWN_EDGE_CLEARANCE) x = SPAWN_EDGE_CLEARANCE;
      else if (x > width - SPAWN_EDGE_CLEARANCE) x = width - SPAWN_EDGE_CLEARANCE;
      if (x < SPAWN_EDGE_CLEARANCE || x > width - SPAWN_EDGE_CLEARANCE) {
        spriteIndex += 1;
        continue;
      }
      placed.push({ rel: propSprites[spriteIndex]!, x, index: spriteIndex });
      spriteIndex += 1;
    }
  }
  return placed;
}

export interface TileCell {
  x: number;
  y: number;
  col: number;
  row: number;
}

export interface PublishedRoomRecord {
  stairFlights?: ReturnType<typeof buildStormglassStairFlights>;
  masonryRects?: CollisionRect[];
  tileSize: number;
  id: string;
  index: number;
  biomeId: string;
  archetype: Room['archetype'];
  /** Original world-graph archetype before assembly overrides (boss, npc, pickups, etc.). */
  worldArchetype?: string;
  width: number;
  height: number;
  /** `optional`/`requirements` mirror the RoomConnection this was built from, so a Node-side
   *  validator (packages/procedural/src/export-fidelity.ts) can cross-check a real exported
   *  project's doors against the WorldGraph edges that produced it — direction/target alone
   *  cannot tell whether an ability gate the graph declares actually made it into the door the
   *  room-assembler built (or, conversely, whether the door ended up requiring something the
   *  graph never asked for). */
  connections: { direction: string; targetRoomId: string; optional: boolean; requirements: string[] }[];
  /** Explicit editor enemy presence; false survives procedural recompilation. */
  forceEnemy?: boolean;
  enemies: string[];
  npcs: string[];
  collectibles: string[];
  visualKit?: 'foundry';
  tileCells?: TileCell[];
  /** Explicit Studio paint, including an empty layout; do not procedurally refill. */
  tileCellsAuthored?: boolean;
  castleRegionPlan?: CastleRegionPlan;
  weakFloors?: { x: number; width: number; targetRoomId: string }[];
  waterZones?: { x: number; y: number; width: number; height: number; targetRoomId: string }[];
  /** Real physical obstacles for phase-gated connections (see derivePhaseBarriers) — recorded the
   *  same way weakFloors already is, for the same export-fidelity reason. */
  phaseBarriers?: { x: number; targetRoomId: string }[];
  platforms?: PlatformRect[];
  pits?: PitGap[];
  blueprint?: RoomBlueprint;
  /** Optional authored entity positions; missing means runtime uses assembler defaults. */
  entityPlacements?: EntityPlacement[];
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

const ALL_ROOM_DIRECTIONS: RoomConnection['direction'][] = ['left', 'right', 'up', 'down'];

/**
 * Seventeenth-session fix: two connections in the same room sharing a `direction` get placed
 * only ~48px apart along the *same* walk line (see generateRoomScene's `directionSlot` spacing
 * a few hundred lines below) — reaching the farther door means physically walking straight
 * through the nearer one's sensor first. Verified as the real, dominant cause of the disclosed
 * `door_did_not_fire` failures whose reported "current" room was neither the transition's `from`
 * nor its intended `to`: a standalone check against `buildRoomConnections`' own output (no engine
 * involved) found 7-9 same-direction collisions per 42-room world on every one of 5 tested seeds,
 * always a branching-shortcut edge landing on the same inferred `left`/`right` direction as the
 * main spine's own edge in that room (both computed by `inferHorizontalDirection`, which only
 * looks at room index order and has no way to know the spine already claimed that side).
 *
 * Scoped to *inferred* directions (branching shortcuts, the main spine) plus explicit-transition
 * edges that carry no ability `requirements` (vertical biome shafts) — never an ability-gated
 * edge (`requirements` non-empty). `deriveWeakFloors`/`deriveGrapplePoints`/`deriveWaterZones`/
 * `derivePhaseBarriers` (below) all gate their placement on `conn.requirements.includes(ability)`
 * first, so a requirements-empty edge's direction is never read by any of them — rerouting it
 * changes nothing but which physical side of the room its door sits on. An ability-gated edge's
 * direction, by contrast, is load-bearing (e.g. a ground_slam gate's weak floor is only placed
 * for `direction === 'down'`) and is never rerouted here. This also fixes a second, deterministic
 * collision found this way: a vertical shaft's bidirectional reverse (always `down`, requirements
 * `[]`) landing in the same room as an unrelated ability gate's explicit `down` — both are
 * `edge.transition`-carrying, but only the shaft side is safe to move.
 */
function resolveNonCollidingDirection(
  connections: Map<string, RoomConnection[]>,
  roomId: string,
  preferred: RoomConnection['direction'],
): RoomConnection['direction'] {
  const used = new Set((connections.get(roomId) ?? []).map((c) => c.direction));
  if (!used.has(preferred)) return preferred;
  for (const alt of ALL_ROOM_DIRECTIONS) {
    if (!used.has(alt)) return alt;
  }
  // Every direction already occupied in this room (all 4 taken by prior edges) — vanishingly
  // rare; fall back to the collision rather than dropping the connection entirely.
  return preferred;
}

export function buildRoomConnections(
  roomIds: string[],
  edges: WorldGraph['edges'],
): Map<string, RoomConnection[]> {
  const indexMap = new Map(roomIds.map((id, i) => [id, i]));
  const connections = new Map<string, RoomConnection[]>();
  for (const roomId of roomIds) connections.set(roomId, []);

  // Ability-gated edges are processed in a first pass, entirely before every non-gated edge
  // (spine, branching shortcuts, vertical shafts) — not just in `buildEdges`' own emission order.
  // A gated edge's direction is fixed and must claim its room+direction slot before
  // `resolveNonCollidingDirection` runs for anything else, or a non-gated edge processed earlier
  // in the array (e.g. a vertical shaft, which is emitted before ability gates in `world.ts`) can
  // grab the exact direction a *later* gate edge in the same room requires, recreating the
  // collision this fix exists to prevent (found exactly this way: a shaft's `down` reverse and an
  // unrelated ground_slam gate's `down` both landing on room_028 — the gate lost the race because
  // it happens to be built after the shaft in `buildEdges`).
  const gated = edges.filter((e) => (e.requirements?.length ?? 0) > 0);
  const nonGated = edges.filter((e) => (e.requirements?.length ?? 0) === 0);

  for (const edge of [...gated, ...nonGated]) {
    if (!connections.has(edge.from) || !connections.has(edge.to)) continue;
    const fromIdx = indexMap.get(edge.from);
    const toIdx = indexMap.get(edge.to);
    const requirements = edge.requirements ?? [];
    const isAbilityGated = requirements.length > 0;
    const inferredOutDirection =
      fromIdx !== undefined && toIdx !== undefined ? inferHorizontalDirection(fromIdx, toIdx) : 'right';
    const preferredOutDirection = edge.transition ?? inferredOutDirection;
    const outDirection = isAbilityGated
      ? preferredOutDirection
      : resolveNonCollidingDirection(connections, edge.from, preferredOutDirection);

    const fromList = connections.get(edge.from)!;
    if (!fromList.some((c) => c.targetRoomId === edge.to && c.direction === outDirection)) {
      fromList.push({
        direction: outDirection,
        targetRoomId: edge.to,
        optional: edge.optional,
        requirements,
      });
    }

    if (edge.bidirectional) {
      const preferredInDirection = reverseDirection(outDirection);
      const inDirection = isAbilityGated
        ? preferredInDirection
        : resolveNonCollidingDirection(connections, edge.to, preferredInDirection);
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
  // A reward placed inside an explicitly-authored secret remains a secret room. Treating the
  // pickup as a stronger room identity relabelled every Stormglass secret as generic treasure
  // and erased the optional-route contract from the published room data.
  if (opts.worldGraphArchetype === 'secret') return 'secret';
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

// Multi-screen castle rooms: retain intimate rest stops while giving traversal and
// set pieces room for galleries, encounter spacing, and vertical return routes.
// Explicit editor dimensions always win; existing authored rooms are not resized.
function defaultRoomWidth(worldGraphArchetype: string | undefined, override?: number): number {
  if (override !== undefined) return override;
  if (worldGraphArchetype === 'set_piece' || worldGraphArchetype === 'traversal') return 2560;
  if (worldGraphArchetype === 'boss' || worldGraphArchetype === 'arena' || worldGraphArchetype === 'miniboss') return 1920;
  if (worldGraphArchetype === 'combat') return 1920;
  if (worldGraphArchetype === 'tutorial') return 1600;
  if (worldGraphArchetype === 'npc' || worldGraphArchetype === 'shop') return 1280;
  if (worldGraphArchetype === 'save' || worldGraphArchetype === 'secret') return 960;
  return 1600;
}

function defaultRoomHeight(worldGraphArchetype: string | undefined, override?: number): number {
  if (override !== undefined) return override;
  if (worldGraphArchetype === 'challenge' || worldGraphArchetype === 'traversal') return 1280;
  if (worldGraphArchetype === 'ability_gate' || worldGraphArchetype === 'ability_shrine') return 1024;
  if (worldGraphArchetype === 'set_piece' || worldGraphArchetype === 'boss' || worldGraphArchetype === 'miniboss') return 960;
  if (worldGraphArchetype === 'combat' || worldGraphArchetype === 'tutorial') return 768;
  if (worldGraphArchetype === 'npc' || worldGraphArchetype === 'shop' || worldGraphArchetype === 'save' || worldGraphArchetype === 'secret') return 640;
  return 768;
}

/**
 * Stormglass uses the same multi-screen scale as the other side-view reference levels.
 * Camera framing and movement distances remain independent of room extents.
 * Explicit Studio dimensions win; this changes newly generated Stormglass rooms only.
 */
export function stormglassTargetRoomSize(
  worldGraphArchetype: string | undefined,
  tileSize: number,
): { width: number; height: number } {
  const tilesByArchetype: Record<string, readonly [number, number]> = {
    tutorial: [56, 24],
    combat: [64, 48],
    traversal: [50, 72],
    challenge: [50, 72],
    ability_shrine: [56, 32],
    ability_gate: [64, 32],
    save: [48, 24],
    npc: [64, 40],
    shop: [64, 40],
    secret: [48, 24],
    treasure: [48, 24],
    miniboss: [64, 32],
    arena: [64, 32],
    boss: [72, 36],
    puzzle: [64, 40],
    transition: [56, 24],
    connector: [56, 24],
    set_piece: [96, 40],
  };
  const [columns, rows] = tilesByArchetype[worldGraphArchetype ?? ''] ?? [56, 24];
  return { width: columns * tileSize, height: rows * tileSize };
}

/** Production encounter groups for Stormglass. Instance ids remain room-local and unique while
 * definitionId deliberately rotates through the generated biome roster. Positions keep five
 * tiles clear at both doors and split enemies between the floor and usable platform tiers. */
export function buildStormglassEncounterPlacements(
  roomId: string,
  roomIndex: number,
  opts: Pick<RoomAssemblyOptions, 'width' | 'height' | 'tileSize' | 'platforms' | 'worldGraphArchetype' | 'biomeIndex'>,
  enemyDefinitionIds: readonly string[],
): EntityPlacement[] {
  const archetype = opts.worldGraphArchetype;
  const count = archetype === 'combat'
    ? roomIndex === 1 ? 4 : 4 + (roomIndex % 3)
    : archetype === 'traversal' ? 2 + (roomIndex % 2) : 0;
  if (count === 0) return [];
  const safeInset = Math.max(opts.tileSize * 5, 160);
  const span = Math.max(opts.tileSize * 4, opts.width - safeInset * 2);
  const floorY = floorTopPx(opts.height, opts.tileSize);
  const safePlatforms = (opts.platforms ?? []).filter((platform) =>
    platform.x + platform.width / 2 >= safeInset && platform.x + platform.width / 2 <= opts.width - safeInset);
  return Array.from({ length: count }, (_, slot) => {
    const floorX = safeInset + (span * (slot + 1)) / (count + 1);
    const platformSlot = Math.floor(slot / 2);
    const platform = slot % 2 === 1 && platformSlot < safePlatforms.length
      ? safePlatforms[platformSlot]
      : undefined;
    const definitionId = enemyDefinitionIds.length > 0
      ? enemyDefinitionIds[(roomIndex + slot * 2) % enemyDefinitionIds.length]!
      : 'enemy_000';
    return {
      kind: 'enemy' as const,
      id: `${roomId}_enemy_${String(slot).padStart(2, '0')}`,
      definitionId,
      // Grand Hall deliberately wakes one sentinel as the player crosses the entry threshold;
      // later enemies remain outside perception range to preserve the staged encounter.
      x: roomIndex === 1 && slot === 0
        ? 220
        : platform ? platform.x + platform.width / 2 : Math.round(floorX),
      y: platform ? platform.y : floorY,
    };
  });
}

export function applyStormglassEncounterComposition(
  roomId: string,
  roomIndex: number,
  opts: RoomAssemblyOptions,
  enemyDefinitions: ReadonlyArray<{ id: string; biomeId?: string }>,
): void {
  if (opts.isBossRoom || (opts.worldGraphArchetype !== 'combat' && opts.worldGraphArchetype !== 'traversal')) return;
  opts.hasEnemy = true;
  const defaults = resolveEntityPlacements(opts.entityPlacements, {
    width: opts.width,
    height: opts.height,
    tileSize: opts.tileSize,
    hasEnemy: true,
    enemyIndex: opts.enemyIndex,
    abilityPickups: opts.abilityPickups,
    hasSavePoint: opts.hasSavePoint,
    npcs: opts.npcs,
    hasItemPickup: opts.hasItemPickup,
    itemId: opts.itemId,
  });
  opts.entityPlacements = [
    ...defaults.filter((placement) => placement.kind !== 'enemy'),
    ...buildStormglassEncounterPlacements(
      roomId,
      roomIndex,
      opts,
      enemyDefinitions.filter((enemy) => enemy.biomeId === `biome_${opts.biomeIndex}`).map((enemy) => enemy.id),
    ),
  ];
}

export function buildRoomAssemblyOptions(
  roomId: string,
  index: number,
  ctx: RoomAssemblyContext,
  gameDna: GameDNA,
  gameContent: GameContent | undefined,
  enemyCounter: { value: number },
  textureExists: (relPath: string) => boolean,
  overrides?: Partial<
    Pick<
      RoomAssemblyOptions,
      'hasEnemy' | 'width' | 'height' | 'uniquenessSalt' | 'visualKit' | 'authoredParallax'
    >
  >,
): RoomAssemblyOptions {
  const bossId = ctx.bossesByRoom.get(roomId);
  const isBossRoom = bossId !== undefined;
  const grantsAbilities =
    (ctx.worldGraphNodesById.get(roomId)?.metadata?.grantsAbilities as string[] | undefined) ?? [];
  const hasAbilityPickup = grantsAbilities.length > 0;
  const nodeMeta = ctx.worldGraphNodesById.get(roomId)?.metadata ?? {};
  const worldGraphArchetype = nodeMeta.archetype as string | undefined;
  const environmentArchetype =
    typeof nodeMeta.environmentArchetype === 'string' ? nodeMeta.environmentArchetype : undefined;
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
    (typeof nodeMeta.biomeIndex === 'number' ? nodeMeta.biomeIndex : undefined) ??
    index % gameDna.world.biomeCount;
  const biomeTexRel = `assets/tilesets/biome_${biomeIndex}/source.png`;
  const hasTileset = textureExists(biomeTexRel);
  const tileSize = gameDna.technical.tileSize;
  const cleanStormglassRooms = gameDna.identity?.title?.startsWith('Stormglass Reliquary') ?? false;
  const stormglassSize = cleanStormglassRooms
    ? stormglassTargetRoomSize(worldGraphArchetype, tileSize)
    : undefined;
  const targetW =
    typeof nodeMeta.targetTileWidth === 'number' ? nodeMeta.targetTileWidth * tileSize : undefined;
  const targetH =
    typeof nodeMeta.targetTileHeight === 'number' ? nodeMeta.targetTileHeight * tileSize : undefined;
  const galleryRoom = cleanStormglassRooms && gameDna.archetype === 'SIDE_VIEW_METROIDVANIA'
    ? buildStormglassGalleryBlueprint().rooms.find(room=>room.id===roomId && room.theme===nodeMeta.stormglassRoomTheme && room.width===targetW && room.height===targetH)
    : undefined;
  const nodeRequestsCastleRegion = gameDna.archetype === 'SIDE_VIEW_METROIDVANIA' &&
    supportsCastleRegionPlan(targetW ?? 0, targetH ?? 0, tileSize);
  const authoredCampaignSize = cleanStormglassRooms && gameDna.archetype === 'SIDE_VIEW_METROIDVANIA'
    && nodeMeta.stormglassCampaignLayout === 'stormglass-gallery-campaign-v1';
  const authoredPlatformerSize = gameDna.archetype === 'SIDE_VIEW_PLATFORMER' && nodeMeta.platformerStage === true;
  if (authoredPlatformerSize && (!Number.isSafeInteger(targetW) || !Number.isSafeInteger(targetH)
    || targetW! < tileSize*16 || targetH! < tileSize*12 || targetW! > tileSize*256 || targetH! > tileSize*256)) {
    throw new Error(`Invalid Platformer stage dimensions: ${roomId}`);
  }
  if (authoredCampaignSize && (!Number.isSafeInteger(targetW) || !Number.isSafeInteger(targetH)
    || targetW! < tileSize * 16 || targetH! < tileSize * 12 || targetW! > tileSize * 256 || targetH! > tileSize * 256)) {
    throw new Error(`Invalid authored Stormglass campaign dimensions: ${roomId}`);
  }
  const width = authoredPlatformerSize ? overrides?.width ?? targetW! : stormglassSize
    ? overrides?.width ?? (authoredCampaignSize ? targetW! : galleryRoom ? galleryRoom.width : nodeRequestsCastleRegion ? targetW! : stormglassSize.width)
    : Math.max(defaultRoomWidth(worldGraphArchetype, overrides?.width), targetW ?? 0);
  const height = authoredPlatformerSize ? overrides?.height ?? targetH! : stormglassSize
    ? overrides?.height ?? (authoredCampaignSize ? targetH! : galleryRoom ? galleryRoom.height : nodeRequestsCastleRegion ? targetH! : stormglassSize.height)
    : Math.max(defaultRoomHeight(worldGraphArchetype, overrides?.height), targetH ?? 0);
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
    // Stormglass already has authored full-room architecture and a deliberately
    // compact archetype grammar. Generic environment gallery bands appended extra
    // left/right shelves after that grammar, making transition, shrine and combat
    // rooms converge on the same evenly spaced platform wall.
    environmentArchetype: cleanStormglassRooms ? undefined : environmentArchetype,
    seed: deriveRoomTileSeed(gameDna.seed, roomId, index),
    movement: movementStats,
    connections,
    availableAbilities: abilitiesAvailableBeforeRoom(ctx, index),
    uniquenessSalt: overrides?.uniquenessSalt ?? 0,
    biomeId: `biome_${biomeIndex}`,
  });

  if (cleanStormglassRooms) {
    // The old opening platforms were authored in compact absolute coordinates.
    // New halls use the shared movement-aware grammar rather than stretching jump gaps.
    if (width < 1600) applyStormglassOpeningGeometry(roomId, layout, tileSize);
    if (roomId === 'room_022' && width >= 1600) {
      // Retain the proven continuous mandatory route through the Collapse Shaft.
      const floorRow = Math.floor(height / tileSize) - 2;
      for (const pit of layout.pits) {
        for (let x = Math.floor(pit.x / tileSize); x < Math.ceil((pit.x + pit.width) / tileSize); x++) {
          layout.cells.push({x,y:floorRow,col:4,row:3}, {x,y:floorRow+1,col:4,row:4});
        }
      }
      layout.pits.splice(0, layout.pits.length);
    }
    if (gameDna.archetype === 'SIDE_VIEW_METROIDVANIA') {
      const doorPits = stormglassGalleryDescentPits(width, tileSize, connections, nodeMeta.stormglassRoomTheme,galleryRoom?roomId:undefined);
      layout.pits.push(...doorPits);
      const floorRow = Math.floor(height / tileSize) - 2;
      for (let i = layout.cells.length - 1; i >= 0; i--) {
        const cell = layout.cells[i]!;
        if (cell.y >= floorRow && doorPits.some(pit => cell.x * tileSize >= pit.x && cell.x * tileSize < pit.x + pit.width)) layout.cells.splice(i, 1);
      }
    }
  }

  if (galleryRoom) {
    layout.cells.splice(0,layout.cells.length);
    layout.platforms.splice(0,layout.platforms.length,...(galleryRoom.theme==='stairwell'?buildStormglassGalleryStairPlatforms(height,galleryRoom.id==="room_042"):[]));
    layout.pits.splice(0,layout.pits.length,...stormglassGalleryDescentPits(width,tileSize,connections,galleryRoom.theme,roomId));
  }
  if (authoredCampaignSize && nodeMeta.stormglassRoomTheme === 'library-reading') {
    // The enclosed reading wing owns its geometry; no random floating shelves.
    layout.cells.splice(0, layout.cells.length);
    layout.platforms.splice(0, layout.platforms.length);
    layout.pits.splice(0, layout.pits.length);
    if (layout.blueprint?.plan) {
      layout.blueprint.plan.platformRegions = [];
      layout.blueprint.plan.gameplayFloors = [{x:0,y:height-tileSize*2,width,height:tileSize*2}];
    }
  }
  if (authoredPlatformerSize) {
    const stage=buildPlatformerStageLayout(width,height,tileSize,Number(nodeMeta.stageIndex)||0,worldGraphArchetype ?? 'traversal');
    layout.cells.splice(0,layout.cells.length,...stage.cells);
    layout.platforms.splice(0,layout.platforms.length,...stage.platforms);
    layout.pits.splice(0,layout.pits.length,...stage.pits);
    if(layout.blueprint?.plan){
      layout.blueprint.plan.platformRegions=stage.platforms.map(rect=>({...rect}));
      layout.blueprint.plan.gameplayFloors=[{x:0,y:height-tileSize*2,width,height:tileSize*2}];
    }
  }

  // Keep the frozen three-storey wing untouched. A region-sized authoring or
  // generation request selects the measured five-storey layout, never stretched stairs.
  const castleRegionPlan = cleanStormglassRooms && gameDna.archetype === 'SIDE_VIEW_METROIDVANIA' &&
    !isBossRoom && supportsCastleRegionPlan(width, height, tileSize) ? buildCastleRegionPlan() : undefined;
  if (castleRegionPlan) {
    layout.platforms.splice(0, layout.platforms.length, ...castleRegionPlan.platforms, ...castleRegionPlan.partitions);
    layout.pits.splice(0, layout.pits.length);
    const cells = new Map<string, TileCell>();
    const floor = { x: 0, y: castleRegionPlan.floors[0]!, width, height: 64 };
    for (const rect of [floor, ...layout.platforms]) {
      for (let y = rect.y / tileSize; y < (rect.y + rect.height) / tileSize; y++) {
        for (let x = rect.x / tileSize; x < (rect.x + rect.width) / tileSize; x++) {
          cells.set(`${x},${y}`, { x, y, col: rect.height > 32 ? 1 : 3, row: 0 });
        }
      }
    }
    layout.cells.splice(0, layout.cells.length, ...cells.values());
    if (layout.blueprint?.plan) {
      layout.blueprint.plan.platformRegions = layout.platforms.map(rect => ({ ...rect }));
      layout.blueprint.plan.gameplayFloors = [floor, ...castleRegionPlan.platforms.filter(rect =>
        rect.width > 512 && castleRegionPlan.floors.includes(rect.y))];
    }
  }
  const foundryKit = overrides?.visualKit === 'foundry';
  const authoredParallax = overrides?.authoredParallax === true;
  // V3 rivet-atlas remap is only for the frozen metroforge-foundry-v3 pack.
  // Authored masonry (foundry-themed courier kit) already matches procedural ROLES.
  const tileCells =
    foundryKit && !authoredParallax ? remapTileCellsForFoundry(layout.cells) : layout.cells;
  const includeAuthoredPlates = !foundryKit || authoredParallax;

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
    stormglassRoomTheme: typeof nodeMeta.stormglassRoomTheme === "string" ? nodeMeta.stormglassRoomTheme : undefined,
    platformerStage: authoredPlatformerSize,
    stairFlights:galleryRoom?.theme==='stairwell'?buildStormglassStairFlights(height,galleryRoom.id==="room_042"):undefined,
    spatialPorts:galleryRoom?connections.flatMap(connection=>{const port=stormglassGalleryPort(roomId,connection.targetRoomId,connection.direction);return port?[port]:[];}):undefined,
    ...(roomId === 'room_003' && grantsAbilities.length > 0 ? {
      entityPlacements: [
        { kind: 'player_spawn' as const, id: 'player', x: 100, y: height - tileSize * 2 },
        // Keep the first mandatory movement pickup on the walkable floor. The former fixed
        // y=388 placement sat below the decorative shrine platform but above the player's
        // grounded overlap range, so a real input-driven run could pass the room without ever
        // acquiring Dash and only fail later at the regional gate.
        {
          kind: 'ability_pickup' as const,
          id: grantsAbilities[0]!,
          x: width / 2,
          y: height - tileSize * 2 - 28,
        },
      ],
    } : {}),
    tileCells,
    ...(castleRegionPlan ? { castleRegionPlan } : {}),
    ...(cleanStormglassRooms ? { tileCellsAuthored: true } : {}),
    platforms: layout.platforms,
    pits: layout.pits,
    blueprint: layout.blueprint,
    visualKit: overrides?.visualKit,
    authoredParallax,
    backgroundLayers: {
      far: !cleanStormglassRooms && (textureExists(far) || authoredParallax) ? far : undefined,
      mid: !cleanStormglassRooms && includeAuthoredPlates && (textureExists(mid) || authoredParallax) ? mid : undefined,
      near: !cleanStormglassRooms && includeAuthoredPlates && (textureExists(near) || authoredParallax) ? near : undefined,
      overlay: cleanStormglassRooms || foundryKit ? undefined : textureExists(overlay) ? overlay : undefined,
      foreground: !cleanStormglassRooms && (!foundryKit || authoredParallax) && (textureExists(foreground) || authoredParallax) ? foreground : undefined,
    },
    propSprites: cleanStormglassRooms ? [] : Array.from({ length: 6 }, (_, i) => `assets/props/biome_${biomeIndex}/biome_${biomeIndex}_prop_${i}.png`).filter(
      (p) => textureExists(p) || authoredParallax,
    ),
    architectureSprites: !cleanStormglassRooms && (!foundryKit || authoredParallax)
      ? Array.from(
          { length: 4 },
          (_, i) => `assets/architecture/biome_${biomeIndex}/biome_${biomeIndex}_arch_${i}.png`,
        ).filter((p) => textureExists(p) || authoredParallax)
      : [],
  };
}

/**
 * The opening vertical slice is authored room-by-room from the approved 32 px blueprint.  The
 * generic archetype builder remains the fallback for every other room and game family.  Only
 * platform cells/colliders are replaced here; boundary walls, door openings and floor collision
 * stay under the shared assembler so transitions retain their tested contracts.
 */
function applyStormglassOpeningGeometry(
  roomId: string,
  layout: ReturnType<typeof buildRoomTileCells>,
  tileSize: number,
): void {
  const authored: Record<string, Array<{ x: number; y: number; width: number; height: number }>> = {
    room_000: [
      { x: 320, y: 384, width: 160, height: 32 },
    ],
    room_001: [
      { x: 256, y: 320, width: 224, height: 32 },
      { x: 640, y: 256, width: 224, height: 32 },
      { x: 896, y: 192, width: 160, height: 32 },
    ],
    room_002: [
      { x: 64, y: 832, width: 160, height: 32 },
      { x: 384, y: 704, width: 160, height: 32 },
      { x: 96, y: 576, width: 160, height: 32 },
      { x: 352, y: 448, width: 160, height: 32 },
      { x: 128, y: 320, width: 160, height: 32 },
    ],
    room_003: [
      { x: 384, y: 320, width: 128, height: 32 },
    ],
    room_004: [
      { x: 192, y: 320, width: 224, height: 32 },
      { x: 576, y: 256, width: 224, height: 32 },
      { x: 832, y: 192, width: 160, height: 32 },
    ],
    room_005: [
      { x: 96, y: 1120, width: 160, height: 32 },
      { x: 352, y: 992, width: 128, height: 32 },
      { x: 96, y: 864, width: 128, height: 32 },
      { x: 352, y: 736, width: 128, height: 32 },
      { x: 96, y: 608, width: 128, height: 32 },
      { x: 352, y: 480, width: 128, height: 32 },
      { x: 96, y: 352, width: 128, height: 32 },
      { x: 352, y: 224, width: 160, height: 32 },
    ],
    room_006: [
      { x: 96, y: 288, width: 160, height: 32 },
      { x: 304, y: 352, width: 160, height: 32 },
      { x: 512, y: 288, width: 160, height: 32 },
    ],
    room_007: [
      { x: 96, y: 192, width: 160, height: 32 },
      { x: 320, y: 128, width: 128, height: 32 },
    ],
    room_008: [
      { x: 160, y: 480, width: 224, height: 32 },
      { x: 512, y: 352, width: 256, height: 32 },
      { x: 896, y: 480, width: 224, height: 32 },
    ],
    room_009: [
      { x: 256, y: 384, width: 160, height: 32 },
      { x: 544, y: 384, width: 160, height: 32 },
    ],
    // The Collapse Shaft is already a tall traversal room. Its generic 64px floor pit put the
    // player capsule against FloorRight's vertical face on the mandatory route to Ground Slam.
    // Preserve the climbing platforms, but keep the critical ground route continuous.
    room_022: [
      { x: 96, y: 1088, width: 160, height: 32 },
      { x: 224, y: 1120, width: 96, height: 32 },
      { x: 320, y: 1024, width: 96, height: 32 },
      { x: 224, y: 928, width: 96, height: 32 },
    ],
  };
  const platforms = authored[roomId];
  if (!platforms) return;

  const isGeneratedPlatformCell = (entry: TileCell): boolean =>
    (entry.row === 2 && (entry.col === 0 || entry.col === 1 || entry.col === 2)) ||
    (entry.row === 0 && entry.col === 3);
  layout.cells = layout.cells.filter((entry) => !isGeneratedPlatformCell(entry));
  layout.platforms.splice(0, layout.platforms.length, ...platforms);
  if (roomId === 'room_022') {
    layout.pits.splice(0, layout.pits.length);
    const floorRow = Math.max(...layout.cells.map((cell) => cell.y)) - 1;
    for (const x of [9, 10]) {
      layout.cells.push({ x, y: floorRow, col: 4, row: 3 });
      layout.cells.push({ x, y: floorRow + 1, col: 4, row: 4 });
    }
  }
  for (const platform of platforms) {
    const start = Math.round(platform.x / tileSize);
    const row = Math.round(platform.y / tileSize);
    const length = Math.round(platform.width / tileSize);
    layout.cells.push({ x: start, y: row, col: 0, row: 2 });
    for (let offset = 1; offset < length - 1; offset += 1)
      layout.cells.push({ x: start + offset, y: row, col: 3, row: 0 });
    layout.cells.push({ x: start + length - 1, y: row, col: 1, row: 2 });
  }
  if (layout.blueprint?.plan) layout.blueprint.plan.platformRegions = platforms.map((platform) => ({ ...platform }));
}

export function buildPublishedRoomRecord(
  roomId: string,
  index: number,
  opts: RoomAssemblyOptions,
): PublishedRoomRecord {
  const enemyId = opts.hasEnemy && !opts.isBossRoom
    ? `enemy_${opts.enemyIndex.toString().padStart(3, '0')}`
    : null;

  const authoredEnemyIds = opts.entityPlacements?.filter((p) => p.kind === 'enemy').map((p) => p.id);
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
    tileSize: opts.tileSize,
    connections: opts.connections.map((c) => ({
      direction: c.direction,
      targetRoomId: c.targetRoomId,
      optional: c.optional ?? false,
      requirements: [...c.requirements],
    })),
    enemies: enemyId ? (authoredEnemyIds?.length ? authoredEnemyIds : [enemyId]) : opts.isBossRoom && opts.bossId ? [opts.bossId] : [],
    npcs: opts.npcs.map((n) => n.id),
    collectibles: opts.hasItemPickup && opts.itemId ? [opts.itemId] : [],
    ...(opts.visualKit ? { visualKit: opts.visualKit } : {}),
    tileCells: opts.tileCells,
    ...(opts.stairFlights?.length?{stairFlights:opts.stairFlights}:{}),
    ...(opts.stormglassRoomTheme ? {masonryRects:[...buildRoomBoundaryColliders(opts),...buildStormglassInteriorMasonry(opts)]} : {}),
    ...(opts.castleRegionPlan ? { castleRegionPlan: opts.castleRegionPlan } : {}),
    ...(opts.tileCellsAuthored ? { tileCellsAuthored: true } : {}),
    weakFloors: deriveWeakFloors(opts.connections, opts.width).map((wf) => ({
      x: wf.x,
      width: wf.width,
      targetRoomId: wf.targetRoomId,
    })),
    waterZones: deriveWaterZones(opts.connections, opts.width, floorTopPx(opts.height, opts.tileSize) + (opts.hasTileset ? opts.tileSize : 32), {
      biomePool: isFloodedBiomeRoom({
        biomeIndex: opts.biomeIndex,
        isBossRoom: opts.isBossRoom,
        worldGraphArchetype: opts.worldGraphArchetype,
      }),
      floorTop: floorTopPx(opts.height, opts.tileSize),
    }).map((wz) => ({
      x: wz.x,
      y: wz.y,
      width: wz.width,
      height: wz.height,
      targetRoomId: wz.targetRoomId,
    })),
    phaseBarriers: derivePhaseBarriers(opts.connections, opts.width, floorTopPx(opts.height, opts.tileSize)).map((pb) => ({
      x: pb.x,
      targetRoomId: pb.targetRoomId,
    })),
    platforms: opts.platforms,
    pits: opts.pits,
    blueprint: opts.blueprint,
    entityPlacements: resolveEntityPlacements(opts.entityPlacements, {
      width: opts.width,
      height: opts.height,
      tileSize: opts.tileSize,
      hasEnemy: opts.hasEnemy,
      enemyIndex: opts.enemyIndex,
      isBossRoom: opts.isBossRoom,
      bossId: opts.bossId,
      abilityPickups: opts.abilityPickups,
      hasSavePoint: opts.hasSavePoint,
      npcs: opts.npcs,
      hasItemPickup: opts.hasItemPickup,
      itemId: opts.itemId,
    }),
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
  extras?: { biomePool?: boolean; floorTop?: number },
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
  if (extras?.biomePool && placements.length === 0) {
    const height = 96;
    const floorTop = extras.floorTop ?? floorY - 32;
    placements.push({
      x: platformWidth / 2,
      y: floorTop - height,
      width: Math.min(platformWidth - 160, 520),
      height,
      targetRoomId: 'biome_pool',
    });
  }
  return placements;
}

/** Flooded utility is biome index 1 in the 3-biome Foundry slice (foundry / flooded / overgrown). */
export function isFloodedBiomeRoom(opts: {
  biomeIndex: number;
  isBossRoom?: boolean;
  worldGraphArchetype?: string;
}): boolean {
  if (opts.isBossRoom) return false;
  if (opts.worldGraphArchetype === 'ability_shrine' || opts.worldGraphArchetype === 'boss') {
    return false;
  }
  return opts.biomeIndex % 3 === 1;
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
function buildPlatformColliders(platforms: PlatformRect[], oneWay = false): {
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
${oneWay ? "one_way_collision = true\none_way_collision_margin = 4.0\n" : ""}
`;
  });
  return { subResources, nodes };
}

function buildShellColliderSection(
  rects: { name: string; x: number; y: number; width: number; height: number }[],
): { subResources: string; nodes: string } {
  let subResources = '';
  let nodes = '';
  rects.forEach((r, i) => {
    const shapeId = `shell_${i}_shape`;
    subResources += `[sub_resource type="RectangleShape2D" id="${shapeId}"]
size = Vector2(${r.width}, ${r.height})

`;
    nodes += `[node name="${r.name}" type="StaticBody2D" parent="."]
position = Vector2(${r.x + r.width / 2}, ${r.y + r.height / 2})

[node name="CollisionShape2D" type="CollisionShape2D" parent="${r.name}"]
shape = SubResource("${shapeId}")

`;
  });
  return { subResources, nodes };
}

export interface CollisionRect {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Enclosed chamber bays connected by low vaulted halls. Solid roof volumes
 * occupy the unused canvas: it is architecture, not another playable storey.
 * Vertical transition rooms retain their open stair shaft. */
export function buildStormglassInteriorMasonry(options: RoomAssemblyOptions): CollisionRect[] {
  if (!options.stormglassRoomTheme || options.stormglassRoomTheme === 'stairwell') return [];
  if (options.connections.some(connection => connection.direction === 'up')) return [];
  const floor = options.hasTileset ? floorTopPx(options.height, options.tileSize || 16) : options.height - 96;
  if (options.stormglassRoomTheme === 'library-reading') {
    // Two sheltered chambers open into a taller central reading hall. The solid
    // roof fills unused canvas and the 192px portals preserve the combat route.
    const spans = [
      {x:0,width:options.width*0.25,clearance:320},
      {x:options.width*0.25,width:options.width*0.5,clearance:448},
      {x:options.width*0.75,width:options.width*0.25,clearance:320},
    ];
    return spans.flatMap((span,index) => [
      {name:`MasonryRoof_${index}`,x:span.x,y:0,width:span.width,height:Math.max(64,floor-span.clearance)},
      ...(index===0?[]:[{name:`MasonryPier_${index}`,x:span.x-32,y:Math.max(64,floor-320),width:64,height:128}]),
    ]);
  }
  const bayWidth = 768;
  const rects: CollisionRect[] = [];
  for (let x = 0, bay = 0; x < options.width; x += bayWidth, bay++) {
    const width = Math.min(bayWidth, options.width-x);
    const ceiling = Math.max(64, floor - (bay % 3 === 1 ? 224 : 320));
    rects.push({name:`MasonryRoof_${bay}`,x,y:0,width,height:ceiling});
    if (x > 0) rects.push({name:`MasonryPier_${bay}`,x:x-32,y:ceiling,width:64,height:Math.max(0,floor-160-ceiling)});
  }
  return rects.filter(rect => rect.height > 0);
}

export function buildRoomBoundaryColliders(options: Pick<RoomAssemblyOptions,'width'|'height'|'tileSize'|'connections'|'spatialPorts'>): CollisionRect[] {
  const shell=buildRoomShellColliders({width:options.width,height:options.height,tileSize:options.tileSize||16,connections:options.connections});
  if(!options.spatialPorts?.length)return shell;
  const result=shell.filter(rect=>!rect.name.startsWith('ShellLeft')&&!rect.name.startsWith('ShellRight'));
  const tile=options.tileSize||16,floor=floorTopPx(options.height,tile);
  for(const direction of ['left','right'] as const){
    const gaps=options.connections.filter(c=>c.direction===direction).map(connection=>{
      const port=options.spatialPorts!.find(p=>p.direction===direction&&p.targetRoomId===connection.targetRoomId);
      const bottom=port?.floorY??floor;
      return {top:Math.max(0,bottom-128),bottom:Math.min(floor,bottom)};
    }).sort((a,b)=>a.top-b.top);
    let cursor=0,index=0;
    for(const gap of [...gaps,{top:floor,bottom:floor}]){
      if(gap.top>cursor)result.push({name:`Shell${direction==='left'?'Left':'Right'}${index===0?(gaps.length?'Upper':''):`Segment_${index}`}`,
        x:direction==='left'?0:options.width-tile,y:cursor,width:tile,height:gap.top-cursor});
      cursor=Math.max(cursor,gap.bottom);index++;
    }
  }
  return result;
}

/** Godot Y-down top-left rects matching the StaticBody2D volumes `generateRoomScene` emits. */
export function collectRoomCollisionRects(options: RoomAssemblyOptions): CollisionRect[] {
  const tileSize = options.tileSize || 16;
  const floorThickness = options.hasTileset ? tileSize * 2 : 64;
  const floorTop = options.hasTileset
    ? floorTopPx(options.height, tileSize)
    : options.height - 96;
  const platformWidth = options.width;
  const weakFloors = deriveWeakFloors(options.connections, platformWidth);
  const pitGaps: FloorGap[] = options.hasTileset
    ? (options.pits ?? []).map((p) => ({ x: p.x + p.width / 2, width: p.width }))
    : [];
  const gaps: FloorGap[] = [
    ...weakFloors.map((wf) => ({ x: wf.x, width: wf.width })),
    ...pitGaps,
  ];
  const rects: CollisionRect[] = [];

  const spans = gaps
    .map((g) => ({
      left: Math.max(0, g.x - g.width / 2),
      right: Math.min(platformWidth, g.x + g.width / 2),
    }))
    .filter((g) => g.right > g.left)
    .sort((a, b) => a.left - b.left)
    .reduce<{ left: number; right: number }[]>((acc, g) => {
      const last = acc[acc.length - 1];
      if (last && g.left <= last.right) last.right = Math.max(last.right, g.right);
      else acc.push({ ...g });
      return acc;
    }, []);

  const bounds = spans.length === 0 ? [0, platformWidth] : [0, ...spans.flatMap((s) => [s.left, s.right]), platformWidth];
  let seg = 0;
  for (let i = 0; i < bounds.length; i += 2) {
    const segLeft = bounds[i]!;
    const segRight = bounds[i + 1]!;
    const segWidth = segRight - segLeft;
    if (segWidth <= 0) continue;
    seg += 1;
    rects.push({
      name: `FloorSeg${seg}`,
      x: segLeft,
      y: floorTop,
      width: segWidth,
      height: floorThickness,
    });
  }

  if (options.hasTileset) {
    for (const [i, p] of (options.platforms ?? []).entries()) {
      rects.push({ name: `Platform_${i}`, x: p.x, y: p.y, width: p.width, height: p.height });
    }
  }

  for (const shell of buildRoomBoundaryColliders(options)) {
    rects.push(shell);
  }
  rects.push(...buildStormglassInteriorMasonry(options));
  return rects;
}

export function spawnSideForEntry(exitDirection: RoomConnection['direction']): string {
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

export function generateRoomScene(roomId: string, _index: number, options: RoomAssemblyOptions): string {
  const foundryKit = options.visualKit === 'foundry';
  const tileSize = options.tileSize || 16;
  const floorThickness = options.hasTileset ? tileSize * 2 : 64;
  const floorTop = options.hasTileset
    ? floorTopPx(options.height, tileSize)
    : options.height - 96;
  const floorY = floorTop + floorThickness / 2;
  const platformWidth = options.width;
  const placements = resolveEntityPlacements(options.entityPlacements, {
    width: options.width,
    height: options.height,
    tileSize,
    hasEnemy: options.hasEnemy,
    enemyIndex: options.enemyIndex,
    isBossRoom: options.isBossRoom,
    bossId: options.bossId,
    abilityPickups: options.abilityPickups,
    hasSavePoint: options.hasSavePoint,
    npcs: options.npcs,
    hasItemPickup: options.hasItemPickup,
    itemId: options.itemId,
  });
  const weakFloors = deriveWeakFloors(options.connections, platformWidth);
  const grapplePoints = deriveGrapplePoints(options.connections, platformWidth, floorY);
  const waterZones = deriveWaterZones(options.connections, platformWidth, floorY, {
    biomePool: isFloodedBiomeRoom({
      biomeIndex: options.biomeIndex,
      isBossRoom: options.isBossRoom,
      worldGraphArchetype: options.worldGraphArchetype,
    }),
    floorTop,
  });
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
  const platformSection = buildPlatformColliders(realPlatforms, options.platformerStage === true || (options.stormglassRoomTheme === 'stairwell'&&!options.stairFlights?.length));
  const shellRects = buildRoomBoundaryColliders(options);
  shellRects.push(...buildStormglassInteriorMasonry(options));
  const shellSection = buildShellColliderSection(shellRects);
  const layers = options.backgroundLayers ?? {};
  // Far is an opaque room-space plate so clear color cannot leak. Mid/near are true
  // Parallax2D layers with distinct scroll scales and transparent air.
  const farPath = layers.far;
  let loadSteps = 6 + floorSection.extraSubResources + realPlatforms.length + shellRects.length;
  if(options.stairFlights?.length)loadSteps+=1;
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
  const emitParallaxPlates = options.authoredParallax === true || !foundryKit;
  if (layers.mid && emitParallaxPlates) loadSteps += 1;
  if (layers.near && emitParallaxPlates) loadSteps += 1;
  const emitForeground = Boolean(layers.foreground) && options.authoredParallax === true;
  if (emitForeground) loadSteps += 1;
  const propSprites = options.propSprites ?? [];
  if (propSprites.length > 0) loadSteps += propSprites.length;
  const architectureSprites = options.architectureSprites ?? [];
  if (architectureSprites.length > 0) loadSteps += architectureSprites.length;

  let scene = `[gd_scene load_steps=${loadSteps} format=3]

[ext_resource type="PackedScene" path="res://scenes/player/Player.tscn" id="1_player"]
[ext_resource type="PackedScene" path="res://scenes/enemies/Enemy.tscn" id="2_enemy"]
[ext_resource type="PackedScene" path="res://scenes/bosses/Boss.tscn" id="3_boss"]
[ext_resource type="PackedScene" path="res://scenes/world/AbilityPickup.tscn" id="4_pickup"]
[ext_resource type="PackedScene" path="res://scenes/world/RoomTransition.tscn" id="5_transition"]
`;

  if(options.stairFlights?.length)scene+='[ext_resource type="Script" path="res://scripts/world/StormglassStairFlight.gd" id="32_stair"]\n';
  if (options.hasSavePoint) {
    scene += `[ext_resource type="PackedScene" path="res://scenes/world/SavePoint.tscn" id="8_savepoint"]
`;
  }
  if (options.npcs.length > 0) {
    scene += `[ext_resource type="PackedScene" path="res://scenes/world/NPC.tscn" id="9_npc"]
`;
  }
  if (options.hasItemPickup) {
    scene += `[ext_resource type="PackedScene" path="res://scenes/world/ItemPickup.tscn" id="10_item"]
`;
  }
  if (options.hasTileset) {
    scene += `[ext_resource type="Script" path="res://scripts/world/RoomTileMap.gd" id="6_tilemap"]
`;
  }
  if (weakFloors.length > 0) {
    scene += `[ext_resource type="PackedScene" path="res://scenes/world/WeakFloor.tscn" id="11_weakfloor"]
`;
  }
  if (grapplePoints.length > 0) {
    scene += `[ext_resource type="PackedScene" path="res://scenes/world/GrapplePoint.tscn" id="12_grapple"]
`;
  }
  if (waterZones.length > 0) {
    scene += `[ext_resource type="PackedScene" path="res://scenes/world/WaterZone.tscn" id="13_water"]
`;
  }
  if (phaseBarriers.length > 0) {
    scene += `[ext_resource type="PackedScene" path="res://scenes/world/PhaseBarrier.tscn" id="14_phase"]
`;
  }
  if (farPath) {
    scene += `[ext_resource type="Texture2D" path="res://${farPath}" id="21_bg_far"]
`;
  }
  if (layers.mid && emitParallaxPlates) {
    scene += `[ext_resource type="Texture2D" path="res://${layers.mid}" id="22_bg_mid"]
`;
  }
  if (layers.near && emitParallaxPlates) {
    scene += `[ext_resource type="Texture2D" path="res://${layers.near}" id="23_bg_near"]
`;
  }
  if (emitForeground && layers.foreground) {
    scene += `[ext_resource type="Texture2D" path="res://${layers.foreground}" id="24_bg_fg"]
`;
  }
  propSprites.forEach((rel, i) => {
    scene += `[ext_resource type="Texture2D" path="res://${rel}" id="30_prop_${i}"]
`;
  });
  architectureSprites.forEach((rel, i) => {
    scene += `[ext_resource type="Texture2D" path="res://${rel}" id="31_arch_${i}"]
`;
  });

  scene += `
${floorSection.subResources}${platformSection.subResources}${shellSection.subResources}
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
${options.visualKit === 'foundry' ? 'visual_kit = "foundry"\n' : ''}`;
    if (options.tileCells !== undefined) {
      const encoded = JSON.stringify(
        options.tileCells.map((c) => [c.x, c.y, c.col, c.row]),
      );
      scene += `painted_cells_json = "${encoded.replace(/"/g, '\\"')}"
`;
    }
    if (options.tileCellsAuthored) scene += `authored_cells = true\n`;
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
  const hideSkyRect = Boolean(farPath) && !foundryKit;
  scene += `[node name="Background" type="ColorRect" parent="."]
z_index = ${foundryKit ? '-90' : '-20'}
z_as_relative = false
visible = ${hideSkyRect ? 'false' : 'true'}
offset_left = -240.0
offset_top = -180.0
offset_right = ${options.width + 240}.0
offset_bottom = ${options.height + 180}.0
mouse_filter = 2
color = Color(${foundryKit ? '0.075, 0.118, 0.173' : `${shadow.toFixed(3)}, ${steel.toFixed(3)}, ${(0.16 + (options.biomeIndex % 4) * 0.02).toFixed(3)}`}, ${hideSkyRect ? '0' : '1'})

`;

  if (farPath) {
    const farScale = foundryKit
      ? foundryBackdropCoverScale(options.width, options.height)
      : Math.min(options.width / 640, options.height / 360) * 1.08;
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
  // Sixteenth-session fix: FarSky already scales to cover the room (farScale above), but
  // ParallaxMid/ParallaxNear previously had no scale at all — their Sprite2D rendered at native
  // 1:1 pixel size (640x360) regardless of room dimensions. On any room bigger than that native
  // size (the common case — see the camera-zoom fix in CameraDirector.gd for real measured room
  // dimensions), the far layer's same-style bay/module art appeared visibly enlarged while mid/
  // near's identical-style art stayed tiny and denser right next to it — the "background modules
  // repeat simultaneously at very different scales, competing with the platforms" finding in the
  // independent visual assessment (docs/audit/MODERN_COHESION_TEST_PROJECT.md's sixteenth
  // session). All three depth layers now share one consistent cover-scale (matching FarSky's own
  // formula); scroll_scale (already present) is what differentiates depth, not raw sprite size.
  // repeat_size scales with it so horizontal tiling still seams cleanly at the new size.
  // Foundry V3 uses a single authored 1920x320 corridor plate — duplicating it as mid/near
  // wallpaper is what made pack-backed rooms still look like VGF landscape cubes.
  const bgScale = Math.min(options.width / 640, options.height / 360) * 1.08;
  if (layers.mid && emitParallaxPlates) {
    scene += `[node name="ParallaxMid" type="Parallax2D" parent="."]
z_index = -40
z_as_relative = false
scroll_scale = Vector2(0.3, 0.12)
repeat_size = Vector2(${(640 * bgScale).toFixed(1)}, 0)
repeat_times = 4

[node name="Sprite" type="Sprite2D" parent="ParallaxMid"]
texture_filter = 0
texture = ExtResource("22_bg_mid")
centered = true
scale = Vector2(${bgScale.toFixed(4)}, ${bgScale.toFixed(4)})
position = Vector2(${Math.round(options.width / 2)}, ${Math.round(options.height / 2)})

`;
  }
  if (layers.near && emitParallaxPlates) {
    scene += `[node name="ParallaxNear" type="Parallax2D" parent="."]
z_index = -20
z_as_relative = false
scroll_scale = Vector2(0.65, 0.2)
repeat_size = Vector2(${(640 * bgScale).toFixed(1)}, 0)
repeat_times = 4

[node name="Sprite" type="Sprite2D" parent="ParallaxNear"]
texture_filter = 0
texture = ExtResource("23_bg_near")
centered = true
scale = Vector2(${bgScale.toFixed(4)}, ${bgScale.toFixed(4)})
position = Vector2(${Math.round(options.width / 2)}, ${Math.round(options.height / 2)})

`;
  }
  if (emitForeground && layers.foreground) {
    const fgScaleX = options.width / 960;
    const fgScaleY = options.height / 540;
    scene += `[node name="ParallaxForeground" type="Parallax2D" parent="."]
z_index = 6
z_as_relative = false
scroll_scale = Vector2(0.92, 0.35)

[node name="Sprite" type="Sprite2D" parent="ParallaxForeground"]
texture_filter = 0
texture = ExtResource("24_bg_fg")
centered = true
scale = Vector2(${fgScaleX.toFixed(4)}, ${fgScaleY.toFixed(4)})
position = Vector2(${Math.round(options.width / 2)}, ${Math.round(options.height / 2)})

`;
  }
  // Structural assets are placed only through the semantic RoomPlan. This avoids the old
  // percentage-based scatter that created unrelated central pillars and props in fight space.
  const roomPlan = options.blueprint?.plan;
  const architectureAnchors = (roomPlan?.majorArchitecture?.length ?? 0) > 0
    ? roomPlan!.majorArchitecture
    : architectureSprites.slice(0, 2).map((_, i) => ({
        role: 'edge_pillar' as const,
        x: options.width * (i === 0 ? 0.12 : 0.88),
        grounded: true,
      }));
  const floorProps = resolveFloorPropPlacements(options);

  floorProps.forEach((placed, i) => {
    const y = floorTop - 8;
    scene += `[node name="EnvProp_${i}" type="Sprite2D" parent="."]
z_index = 3
texture_filter = 0
position = Vector2(${placed.x}, ${y})
texture = ExtResource("30_prop_${placed.index}")
centered = true

`;
  });
  // Wall-mounted macro architecture (arches/pillars/statues) — visibly larger than the tile-scale
  // floor props above, standing tall against the wall instead of sitting small on the floor.
  // z_index 2 keeps them behind gameplay (player/enemies at 5+) and in front of the background
  // (-20) and rear-wall silhouette layers, so they read as room architecture, not clutter.
  architectureSprites.slice(0, architectureAnchors.length).forEach((rel, i) => {
    const anchor = architectureAnchors[i]!;
    const x = Math.round(anchor.x);
    const nativeHeight = 112;
    const architectureScale = anchor.role === 'focal_frame' ? 1.35 : 1.15;
    const y = Math.round(floorTop - (nativeHeight * architectureScale) / 2 + 6);
    scene += `[node name="Architecture_${i}" type="Sprite2D" parent="."]
z_index = 2
texture_filter = 0
position = Vector2(${x}, ${y})
scale = Vector2(${architectureScale}, ${architectureScale})
texture = ExtResource("31_arch_${i}")
centered = true

`;
    void rel;
  });

  scene += floorSection.nodes;
  scene += platformSection.nodes;
  scene += shellSection.nodes;
  for(const [i,flight] of (options.stairFlights??[]).entries()){
    const a=flight.from,b=flight.to,t=flight.thickness;
    scene+=`\n[node name="StairFlight_${i}" type="StaticBody2D" parent="."]\n\n[node name="CollisionPolygon2D" type="CollisionPolygon2D" parent="StairFlight_${i}"]\npolygon = PackedVector2Array(${a.x}, ${a.y}, ${b.x}, ${b.y}, ${b.x}, ${b.y+t}, ${a.x}, ${a.y+t})\n\n[node name="StoneFlight" type="Node2D" parent="StairFlight_${i}"]\nz_index = 2\nscript = ExtResource("32_stair")\nstart = Vector2(${a.x}, ${a.y})\nfinish = Vector2(${b.x}, ${b.y})\nthickness = ${t}\n`;
  }

  if (weakFloors.length > 0) {
    const wf = weakFloors[0]!;
    scene += `
[node name="WeakFloor_${wf.targetRoomId}" parent="." instance=ExtResource("11_weakfloor")]
position = Vector2(${wf.x}, ${floorTop})
floor_width = ${wf.width}
target_room_id = "${wf.targetRoomId}"

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
    for (const wz of waterZones) {
      scene += `
[node name="WaterZone_${wz.targetRoomId}" parent="." instance=ExtResource("13_water")]
position = Vector2(${wz.x}, ${wz.y})
zone_width = ${wz.width}
zone_height = ${wz.height}

`;
    }
  }

  if (phaseBarriers.length > 0) {
    const pb = phaseBarriers[0]!;
    scene += `
[node name="PhaseBarrier_${pb.targetRoomId}" parent="." instance=ExtResource("14_phase")]
position = Vector2(${pb.x}, ${pb.y})

`;
  }

  // Only emitted placement roots carry authoring identity. Child sprites and fallback
  // coordinates without a unique saved placement must never become persistence targets.
  const authoredMetadata = (placement: Partial<EntityPlacement>): string => {
    if (!placement.kind || !placement.id ||
        placements.filter((p) => p.kind === placement.kind && p.id === placement.id).length !== 1) {
      return '';
    }
    return `metadata/metroforge_room_id = ${JSON.stringify(roomId)}\n` +
      `metadata/metroforge_entity_kind = ${JSON.stringify(placement.kind)}\n` +
      `metadata/metroforge_entity_id = ${JSON.stringify(placement.id)}\n`;
  };

  const playerPos = findPlacement(placements, 'player_spawn') ?? { x: 100, y: floorTop };
  scene += `[node name="Player" parent="." instance=ExtResource("1_player")]
position = Vector2(${playerPos.x}, ${playerPos.y})
${authoredMetadata(playerPos)}`;

  if (options.hasEnemy && !options.isBossRoom) {
    const authoredEnemies = placements.filter((p) => p.kind === 'enemy');
    const enemies = authoredEnemies.length ? authoredEnemies : [{ kind: 'enemy' as const, id: `enemy_${options.enemyIndex.toString().padStart(3, '0')}`, x: platformWidth - 150, y: floorTop }];
    for (const [enemyIndex, enemyPos] of enemies.entries()) {
    const enemyId = enemyPos.definitionId ?? enemyPos.id;
    const nodeName = enemyIndex === 0 ? 'Enemy' : `Enemy_${enemyIndex}`;
    scene += `
[node name="${nodeName}" parent="." instance=ExtResource("2_enemy")]
position = Vector2(${enemyPos.x}, ${enemyPos.y})
${authoredMetadata(enemyPos)}enemy_id = "${enemyId}"

[node name="Sprite" parent="${nodeName}"]
sheet_path = "assets/enemies/${enemyId}_walk.png"
run_sheet_path = "assets/enemies/${enemyId}_run.png"
frame_size = Vector2i(64, 64)
frame_count = 4
hurt_sheet_path = "assets/enemies/${enemyId}_hurt.png"
death_sheet_path = "assets/enemies/${enemyId}_death.png"
attack_sheet_path = "assets/enemies/${enemyId}_attack.png"
`;
    }
  }

  if (options.isBossRoom) {
    const bossId = options.bossId;
    const isFinalBoss = bossId === 'boss_final' || bossId.includes('final');
    const bossFrame = 160;
    // Every Stormglass guardian now uses the same authored 160px production standard as the
    // final Abbot. Non-final guardians clear the final-only special attacks but keep full-size
    // walk, attack, hurt, death and prefixed idle sheets.
    const bossExtraAnimations = isFinalBoss ? '' : 'extra_animation_sheets = {}\n';
    const bossPos =
      findPlacement(placements, 'boss', bossId) ??
      findPlacement(placements, 'boss') ?? { x: platformWidth / 2, y: floorTop };
    scene += `
[node name="Boss" parent="." instance=ExtResource("3_boss")]
position = Vector2(${bossPos.x}, ${bossPos.y})
${authoredMetadata(bossPos)}boss_id = "${bossId}"

[node name="Sprite" parent="Boss"]
sheet_path = "assets/bosses/${bossId}_walk.png"
run_sheet_path = "assets/bosses/${bossId}_run.png"
frame_size = Vector2i(${bossFrame}, ${bossFrame})
frame_count = 3
${bossExtraAnimations}hurt_sheet_path = "assets/bosses/${bossId}_hurt.png"
death_sheet_path = "assets/bosses/${bossId}_death.png"
attack_sheet_path = "assets/bosses/${bossId}_attack.png"
`;
  }

  if (options.abilityPickups.length > 0) {
    for (let pi = 0; pi < options.abilityPickups.length; pi++) {
      const abilityId = options.abilityPickups[pi]!;
      // Keep pickups off the room center: up/down transitions and water volumes
      // are placed at platformWidth/2, and a center pickup overlaps those sensors.
      const pickupPos =
        findPlacement(placements, 'ability_pickup', abilityId) ?? {
          x: 220 + pi * 40,
          y: floorTop - 28,
        };
      scene += `
[node name="AbilityPickup_${abilityId}" parent="." instance=ExtResource("4_pickup")]
position = Vector2(${pickupPos.x}, ${pickupPos.y})
${authoredMetadata(pickupPos)}ability_id = "${abilityId}"
display_name = "${abilityId}"
`;
    }
  }

  if (options.hasSavePoint) {
    const savePos =
      findPlacement(placements, 'checkpoint') ?? { x: 150, y: floorTop };
    scene += `
[node name="SavePoint" parent="." instance=ExtResource("8_savepoint")]
position = Vector2(${savePos.x}, ${savePos.y})
${authoredMetadata(savePos)}`;
  }

  options.npcs.forEach((npc, npcIdx) => {
    const npcPos =
      findPlacement(placements, 'npc', npc.id) ?? {
        x: platformWidth * 0.75 - npcIdx * 60,
        y: floorTop,
      };
    scene += `
[node name="NPC_${npcIdx}" parent="." instance=ExtResource("9_npc")]
position = Vector2(${npcPos.x}, ${npcPos.y})
${authoredMetadata(npcPos)}npc_id = "${npc.definitionId ?? npc.id}"
npc_name = "${npc.name.replace(/"/g, '\\"')}"
role = "${npc.role}"${npc.questIds.length > 0 ? `\nquest_ids = PackedStringArray(${npc.questIds.map((q) => `"${q}"`).join(', ')})` : ''}${npc.shopId ? `\nshop_id = "${npc.shopId}"` : ''}

[node name="Sprite" parent="NPC_${npcIdx}"]
sheet_path = "assets/npcs/${npc.definitionId ?? npc.id}_walk.png"
extra_animation_sheets = {
"idle": "assets/npcs/${npc.definitionId ?? npc.id}_idle.png",
"talk": "assets/npcs/${npc.definitionId ?? npc.id}_talk.png",
"listen": "assets/npcs/${npc.definitionId ?? npc.id}_listen.png"
}
frame_size = Vector2i(64, 64)
frame_count = 4
`;
  });

  if (options.hasItemPickup) {
    const itemPos =
      findPlacement(placements, 'item_pickup', options.itemId) ??
      findPlacement(placements, 'item_pickup') ?? {
        x: platformWidth * 0.5 + 100,
        y: floorTop - 12,
      };
    scene += `
[node name="ItemPickup" parent="." instance=ExtResource("10_item")]
position = Vector2(${itemPos.x}, ${itemPos.y})
${authoredMetadata(itemPos)}item_id = "${options.itemId}"
amount = ${options.itemAmount}
`;
  }

  const directionSlot: Record<string, number> = {};
  for (const conn of options.connections) {
    const spawnSide = spawnSideForEntry(conn.direction);
    const slot = directionSlot[conn.direction] ?? 0;
    directionSlot[conn.direction] = slot + 1;
    let x = 0;
    let y = floorY - 80;
    switch (conn.direction) {
      case 'up':
        x = platformWidth / 2 - 12 + slot * 48;
        y = options.stormglassRoomTheme === 'stairwell' ? 32 : floorY - 80;
        break;
      case 'down':
        // Always below the walk line so falling into a pit or weak floor can hit the
        // sensor, and walkers crossing the room cannot. Intended vertical exits are
        // falls, not mid-hall teleports.
        x = platformWidth / 2 - 12 + slot * 48;
        y = floorY + 96;
        break;
      case 'right':
        // Keep the sensor inside the room shell. At the old edge position its
        // active 24px strip sat beyond the wall collider, so grounded players
        // stopped before Area2D overlap could begin.
        x = platformWidth - 72 - slot * 48;
        // RoomTransition's 80px sensor begins at the node origin. Extend it 16px
        // through the floor line so a grounded CharacterBody overlaps it rather
        // than merely touching its bottom edge (Godot does not count that as an
        // Area2D overlap).
        y = floorY - 64;
        break;
      case 'left':
        x = 48 + slot * 48;
        y = floorY - 64;
        break;
    }
    const spatialPort=options.spatialPorts?.find(port=>port.direction===conn.direction&&port.targetRoomId===conn.targetRoomId);
    if(spatialPort){x=spatialPort.x;y=spatialPort.y;}
    scene += `
[node name="Transition_${conn.direction}_${conn.targetRoomId}" parent="." instance=ExtResource("5_transition")]
position = Vector2(${x}, ${y})
${spatialPort?`metadata/metroforge_spatial_port = true\nmetadata/metroforge_port_floor_y = ${spatialPort.floorY}\n`:''}target_room_id = "${conn.targetRoomId}"
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
  /** Explicitly replace combat placements while preserving other authored entities. */
  regenerateEncounterRoomIds?: string[];
  visualKit?: 'foundry';
  authoredParallax?: boolean;
  roomOverrides?: Record<
    string,
    Partial<
      Pick<
        RoomAssemblyOptions,
        'hasEnemy' | 'width' | 'height' | 'tileCells' | 'visualKit' | 'authoredParallax' | 'entityPlacements'
      >
    >
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
  const textureExists = (rel: string) => existsSync(join(input.outputDir, ...rel.split(/[\\/]/)));

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
  const visualKit =
    input.visualKit ?? (projectUsesFoundryVisualKit(input.outputDir) ? 'foundry' : undefined);
  const authoredParallax = input.authoredParallax === true;
  for (let i = 0; i < roomIds.length; i++) {
    const roomId = roomIds[i]!;
    if (!targets.has(roomId)) continue;
    try {
      const override = input.roomOverrides?.[roomId];
      const existingRecord = roomsData[roomId] as PublishedRoomRecord | undefined;
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
        {
          ...override,
          // Recompiling doors or paint must not reset Studio-authored room bounds.
          hasEnemy: override?.hasEnemy ?? existingRecord?.forceEnemy,
          width: override?.width ?? existingRecord?.width,
          height: override?.height ?? existingRecord?.height,
          visualKit: override?.visualKit ?? visualKit,
          authoredParallax: override?.authoredParallax ?? authoredParallax,
        },
      );
      const storedPaint = roomsData[roomId];
      const authoredCells = override?.tileCells ?? (storedPaint?.tileCellsAuthored ? storedPaint.tileCells : undefined);
      if (authoredCells !== undefined) {
        // A new paint override invalidates generated geometry. A stored authored
        // record may also own explicit collision surfaces (Stormglass/undo): keep
        // those on ordinary recompilation so restoring tiles restores traversal.
        opts.castleRegionPlan = override?.tileCells !== undefined ? undefined : storedPaint?.castleRegionPlan;
        opts.tileCells = authoredCells;
        opts.tileCellsAuthored = true;
        const generatedPlatforms=opts.platforms;
        opts.platforms = override?.tileCells !== undefined ? [] : storedPaint?.platforms ?? [];
        // Preserve painted/user-owned landings without mixing them with a newer
        // incompatible flight layout. Fresh generation owns the complete stair plan.
        if(opts.stairFlights?.length&&JSON.stringify(opts.platforms)!==JSON.stringify(generatedPlatforms))opts.stairFlights=undefined;
        opts.pits = override?.tileCells !== undefined ? [] : storedPaint?.pits ?? [];
        // Empty authored paint previously restored a solid floor over the gallery's
        // mandatory descent. Re-derive these graph-owned ports after saved geometry.
        if (input.gameDna.identity?.title?.startsWith('Stormglass Reliquary') && input.gameDna.archetype === 'SIDE_VIEW_METROIDVANIA') {
          const doorPits = stormglassGalleryDescentPits(opts.width, opts.tileSize, opts.connections, ctx.worldGraphNodesById.get(roomId)?.metadata?.stormglassRoomTheme,opts.spatialPorts?.length?roomId:undefined);
          opts.pits = [...opts.pits, ...doorPits.filter(pit => !opts.pits!.some(saved => saved.x <= pit.x && saved.x + saved.width >= pit.x + pit.width))];
          const floorRow = Math.floor(opts.height / opts.tileSize) - 2;
          opts.tileCells = opts.tileCells.filter(cell => cell.y < floorRow || !doorPits.some(pit => cell.x * opts.tileSize >= pit.x && cell.x * opts.tileSize < pit.x + pit.width));
        }
      }
      // Saved NPC membership is authored state, including an intentionally empty room.
      if (existingRecord?.npcs !== undefined) {
        const authored = override?.entityPlacements ?? existingRecord.entityPlacements ?? [];
        opts.npcs = existingRecord.npcs.map((id) => {
          const definitionId = authored.find((p) => p.kind === 'npc' && p.id === id)?.definitionId ?? id;
          const definition = input.gameContent?.npcs.find((npc) => npc.id === definitionId);
          if (!definition) throw new Error(`NPC definition ${definitionId} not found for ${id}`);
          return { id, definitionId, name: definition.name, role: definition.role, questIds: definition.questIds, shopId: definition.shopId };
        });
      }
      if (override?.entityPlacements?.length) {
        opts.entityPlacements = override.entityPlacements;
      } else if (existingRecord?.entityPlacements?.length) {
        // Preserve studio-authored coordinates across geometry-only recompiles.
        opts.entityPlacements = existingRecord.entityPlacements;
      } else {
        opts.entityPlacements = defaultEntityPlacements({
          width: opts.width,
          height: opts.height,
          tileSize: opts.tileSize,
          hasEnemy: opts.hasEnemy,
          enemyIndex: opts.enemyIndex,
          isBossRoom: opts.isBossRoom,
          bossId: opts.bossId,
          abilityPickups: opts.abilityPickups,
          hasSavePoint: opts.hasSavePoint,
          npcs: opts.npcs,
          hasItemPickup: opts.hasItemPickup,
          itemId: opts.itemId,
        });
      }
      if (input.gameDna.identity.title.startsWith('Stormglass Reliquary') && !opts.isBossRoom &&
          (opts.worldGraphArchetype === 'combat' || opts.worldGraphArchetype === 'traversal')) {
        applyStormglassEncounterComposition(roomId, i, opts, input.gameContent?.enemies ?? []);
      }
      if (input.regenerateEncounterRoomIds?.includes(roomId)) {
        const combat = defaultEntityPlacements({
          width: opts.width, height: opts.height, tileSize: opts.tileSize,
          hasEnemy: opts.hasEnemy, enemyIndex: opts.enemyIndex,
          isBossRoom: opts.isBossRoom, bossId: opts.bossId,
        }).filter((p) => p.kind === 'enemy' || p.kind === 'boss');
        opts.entityPlacements = [
          ...(opts.entityPlacements ?? []).filter((p) => p.kind !== 'enemy' && p.kind !== 'boss'),
          ...combat,
        ];
      }
      const scene = generateRoomScene(roomId, i, opts);
      writeFileSync(join(roomsDir, `${roomId}.tscn`), scene);
      roomsData[roomId] = buildPublishedRoomRecord(roomId, i, opts);
      const enemyPresence = override?.hasEnemy ?? existingRecord?.forceEnemy;
      if (enemyPresence !== undefined) roomsData[roomId]!.forceEnemy = enemyPresence;
      recompiled.push(roomId);
    } catch (err) {
      errors.push(`${roomId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  mkdirSync(join(input.outputDir, 'data', 'rooms'), { recursive: true });
  writeFileSync(roomsJsonPath, JSON.stringify({ rooms: roomsData }, null, 2));

  return { success: errors.length === 0, recompiled, errors };
}
