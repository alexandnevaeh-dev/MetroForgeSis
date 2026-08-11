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

export function generateWorldTopology(options: WorldGenOptions): WorldGenResult {
  const rng = new SeededRNG(options.seed);
  const roomIds: string[] = [];

  for (let i = 0; i < options.roomCount; i++) {
    roomIds.push(`room_${i.toString().padStart(3, '0')}`);
  }

  const isLarge = options.roomCount >= 50;
  const isMedium = options.roomCount >= 30 && options.roomCount < 150;

  const nodes = roomIds.map((id, i) => ({
    id,
    type: 'room' as const,
    label: `Room ${i}`,
    metadata: {
      archetype: pickArchetype(i, options.roomCount, rng),
      biomeIndex: isMedium || isLarge ? Math.floor(i / Math.ceil(options.roomCount / options.biomeCount)) % options.biomeCount : i % options.biomeCount,
      regionIndex: isLarge ? Math.floor(i / (options.roomCount / options.biomeCount)) : 0,
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
    const gateIdx = Math.floor(((ai + 1) / (options.abilities.length + 1)) * roomIds.length);
    const postIdx = Math.min(gateIdx + 1, roomIds.length - 1);
    edges.push({
      id: generateId('edge'),
      from: roomIds[gateIdx]!,
      to: roomIds[postIdx]!,
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
 * This is deliberately a weaker, complementary check to `validateReachability` (which proves the
 * abstract ability-gate chain is solvable in order): `worldGraph` room nodes don't record where
 * abilities are picked up, so there's no data to prove ability-gated room reachability here. What
 * this *does* catch is a real, distinct failure class — a bug in edge construction leaving a room
 * with no path back to the start at all, disconnected regardless of what abilities the player has.
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

