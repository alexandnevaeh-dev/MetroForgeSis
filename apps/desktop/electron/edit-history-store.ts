import { resolve as resolveProjectPath } from 'node:path';
import type { WorldGraph } from '@metroforge/schemas';
import type { WorldEditCommand } from '@metroforge/generation';
import {
  EditHistory,
  saveAuthoredPlacement,
  restoreRoomRecord,
  snapshotRoomRecord,
  type PlacementSaveSnapshot,
  type ProjectEditResult,
} from '@metroforge/generation';

const worldHistories = new Map<
  string,
  EditHistory<{ command: WorldEditCommand; previousGraph: WorldGraph }>
>();

type RoomHistoryPayload = {
  roomId: string;
  previousRoom: Record<string, unknown>;
  summary: string;
  nextRoom?: Record<string, unknown>;
  placement?: {
    saved: PlacementSaveSnapshot;
    before: { x: number; y: number };
    after: { x: number; y: number };
  };
};

const roomHistories = new Map<string, EditHistory<RoomHistoryPayload>>();

function worldHistoryFor(
  projectPath: string,
): EditHistory<{ command: WorldEditCommand; previousGraph: WorldGraph }> {
  projectPath = resolveProjectPath(projectPath);
  let h = worldHistories.get(projectPath);
  if (!h) {
    h = new EditHistory(50);
    worldHistories.set(projectPath, h);
  }
  return h;
}

function roomHistoryFor(projectPath: string): EditHistory<RoomHistoryPayload> {
  projectPath = resolveProjectPath(projectPath);
  let h = roomHistories.get(projectPath);
  if (!h) {
    h = new EditHistory(50);
    roomHistories.set(projectPath, h);
  }
  return h;
}

export function recordWorldEdit(
  projectPath: string,
  command: WorldEditCommand,
  previousGraph: WorldGraph,
): void {
  worldHistoryFor(projectPath).push({
    id: `${Date.now()}`,
    type: command.type,
    payload: { command, previousGraph },
    timestamp: new Date().toISOString(),
  });
}

export function popWorldUndo(projectPath: string): WorldGraph | null {
  const cmd = worldHistoryFor(projectPath).popUndo();
  return cmd?.payload.previousGraph ?? null;
}

export function popWorldRedo(projectPath: string): WorldEditCommand | null {
  const cmd = worldHistoryFor(projectPath).popRedo();
  return cmd?.payload.command ?? null;
}

export function canUndoWorld(projectPath: string): boolean {
  return worldHistoryFor(projectPath).canUndo();
}

export function canRedoWorld(projectPath: string): boolean {
  return worldHistoryFor(projectPath).canRedo();
}

export function listWorldEditHistory(projectPath: string) {
  return worldHistoryFor(projectPath)
    .list()
    .map((c) => ({
      id: c.id,
      type: c.type,
      timestamp: c.timestamp,
    }));
}

export function recordRoomEdit(
  projectPath: string,
  roomId: string,
  previousRoom: Record<string, unknown>,
  summary: string,
): void {
  roomHistoryFor(projectPath).push({
    id: `${Date.now()}`,
    type: 'room_edit',
    payload: { roomId, previousRoom: structuredClone(previousRoom), summary },
    timestamp: new Date().toISOString(),
  });
}

export function recordLivePlacementEdit(
  projectPath: string,
  saved: PlacementSaveSnapshot,
  previousRoom: Record<string, unknown>,
): void {
  const rows = previousRoom.entityPlacements as Array<{
    kind: string;
    id: string;
    x: number;
    y: number;
  }>;
  const before = rows.find(
    (row) => row.kind === saved.identity.kind && row.id === saved.identity.id,
  )!;
  roomHistoryFor(projectPath).push({
    id: `${Date.now()}`,
    type: 'live_placement',
    payload: {
      roomId: saved.identity.roomId,
      previousRoom: structuredClone(previousRoom),
      summary: `Save live placement ${saved.identity.id}`,
      placement: {
        saved: structuredClone(saved),
        before: { x: before.x, y: before.y },
        after: { x: saved.x, y: saved.y },
      },
    },
    timestamp: new Date().toISOString(),
  });
}

function travelRoomHistory(projectPath: string, direction: 'undo' | 'redo'): ProjectEditResult {
  const history = roomHistoryFor(projectPath);
  const command = direction === 'undo' ? history.peekUndo() : history.peekRedo();
  if (!command) return { success: false, errors: [`Nothing to ${direction}`] };
  const payload = command.payload;
  try {
    if (payload.placement) {
      const placement = payload.placement;
      const result = saveAuthoredPlacement(
        projectPath,
        placement.saved.identity,
        placement.saved.revision,
        direction === 'undo' ? placement.before : placement.after,
      );
      placement.saved = result.saved;
    } else {
      const snapshot = direction === 'undo' ? payload.previousRoom : payload.nextRoom;
      if (!snapshot) return { success: false, errors: ['No room snapshot available for redo'] };
      const current = snapshotRoomRecord(projectPath, payload.roomId);
      const result = restoreRoomRecord(projectPath, payload.roomId, snapshot);
      if (!result.success) return result;
      if (direction === 'undo' && current) payload.nextRoom = current;
    }
    if (direction === 'undo') history.popUndo();
    else history.popRedo();
    return {
      success: true,
      errors: [],
      message: `${direction === 'undo' ? 'Undid' : 'Redid'} ${payload.summary}. Running preview unchanged.`,
    };
  } catch (error) {
    return { success: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export function undoRoomEdit(projectPath: string): ProjectEditResult {
  return travelRoomHistory(projectPath, 'undo');
}
export function redoRoomEdit(projectPath: string): ProjectEditResult {
  return travelRoomHistory(projectPath, 'redo');
}

export function canUndoRoom(projectPath: string): boolean {
  return roomHistoryFor(projectPath).canUndo();
}

export function canRedoRoom(projectPath: string): boolean {
  return roomHistoryFor(projectPath).canRedo();
}

export function listRoomEditHistory(projectPath: string) {
  return roomHistoryFor(projectPath)
    .list()
    .map((c) => ({
      id: c.id,
      type: c.type,
      roomId: c.payload.roomId,
      summary: c.payload.summary,
      timestamp: c.timestamp,
    }));
}
