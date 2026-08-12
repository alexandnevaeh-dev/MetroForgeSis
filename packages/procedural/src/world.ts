import type { ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import { generateId, PROFILE_DEFAULTS, type GenerationProfile } from '@metroforge/shared';
import { SeededRNG } from './rng.js';

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

const ROOM_ARCHETYPES = [
  'connector',
  'traversal',
  'combat',
  'arena',
  'ability_gate',
  'save',
  'boss',
  'treasure',
] as const;

/** The room index where the Nth ability's gate (and pickup) sits — a pure function of ability
 *  count and room count, shared by node metadata tagging and edge construction so the two never
 *  drift out of sync. */
function abilityGateRoomIndex(abilityIndex: number, abilityCount: number, roomCount: number): number {
  return Math.floor(((abilityIndex + 1) / (abilityCount + 1)) * roomCount);
}

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

  const nodes = roomIds.map((id, i) => ({
    id,
    type: 'room' as const,
    label: `Room ${i}`,
    metadata: {
      archetype: pickArchetype(i, options.roomCount, rng),
      biomeIndex: isMedium || isLarge ? Math.floor(i / Math.ceil(options.roomCount / options.biomeCount)) % options.biomeCount : i % options.biomeCount,
      regionIndex: isLarge ? Math.floor(i / (options.roomCount / options.biomeCount)) : 0,
      grantsAbilities: grantsAbilitiesByRoom.get(id) ?? [],
    },
  }));

  const edges: WorldGraph['edges'] = buildEdges(roomIds, options, rng, isMedium || isLarge);

  const bossRoomId = roomIds[roomIds.length - 1]!;
  const startRoomId = roomIds[0]!;

  const worldGraph: WorldGraph = {
    version: '0.1.0',
    seed: options.seed,
    nodes,
    edges,
    regions: Array.from({ length: options.biomeCount }, (_, i) => ({
      id: `region_${i}`,
      name: `Region ${i}`,
      biomeId: `biome_${i}`,
      roomIds: roomIds.filter((_, ri) => ri % options.biomeCount === i),
    })),
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

function pickArchetype(index: number, total: number, rng: SeededRNG): string {
  if (index === 0) return 'tutorial';
  if (index === total - 1) return 'boss';
  if (index === Math.floor(total * 0.3)) return 'ability_shrine';
  if (index % 7 === 0) return 'save';
  if (index % 5 === 0) return 'treasure';
  return rng.pick([...ROOM_ARCHETYPES]);
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
    for (let b = 0; b < branchCount; b++) {
      const from = rng.int(1, roomIds.length - 3);
      const to = rng.int(from + 2, Math.min(from + 8, roomIds.length - 1));
      if (to !== from + 1) {
        edges.push({
          id: generateId('edge'),
          from: roomIds[from]!,
          to: roomIds[to]!,
          requirements: [],
          optional: true,
          bidirectional: true,
        });
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
        edges.push({
          id: generateId('edge'),
          from: roomIds[lowerIdx]!,
          to: roomIds[upperIdx]!,
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
      transition: ai % 2 === 1 ? 'up' : undefined,
    });
  });

  return edges;
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
  const roomIds = graph.nodes.filter((n) => n.type === 'room').map((n) => n.id);
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
  const roomIds = graph.nodes.filter((n) => n.type === 'room').map((n) => n.id);
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

