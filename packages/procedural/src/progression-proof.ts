import type { ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import { isRegisteredAbilityId, TOP_DOWN_DUNGEON_ITEMS } from '@metroforge/shared';
import { planVictoryRoute } from './playtest-route.js';
import {
  validateMovementFeasibility,
  type MovementFeasibilityReport,
} from './movement-feasibility.js';
import { validateReachability, validateWorldReachability } from './world.js';

export interface ProgressionTraceStep {
  kind: 'visit' | 'acquire' | 'unlock_gate';
  roomId: string;
  abilityId?: string;
  gateTo?: string;
}

export interface ProgressionProof {
  version: string;
  seed: number;
  startRoomId: string;
  bossRoomId: string;
  startReachable: boolean;
  abilitiesAcquirable: Array<{ id: string; roomId: string | null; acquirable: boolean }>;
  selfLocks: Array<{ abilityId: string; roomId: string }>;
  unknownAbilities: string[];
  criticalPathReachable: boolean;
  bossReachable: boolean;
  victoryAchievable: boolean;
  noHardCycle: boolean;
  noUnavoidableSoftLock: boolean;
  movementFeasible: boolean;
  unreachableRoomIds: string[];
  unreachableProgressionNodes: string[];
  passed: boolean;
  trace: ProgressionTraceStep[];
}

function roomIdsOf(graph: WorldGraph): string[] {
  return graph.nodes.filter((n) => n.type === 'room' || n.type === 'zone').map((n) => n.id);
}

function grantsAt(graph: WorldGraph, roomId: string): string[] {
  const node = graph.nodes.find((n) => n.id === roomId);
  const grants = node?.metadata?.grantsAbilities;
  return Array.isArray(grants) ? grants.filter((a): a is string => typeof a === 'string') : [];
}

function requiredAbilities(graph: WorldGraph): string[] {
  const ids = new Set<string>();
  for (const edge of graph.edges) {
    for (const req of edge.requirements) ids.add(req);
  }
  for (const node of graph.nodes) {
    const grants = node.metadata?.grantsAbilities;
    if (Array.isArray(grants)) {
      for (const a of grants) if (typeof a === 'string') ids.add(a);
    }
  }
  return [...ids];
}

function buildAdjacency(graph: WorldGraph): Map<string, Array<{ to: string; requirements: string[] }>> {
  const adjacency = new Map<string, Array<{ to: string; requirements: string[] }>>();
  const add = (from: string, to: string, requirements: string[]) => {
    const list = adjacency.get(from) ?? [];
    list.push({ to, requirements });
    adjacency.set(from, list);
  };
  for (const edge of graph.edges) {
    add(edge.from, edge.to, edge.requirements);
    if (edge.bidirectional) add(edge.to, edge.from, edge.requirements);
  }
  return adjacency;
}

function walkTrace(graph: WorldGraph, startRoomId: string): ProgressionTraceStep[] {
  const adjacency = buildAdjacency(graph);
  const unlocked = new Set<string>();
  const visited = new Set<string>([startRoomId]);
  const trace: ProgressionTraceStep[] = [{ kind: 'visit', roomId: startRoomId }];
  for (const ability of grantsAt(graph, startRoomId)) {
    unlocked.add(ability);
    trace.push({ kind: 'acquire', roomId: startRoomId, abilityId: ability });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const roomId of [...visited]) {
      for (const { to, requirements } of adjacency.get(roomId) ?? []) {
        if (visited.has(to)) continue;
        if (!requirements.every((r) => unlocked.has(r))) continue;
        visited.add(to);
        trace.push({ kind: 'visit', roomId: to });
        if (requirements.length > 0) {
          trace.push({
            kind: 'unlock_gate',
            roomId,
            gateTo: to,
            abilityId: requirements[0],
          });
        }
        for (const ability of grantsAt(graph, to)) {
          if (!unlocked.has(ability)) {
            unlocked.add(ability);
            trace.push({ kind: 'acquire', roomId: to, abilityId: ability });
          }
        }
        changed = true;
      }
    }
  }
  return trace;
}

function findGrantRoom(graph: WorldGraph, abilityId: string): string | null {
  for (const node of graph.nodes) {
    const grants = node.metadata?.grantsAbilities;
    if (Array.isArray(grants) && grants.includes(abilityId)) return node.id;
  }
  return null;
}

/**
 * Simulate reachability while never granting `blockedAbility` — if its pickup room is
 * unreachable, the ability is locked behind itself (or behind an unsatisfiable cycle).
 */
function isSelfLocked(graph: WorldGraph, startRoomId: string, blockedAbility: string): boolean {
  const grantRoom = findGrantRoom(graph, blockedAbility);
  if (!grantRoom) return false;
  const adjacency = buildAdjacency(graph);
  const unlocked = new Set<string>();
  const visited = new Set<string>([startRoomId]);
  for (const ability of grantsAt(graph, startRoomId)) {
    if (ability !== blockedAbility) unlocked.add(ability);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const roomId of [...visited]) {
      for (const { to, requirements } of adjacency.get(roomId) ?? []) {
        if (visited.has(to)) continue;
        if (requirements.includes(blockedAbility)) continue;
        if (!requirements.every((r) => unlocked.has(r))) continue;
        visited.add(to);
        for (const ability of grantsAt(graph, to)) {
          if (ability !== blockedAbility) unlocked.add(ability);
        }
        changed = true;
      }
    }
  }
  return !visited.has(grantRoom);
}

export function buildProgressionProof(
  worldGraph: WorldGraph,
  progressionGraph: ProgressionGraph,
  movement?: MovementFeasibilityReport,
): ProgressionProof {
  const rooms = roomIdsOf(worldGraph);
  const startRoomId = progressionGraph.startNodeId || rooms[0] || '';
  const bossRoomId = progressionGraph.endNodeId || rooms[rooms.length - 1] || '';
  const startReachable = rooms.includes(startRoomId);

  const itemIds = new Set<string>(TOP_DOWN_DUNGEON_ITEMS.map((item) => item.id));
  const unknownAbilities = requiredAbilities(worldGraph).filter(
    (id) => !isRegisteredAbilityId(id) && !itemIds.has(id) && id.length > 0,
  );

  const worldReach = validateWorldReachability(worldGraph, new Set());
  const abstractReach = validateReachability(progressionGraph, new Set());
  const movementReport = movement ?? validateMovementFeasibility(worldGraph);
  const route = planVictoryRoute(worldGraph, { victoryRoomId: bossRoomId });
  const trace = startReachable ? walkTrace(worldGraph, startRoomId) : [];

  const abilities = [...new Set([...(progressionGraph.abilities ?? []), ...requiredAbilities(worldGraph)])];
  const acquiredRooms = new Map<string, string>();
  for (const step of trace) {
    if (step.kind === 'acquire' && step.abilityId) acquiredRooms.set(step.abilityId, step.roomId);
  }

  const abilitiesAcquirable = abilities.map((id) => ({
    id,
    roomId: acquiredRooms.get(id) ?? findGrantRoom(worldGraph, id),
    acquirable: acquiredRooms.has(id) || grantsAt(worldGraph, startRoomId).includes(id),
  }));

  const selfLocks = abilities
    .filter((id) => startReachable && isSelfLocked(worldGraph, startRoomId, id))
    .map((abilityId) => ({
      abilityId,
      roomId: findGrantRoom(worldGraph, abilityId) ?? '',
    }));

  const bossReachable = startReachable && !worldReach.unreachableRoomIds.includes(bossRoomId);
  const criticalPathReachable =
    abstractReach.reachable &&
    (progressionGraph.criticalPath ?? []).every(
      (id) =>
        !worldReach.unreachableRoomIds.includes(id) && !abstractReach.unreachableNodes.includes(id),
    );
  const victoryAchievable = bossReachable && route.reachable && criticalPathReachable;
  const noHardCycle = selfLocks.length === 0;
  const noUnavoidableSoftLock = worldReach.reachable && abstractReach.reachable;

  const passed =
    startReachable &&
    unknownAbilities.length === 0 &&
    abilitiesAcquirable.every((a) => a.acquirable) &&
    noHardCycle &&
    noUnavoidableSoftLock &&
    criticalPathReachable &&
    bossReachable &&
    victoryAchievable &&
    movementReport.feasible &&
    worldReach.reachable &&
    abstractReach.reachable;

  return {
    version: '0.1.0',
    seed: worldGraph.seed,
    startRoomId,
    bossRoomId,
    startReachable,
    abilitiesAcquirable,
    selfLocks,
    unknownAbilities,
    criticalPathReachable,
    bossReachable,
    victoryAchievable,
    noHardCycle,
    noUnavoidableSoftLock,
    movementFeasible: movementReport.feasible,
    unreachableRoomIds: worldReach.unreachableRoomIds,
    unreachableProgressionNodes: abstractReach.unreachableNodes,
    passed,
    trace,
  };
}
