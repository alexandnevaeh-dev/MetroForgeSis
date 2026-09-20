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

export interface RemoveRoomCommand {
  type: 'remove_room';
  roomId: string;
}

export interface DuplicateRoomCommand {
  type: 'duplicate_room';
  roomId: string;
  newRoomId: string;
  label?: string;
}

export interface MoveRoomCommand {
  type: 'move_room';
  roomId: string;
  x: number;
  y: number;
}

export type WorldEditCommand =
  | AddRoomCommand
  | ConnectRoomsCommand
  | DisconnectRoomsCommand
  | RemoveRoomCommand
  | DuplicateRoomCommand
  | MoveRoomCommand;

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
    case 'remove_room': {
      if (next.nodes.length <= 1) {
        throw new Error('Cannot remove the last room');
      }
      if (!next.nodes.some((n) => n.id === command.roomId)) {
        throw new Error(`Room ${command.roomId} not found`);
      }
      next.nodes = next.nodes.filter((n) => n.id !== command.roomId);
      next.edges = next.edges.filter((e) => e.from !== command.roomId && e.to !== command.roomId);
      next.regions = next.regions.map((region) => ({
        ...region,
        roomIds: region.roomIds.filter((id) => id !== command.roomId),
      }));
      break;
    }
    case 'duplicate_room': {
      const source = next.nodes.find((n) => n.id === command.roomId);
      if (!source) {
        throw new Error(`Room ${command.roomId} not found`);
      }
      if (next.nodes.some((n) => n.id === command.newRoomId)) {
        throw new Error(`Room ${command.newRoomId} already exists`);
      }
      next.nodes.push({
        ...source,
        id: command.newRoomId,
        label: command.label ?? `${source.label} copy`,
        metadata: {
          ...(source.metadata ?? {}),
          x:
            typeof source.metadata?.x === 'number'
              ? Number(source.metadata.x) + 1
              : source.metadata?.x,
        },
      });
      next.edges.push({
        id: `edge_${command.roomId}_${command.newRoomId}`,
        from: command.roomId,
        to: command.newRoomId,
        requirements: [],
        optional: true,
        bidirectional: true,
      });
      next.regions = next.regions.map((region) =>
        region.roomIds.includes(command.roomId)
          ? { ...region, roomIds: [...region.roomIds, command.newRoomId] }
          : region,
      );
      break;
    }
    case 'move_room': {
      const node = next.nodes.find((n) => n.id === command.roomId);
      if (!node) {
        throw new Error(`Room ${command.roomId} not found`);
      }
      node.metadata = { ...(node.metadata ?? {}), x: command.x, y: command.y };
      break;
    }
  }

  const validation = validateWorldGraph(next);
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }
  return next;
}
