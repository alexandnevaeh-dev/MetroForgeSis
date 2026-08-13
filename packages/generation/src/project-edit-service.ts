import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GodotProjectAssembler } from '@metroforge/godot';
import { loadProjectContext } from './project-loader.js';
import { applyWorldEditCommand, type WorldEditCommand } from './world-edit.js';
import type { WorldGraph } from '@metroforge/schemas';

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

  const affectedRooms =
    options?.recompileRoomIds ??
    (command.type === 'add_room'
      ? [command.roomId, command.connectFromRoomId]
      : command.type === 'connect_rooms'
        ? [command.from, command.to]
        : command.type === 'disconnect_rooms'
          ? [command.from, command.to]
          : []);

  const assembler = new GodotProjectAssembler();
  const recompile = assembler.recompileRooms({
    outputDir: projectPath,
    gameDna: project.gameDna,
    worldGraph: updated,
    gameContent: project.gameContent,
    roomIds: project.roomIds,
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
}

export function applyRoomEditAndRecompile(
  projectPath: string,
  patch: RoomEditPatch,
): ProjectEditResult {
  const project = loadProjectContext(projectPath);
  const roomsData = { ...project.roomsData };
  const existing = roomsData[patch.roomId];
  if (!existing) {
    return { success: false, errors: [`Room ${patch.roomId} not found`] };
  }

  roomsData[patch.roomId] = {
    ...existing,
    ...(patch.archetype ? { archetype: patch.archetype } : {}),
    ...(patch.width ? { width: patch.width } : {}),
    ...(patch.height ? { height: patch.height } : {}),
    ...(patch.hasEnemy !== undefined ? { forceEnemy: patch.hasEnemy } : {}),
    ...(patch.tileCells ? { tileCells: patch.tileCells } : {}),
  };

  writeFileSync(
    join(projectPath, 'data', 'rooms', 'rooms.json'),
    JSON.stringify({ rooms: roomsData }, null, 2),
  );

  const assembler = new GodotProjectAssembler();
  const roomOverrides: Record<string, Partial<{ hasEnemy: boolean; width: number; height: number; tileCells: RoomEditPatch['tileCells'] }>> = {};
  if (patch.hasEnemy !== undefined || patch.width || patch.height || patch.tileCells) {
    roomOverrides[patch.roomId] = {
      ...(patch.hasEnemy !== undefined ? { hasEnemy: patch.hasEnemy } : {}),
      ...(patch.width ? { width: patch.width } : {}),
      ...(patch.height ? { height: patch.height } : {}),
      ...(patch.tileCells ? { tileCells: patch.tileCells } : {}),
    };
  }

  const recompile = assembler.recompileRooms({
    outputDir: projectPath,
    gameDna: project.gameDna,
    worldGraph: project.worldGraph,
    gameContent: project.gameContent,
    roomIds: project.roomIds,
    targetRoomIds: [patch.roomId],
    roomOverrides: Object.keys(roomOverrides).length ? roomOverrides : undefined,
  });

  return {
    success: recompile.errors.length === 0,
    recompiledRooms: recompile.recompiled,
    errors: recompile.errors,
    message: `Room ${patch.roomId} updated`,
  };
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
