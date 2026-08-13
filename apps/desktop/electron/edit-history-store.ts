import type { WorldGraph } from '@metroforge/schemas';
import type { WorldEditCommand } from '@metroforge/generation';
import { EditHistory } from '@metroforge/generation';

const histories = new Map<string, EditHistory<{ command: WorldEditCommand; previousGraph: WorldGraph }>>();

function historyFor(projectPath: string): EditHistory<{ command: WorldEditCommand; previousGraph: WorldGraph }> {
  let h = histories.get(projectPath);
  if (!h) {
    h = new EditHistory(50);
    histories.set(projectPath, h);
  }
  return h;
}

export function recordWorldEdit(
  projectPath: string,
  command: WorldEditCommand,
  previousGraph: WorldGraph,
): void {
  historyFor(projectPath).push({
    id: `${Date.now()}`,
    type: command.type,
    payload: { command, previousGraph },
    timestamp: new Date().toISOString(),
  });
}

export function popWorldUndo(projectPath: string): WorldGraph | null {
  const cmd = historyFor(projectPath).popUndo();
  return cmd?.payload.previousGraph ?? null;
}

export function canUndoWorld(projectPath: string): boolean {
  return historyFor(projectPath).canUndo();
}

export function canRedoWorld(projectPath: string): boolean {
  return historyFor(projectPath).canRedo();
}

export function listWorldEditHistory(projectPath: string) {
  return historyFor(projectPath).list().map((c) => ({
    id: c.id,
    type: c.type,
    timestamp: c.timestamp,
  }));
}
