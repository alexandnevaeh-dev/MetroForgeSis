import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
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

/** Restore world data and room scenes on failed writes/compilation (not crash atomic). */
export function applyWorldEditAndRecompile(
  projectPath: string,
  command: WorldEditCommand,
  options?: { recompileRoomIds?: string[] },
): ProjectEditResult {
  let files: string[];
  let originals: Array<Buffer | null>;
  try {
    if (detectProjectEngine(projectPath) !== 'godot') {
      return { success: false, errors: ['This room/world edit requires the Godot adapter; Unity and Unreal recompilation is not implemented here.'] };
    }
    const project = loadProjectContext(projectPath);
    const updated = applyWorldEditCommand(project.worldGraph, command);
    const ids = new Set([...project.worldGraph.nodes, ...updated.nodes].filter((node) => node.type === 'room').map((node) => node.id));
    for (const id of [...ids, ...(options?.recompileRoomIds ?? [])]) {
      if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid room identifier');
    }
    if (command.type === 'move_room' && (!Number.isFinite(command.x) || !Number.isFinite(command.y))) {
      throw new Error('World positions must be finite numbers');
    }
    files = [
      join(projectPath, 'world_graph.json'),
      join(projectPath, 'data', 'world', 'world_graph.json'),
      join(projectPath, 'data', 'rooms', 'rooms.json'),
      ...[...ids].map((id) => join(projectPath, 'scenes', 'rooms', `${id}.tscn`)),
    ];
    originals = files.map((file) => existsSync(file) ? readFileSync(file) : null);
  } catch (error) {
    return { success: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  let result: ProjectEditResult;
  try {
    result = applyWorldEditUnchecked(projectPath, command, options);
  } catch (error) {
    result = { success: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  if (result.success) return result;
  const errors = [...result.errors];
  files.forEach((file, index) => {
    try {
      const original = originals[index];
      if (original === null) {
        if (existsSync(file)) unlinkSync(file);
      } else if (original !== undefined && (!existsSync(file) || !readFileSync(file).equals(original))) {
        writeFileSync(file, original);
      }
    } catch (error) {
      errors.push(`World rollback failed for ${file}: ${String(error)}`);
    }
  });
  return { success: false, errors, recompiledRooms: [] };
}

function applyWorldEditUnchecked(
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
  if (!recompile.success && errors.length === 0) errors.push("World room compilation failed");

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

function validateRoomPatch(patch: RoomEditPatch): string[] {
  if (!patch || typeof patch !== 'object' || typeof patch.roomId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(patch.roomId)) {
    return ['Invalid room identifier'];
  }
  for (const dimension of ['width', 'height'] as const) {
    const value = patch[dimension];
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) return [`Room ${dimension} must be a positive whole number`];
  }
  if (patch.hasEnemy !== undefined && typeof patch.hasEnemy !== 'boolean') return ['Enemy presence must be true or false'];
  for (const field of ['enemies', 'npcs'] as const) {
    const ids = patch[field];
    if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !id.trim()))) return [`Room ${field} must contain nonempty identifiers`];
  }
  if (patch.tileCells !== undefined) {
    if (!Array.isArray(patch.tileCells)) return ['Painted tiles must be an array'];
    const positions = new Set<string>();
    for (const cell of patch.tileCells) {
      if (!cell || ['x', 'y', 'col', 'row'].some((key) => {
        const value = cell[key as keyof typeof cell];
        return !Number.isSafeInteger(value) || value < 0;
      })) return ['Tile positions and atlas coordinates must be nonnegative whole numbers'];
      const key = `${cell.x},${cell.y}`;
      if (positions.has(key)) return [`More than one painted tile occupies cell ${key}`];
      positions.add(key);
    }
  }
  if (patch.entityPlacements !== undefined) {
    if (!Array.isArray(patch.entityPlacements)) return ['Entity placements must be an array'];
    const kinds = new Set(['player_spawn', 'enemy', 'boss', 'npc', 'ability_pickup', 'item_pickup', 'checkpoint']);
    const identities = new Set<string>();
    for (const entity of patch.entityPlacements) {
      if (!entity || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return ['Entity positions must be finite numbers'];
      if (!kinds.has(entity.kind) || typeof entity.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(entity.id)) {
        return ['Entity placements require a supported kind and valid identifier'];
      }
      if (entity.definitionId !== undefined && (typeof entity.definitionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(entity.definitionId))) {
        return ['Entity definition must be a valid identifier'];
      }
      const identity = `${entity.kind}:${entity.id}`;
      if (identities.has(identity)) return [`Duplicate entity identity: ${identity}`];
      identities.add(identity);
    }
  }
  return [];
}

/** Roll back ordinary room edits when compilation or writing fails (not crash atomic). */
export function applyRoomEditAndRecompile(
  projectPath: string,
  patch: RoomEditPatch,
  options?: { regenerate?: 'full' | 'geometry'; restoreRecord?: Record<string, unknown> },
): ProjectEditResult {
  const validationErrors = validateRoomPatch(patch);
  if (validationErrors.length) return { success: false, errors: validationErrors };
  const files = [
    join(projectPath, 'data', 'rooms', 'rooms.json'),
    join(projectPath, 'scenes', 'rooms', `${patch.roomId}.tscn`),
  ];
  let originals: Array<Buffer | null>;
  try {
    originals = files.map((file) => existsSync(file) ? readFileSync(file) : null);
  } catch (error) {
    return { success: false, errors: [`Cannot snapshot room edit: ${String(error)}`] };
  }
  let result: ProjectEditResult;
  try {
    result = applyRoomEditUnchecked(projectPath, patch, options);
  } catch (error) {
    result = { success: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  if (result.success) return result;
  const errors = [...result.errors];
  files.forEach((file, index) => {
    try {
      const original = originals[index];
      if (original === null) {
        if (existsSync(file)) unlinkSync(file);
      } else if (original !== undefined && (!existsSync(file) || !readFileSync(file).equals(original))) {
        writeFileSync(file, original);
      }
    } catch (error) {
      errors.push(`Room rollback failed for ${file}: ${String(error)}`);
    }
  });
  return { success: false, errors, recompiledRooms: [] };
}

function applyRoomEditUnchecked(
  projectPath: string,
  patch: RoomEditPatch,
  options?: { regenerate?: 'full' | 'geometry'; restoreRecord?: Record<string, unknown> },
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

  if (options?.regenerate || options?.restoreRecord) {
    if (options.restoreRecord) roomsData[patch.roomId] = structuredClone(options.restoreRecord);
    else if (options.regenerate === 'geometry') {
      const geometryReset = { ...existing };
      delete geometryReset.tileCells;
      delete geometryReset.tileCellsAuthored;
      delete geometryReset.platforms;
      delete geometryReset.pits;
      delete geometryReset.blueprint;
      roomsData[patch.roomId] = geometryReset;
    } else delete roomsData[patch.roomId];
    writeFileSync(join(projectPath, 'data', 'rooms', 'rooms.json'), JSON.stringify({ rooms: roomsData }, null, 2));
    const rebuilt = new GodotProjectAssembler().recompileRooms({
      outputDir: projectPath,
      gameDna: project.gameDna,
      worldGraph: project.worldGraph,
      gameContent: project.gameContent,
      roomIds: project.roomIds,
      targetRoomIds: [patch.roomId],
    });
    const errors = [...rebuilt.errors];
    if (!rebuilt.success && !errors.length) errors.push('Room regeneration failed');
    return { success: rebuilt.success && !errors.length, errors, recompiledRooms: rebuilt.recompiled, message: `Room ${patch.roomId} ${options.restoreRecord ? "restored" : "regenerated"}` };
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

  const enemyPresence = patch.hasEnemy ?? (patch.enemies !== undefined ? patch.enemies.some((id) => !id.startsWith('boss_')) : undefined);

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
    ...(enemyPresence !== undefined ? { forceEnemy: enemyPresence } : {}),
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
    ...(enemyPresence !== undefined ? { hasEnemy: enemyPresence } : {}),
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
  return applyRoomEditAndRecompile(projectPath, { roomId }, { restoreRecord: snapshot });
}

export function regenerateRoom(
  projectPath: string,
  roomId: string,
  scope: 'full' | 'geometry' | 'encounter' = 'full',
): ProjectEditResult {
  if (scope === 'full' || scope === 'geometry') return applyRoomEditAndRecompile(projectPath, { roomId }, { regenerate: scope });
  const patch: RoomEditPatch = { roomId };
  if (scope === 'encounter') patch.hasEnemy = true;
  return applyRoomEditAndRecompile(projectPath, patch);
}
