import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GodotProjectAssembler, mergeEntityPlacementsForIds, type EntityPlacement } from '@metroforge/godot';
import { loadProjectContext } from './project-loader.js';
import { applyWorldEditCommand, type WorldEditCommand } from './world-edit.js';
import type { WorldGraph } from '@metroforge/schemas';
import { detectProjectEngine } from '@metroforge/engines';

export interface ProjectEditResult {
  success: boolean;
  worldGraph?: WorldGraph;
  recompiledRooms?: string[];
  errors: string[];
  message?: string;
}

export function applyWorldEditAndRecompile(
  projectPath: string,
  command: WorldEditCommand,
  options?: { recompileRoomIds?: string[] },
): ProjectEditResult {
  if (detectProjectEngine(projectPath) !== 'godot') {
    return { success: false, errors: ['This room/world edit requires the Godot adapter; Unity and Unreal recompilation is not implemented here.'] };
  }
  const errors: string[] = [];
  const project = loadProjectContext(projectPath);
  let updated: WorldGraph;
  try {
    updated = applyWorldEditCommand(project.worldGraph, command);
  } catch (err) {
    return {
      success: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  writeFileSync(join(projectPath, 'world_graph.json'), JSON.stringify(updated, null, 2));
  mkdirSync(join(projectPath, 'data', 'world'), { recursive: true });
  writeFileSync(join(projectPath, 'data', 'world', 'world_graph.json'), JSON.stringify(updated, null, 2));

  if (command.type === 'duplicate_room') {
    const roomsPath = join(projectPath, 'data', 'rooms', 'rooms.json');
    const sourceRoom = project.roomsData[command.roomId];
    if (sourceRoom) {
      const roomsData = { ...project.roomsData, [command.newRoomId]: structuredClone(sourceRoom) };
      mkdirSync(join(projectPath, 'data', 'rooms'), { recursive: true });
      writeFileSync(roomsPath, JSON.stringify({ rooms: roomsData }, null, 2));
    }
  }
  if (command.type === 'remove_room') {
    const roomsPath = join(projectPath, 'data', 'rooms', 'rooms.json');
    if (project.roomsData[command.roomId]) {
      const roomsData = { ...project.roomsData };
      delete roomsData[command.roomId];
      mkdirSync(join(projectPath, 'data', 'rooms'), { recursive: true });
      writeFileSync(roomsPath, JSON.stringify({ rooms: roomsData }, null, 2));
    }
  }

  if (command.type === 'move_room') {
    return {
      success: true,
      worldGraph: updated,
      recompiledRooms: [],
      errors,
      message: `Moved ${command.roomId} to (${command.x}, ${command.y}) — layout only, Godot scenes unchanged`,
    };
  }

  const affectedRooms =
    options?.recompileRoomIds ??
    (command.type === 'add_room'
      ? [command.roomId, command.connectFromRoomId]
      : command.type === 'connect_rooms'
        ? [command.from, command.to]
        : command.type === 'disconnect_rooms'
          ? [command.from, command.to]
          : command.type === 'duplicate_room'
            ? [command.roomId, command.newRoomId]
            : command.type === 'remove_room'
              ? project.worldGraph.edges
                  .filter((e) => e.from === command.roomId || e.to === command.roomId)
                  .flatMap((e) => [e.from, e.to])
                  .filter((id) => id !== command.roomId)
              : []);

  const assembler = new GodotProjectAssembler();
  const recompile = assembler.recompileRooms({
    outputDir: projectPath,
    gameDna: project.gameDna,
    worldGraph: updated,
    gameContent: project.gameContent,
    roomIds: updated.nodes.filter((n) => n.type === 'room').map((n) => n.id),
    targetRoomIds: affectedRooms,
  });

  if (recompile.errors.length) errors.push(...recompile.errors);

  return {
    success: errors.length === 0,
    worldGraph: updated,
    recompiledRooms: recompile.recompiled,
    errors,
    message: `Updated world graph; recompiled ${recompile.recompiled.length} room(s)`,
  };
}

export interface RoomEditPatch {
  roomId: string;
  hasEnemy?: boolean;
  width?: number;
  height?: number;
  archetype?: string;
  tileCells?: Array<{ x: number; y: number; col: number; row: number }>;
  enemies?: string[];
  npcs?: string[];
  entityPlacements?: EntityPlacement[];
}

function readRoomsFile(projectPath: string): Record<string, Record<string, unknown>> {
  const roomsPath = join(projectPath, 'data', 'rooms', 'rooms.json');
  if (!existsSync(roomsPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(roomsPath, 'utf-8')) as {
      rooms?: Record<string, Record<string, unknown>>;
    };
    return parsed.rooms ?? {};
  } catch {
    return {};
  }
}

export function applyRoomEditAndRecompile(
  projectPath: string,
  patch: RoomEditPatch,
): ProjectEditResult {
  if (detectProjectEngine(projectPath) !== 'godot') {
    return { success: false, errors: ['This room edit requires the Godot adapter; Unity and Unreal recompilation is not implemented here.'] };
  }
  const project = loadProjectContext(projectPath);
  const roomsData = { ...project.roomsData };
  const existing = roomsData[patch.roomId] as Record<string, unknown> | undefined;
  if (!existing) {
    return { success: false, errors: [`Room ${patch.roomId} not found`] };
  }

  const width = patch.width ?? (typeof existing.width === 'number' ? existing.width : 800);
  const height = patch.height ?? (typeof existing.height === 'number' ? existing.height : 600);
  const nextEnemies =
    patch.enemies ??
    (Array.isArray(existing.enemies) ? (existing.enemies as string[]) : []);
  const nextNpcs =
    patch.npcs ?? (Array.isArray(existing.npcs) ? (existing.npcs as string[]) : []);
  const priorPlacements = Array.isArray(existing.entityPlacements)
    ? (existing.entityPlacements as EntityPlacement[])
    : undefined;

  let entityPlacements = patch.entityPlacements;
  if (!entityPlacements) {
    entityPlacements = mergeEntityPlacementsForIds(
      priorPlacements,
      {
        width,
        height,
        tileSize: project.gameDna.technical?.tileSize ?? 16,
        hasEnemy: patch.hasEnemy ?? nextEnemies.length > 0,
        enemyId: nextEnemies[0],
        isBossRoom: String(existing.archetype ?? '') === 'boss',
        bossId: nextEnemies.find((id) => id.startsWith('boss_')),
        npcs: nextNpcs.map((id) => ({ id })),
        hasItemPickup: Array.isArray(existing.collectibles) && (existing.collectibles as string[]).length > 0,
        itemId: Array.isArray(existing.collectibles)
          ? (existing.collectibles as string[])[0]
          : undefined,
        hasSavePoint:
          String(existing.archetype ?? '') === 'save' ||
          Boolean((priorPlacements ?? []).some((p) => p.kind === 'checkpoint')),
        abilityPickups: (priorPlacements ?? [])
          .filter((p) => p.kind === 'ability_pickup')
          .map((p) => p.id),
      },
      nextEnemies.filter((id) => !id.startsWith('boss_')),
      nextNpcs,
    );
  }

  roomsData[patch.roomId] = {
    ...existing,
    ...(patch.archetype ? { archetype: patch.archetype } : {}),
    ...(patch.width ? { width: patch.width } : {}),
    ...(patch.height ? { height: patch.height } : {}),
    ...(patch.hasEnemy !== undefined ? { forceEnemy: patch.hasEnemy } : {}),
    ...(patch.tileCells ? { tileCells: patch.tileCells } : {}),
    ...(patch.enemies ? { enemies: patch.enemies } : {}),
    ...(patch.npcs ? { npcs: patch.npcs } : {}),
    entityPlacements,
  };

  writeFileSync(
    join(projectPath, 'data', 'rooms', 'rooms.json'),
    JSON.stringify({ rooms: roomsData }, null, 2),
  );

  const assembler = new GodotProjectAssembler();
  const roomOverrides: Record<
    string,
    Partial<{
      hasEnemy: boolean;
      width: number;
      height: number;
      tileCells: RoomEditPatch['tileCells'];
      entityPlacements: EntityPlacement[];
    }>
  > = {};
  roomOverrides[patch.roomId] = {
    ...(patch.hasEnemy !== undefined ? { hasEnemy: patch.hasEnemy } : {}),
    ...(patch.width ? { width: patch.width } : {}),
    ...(patch.height ? { height: patch.height } : {}),
    ...(patch.tileCells ? { tileCells: patch.tileCells } : {}),
    entityPlacements,
  };

  const recompile = assembler.recompileRooms({
    outputDir: projectPath,
    gameDna: project.gameDna,
    worldGraph: project.worldGraph,
    gameContent: project.gameContent,
    roomIds: project.roomIds,
    targetRoomIds: [patch.roomId],
    roomOverrides,
  });

  return {
    success: recompile.errors.length === 0,
    recompiledRooms: recompile.recompiled,
    errors: recompile.errors,
    message: `Room ${patch.roomId} updated`,
  };
}

/** Snapshot a room record for undo (includes entityPlacements). */
export function snapshotRoomRecord(
  projectPath: string,
  roomId: string,
): Record<string, unknown> | null {
  const rooms = readRoomsFile(projectPath);
  const room = rooms[roomId];
  return room ? structuredClone(room) : null;
}

export function restoreRoomRecord(
  projectPath: string,
  roomId: string,
  snapshot: Record<string, unknown>,
): ProjectEditResult {
  return applyRoomEditAndRecompile(projectPath, {
    roomId,
    width: typeof snapshot.width === 'number' ? snapshot.width : undefined,
    height: typeof snapshot.height === 'number' ? snapshot.height : undefined,
    archetype: typeof snapshot.archetype === 'string' ? snapshot.archetype : undefined,
    hasEnemy:
      typeof snapshot.forceEnemy === 'boolean'
        ? snapshot.forceEnemy
        : Array.isArray(snapshot.enemies) && (snapshot.enemies as string[]).length > 0,
    tileCells: Array.isArray(snapshot.tileCells)
      ? (snapshot.tileCells as RoomEditPatch['tileCells'])
      : undefined,
    enemies: Array.isArray(snapshot.enemies) ? (snapshot.enemies as string[]) : undefined,
    npcs: Array.isArray(snapshot.npcs) ? (snapshot.npcs as string[]) : undefined,
    entityPlacements: Array.isArray(snapshot.entityPlacements)
      ? (snapshot.entityPlacements as EntityPlacement[])
      : undefined,
  });
}

export function regenerateRoom(
  projectPath: string,
  roomId: string,
  scope: 'full' | 'geometry' | 'encounter' = 'full',
): ProjectEditResult {
  const patch: RoomEditPatch = { roomId };
  if (scope === 'encounter') patch.hasEnemy = true;
  if (scope === 'geometry') {
    patch.width = 800;
    patch.height = 600;
  }
  return applyRoomEditAndRecompile(projectPath, patch);
}
