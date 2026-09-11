import type { GraphEdge, GraphNode, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import { generateId, isRegisteredAbilityId, type GenerationProfile } from '@metroforge/shared';
import { generateWorldTopology, type WorldGenResult } from './world.js';
import { abilityGateRoomIndex } from './room-archetypes.js';
import { buildProgressionProof, type ProgressionProof } from './progression-proof.js';
import {
  DEFAULT_MOVEMENT_STATS,
  DEFAULT_ROOM_LAYOUT,
  validateMovementFeasibility,
  type MovementStats,
  type RoomLayoutDefaults,
} from './movement-feasibility.js';

/**
 * Metroidvania world-design validation
 * -------------------------------------
 * Extends the existing procedural layer (world.ts's connectivity/reachability checks,
 * progression-proof.ts's self-lock/victory-route proof, movement-feasibility.ts's ability-reach
 * math) with the structural checks a Metroidvania specifically needs and that a linear-sequence
 * "reaches the victory room" bot does not exercise: multiple themed zones, room coordinates and
 * spatial consistency, distinct gate *kinds* (movement ability vs. a combat/key gate), return
 * loops back to earlier zones, teaching rooms, and visible-but-locked rewards.
 *
 * Deliberately reuses rather than duplicates: `generateFullMetroidvaniaWorld` calls the existing
 * `generateWorldTopology` for the base graph and only *adds* zone/shortcut/tease/teaching
 * structure on top; `validateWorldDesign` calls the existing `buildProgressionProof` for
 * self-lock/victory-route/movement-feasibility rather than re-implementing them.
 *
 * Scope: this module only applies where the caller explicitly asks for full-world checks
 * (`biomeCount >= MIN_FULL_WORLD_ZONES`). A VISUAL_VERTICAL_SLICE or TINY_TEST world (1-3 biomes)
 * is not expected to pass these checks and `evaluateFullWorldApplicability` says so explicitly
 * rather than silently reporting a pass on a world that was never meant to have four zones.
 */

export const MIN_FULL_WORLD_ZONES = 4;

/** The one ability with real runtime support for destroying a wall/floor rather than merely
 *  crossing a gap (see templates/godot-metroidvania/scripts/player/abilities/GroundSlamAbility.gd
 *  and room-assembler.ts's deriveWeakFloors, which only ever fires on ground_slam+down). A
 *  'breakable' edge kind that named any other ability would be modeling a wall the runtime has no
 *  way to actually destroy. */
export const BREAKABLE_WALL_ABILITY = 'ground_slam';

export interface ZoneTheme {
  id: string;
  name: string;
  hazards: string[];
  enemyArchetypes: string[];
}

/**
 * World-design-report theme flavor only — independent of, and not claimed to drive, the actual
 * visual asset biome rotation in packages/assets. Aesthetic quality is a visual-review concern
 * (see the Foundry visual-slice review packets); this metadata exists so the generation report
 * can describe zone *identity* (name/hazards/enemies) without pretending that description proves
 * anything about how the zone actually looks once rendered.
 */
export const DEFAULT_ZONE_THEMES: readonly ZoneTheme[] = [
  { id: 'ashen_foundry', name: 'Ashen Foundry', hazards: ['furnace_vents', 'molten_slag'], enemyArchetypes: ['forge_wraith', 'slag_hound'] },
  { id: 'flooded_utility', name: 'Flooded Utility Deck', hazards: ['deep_water', 'electrified_grating'], enemyArchetypes: ['eel_drone', 'bilge_crawler'] },
  { id: 'overgrown_reactor', name: 'Overgrown Reactor Core', hazards: ['radiation_spores', 'thorn_vines'], enemyArchetypes: ['spore_stalker', 'vine_turret'] },
  { id: 'shattered_archive', name: 'Shattered Archive', hazards: ['unstable_floor', 'static_discharge'], enemyArchetypes: ['archive_wisp', 'index_golem'] },
  { id: 'frozen_causeway', name: 'Frozen Causeway', hazards: ['thin_ice', 'wind_shear'], enemyArchetypes: ['frost_sentry', 'gale_wisp'] },
  { id: 'sunken_reliquary', name: 'Sunken Reliquary', hazards: ['crushing_depth', 'silt_traps'], enemyArchetypes: ['reliquary_diver', 'silt_lurker'] },
] as const;

export interface FullWorldOptions {
  seed: number;
  roomCount: number;
  /** Must be >= MIN_FULL_WORLD_ZONES for this module's checks to apply meaningfully. */
  biomeCount: number;
  /** Movement ability ids (subset of @metroforge/shared REGISTERED_ABILITY_IDS). */
  abilities: string[];
  bossCount: number;
  profile?: GenerationProfile;
  /** Item id granted by defeating a zone miniboss, gating a later junction — the "combat gate"
   *  type, distinct from a movement-ability gate (see requiredGateTypes on the returned graph's
   *  design metadata). Defaults to 'item_reactor_key' if omitted. */
  combatKeyItemId?: string;
}

/** A conservative, fast, asset-light configuration for exercising this module's checks against a
 *  real generation (procedural layer, and — separately, see scripts/smoke-world-design.mjs — a
 *  real Godot project). Uses profile 'SMALL' for its light enemy/boss/NPC budgets (this is a
 *  topology/progression test, not an asset-generation stress test) with roomCount/biomeCount
 *  overridden up to MIN_FULL_WORLD_ZONES zones. See GenerationPipeline.run()'s `worldOverride`
 *  option, which is the only pipeline plumbing this adds — profile-keyed gates
 *  (assertMassVisualGenerationAllowed, isMassVisualProfile) are untouched because they read
 *  `profile` ('SMALL' here), never roomCount/biomeCount. */
export const FULL_WORLD_TEST_CONFIG: Omit<FullWorldOptions, 'seed'> = {
  roomCount: 40,
  biomeCount: MIN_FULL_WORLD_ZONES,
  abilities: ['dash', 'wall_jump', 'grapple', 'ground_slam'],
  bossCount: MIN_FULL_WORLD_ZONES,
  profile: 'SMALL',
  combatKeyItemId: 'item_reactor_key',
};

/** Bounded, documented set of deterministic seeds run through topology/progression validation
 *  (see world-design.test.ts's seed-sweep test). Not randomized and not expanded silently —
 *  adding a seed here is a deliberate test-coverage decision, not a knob tests reach for at run
 *  time. */
export const FULL_WORLD_TEST_SEEDS: readonly number[] = [
  700001, 700002, 700003, 700004, 700005, 700006, 700007, 700008,
];

export interface FullWorldResult extends WorldGenResult {
  zones: ZoneTheme[];
  /** Room id -> zone index, for callers that need it without re-deriving from biomeIndex. */
  zoneOfRoom: Map<string, number>;
}

function zoneIndexForRoom(node: GraphNode, biomeCount: number): number {
  const raw = node.metadata?.biomeIndex;
  const n = typeof raw === 'number' ? raw : 0;
  return Math.max(0, Math.min(biomeCount - 1, n));
}

function findEdge(edges: GraphEdge[], from: string, to: string): GraphEdge | undefined {
  return edges.find((e) => (e.from === from && e.to === to) || (e.bidirectional && e.from === to && e.to === from));
}

/**
 * Builds on generateWorldTopology's base graph with the structure a *full* Metroidvania world
 * needs and a single linear-spine 8-15-room slice does not: explicit zone theming, a combat
 * (key-item) gate distinct from the movement-ability gates the base generator already produces,
 * a return shortcut and a breakable-wall connection linking a later zone back to an earlier one,
 * a genuine one-way drop, teaching-room tags on the room immediately after each ability gate, and
 * visible-but-locked "tease" tags one room before an ability-gated reward.
 */
export function generateFullMetroidvaniaWorld(options: FullWorldOptions): FullWorldResult {
  if (options.biomeCount < MIN_FULL_WORLD_ZONES) {
    throw new Error(
      `generateFullMetroidvaniaWorld requires biomeCount >= ${MIN_FULL_WORLD_ZONES} (got ${options.biomeCount}); use generateWorldTopology directly for smaller slices — this function is not meant to force a small world into a four-zone shape.`,
    );
  }
  const base = generateWorldTopology({
    seed: options.seed,
    roomCount: options.roomCount,
    biomeCount: options.biomeCount,
    abilities: options.abilities,
    bossCount: options.bossCount,
    profile: options.profile,
  });

  const zones = DEFAULT_ZONE_THEMES.slice(0, options.biomeCount);
  if (zones.length < options.biomeCount) {
    // More biomes than named themes — extend deterministically rather than throwing, but this
    // is a real coverage gap worth surfacing rather than silently cycling names.
    for (let i = zones.length; i < options.biomeCount; i++) {
      (zones as ZoneTheme[]).push({ id: `zone_${i}`, name: `Zone ${i}`, hazards: [], enemyArchetypes: [] });
    }
  }

  const nodes = base.worldGraph.nodes.map((n) => ({ ...n, metadata: { ...n.metadata } }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const roomIds = base.roomIds;
  const zoneOfRoom = new Map<string, number>();
  const roomsByZone: string[][] = zones.map(() => []);
  for (const id of roomIds) {
    const node = nodeById.get(id)!;
    const zi = zoneIndexForRoom(node, options.biomeCount);
    zoneOfRoom.set(id, zi);
    roomsByZone[zi]!.push(id);
    const theme = zones[zi]!;
    node.metadata.theme = theme.name;
    node.metadata.zoneId = theme.id;
    node.metadata.zoneIndex = zi;
  }

  const edges = base.worldGraph.edges.map((e) => ({ ...e, metadata: { ...e.metadata } }));

  // Zone-crossing edges get transition metadata so the report/validator can point at an
  // "organic boundary" candidate without claiming the metadata alone proves the transition reads
  // well visually — that judgment stays a human visual-review concern (see requirement 1's own
  // wording, echoed in the report generator below).
  for (const edge of edges) {
    const fromZone = zoneOfRoom.get(edge.from);
    const toZone = zoneOfRoom.get(edge.to);
    if (fromZone === undefined || toZone === undefined || fromZone === toZone) continue;
    const a = zones[fromZone]!;
    const b = zones[toZone]!;
    edge.metadata.zoneTransition = true;
    edge.metadata.transitionMotif = `${a.name} giving way to ${b.name} — blend ${a.hazards[0] ?? a.id} with ${b.hazards[0] ?? b.id}, do not hard-cut the palette`;
  }

  // --- Teaching room: tag the room immediately after each ability gate as the room meant to
  // exercise that ability safely before anything harder — reuses abilityGateRoomIndex, the exact
  // formula the base generator already used to place the gate itself, so this never drifts from
  // where the real gate/pickup ended up. Computed *before* the zone-miniboss placement just below
  // so that placement can steer clear of a teaching room rather than colliding with one — found
  // empirically (validateWorldDesign's own `unsafe_teaching_room` check) that the first ability's
  // gate-post room can land exactly on a zone boundary, which is also where a zone's miniboss
  // arena was being placed, silently turning a "safe room to try dashing" into a boss fight. -----
  const teachingRoomIds = new Set<string>();
  options.abilities.forEach((ability, ai) => {
    const gateIdx = abilityGateRoomIndex(ai, options.abilities.length, roomIds.length);
    const postIdx = Math.min(gateIdx + 1, roomIds.length - 1);
    const postId = roomIds[postIdx]!;
    const postNode = nodeById.get(postId);
    if (postNode) {
      postNode.metadata.teachesAbility = ability;
      teachingRoomIds.add(postId);
    }
  });

  // --- Designated rooms: per-zone save room, fast-travel room, zone miniboss/arena -----------
  for (let zi = 0; zi < zones.length; zi++) {
    const roomsInZone = roomsByZone[zi]!;
    if (roomsInZone.length === 0) continue;

    // Save room: assignRoomArchetypes already tags 'save' every 7th interior room for non-VVS
    // profiles, but that's incidental — top up deterministically so every zone has at least one,
    // rather than relying on the modulo heuristic to land inside this zone's index range.
    const hasSave = roomsInZone.some((id) => nodeById.get(id)?.metadata?.archetype === 'save');
    if (!hasSave) {
      const target = roomsInZone[Math.floor(roomsInZone.length / 2)]!;
      nodeById.get(target)!.metadata.archetype = 'save';
    }

    // Fast-travel room: the first room of each zone after zone 0 (zone 0's "fast travel" point is
    // the world start itself). This is a graph-level designation for world-design validation only
    // — it does not by itself wire an in-game fast-travel menu/teleport action; see this module's
    // header and the final report's limitations section.
    if (zi > 0) {
      nodeById.get(roomsInZone[0]!)!.metadata.fastTravel = true;
    }

    // Zone miniboss/arena: the last room in every zone except the final one (which keeps the
    // base generator's single true final boss in the very last room overall) becomes that zone's
    // miniboss arena, and grants the combat-gate key item on defeat if this is zone 1 (see the
    // combat-gate wiring below — only one key item is introduced, not one per zone, to keep the
    // "distinct gate kinds" story legible rather than diluted across every junction).
    if (zi < zones.length - 1) {
      // Walk backward from the zone's last room to find one that isn't also a teaching room —
      // see the teachingRoomIds comment above for why this collision is worth avoiding rather
      // than just accepting a miniboss fight as a new ability's "safe" first exercise.
      let arenaRoomId = roomsInZone[roomsInZone.length - 1]!;
      for (let ri = roomsInZone.length - 1; ri >= 0; ri--) {
        if (!teachingRoomIds.has(roomsInZone[ri]!)) {
          arenaRoomId = roomsInZone[ri]!;
          break;
        }
      }
      const arenaNode = nodeById.get(arenaRoomId)!;
      if (arenaNode.metadata.archetype !== 'boss') {
        arenaNode.metadata.archetype = 'miniboss';
      }
      arenaNode.metadata.bossArena = true;
      arenaNode.metadata.zoneBossOf = zones[zi]!.id;
    }
  }

  // --- Combat gate: a key item from zone 1's miniboss gates a junction into zone 3 ------------
  const combatKeyItemId = options.combatKeyItemId ?? 'item_reactor_key';
  if (zones.length >= 4 && roomsByZone[1]!.length > 0 && roomsByZone[3]!.length > 1) {
    const keyRoomId = roomsByZone[1]![roomsByZone[1]!.length - 1]!;
    const keyNode = nodeById.get(keyRoomId)!;
    // Reuses the existing `grantsAbilities` convention rather than a parallel `grantsItems`
    // field — the real codebase already overloads this field for non-ability unlock tokens (see
    // packages/procedural/src/topdown/world.ts, which grants dungeon-item ids through the exact
    // same field), and every existing reachability function (validateWorldReachability,
    // buildProgressionProof's grantsAt) already reads it. A separate `grantsItems` field would be
    // invisible to all of that reused machinery instead of extending it.
    const existingGrants = Array.isArray(keyNode.metadata.grantsAbilities) ? (keyNode.metadata.grantsAbilities as string[]) : [];
    keyNode.metadata.grantsAbilities = [...existingGrants, combatKeyItemId];

    const gateFromId = roomsByZone[3]![0]!;
    const gateToId = roomsByZone[3]![1]!;
    const existing = findEdge(edges, gateFromId, gateToId);
    if (existing) {
      existing.requirements = [...new Set([...existing.requirements, combatKeyItemId])];
      existing.kind = existing.kind === 'normal' ? 'normal' : existing.kind;
      (existing.metadata ??= {}).gateType = 'combat';
    } else {
      edges.push({
        id: generateId('edge'),
        from: gateFromId,
        to: gateToId,
        requirements: [combatKeyItemId],
        optional: false,
        bidirectional: true,
        kind: 'normal',
        metadata: { gateType: 'combat' },
      });
    }
  }

  // --- Return structure: a shortcut and (if ground_slam is in this world) a breakable wall,
  // both linking a late zone back toward zone 0 ------------------------------------------------
  const lastZoneIdx = zones.length - 1;
  if (roomsByZone[lastZoneIdx]!.length > 1 && roomsByZone[0]!.length > 1) {
    const fromId = roomsByZone[lastZoneIdx]![Math.floor(roomsByZone[lastZoneIdx]!.length / 2)]!;
    const toId = roomsByZone[0]![roomsByZone[0]!.length - 1]!;
    if (!findEdge(edges, fromId, toId)) {
      edges.push({
        id: generateId('edge'),
        from: fromId,
        to: toId,
        requirements: [],
        optional: true,
        bidirectional: true,
        kind: 'shortcut',
        metadata: { linksZone: zones[lastZoneIdx]!.id, backToZone: zones[0]!.id },
      });
    }
  }
  if (options.abilities.includes(BREAKABLE_WALL_ABILITY) && zones.length >= 3) {
    const zi = zones.length >= 3 ? 2 : lastZoneIdx;
    if (roomsByZone[zi]!.length > 0 && roomsByZone[0]!.length > 0) {
      const fromId = roomsByZone[zi]![0]!;
      const toId = roomsByZone[0]![0]!;
      if (!findEdge(edges, fromId, toId)) {
        edges.push({
          id: generateId('edge'),
          from: fromId,
          to: toId,
          requirements: [BREAKABLE_WALL_ABILITY],
          optional: true,
          bidirectional: true,
          kind: 'breakable',
          transition: 'down',
          metadata: { linksZone: zones[zi]!.id, backToZone: zones[0]!.id },
        });
      }
    }
  }

  // --- One genuine one-way drop, kept safe: its destination always keeps at least one other
  // outgoing edge, so a validator can prove it never strands the player without special-casing
  // "the drop room happens to also be a hub." The first consecutive-room pair in a zone is not
  // always free — a movement-ability gate placed by generateWorldTopology can legitimately land
  // on that exact edge (abilityGateRoomIndex has no knowledge of this pass) — so scan every
  // consecutive pair in every non-starting zone for the first zero-requirement bidirectional
  // edge rather than silently giving up on the first candidate. -----------------------------------
  outer: for (let zi = 1; zi < zones.length; zi++) {
    const roomsInZone = roomsByZone[zi]!;
    for (let i = 0; i < roomsInZone.length - 1; i++) {
      const existing = findEdge(edges, roomsInZone[i]!, roomsInZone[i + 1]!);
      if (existing && existing.bidirectional && existing.requirements.length === 0) {
        existing.bidirectional = false;
        existing.kind = 'one_way';
        (existing.metadata ??= {}).oneWayReason = 'drop_ledge';
        break outer;
      }
    }
  }

  // --- Tease: one visible-but-locked room per zone, tagged on the room one step before it -----
  for (let zi = 0; zi < zones.length; zi++) {
    const roomsInZone = roomsByZone[zi]!;
    if (roomsInZone.length < 3) continue;
    const rewardIdx = roomsInZone.length - 2;
    const rewardId = roomsInZone[rewardIdx]!;
    const teaseFromId = roomsInZone[Math.max(0, rewardIdx - 1)]!;
    if (teaseFromId === rewardId) continue;
    const rewardNode = nodeById.get(rewardId)!;
    if (rewardNode.metadata.archetype !== 'treasure' && rewardNode.metadata.archetype !== 'secret') {
      rewardNode.metadata.archetype = 'treasure';
    }
    const gatingAbility = options.abilities[zi % Math.max(1, options.abilities.length)];
    const teaseNode = nodeById.get(teaseFromId)!;
    const existingTeases = Array.isArray(teaseNode.metadata.teases) ? (teaseNode.metadata.teases as unknown[]) : [];
    teaseNode.metadata.teases = [
      ...existingTeases,
      { targetRoomId: rewardId, previewOf: 'item', requiresAbility: gatingAbility },
    ];
  }

  const worldGraph: WorldGraph = { ...base.worldGraph, nodes, edges };
  return { worldGraph, progressionGraph: base.progressionGraph, roomIds, zones: [...zones], zoneOfRoom };
}

// ---------------------------------------------------------------------------------------------
// Room layout: coordinates + extents derived from the graph, not stored on it
// ---------------------------------------------------------------------------------------------

export interface RoomExtent {
  id: string;
  width: number;
  height: number;
}

export interface RoomPlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Derived display/report convenience — a coarse vertical band index, not a separate collision
   *  domain. Overlap checks below run over every room pair regardless of layer. */
  layer: number;
}

export interface LayoutIssue {
  kind: 'overlap' | 'incompatible_door' | 'unplaced';
  roomIds: string[];
  detail: string;
}

export interface WorldLayout {
  placements: Map<string, RoomPlacement>;
  issues: LayoutIssue[];
}

const LAYOUT_MARGIN_PX = 24;

/**
 * Assigns every room a concrete (x, y) position and extent purely from the graph's own edge
 * `transition` directions and each room's declared width/height — the schema itself carries no
 * coordinates (by design: layout is graph-topological, see this module's header), so this is a
 * *derivation*, run fresh from canonical data, not a value stored anywhere. A BFS from the start
 * room places each newly-visited room adjacent to whichever already-placed neighbor reached it
 * first, offset by both rooms' half-extents plus a fixed margin along the edge's transition axis
 * (defaulting to a rightward offset for untransitioned/spine edges, matching how the room
 * assembler treats an untagged edge as its default horizontal connection).
 *
 * Two classes of problems fall out of this purely mechanically, without any special-casing:
 * - `incompatible_door`: a room reached via two different edges/directions computes two
 *   different positions — the layout has no single consistent geometry that would build.
 * - `overlap`: two *different* rooms' final AABBs intersect by more than the margin — including
 *   rooms that were each individually placed consistently but collide with each other, which a
 *   pure graph-connectivity check (no coordinates at all) can never see.
 *
 * `optional`/`shortcut`/`breakable` edges are skipped when they'd conflict with an
 * already-placed room (they're extra connections, not the primary spatial relationship for
 * either endpoint) rather than treated as a hard overlap — the same real Metroidvania a shortcut
 * or breakable wall connects two rooms that are *not* adjacent in the primary layout, on purpose.
 */
export function deriveWorldLayout(graph: WorldGraph, extents: RoomExtent[]): WorldLayout {
  const extentById = new Map(extents.map((e) => [e.id, e]));
  const roomIds = graph.nodes.filter((n) => n.type === 'room' || n.type === 'zone').map((n) => n.id);
  const placements = new Map<string, RoomPlacement>();
  const issues: LayoutIssue[] = [];
  if (roomIds.length === 0) return { placements, issues };

  const extentOf = (id: string): { width: number; height: number } =>
    extentById.get(id) ?? { width: 800, height: 600 };

  // Excluded from primary placement: `kind: 'shortcut'` and any legacy-unlabeled `optional: true`
  // edge (world.ts's "Branching shortcuts for medium+ worlds" feature predates the `kind` field
  // and so is never tagged 'shortcut' even though it's the same kind of supplementary link) — a
  // shortcut is an *extra* connection between two rooms that already have their own primary
  // spatial position from the spine/gate/shaft/one-way/breakable edges; treating it as load-bearing
  // for layout placement produced spurious overlap/incompatible-door findings against a perfectly
  // fine layout (found empirically against generateFullMetroidvaniaWorld's own output).
  // `one_way` IS primary when it's not also a cross-zone return link — a plain one-way drop is
  // still how the room graph actually connects those two (adjacent) rooms, not a supplementary
  // extra like a shortcut; an earlier version of this filter excluded every non-'normal' kind and
  // silently truncated the whole BFS at the first one-way edge it met, misreporting everything
  // past it as `unplaced`. `breakable`/`shortcut` edges this module generates as an explicit
  // "link a later zone back to an earlier one" (tagged with `metadata.backToZone`) are excluded
  // the same way an ordinary shortcut is — they connect two rooms that are each already placed
  // via their own zone's primary spine, and are not the primary spatial relationship for either.
  const primaryEdges = graph.edges.filter(
    (e) => e.kind !== 'shortcut' && e.metadata?.backToZone === undefined && !(e.optional && e.kind === undefined),
  );
  const adjacency = new Map<string, Array<{ to: string; dir: 'left' | 'right' | 'up' | 'down' }>>();
  const addAdj = (from: string, to: string, dir: 'left' | 'right' | 'up' | 'down'): void => {
    const list = adjacency.get(from) ?? [];
    list.push({ to, dir });
    adjacency.set(from, list);
  };
  const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' } as const;
  for (const edge of primaryEdges) {
    const dir = edge.transition ?? 'right';
    addAdj(edge.from, edge.to, dir);
    if (edge.bidirectional) addAdj(edge.to, edge.from, opposite[dir]);
  }

  const startId = roomIds[0]!;
  const startExtent = extentOf(startId);
  placements.set(startId, { id: startId, x: 0, y: 0, width: startExtent.width, height: startExtent.height, layer: 0 });
  const visited = new Set<string>([startId]);
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentPlacement = placements.get(current)!;
    for (const { to, dir } of adjacency.get(current) ?? []) {
      const childExtent = extentOf(to);
      let x = currentPlacement.x;
      let y = currentPlacement.y;
      let layer = currentPlacement.layer;
      if (dir === 'right') x = currentPlacement.x + currentPlacement.width / 2 + LAYOUT_MARGIN_PX + childExtent.width / 2;
      else if (dir === 'left') x = currentPlacement.x - currentPlacement.width / 2 - LAYOUT_MARGIN_PX - childExtent.width / 2;
      else if (dir === 'up') {
        y = currentPlacement.y - currentPlacement.height / 2 - LAYOUT_MARGIN_PX - childExtent.height / 2;
        layer = currentPlacement.layer - 1;
      } else if (dir === 'down') {
        y = currentPlacement.y + currentPlacement.height / 2 + LAYOUT_MARGIN_PX + childExtent.height / 2;
        layer = currentPlacement.layer + 1;
      }

      const proposed: RoomPlacement = { id: to, x, y, width: childExtent.width, height: childExtent.height, layer };
      const already = placements.get(to);
      if (already) {
        const moved = Math.abs(already.x - x) > 1 || Math.abs(already.y - y) > 1;
        if (moved) {
          issues.push({
            kind: 'incompatible_door',
            roomIds: [current, to],
            detail: `${to} is reached from ${current} via '${dir}' at (${Math.round(x)},${Math.round(y)}), but was already placed at (${Math.round(already.x)},${Math.round(already.y)}) by another connection — the layout has no single consistent geometry.`,
          });
        }
        continue;
      }
      placements.set(to, proposed);
      visited.add(to);
      queue.push(to);
    }
  }

  for (const id of roomIds) {
    if (!visited.has(id)) {
      issues.push({ kind: 'unplaced', roomIds: [id], detail: `${id} has no primary (non-shortcut) path from the start room, so no coordinate could be derived for it.` });
    }
  }

  const placed = [...placements.values()];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const overlapX = Math.abs(a.x - b.x) * 2 < a.width + b.width - LAYOUT_MARGIN_PX;
      const overlapY = Math.abs(a.y - b.y) * 2 < a.height + b.height - LAYOUT_MARGIN_PX;
      if (overlapX && overlapY) {
        issues.push({
          kind: 'overlap',
          roomIds: [a.id, b.id],
          detail: `${a.id} and ${b.id} occupy overlapping space at their derived layout positions (${Math.round(a.x)},${Math.round(a.y)}) and (${Math.round(b.x)},${Math.round(b.y)}).`,
        });
      }
    }
  }

  return { placements, issues };
}

// ---------------------------------------------------------------------------------------------
// World-design validation
// ---------------------------------------------------------------------------------------------

export interface WorldDesignIssueBase {
  code: string;
  message: string;
  roomIds?: string[];
  gateEdgeId?: string;
  counterexamplePath?: string[];
}

export interface WorldDesignReport {
  seed: number;
  passed: boolean;
  applicable: boolean;
  applicabilityReason: string;
  issues: WorldDesignIssueBase[];
  zoneCount: number;
  gateTypeCounts: { movement: number; combat: number };
  shortcutCount: number;
  oneWayCount: number;
  breakableCount: number;
  teaseCount: number;
  teachingRoomCount: number;
  progressionProof: ProgressionProof;
  layout: { overlapCount: number; incompatibleDoorCount: number; unplacedCount: number };
}

export interface ValidateWorldDesignInput {
  worldGraph: WorldGraph;
  progressionGraph: ProgressionGraph;
  roomExtents: RoomExtent[];
  movementStats?: MovementStats;
  roomLayoutDefaults?: RoomLayoutDefaults;
}

/**
 * Whether the four-zone / return-loop / combat-gate / teaching-room / tease requirements in this
 * module apply at all. A VISUAL_VERTICAL_SLICE or TINY_TEST world is explicitly not required to
 * satisfy them — see this module's header and the task that introduced it, which is explicit that
 * a small slice must not be forced into a four-zone shape. Callers (the QA gate, the report
 * generator) must check this before treating a low zone count as a failure.
 */
export function evaluateFullWorldApplicability(worldGraph: WorldGraph): { applicable: boolean; reason: string } {
  const zoneCount = worldGraph.regions.length;
  if (zoneCount < MIN_FULL_WORLD_ZONES) {
    return {
      applicable: false,
      reason: `${zoneCount} zone(s) declared — full-world Metroidvania design checks (>= ${MIN_FULL_WORLD_ZONES} zones) do not apply to this generation; this is expected for VISUAL_VERTICAL_SLICE/TINY_TEST/small SMALL-profile worlds and is not itself a defect.`,
    };
  }
  return { applicable: true, reason: `${zoneCount} zones declared — full-world checks apply.` };
}

function roomNode(graph: WorldGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

function unlockedTokensReachability(
  graph: WorldGraph,
  startId: string,
): { visited: Set<string>; unlocked: Set<string> } {
  const adjacency = new Map<string, Array<{ to: string; requirements: string[] }>>();
  const add = (from: string, to: string, requirements: string[]): void => {
    const list = adjacency.get(from) ?? [];
    list.push({ to, requirements });
    adjacency.set(from, list);
  };
  for (const edge of graph.edges) {
    add(edge.from, edge.to, edge.requirements);
    if (edge.bidirectional) add(edge.to, edge.from, edge.requirements);
  }
  const grantTokens = (roomId: string, unlocked: Set<string>): void => {
    const node = roomNode(graph, roomId);
    const abilities = node?.metadata?.grantsAbilities;
    if (Array.isArray(abilities)) for (const a of abilities) if (typeof a === 'string') unlocked.add(a);
  };
  const unlocked = new Set<string>();
  const visited = new Set<string>([startId]);
  grantTokens(startId, unlocked);
  let changed = true;
  while (changed) {
    changed = false;
    for (const roomId of [...visited]) {
      for (const { to, requirements } of adjacency.get(roomId) ?? []) {
        if (visited.has(to)) continue;
        if (!requirements.every((r) => unlocked.has(r))) continue;
        visited.add(to);
        grantTokens(to, unlocked);
        changed = true;
      }
    }
  }
  return { visited, unlocked };
}

/** Undirected adjacency ignoring every requirement — used only for the "does an alternate,
 *  ungated route exist around this mandatory gate" bypass check and the one-way-strand check,
 *  both of which are about raw connectivity, not ability state. */
function undirectedAdjacencyExcludingEdge(graph: WorldGraph, excludeEdgeId: string): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const add = (from: string, to: string): void => {
    const list = adjacency.get(from) ?? [];
    list.push(to);
    adjacency.set(from, list);
  };
  for (const edge of graph.edges) {
    if (edge.id === excludeEdgeId) continue;
    add(edge.from, edge.to);
    if (edge.bidirectional) add(edge.to, edge.from);
  }
  return adjacency;
}

function bfsReachable(adjacency: Map<string, string[]>, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const visited = new Set<string>([from]);
  const queue: string[][] = [[from]];
  while (queue.length > 0) {
    const path = queue.shift()!;
    const node = path[path.length - 1]!;
    for (const next of adjacency.get(node) ?? []) {
      if (visited.has(next)) continue;
      const nextPath = [...path, next];
      if (next === to) return nextPath;
      visited.add(next);
      queue.push(nextPath);
    }
  }
  return null;
}

/**
 * The full world-design validation suite. Combines the existing progression proof (self-locks,
 * victory reachability, movement-axis feasibility — unchanged, reused as-is) with the
 * Metroidvania-specific structural checks this module adds: zone count, layout consistency,
 * gate-kind distinctness, dependency-cycle/mandatory-bypass/optional-becomes-mandatory checks,
 * one-way/softlock safety, and teaching-room/tease-metadata presence.
 *
 * Solver assumptions, stated explicitly per this task's requirement that graph reachability must
 * never be presented as proof that platforming geometry is traversable:
 *  1. `unlockedTokensReachability` (and the existing `validateWorldReachability` it mirrors)
 *     proves *ability-gated order* is solvable — it does not simulate jump arcs, gravity, or
 *     collision. `validateMovementFeasibility` (reused via buildProgressionProof) is the only
 *     part of this pipeline that checks a *quantitative* physical reach, and only for the `up`
 *     axis (see movement-feasibility.ts); horizontal/down gated gaps are axis-checked only, not
 *     distance-checked, because no generated room currently varies gap width by ability tier.
 *  2. Every room is assumed to be internally traversable once entered — this suite reasons about
 *     the room *graph*, not interior platform placement (that is `deriveRoomLayout`'s and
 *     RuntimeSmokeTest's job, at the Godot layer, exercised for a real project by
 *     scripts/smoke-world-design.mjs, not by this pure-graph solver).
 *  3. `deriveWorldLayout`'s coordinates are a derivation for *this validation pass*, computed
 *     fresh from edge directions and room extents — they are not authored, not stored on disk,
 *     and not read back by the room assembler; two different validation runs of the same graph
 *     always re-derive the identical layout (it's a pure function), but the actual assembled
 *     Godot scenes place rooms via their own independent camera/transition logic, which this
 *     suite does not re-verify pixel-for-pixel.
 */
export function validateWorldDesign(input: ValidateWorldDesignInput): WorldDesignReport {
  const { worldGraph, progressionGraph } = input;
  const applicability = evaluateFullWorldApplicability(worldGraph);
  // A combat/key-item gate (see generateFullMetroidvaniaWorld) grants its token through the same
  // `grantsAbilities` field a movement ability uses — real, deliberate content, just not a
  // registered ability id. Tell buildProgressionProof about every such token up front (any
  // grantsAbilities entry that isn't a registered ability) so it doesn't misreport a perfectly
  // real combat gate as an "unknown ability" the way it would a genuine typo.
  const nonAbilityGrantedTokens = new Set<string>();
  for (const node of worldGraph.nodes) {
    const grants = node.metadata?.grantsAbilities;
    if (!Array.isArray(grants)) continue;
    for (const g of grants) if (typeof g === 'string' && !isRegisteredAbilityId(g)) nonAbilityGrantedTokens.add(g);
  }
  const movementReport = validateMovementFeasibility(worldGraph, input.movementStats ?? DEFAULT_MOVEMENT_STATS, input.roomLayoutDefaults ?? DEFAULT_ROOM_LAYOUT);
  const progressionProof = buildProgressionProof(worldGraph, progressionGraph, movementReport, nonAbilityGrantedTokens);
  const issues: WorldDesignIssueBase[] = [];

  // --- Over-gating: an 'up' edge that requires an ability but whose gap the *base* jump alone
  // (no ability at all) already clears is a physical gate the player's base movement can bypass
  // without ever acquiring what it claims to require — the opposite failure direction from
  // validateMovementFeasibility's own check (which only catches a gap too big for the stated
  // ability, never a gap too small to have needed one). ------------------------------------------
  if (movementReport.metrics.upTransitionGapPx <= movementReport.metrics.jumpApexPx) {
    for (const edge of worldGraph.edges) {
      if (edge.requirements.length === 0 || edge.transition !== 'up') continue;
      issues.push({
        code: 'gate_bypassable_by_base_movement',
        message: `Gate ${edge.id} (${edge.from} -> ${edge.to}, requires [${edge.requirements.join(', ')}]) is an 'up' gap of ${movementReport.metrics.upTransitionGapPx}px, which base jump height alone (${movementReport.metrics.jumpApexPx}px, no ability) already clears — the stated requirement is decorative.`,
        gateEdgeId: edge.id,
      });
    }
  }
  const roomIds = worldGraph.nodes.filter((n) => n.type === 'room' || n.type === 'zone').map((n) => n.id);
  const startId = progressionGraph.startNodeId || roomIds[0] || '';

  // --- Layout: overlaps / incompatible doors --------------------------------------------------
  const layout = deriveWorldLayout(worldGraph, input.roomExtents);
  for (const li of layout.issues) {
    issues.push({ code: `layout_${li.kind}`, message: li.detail, roomIds: li.roomIds });
  }

  // --- Zone count (only enforced when the caller declared >= MIN_FULL_WORLD_ZONES regions) ----
  if (applicability.applicable && worldGraph.regions.some((r) => r.roomIds.length === 0)) {
    for (const region of worldGraph.regions.filter((r) => r.roomIds.length === 0)) {
      issues.push({ code: 'empty_zone', message: `Zone '${region.id}' has no rooms assigned to it.`, roomIds: [] });
    }
  }

  // --- Gate-type distinctness: at least one movement-ability gate and, if this world declares a
  // combat gate (an edge whose requirement is not a registered ability), at least one of those
  // too — both counted from real edges, not assumed. ------------------------------------------
  let movementGates = 0;
  let combatGates = 0;
  for (const edge of worldGraph.edges) {
    if (edge.requirements.length === 0) continue;
    const hasMovement = edge.requirements.some((r) => isRegisteredAbilityId(r));
    const hasCombat = edge.requirements.some((r) => !isRegisteredAbilityId(r));
    if (hasMovement) movementGates++;
    if (hasCombat) combatGates++;
  }
  if (applicability.applicable && combatGates === 0) {
    issues.push({ code: 'no_combat_gate', message: 'No edge requires a non-ability (combat/key-item) token — every gate in this full world is a movement-ability gate, so movement and combat gate types are not actually distinct here.' });
  }

  // --- Self-lock / dependency cycles beyond the single-ability self-lock progression-proof
  // already checks: verify the *combined* ability+item unlock closure from the start room
  // actually reaches every gate's requirement, i.e. there is no cycle among two or more
  // gates each requiring something only obtainable past the other. ----------------------------
  const { visited: fullyUnlockedVisited, unlocked: allTokens } = unlockedTokensReachability(worldGraph, startId);
  const grantedTokens = new Set<string>();
  for (const node of worldGraph.nodes) {
    const abilities = node.metadata?.grantsAbilities;
    if (Array.isArray(abilities)) for (const a of abilities) if (typeof a === 'string') grantedTokens.add(a);
  }
  for (const token of grantedTokens) {
    if (!allTokens.has(token)) {
      issues.push({
        code: 'unreachable_gate_dependency',
        message: `Token '${token}' is granted somewhere in the world but is never actually unlocked by the reachability closure from the start room — an impossible dependency (a cycle, or a grant room itself gated behind the same token).`,
      });
    }
  }
  for (const id of roomIds) {
    if (!fullyUnlockedVisited.has(id)) {
      issues.push({ code: 'unreachable_with_all_tokens', message: `Room '${id}' is unreachable even with every ability/item in the world unlocked — it is disconnected from the traversal graph, not merely gated.`, roomIds: [id] });
    }
  }

  // --- Mandatory-gate bypass: for every non-optional, non-shortcut gated edge, prove there is no
  // alternate *ungated* route between its endpoints (which would make the gate decorative). ----
  for (const edge of worldGraph.edges) {
    if (edge.requirements.length === 0 || edge.optional || edge.kind === 'shortcut') continue;
    const adjacencyWithoutThis = undirectedAdjacencyExcludingEdge(worldGraph, edge.id);
    // Remove every OTHER gated edge too — we want to know if an *ungated* bypass exists, not
    // merely some other path that happens to require a different ability.
    for (const [from, tos] of adjacencyWithoutThis) {
      adjacencyWithoutThis.set(
        from,
        tos.filter((to) => {
          const other = worldGraph.edges.find((e) => e.id !== edge.id && ((e.from === from && e.to === to) || (e.bidirectional && e.from === to && e.to === from)));
          return !other || other.requirements.length === 0;
        }),
      );
    }
    const bypass = bfsReachable(adjacencyWithoutThis, edge.from, edge.to);
    if (bypass) {
      issues.push({
        code: 'mandatory_gate_bypassed',
        message: `Mandatory gate ${edge.id} (${edge.from} -> ${edge.to}, requires [${edge.requirements.join(', ')}]) has an ungated bypass route that skips the requirement entirely.`,
        gateEdgeId: edge.id,
        counterexamplePath: bypass,
      });
    }
  }

  // --- Optional upgrades must not become mandatory: every edge/room tagged optional (or a
  // shortcut) must be absent from the critical path and from the boss-reachability closure when
  // pretending that specific token was never granted. -------------------------------------------
  const optionalGrantRooms = worldGraph.nodes.filter((n) => n.metadata?.optionalReward === true).map((n) => n.id);
  for (const roomId of optionalGrantRooms) {
    const node = roomNode(worldGraph, roomId);
    const grants = Array.isArray(node?.metadata?.grantsAbilities) ? (node!.metadata.grantsAbilities as string[]) : [];
    for (const token of grants) {
      const withoutToken = new Set([...allTokens].filter((t) => t !== token));
      const stillReachesBoss = simulateReachabilityWithoutToken(worldGraph, startId, token);
      if (!stillReachesBoss) {
        issues.push({ code: 'optional_became_mandatory', message: `Optional reward room '${roomId}' grants '${token}', but the boss room becomes unreachable without it — it is not actually optional.`, roomIds: [roomId] });
      }
      void withoutToken;
    }
  }

  // --- Softlocks: a one-way edge must not leave its destination with no other way forward, and
  // every one-way destination should itself be able to reach a save-capable room. --------------
  const saveRoomIds = new Set(worldGraph.nodes.filter((n) => n.metadata?.archetype === 'save').map((n) => n.id));
  for (const edge of worldGraph.edges) {
    if (edge.bidirectional) continue;
    const forwardAdjacency = new Map<string, string[]>();
    for (const e of worldGraph.edges) {
      const list = forwardAdjacency.get(e.from) ?? [];
      list.push(e.to);
      forwardAdjacency.set(e.from, list);
      if (e.bidirectional) {
        const rlist = forwardAdjacency.get(e.to) ?? [];
        rlist.push(e.from);
        forwardAdjacency.set(e.to, rlist);
      }
    }
    const outgoingFromDestination = (forwardAdjacency.get(edge.to) ?? []).filter((t) => t !== edge.from || worldGraph.edges.some((e2) => e2.id !== edge.id && ((e2.from === edge.to && e2.to === t) || (e2.bidirectional && e2.from === t && e2.to === edge.to))));
    if (outgoingFromDestination.length === 0) {
      issues.push({ code: 'one_way_softlock', message: `One-way edge ${edge.id} (${edge.from} -> ${edge.to}) leads to a room with no further outgoing connection — a dead-end drop.`, roomIds: [edge.to], gateEdgeId: edge.id });
      continue;
    }
    const canReachSave = saveRoomIds.size === 0 || saveRoomIds.has(edge.to) || bfsReachable(undirectedAdjacencyExcludingEdge(worldGraph, '__none__'), edge.to, [...saveRoomIds][0] ?? edge.to) !== null;
    if (!canReachSave) {
      issues.push({ code: 'one_way_no_save_path', message: `One-way edge ${edge.id} lands in a stretch of the world with no path to any save room.`, roomIds: [edge.to], gateEdgeId: edge.id });
    }
  }

  // --- Teaching rooms: every ability's gate-post room must be tagged, and must not itself be a
  // boss/miniboss/arena room (the point is a *safe* first exercise of the ability). ------------
  for (const ability of progressionGraph.abilities ?? []) {
    const teachingRoom = worldGraph.nodes.find((n) => n.metadata?.teachesAbility === ability);
    if (!teachingRoom) {
      issues.push({ code: 'missing_teaching_room', message: `No room is tagged as the teaching room for ability '${ability}' — there should be a safe room exercising it immediately after its gate.` });
      continue;
    }
    const archetype = teachingRoom.metadata?.archetype;
    if (archetype === 'boss' || archetype === 'miniboss' || archetype === 'arena') {
      issues.push({ code: 'unsafe_teaching_room', message: `Teaching room for '${ability}' (${teachingRoom.id}) is archetype '${String(archetype)}' — not a safe room to introduce a new ability in.`, roomIds: [teachingRoom.id] });
    }
  }

  // --- Tease metadata presence (only meaningfully checked in full-world mode) -----------------
  const teaseCount = worldGraph.nodes.filter((n) => Array.isArray(n.metadata?.teases) && (n.metadata!.teases as unknown[]).length > 0).length;
  if (applicability.applicable && teaseCount === 0) {
    issues.push({ code: 'no_tease_metadata', message: 'No room declares a visible-but-unreachable tease — this world has no tell-tale locked reward pointing at a later ability.' });
  }

  const shortcutCount = worldGraph.edges.filter((e) => e.kind === 'shortcut').length;
  const oneWayCount = worldGraph.edges.filter((e) => e.kind === 'one_way' || !e.bidirectional).length;
  const breakableCount = worldGraph.edges.filter((e) => e.kind === 'breakable').length;
  const teachingRoomCount = worldGraph.nodes.filter((n) => typeof n.metadata?.teachesAbility === 'string').length;

  const passed = progressionProof.passed && issues.length === 0;

  return {
    seed: worldGraph.seed,
    passed,
    applicable: applicability.applicable,
    applicabilityReason: applicability.reason,
    issues,
    zoneCount: worldGraph.regions.length,
    gateTypeCounts: { movement: movementGates, combat: combatGates },
    shortcutCount,
    oneWayCount,
    breakableCount,
    teaseCount,
    teachingRoomCount,
    progressionProof,
    layout: {
      overlapCount: layout.issues.filter((i) => i.kind === 'overlap').length,
      incompatibleDoorCount: layout.issues.filter((i) => i.kind === 'incompatible_door').length,
      unplacedCount: layout.issues.filter((i) => i.kind === 'unplaced').length,
    },
  };
}

function simulateReachabilityWithoutToken(graph: WorldGraph, startId: string, blockedToken: string): boolean {
  const adjacency = new Map<string, Array<{ to: string; requirements: string[] }>>();
  const add = (from: string, to: string, requirements: string[]): void => {
    const list = adjacency.get(from) ?? [];
    list.push({ to, requirements });
    adjacency.set(from, list);
  };
  for (const edge of graph.edges) {
    add(edge.from, edge.to, edge.requirements);
    if (edge.bidirectional) add(edge.to, edge.from, edge.requirements);
  }
  const grantTokens = (roomId: string, unlocked: Set<string>): void => {
    const node = roomNode(graph, roomId);
    const abilities = node?.metadata?.grantsAbilities;
    if (Array.isArray(abilities)) for (const a of abilities) if (typeof a === 'string' && a !== blockedToken) unlocked.add(a);
  };
  const unlocked = new Set<string>();
  const visited = new Set<string>([startId]);
  grantTokens(startId, unlocked);
  let changed = true;
  while (changed) {
    changed = false;
    for (const roomId of [...visited]) {
      for (const { to, requirements } of adjacency.get(roomId) ?? []) {
        if (visited.has(to)) continue;
        if (requirements.includes(blockedToken)) continue;
        if (!requirements.every((r) => unlocked.has(r))) continue;
        visited.add(to);
        grantTokens(to, unlocked);
        changed = true;
      }
    }
  }
  const roomIds = graph.nodes.filter((n) => n.type === 'room' || n.type === 'zone').map((n) => n.id);
  const bossId = roomIds[roomIds.length - 1]!;
  return visited.has(bossId);
}

// ---------------------------------------------------------------------------------------------
// Generation report — Game Hook / Progression Sequence / Zone Breakdown / ASCII layout graph.
//
// Generated from the SAME worldGraph/progressionGraph objects the pipeline already writes to
// world_graph.json/progression_graph.json (and, at the QA-gate layer, the same rooms.json the
// exporter reads) — never a separate hand-authored description that could drift from what the
// game actually contains. Every fact quoted here is read off worldGraph.nodes/edges directly.
// ---------------------------------------------------------------------------------------------

export interface GameHookInfo {
  title: string;
  tagline?: string;
  tone: string;
  visualStyle: string;
}

function formatGateRequirement(requirements: string[]): string {
  if (requirements.length === 0) return 'open';
  return requirements.join(' + ');
}

function edgeArrow(edge: GraphEdge): string {
  if (edge.kind === 'shortcut') return '~~~';
  if (edge.kind === 'breakable') return '=X=';
  if (!edge.bidirectional) return '-->';
  return '---';
}

/**
 * Renders the required Game Hook / Progression Sequence / Zone Breakdown / ASCII layout graph
 * report as plain text. Pure function over already-generated canonical data — no additional
 * generation, randomness, or narrative invention happens here; every line is a direct read of a
 * field on worldGraph/progressionGraph. Aesthetic claims are deliberately not made: zone
 * hazards/enemy lists are echoed as declared data, and the report says outright that visual
 * quality is a human-review concern, not something this text can certify.
 */
export function generateWorldDesignReport(
  hook: GameHookInfo,
  worldGraph: WorldGraph,
  progressionGraph: ProgressionGraph,
  design?: WorldDesignReport,
): string {
  const lines: string[] = [];
  const nodeById = new Map(worldGraph.nodes.map((n) => [n.id, n]));
  const roomIds = worldGraph.nodes.filter((n) => n.type === 'room' || n.type === 'zone').map((n) => n.id);

  lines.push('=== GAME HOOK ===');
  lines.push(`Title: ${hook.title}`);
  if (hook.tagline) lines.push(`Tagline: ${hook.tagline}`);
  lines.push(`Atmosphere/Tone: ${hook.tone}`);
  lines.push(`Aesthetic Direction: ${hook.visualStyle} (declared direction — actual visual quality is a human visual-review concern; this report does not certify it)`);
  lines.push('');

  lines.push('=== PROGRESSION SEQUENCE ===');
  const grantOrder: Array<{ ability: string; roomId: string }> = [];
  for (const id of roomIds) {
    const grants = nodeById.get(id)?.metadata?.grantsAbilities;
    if (Array.isArray(grants)) for (const g of grants) if (typeof g === 'string') grantOrder.push({ ability: g, roomId: id });
  }
  if (grantOrder.length === 0) {
    lines.push('(no ability/item gates declared)');
  }
  grantOrder.forEach(({ ability, roomId }, i) => {
    const gatedEdges = worldGraph.edges.filter((e) => e.requirements.includes(ability));
    const unlocks = gatedEdges.length > 0
      ? gatedEdges.map((e) => `${e.from}->${e.to}${e.kind === 'breakable' ? ' (breakable wall)' : ''}`).join(', ')
      : '(no edge currently requires it — dead pickup, see issues)';
    lines.push(`${i + 1}. Acquire '${ability}' at ${roomId} -> unlocks: ${unlocks}`);
  });
  lines.push(`Victory: reach ${progressionGraph.endNodeId} from ${progressionGraph.startNodeId}`);
  lines.push('');

  lines.push('=== ZONE BREAKDOWN ===');
  for (const region of worldGraph.regions) {
    const first = region.roomIds[0];
    const theme = first ? nodeById.get(first)?.metadata?.theme : undefined;
    lines.push(`Zone '${region.id}' (${typeof theme === 'string' ? theme : region.name}) — ${region.roomIds.length} room(s): ${region.roomIds[0] ?? '?'}..${region.roomIds[region.roomIds.length - 1] ?? '?'}`);
    const hazardSet = new Set<string>();
    const enemySet = new Set<string>();
    const keyItems: string[] = [];
    for (const rid of region.roomIds) {
      const node = nodeById.get(rid);
      const grants = node?.metadata?.grantsAbilities;
      if (Array.isArray(grants)) for (const g of grants) if (typeof g === 'string') keyItems.push(`${g}@${rid}`);
    }
    const themeDef = DEFAULT_ZONE_THEMES.find((t) => t.name === theme);
    if (themeDef) {
      themeDef.hazards.forEach((h) => hazardSet.add(h));
      themeDef.enemyArchetypes.forEach((e) => enemySet.add(e));
    }
    lines.push(`  Hazards: ${[...hazardSet].join(', ') || '(none declared)'}`);
    lines.push(`  Enemy archetypes: ${[...enemySet].join(', ') || '(none declared)'}`);
    lines.push(`  Key items/abilities granted: ${keyItems.join(', ') || '(none)'}`);
  }
  lines.push('');

  lines.push('=== WORLD LAYOUT GRAPH ===');
  lines.push('Legend: --- normal, ~~~ shortcut (optional), =X= breakable wall, --> one-way, [G:ability] gate requirement');
  const seenPairs = new Set<string>();
  for (const edge of worldGraph.edges) {
    const pairKey = [edge.from, edge.to].sort().join('|') + edge.id;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const gateLabel = edge.requirements.length > 0 ? ` [G:${formatGateRequirement(edge.requirements)}]` : '';
    const teases = nodeById.get(edge.from)?.metadata?.teases;
    const teaseLabel = Array.isArray(teases) && teases.length > 0 ? ' (tease here)' : '';
    lines.push(`${edge.from} ${edgeArrow(edge)} ${edge.to}${gateLabel}${teaseLabel}`);
  }
  lines.push('');

  if (design) {
    lines.push('=== VALIDATION SUMMARY ===');
    lines.push(`Applicable: ${design.applicable} (${design.applicabilityReason})`);
    lines.push(`Passed: ${design.passed}`);
    lines.push(`Zones: ${design.zoneCount}, gate types: movement=${design.gateTypeCounts.movement} combat=${design.gateTypeCounts.combat}, shortcuts=${design.shortcutCount}, one-way=${design.oneWayCount}, breakable=${design.breakableCount}, teases=${design.teaseCount}, teaching rooms=${design.teachingRoomCount}`);
    if (design.issues.length > 0) {
      lines.push(`Issues (${design.issues.length}):`);
      for (const issue of design.issues) lines.push(`  - [${issue.code}] ${issue.message}`);
    }
  }

  return lines.join('\n');
}
