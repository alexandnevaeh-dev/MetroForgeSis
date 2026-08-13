import type { WorldGraph } from '@metroforge/schemas';
import { validateWorldConnectivity, validateWorldReachability } from '@metroforge/procedural';

export interface WorldEditValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AddRoomCommand {
  type: 'add_room';
  roomId: string;
  label?: string;
  archetype?: string;
  biomeIndex?: number;
  connectFromRoomId: string;
  bidirectional?: boolean;
}

export interface ConnectRoomsCommand {
  type: 'connect_rooms';
  from: string;
  to: string;
  bidirectional?: boolean;
  requirements?: string[];
}

export interface DisconnectRoomsCommand {
  type: 'disconnect_rooms';
  from: string;
  to: string;
}

export type WorldEditCommand = AddRoomCommand | ConnectRoomsCommand | DisconnectRoomsCommand;

export function validateWorldGraph(graph: WorldGraph): WorldEditValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { connected, unreachableRoomIds } = validateWorldConnectivity(graph);
  if (!connected) {
    errors.push(`Disconnected rooms: ${unreachableRoomIds.join(', ')}`);
  }

  const { reachable, unreachableRoomIds: progressionUnreachable } = validateWorldReachability(
    graph,
    new Set(),
  );
  if (!reachable) {
    errors.push(`Rooms unreachable via ability progression: ${progressionUnreachable.join(', ')}`);
  }

  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      errors.push(`Edge ${edge.id} references missing room`);
    }
  }

  const bossRooms = graph.nodes.filter((n) => n.metadata?.archetype === 'boss');
  if (bossRooms.length === 0) {
    warnings.push('No boss room marked in world graph');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function applyWorldEditCommand(graph: WorldGraph, command: WorldEditCommand): WorldGraph {
  const next: WorldGraph = structuredClone(graph);

  switch (command.type) {
    case 'add_room': {
      if (next.nodes.some((n) => n.id === command.roomId)) {
        throw new Error(`Room ${command.roomId} already exists`);
      }
      if (!next.nodes.some((n) => n.id === command.connectFromRoomId)) {
        throw new Error(`Source room ${command.connectFromRoomId} not found`);
      }
      next.nodes.push({
        id: command.roomId,
        type: 'room',
        label: command.label ?? command.roomId,
        metadata: {
          archetype: command.archetype ?? 'treasure',
          biomeIndex: command.biomeIndex ?? 0,
          regionIndex: 0,
          grantsAbilities: [],
        },
      });
      next.edges.push({
        id: `edge_${command.connectFromRoomId}_${command.roomId}`,
        from: command.connectFromRoomId,
        to: command.roomId,
        requirements: [],
        optional: true,
        bidirectional: command.bidirectional ?? true,
      });
      break;
    }
    case 'connect_rooms': {
      if (next.edges.some((e) => e.from === command.from && e.to === command.to)) {
        return next;
      }
      next.edges.push({
        id: `edge_${command.from}_${command.to}`,
        from: command.from,
        to: command.to,
        requirements: command.requirements ?? [],
        optional: false,
        bidirectional: command.bidirectional ?? true,
      });
      break;
    }
    case 'disconnect_rooms': {
      next.edges = next.edges.filter(
        (e) =>
          !(e.from === command.from && e.to === command.to) &&
          !(e.from === command.to && e.to === command.from),
      );
      break;
    }
  }

  const validation = validateWorldGraph(next);
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }
  return next;
}
