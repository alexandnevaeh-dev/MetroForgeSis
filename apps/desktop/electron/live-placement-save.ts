import {
  inspectPlacementForSave,
  saveAuthoredPlacement,
  type PlacementSaveSnapshot,
} from '@metroforge/generation';
import { getPlaytestSession, sendPlaytestCommand } from '@metroforge/tools';
import { resolve } from 'node:path';

export interface LivePlacementInspection {
  projectPath: string;
  sessionStartedAt: string;
  nodePath: string;
  instanceId: string;
  source: PlacementSaveSnapshot;
  position: { x: number; y: number };
}

async function currentObject(
  projectPath: string,
  nodePath: string,
  instanceId: string,
  sessionStartedAt: string,
) {
  const session = getPlaytestSession(projectPath);
  if (!session || session.startedAt !== sessionStartedAt)
    throw new Error('Preview session changed. Inspect again before saving.');
  const state = await sendPlaytestCommand(projectPath, 'get_state');
  if (getPlaytestSession(projectPath)?.startedAt !== sessionStartedAt)
    throw new Error('Preview session changed while inspecting.');
  if (!state.ok || !Array.isArray(state.result?.objects))
    throw new Error(state.error ?? 'Runtime inspection was not acknowledged');
  const matches = (state.result.objects as Array<Record<string, unknown>>).filter(
    (object) => object.nodePath === nodePath && object.instanceId === instanceId,
  );
  if (matches.length !== 1) throw new Error('Runtime object changed. Inspect again before saving.');
  const object = matches[0]!;
  if (
    !object.authored ||
    typeof object.authored !== 'object' ||
    !Number.isFinite(object.x) ||
    !Number.isFinite(object.y)
  ) {
    throw new Error('This runtime object has no saved placement');
  }
  return {
    identity: object.authored as PlacementSaveSnapshot['identity'],
    position: { x: Number(object.x), y: Number(object.y) },
  };
}

export async function inspectLivePlacement(
  projectPath: string,
  target: { nodePath: string; instanceId: string; sessionStartedAt: string },
): Promise<LivePlacementInspection> {
  const object = await currentObject(
    projectPath,
    target.nodePath,
    target.instanceId,
    target.sessionStartedAt,
  );
  const source = inspectPlacementForSave(projectPath, object.identity);
  return { ...target, projectPath: resolve(projectPath), source, position: object.position };
}

export async function saveLivePlacement(
  projectPath: string,
  inspection: LivePlacementInspection,
  position: { x: number; y: number },
) {
  if (
    !inspection?.source?.identity ||
    !position ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y)
  ) {
    throw new Error('Invalid placement save request');
  }
  if (inspection.projectPath !== resolve(projectPath)) {
    throw new Error('Placement inspection belongs to another project');
  }
  const object = await currentObject(
    projectPath,
    inspection.nodePath,
    inspection.instanceId,
    inspection.sessionStartedAt,
  );
  const expected = inspection.source.identity;
  if (
    object.identity.roomId !== expected.roomId ||
    object.identity.kind !== expected.kind ||
    object.identity.id !== expected.id
  ) {
    throw new Error('Authored identity changed. Inspect again before saving.');
  }
  if (object.position.x !== position.x || object.position.y !== position.y) {
    throw new Error('Runtime position changed. Pause and inspect again before saving.');
  }
  return saveAuthoredPlacement(projectPath, object.identity, inspection.source.revision, position);
}
