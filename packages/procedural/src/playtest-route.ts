import type { WorldGraph } from '@metroforge/schemas';

export interface PlaytestTransitionStep {
  fromRoomId: string;
  toRoomId: string;
  requirements: string[];
}

export interface PlaytestRoutePlan {
  reachable: boolean;
  startRoomId: string;
  victoryRoomId: string;
  victoryBossId: string;
  transitions: PlaytestTransitionStep[];
  visitedRoomOrder: string[];
}

export interface PlanVictoryRouteOptions {
  victoryRoomId?: string;
  victoryBossId?: string;
}

function cloneAbilities(set: Set<string>): Set<string> {
  return new Set(set);
}

function stateKey(roomId: string, abilities: Set<string>): string {
  return `${roomId}|${[...abilities].sort().join(',')}`;
}

/**
 * Plans an ability-aware room-to-room path from the start room to the victory room.
 * Used by the Godot PlaytestAgent to simulate input-driven traversal — distinct from
 * `validateWorldReachability`, which only proves existence of a solvable route.
 */
export function planVictoryRoute(
  graph: WorldGraph,
  options: PlanVictoryRouteOptions = {},
): PlaytestRoutePlan {
  const roomIds = graph.nodes.filter((n) => n.type === 'room').map((n) => n.id);
  const startRoomId = roomIds[0] ?? 'room_000';
  const victoryRoomId = options.victoryRoomId ?? roomIds[roomIds.length - 1] ?? startRoomId;
  const victoryBossId = options.victoryBossId ?? 'boss_final';

  if (roomIds.length === 0) {
    return {
      reachable: false,
      startRoomId,
      victoryRoomId,
      victoryBossId,
      transitions: [],
      visitedRoomOrder: [],
    };
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const grantAt = (roomId: string, abilities: Set<string>): void => {
    const grants = nodeById.get(roomId)?.metadata?.grantsAbilities;
    if (Array.isArray(grants)) {
      for (const ability of grants) {
        if (typeof ability === 'string') abilities.add(ability);
      }
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

  interface QueueEntry {
    roomId: string;
    abilities: Set<string>;
    path: PlaytestTransitionStep[];
    visitedOrder: string[];
  }

  const startAbilities = new Set<string>();
  grantAt(startRoomId, startAbilities);
  const queue: QueueEntry[] = [
    {
      roomId: startRoomId,
      abilities: startAbilities,
      path: [],
      visitedOrder: [startRoomId],
    },
  ];
  const seen = new Set<string>([stateKey(startRoomId, startAbilities)]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.roomId === victoryRoomId) {
      return {
        reachable: true,
        startRoomId,
        victoryRoomId,
        victoryBossId,
        transitions: current.path,
        visitedRoomOrder: current.visitedOrder,
      };
    }

    for (const { to, requirements } of adjacency.get(current.roomId) ?? []) {
      if (!requirements.every((req) => current.abilities.has(req))) continue;

      const nextAbilities = cloneAbilities(current.abilities);
      grantAt(to, nextAbilities);
      const key = stateKey(to, nextAbilities);
      if (seen.has(key)) continue;
      seen.add(key);

      queue.push({
        roomId: to,
        abilities: nextAbilities,
        path: [
          ...current.path,
          {
            fromRoomId: current.roomId,
            toRoomId: to,
            requirements: [...requirements],
          },
        ],
        visitedOrder: [...current.visitedOrder, to],
      });
    }
  }

  return {
    reachable: false,
    startRoomId,
    victoryRoomId,
    victoryBossId,
    transitions: [],
    visitedRoomOrder: [],
  };
}
