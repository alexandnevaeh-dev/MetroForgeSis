import type { ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import { generateId, PROFILE_DEFAULTS, type GenerationProfile } from '@metroforge/shared';
import { SeededRNG } from './rng.js';
import {
  abilityGateRoomIndex,
  assignRoomArchetypes,
  npcCountForProfile,
} from './room-archetypes.js';

export interface WorldGenOptions {
  seed: number;
  roomCount: number;
  biomeCount: number;
  abilities: string[];
  bossCount: number;
  profile?: GenerationProfile;
}

export interface WorldGenResult {
  worldGraph: WorldGraph;
  progressionGraph: ProgressionGraph;
  roomIds: string[];
}

/** Re-export for tests and content placement alignment. */
export { abilityGateRoomIndex } from './room-archetypes.js';

export function generateWorldTopology(options: WorldGenOptions): WorldGenResult {
  const rng = new SeededRNG(options.seed);
  const roomIds: string[] = [];

  for (let i = 0; i < options.roomCount; i++) {
    roomIds.push(`room_${i.toString().padStart(3, '0')}`);
  }

  const isLarge = options.roomCount >= 50;
  const isMedium = options.roomCount >= 30 && options.roomCount < 150;

  // Each ability is picked up in the room right before the gate it unlocks — a common
  // Metroidvania pattern (shrine right at the chasm it lets you cross). Tagged on the room node
  // so validateWorldReachability can prove the real room graph is solvable, not just the
  // abstract ability-order chain.
  const grantsAbilitiesByRoom = new Map<string, string[]>();
  options.abilities.forEach((ability, ai) => {
    const gateIdx = abilityGateRoomIndex(ai, options.abilities.length, options.roomCount);
    const roomId = roomIds[gateIdx]!;
    const list = grantsAbilitiesByRoom.get(roomId) ?? [];
    list.push(ability);
    grantsAbilitiesByRoom.set(roomId, list);
  });

  const roomArchetypes = assignRoomArchetypes({
    roomCount: options.roomCount,
    abilityCount: options.abilities.length,
    npcCount: npcCountForProfile(options.profile),
    biomeCount: options.biomeCount,
    seed: options.seed,
    profile: options.profile,
  });

  const nodes = roomIds.map((id, i) => ({
    id,
    type: 'room' as const,
    label: `Room ${i}`,
    metadata: {
      archetype: roomArchetypes[i]!,
      biomeIndex: isMedium || isLarge ? Math.floor(i / Math.ceil(options.roomCount / options.biomeCount)) % options.biomeCount : i % options.biomeCount,
      regionIndex: isLarge ? Math.floor(i / (options.roomCount / options.biomeCount)) : 0,
      grantsAbilities: grantsAbilitiesByRoom.get(id) ?? [],
    },
  }));

  const edges: WorldGraph['edges'] = buildEdges(roomIds, options, rng, isMedium || isLarge);

  const bossRoomId = roomIds[roomIds.length - 1]!;
  const startRoomId = roomIds[0]!;

  // regions[i].roomIds is derived from each node's own metadata.biomeIndex (set two lines above)
  // rather than recomputed with an independent formula — they used to disagree for medium+/large
  // worlds (nodes assign biomeIndex in contiguous per-zone blocks there, but regions used a plain
  // `roomIndex % biomeCount` interleave), so `regions[i].roomIds` listed rooms scattered across
  // every other zone instead of the zone that room's own tag said it belonged to. Found via
  // world-design.ts's generateWorldDesignReport, whose Zone Breakdown section is the first thing
  // to actually iterate `region.roomIds` and print the result somewhere a human would notice the
  // mismatch (e.g. "10 room(s): room_000..room_036" — a 40-room-wide "zone").
  const regions = Array.from({ length: options.biomeCount }, (_, i) => ({
    id: `region_${i}`,
    name: `Region ${i}`,
    biomeId: `biome_${i}`,
    roomIds: [] as string[],
  }));
  nodes.forEach((node, i) => {
    const bi = Math.max(0, Math.min(options.biomeCount - 1, node.metadata.biomeIndex));
    regions[bi]!.roomIds.push(roomIds[i]!);
  });

  const worldGraph: WorldGraph = {
    version: '0.1.0',
    seed: options.seed,
    nodes,
    edges,
    regions,
  };

  const progressionNodes = [
    { id: startRoomId, type: 'room' as const, label: 'Start', required: true },
    ...options.abilities.map((a) => ({
      id: `ability_${a}`,
      type: 'ability' as const,
      label: a,
      required: true,
    })),
    { id: bossRoomId, type: 'boss' as const, label: 'Final Boss', required: true },
  ];

  const progressionEdges: ProgressionGraph['edges'] = [];
  for (let i = 0; i < progressionNodes.length - 1; i++) {
    // Each ability node gates the edge leading out of it — you need the ability you just
    // picked up to reach the next stretch of the critical path. The Start room requires nothing.
    const fromNode = progressionNodes[i]!;
    const requires = fromNode.type === 'ability' ? [fromNode.label] : [];
    progressionEdges.push({
      from: fromNode.id,
      to: progressionNodes[i + 1]!.id,
      requires,
    });
  }

  const progressionGraph: ProgressionGraph = {
    version: '0.1.0',
    seed: options.seed,
    startNodeId: startRoomId,
    endNodeId: bossRoomId,
    nodes: progressionNodes,
    edges: progressionEdges,
    abilities: options.abilities,
    criticalPath: progressionNodes.map((n) => n.id),
  };

  return { worldGraph, progressionGraph, roomIds };
}

function buildEdges(
  roomIds: string[],
  options: WorldGenOptions,
  rng: SeededRNG,
  branching: boolean,
): WorldGraph['edges'] {
  const edges: WorldGraph['edges'] = [];

  // Main spine
  for (let i = 0; i < roomIds.length - 1; i++) {
    edges.push({
      id: generateId('edge'),
      from: roomIds[i]!,
      to: roomIds[i + 1]!,
      requirements: [],
      optional: false,
      bidirectional: true,
    });
  }

  // Branching shortcuts for medium+ worlds
  if (branching) {
    const branchCount = Math.min(Math.floor(roomIds.length / 10), 8);
    // Seventeenth-session fix: every room already carries up to 2 spine connections (prev/next)
    // and can additionally be an ability-gate or vertical-shaft endpoint — a room becomes an
    // endpoint of *this* many independently-random shortcuts too and it can need more distinct
    // physical doors than the 4 cardinal directions a room scene supports, which is what forces
    // two connections into the same direction (see buildRoomConnections' own same-direction
    // collision-avoidance in packages/godot/src/room-assembler.ts — that fix handles a room
    // needing up to 4 directions, not 5+). Found via a direct sweep of 420 seed/roomCount/
    // biomeCount combinations: 16 residual collisions, all in roomCount>=50 worlds, all a room
    // touched by 3+ shortcuts. Capping each room to at most one shortcut endpoint keeps every
    // room's worst case (2 spine + 1 shortcut + 1 gate/shaft) at exactly 4, never 5.
    const shortcutTouches = new Map<string, number>();
    const MAX_SHORTCUT_TOUCHES_PER_ROOM = 1;
    const touches = (id: string): number => shortcutTouches.get(id) ?? 0;
    for (let b = 0; b < branchCount; b++) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const from = rng.int(1, roomIds.length - 3);
        const to = rng.int(from + 2, Math.min(from + 8, roomIds.length - 1));
        if (to === from + 1) continue;
        const fromId = roomIds[from]!;
        const toId = roomIds[to]!;
        if (
          touches(fromId) >= MAX_SHORTCUT_TOUCHES_PER_ROOM ||
          touches(toId) >= MAX_SHORTCUT_TOUCHES_PER_ROOM
        ) {
          continue;
        }
        edges.push({
          id: generateId('edge'),
          from: fromId,
          to: toId,
          requirements: [],
          optional: true,
          bidirectional: true,
        });
        shortcutTouches.set(fromId, touches(fromId) + 1);
        shortcutTouches.set(toId, touches(toId) + 1);
        break;
      }
    }
  }

  // Vertical biome shafts for medium+ worlds
  if (branching && options.biomeCount > 1) {
    const roomsPerBiome = Math.ceil(roomIds.length / options.biomeCount);
    for (let b = 0; b < options.biomeCount - 1; b++) {
      const lowerIdx = Math.min((b + 1) * roomsPerBiome - 1, roomIds.length - 2);
      const upperIdx = Math.min(lowerIdx + 1, roomIds.length - 1);
      if (upperIdx > lowerIdx) {
        const lowerId = roomIds[lowerIdx]!;
        const upperId = roomIds[upperIdx]!;
        // Sixteenth-session fix: upperIdx is usually lowerIdx+1, a pair the main spine above
        // (line ~138) already connects unconditionally as a plain (no `transition`, i.e.
        // horizontal) edge. Without removing that duplicate the exact same room pair ends up
        // with two edges to the same target — one horizontal, one `transition: 'up'` — and
        // nothing downstream (PlaytestAgent.gd's _find_transition, the room assembler's door
        // placement) disambiguates by direction, so whichever edge is found/placed first wins
        // arbitrarily. When the 'up' edge wins, its door sits at the top of a tall room that a
        // grounded walk-to can't reach, producing a real, reproduced `door_did_not_fire` failure
        // (see docs/audit/MODERN_COHESION_TEST_PROJECT.md's sixteenth session — this is the exact
        // shape of the reported room_012 -> room_013 failure). The ability-gate loop below this
        // one already applies this same same-pair dedup for its own edges; the vertical-shaft
        // loop never had it.
        for (let i = edges.length - 1; i >= 0; i--) {
          const existing = edges[i]!;
          const sameUndirectedPair =
            (existing.from === lowerId && existing.to === upperId) ||
            (existing.bidirectional && existing.from === upperId && existing.to === lowerId);
          if (sameUndirectedPair && existing.requirements.length === 0) {
            edges.splice(i, 1);
          }
        }
        edges.push({
          id: generateId('edge'),
          from: lowerId,
          to: upperId,
          requirements: [],
          optional: false,
          bidirectional: true,
          transition: 'up',
        });
      }
    }
  }

  // Ability gates distributed across world (vertical shafts require abilities)
  options.abilities.forEach((ability, ai) => {
    const gateIdx = abilityGateRoomIndex(ai, options.abilities.length, roomIds.length);
    const postIdx = Math.min(gateIdx + 1, roomIds.length - 1);
    const fromId = roomIds[gateIdx]!;
    const toId = roomIds[postIdx]!;

    // The gate room is (by construction, see abilityGateRoomIndex) adjacent to the room it
    // gates, which the main spine (or a vertical shaft) may have already connected with a free,
    // unconditional edge. Without removing that duplicate, the gate would be pure decoration —
    // silently walkable without the ability it claims to require. Only the gated edge should
    // remain between this exact pair.
    for (let i = edges.length - 1; i >= 0; i--) {
      const existing = edges[i]!;
      const sameUndirectedPair =
        (existing.from === fromId && existing.to === toId) ||
        (existing.bidirectional && existing.from === toId && existing.to === fromId);
      if (sameUndirectedPair && existing.requirements.length === 0) {
        edges.splice(i, 1);
      }
    }

    edges.push({
      id: generateId('edge'),
      from: fromId,
      to: toId,
      requirements: [ability],
      optional: false,
      bidirectional: true,
      transition: transitionForAbilityGate(ability),
    });
  });

  removeShortcutsThatBypassGates(edges);

  return edges;
}

/**
 * The random branching-shortcut edges above are placed without knowledge of the ability gates
 * added afterward (in this same function, further down) — so a shortcut spanning `from..from+8`
 * rooms can land squarely across an ability-gated pair and give the player a free, ungated route
 * around a requirement the gate claims is mandatory. Found empirically: validateWorldDesign
 * (packages/procedural/src/world-design.ts) flagged real `mandatory_gate_bypassed` cases on
 * several of this module's own generated worlds at medium+ room counts, all traced to exactly
 * this shortcut/gate interaction, never to the gate-adjacency dedup above (which only removes a
 * *direct*, same-pair duplicate — it can't see a bypass several rooms long).
 *
 * Shortcuts (and only shortcuts — never the main spine or a vertical biome shaft, both of which
 * are load-bearing for basic connectivity) are removed, one at a time, until no free-edges-only
 * path connects a gate's two endpoints. A shortcut is who has to give: it is explicitly
 * `optional: true` supplementary connectivity by construction, so removing one never disconnects
 * anything the spine doesn't already connect.
 */
export function removeShortcutsThatBypassGates(edges: WorldGraph['edges']): void {
  const freeBypassPath = (fromId: string, toId: string, excludeEdgeId: string): WorldGraph['edges'] | null => {
    const adjacency = new Map<string, Array<{ to: string; edge: WorldGraph['edges'][number] }>>();
    for (const e of edges) {
      if (e.id === excludeEdgeId || e.requirements.length > 0) continue;
      const list = adjacency.get(e.from) ?? [];
      list.push({ to: e.to, edge: e });
      adjacency.set(e.from, list);
      if (e.bidirectional) {
        const rlist = adjacency.get(e.to) ?? [];
        rlist.push({ to: e.from, edge: e });
        adjacency.set(e.to, rlist);
      }
    }
    const visited = new Set<string>([fromId]);
    const queue: Array<{ node: string; path: WorldGraph['edges'] }> = [{ node: fromId, path: [] }];
    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      if (node === toId) return path;
      for (const { to, edge } of adjacency.get(node) ?? []) {
        if (visited.has(to)) continue;
        visited.add(to);
        queue.push({ node: to, path: [...path, edge] });
      }
    }
    return null;
  };

  for (const gate of edges.filter((e) => e.requirements.length > 0)) {
    for (let guard = 0; guard < 8; guard++) {
      const bypass = freeBypassPath(gate.from, gate.to, gate.id);
      if (!bypass) break;
      const removable = bypass.find((e) => e.optional);
      if (!removable) break; // bypass exists through non-optional (spine/shaft) edges only — not ours to remove.
      const idx = edges.findIndex((e) => e.id === removable.id);
      if (idx >= 0) edges.splice(idx, 1);
      else break;
    }
  }
}

function transitionForAbilityGate(
  ability: string,
): 'up' | 'down' | 'left' | 'right' | undefined {
  switch (ability) {
    case 'ground_slam':
      return 'down';
    case 'grapple':
      return 'up';
    case 'swim':
      return 'down';
    case 'phase':
      return 'right';
    case 'wall_slide':
    case 'wall_jump':
      return 'up';
    case 'dash':
    case 'double_jump':
    case 'air_dash':
      return 'right';
    default:
      return 'right';
  }
}

export function resolveRoomCount(profile: GenerationProfile, seed: number): number {
  const defaults = PROFILE_DEFAULTS[profile];
  if (defaults.roomsMin === defaults.roomsMax) return defaults.roomsMin;
  const rng = new SeededRNG(seed);
  return rng.int(defaults.roomsMin, defaults.roomsMax);
}

/**
 * Proves every room in the actual assembled world graph is reachable from the start room via
 * *some* path (bidirectional edges traversable both ways), ignoring ability requirements.
 *
 * Deliberately weaker than `validateWorldReachability` (below), which additionally proves the
 * ability-gated edges are satisfiable in order. This one isolates a distinct, simpler failure
 * class on its own: a pure edge-construction bug leaving a room with no path back to the start
 * *at all*, independent of ability gating — useful for telling "the topology itself is broken"
 * apart from "the topology is fine but the ability gates don't line up."
 */
export function validateWorldConnectivity(graph: WorldGraph): {
  connected: boolean;
  unreachableRoomIds: string[];
} {
  // 'zone' included alongside 'room' so TOP_DOWN_ACTION_ADVENTURE's overworld node (tagged
  // type: 'zone' by generateTopDownWorld(), packages/procedural/src/topdown/world.ts) is itself
  // checked for reachability, not silently excluded from the room set this proves connectivity
  // over — see the identical fix in planVictoryRoute (playtest-route.ts) for why that mattered.
  const roomIds = graph.nodes.filter((n) => n.type === 'room' || n.type === 'zone').map((n) => n.id);
  if (roomIds.length === 0) return { connected: true, unreachableRoomIds: [] };

  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    (adjacency.get(edge.from) ?? adjacency.set(edge.from, []).get(edge.from)!).push(edge.to);
    if (edge.bidirectional) {
      (adjacency.get(edge.to) ?? adjacency.set(edge.to, []).get(edge.to)!).push(edge.from);
    }
  }

  const startId = roomIds[0]!;
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  const unreachableRoomIds = roomIds.filter((id) => !visited.has(id));
  return { connected: unreachableRoomIds.length === 0, unreachableRoomIds };
}

/**
 * Proves every room in the real world graph is reachable from the start room, given progressive
 * ability acquisition — abilities become available once the player reaches whichever room's
 * `metadata.grantsAbilities` lists them (see `generateWorldTopology`), and each edge's
 * `requirements` gate traversal until the player has all of them.
 *
 * This is the room-level counterpart to `validateReachability` (which only proves the small
 * abstract ability-order chain is solvable) — it proves the actual generated layout realizes
 * that chain correctly, catching e.g. an ability gate placed before its own pickup room, or a
 * pickup room that's itself unreachable.
 *
 * Uses a fixed-point iteration rather than a single BFS pass because an ability picked up via
 * one branch can retroactively unlock a gate on an entirely different, already-visited branch —
 * a single forward pass could miss that if the branches are explored in the "wrong" order.
 */
export function validateWorldReachability(
  graph: WorldGraph,
  unlockedAbilities: Set<string> = new Set(),
): { reachable: boolean; unreachableRoomIds: string[] } {
  // See validateWorldConnectivity's comment above — 'zone' covers the top-down overworld node.
  const roomIds = graph.nodes.filter((n) => n.type === 'room' || n.type === 'zone').map((n) => n.id);
  if (roomIds.length === 0) return { reachable: true, unreachableRoomIds: [] };

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const grantsAt = (roomId: string): void => {
    const grants = nodeById.get(roomId)?.metadata?.grantsAbilities;
    if (Array.isArray(grants)) {
      for (const a of grants) if (typeof a === 'string') unlockedAbilities.add(a);
    }
  };

  type Traversal = { to: string; requirements: string[] };
  const adjacency = new Map<string, Traversal[]>();
  const addEdge = (from: string, to: string, requirements: string[]): void => {
    const list = adjacency.get(from) ?? [];
    list.push({ to, requirements });
    adjacency.set(from, list);
  };
  for (const edge of graph.edges) {
    addEdge(edge.from, edge.to, edge.requirements);
    if (edge.bidirectional) addEdge(edge.to, edge.from, edge.requirements);
  }

  const startId = roomIds[0]!;
  const visited = new Set<string>([startId]);
  grantsAt(startId);

  let changed = true;
  while (changed) {
    changed = false;
    for (const roomId of visited) {
      for (const { to, requirements } of adjacency.get(roomId) ?? []) {
        if (visited.has(to)) continue;
        if (requirements.every((r) => unlockedAbilities.has(r))) {
          visited.add(to);
          grantsAt(to);
          changed = true;
        }
      }
    }
  }

  const unreachableRoomIds = roomIds.filter((id) => !visited.has(id));
  return { reachable: unreachableRoomIds.length === 0, unreachableRoomIds };
}

export function validateReachability(
  graph: ProgressionGraph,
  unlockedAbilities: Set<string> = new Set(),
): { reachable: boolean; unreachableNodes: string[] } {
  const visited = new Set<string>();
  const queue = [graph.startNodeId];
  visited.add(graph.startNodeId);

  const edgeMap = new Map<string, ProgressionGraph['edges']>();
  for (const edge of graph.edges) {
    const list = edgeMap.get(edge.from) ?? [];
    list.push(edge);
    edgeMap.set(edge.from, list);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = graph.nodes.find((n) => n.id === current);
    if (node?.type === 'ability') {
      unlockedAbilities.add(node.label);
    }

    for (const edge of edgeMap.get(current) ?? []) {
      const canTraverse = edge.requires.every((r) => unlockedAbilities.has(r));
      if (canTraverse && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  const requiredNodes = graph.nodes.filter((n) => n.required).map((n) => n.id);
  const unreachableNodes = requiredNodes.filter((id) => !visited.has(id));

  return {
    reachable: unreachableNodes.length === 0,
    unreachableNodes,
  };
}

