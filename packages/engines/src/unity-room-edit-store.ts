import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { GameplayPack } from './types.js';
import type { EditableObject } from './live-edit-session.js';
import { roomSolidObjects, withRoomSolids } from './room-solid-edit.js';

export interface UnityBackgroundFraming { farCameraRelative: boolean; farParallax: number }
const paths = (project: string) => [join(project, 'gameplay.json'), join(project, 'Assets', 'StreamingAssets', 'gameplay.json')];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function readUnityRoomEdit(project: string, roomId: string) {
  const originals = paths(project).map(path => readFileSync(path, 'utf8'));
  const pack = JSON.parse(originals[1]!) as GameplayPack;
  if (JSON.stringify(JSON.parse(originals[0]!)) !== JSON.stringify(pack))
    throw new Error('Gameplay copies differ; reconcile them before editing');
  const objects = roomSolidObjects(pack, roomId);
  const background = pack.rooms.find(room => room.id === roomId)!.backgrounds;
  return { objects, farBackground: background?.far, backgroundFraming: { farCameraRelative: background?.farCameraRelative ?? false,
    farParallax: background?.farParallax ?? 0.1 }, fingerprints: originals.map(hash) };
}

/** Rollback on ordinary write failures. Backups also permit manual crash recovery. */
export function saveUnityRoomEdit(project: string, roomId: string, objects: EditableObject[], fingerprints: string[], backgroundFraming?: UnityBackgroundFraming) {
  const files = paths(project);
  const originals = files.map(path => readFileSync(path, 'utf8'));
  if (fingerprints.length !== 2 || originals.some((text, index) => hash(text) !== fingerprints[index]))
    throw new Error('Gameplay changed since this room was opened; reload before saving');
  const pack = JSON.parse(originals[1]!) as GameplayPack;
  if (JSON.stringify(JSON.parse(originals[0]!)) !== JSON.stringify(pack)) throw new Error('Gameplay copies differ');
  const updated = withRoomSolids(pack, roomId, objects);
  if (backgroundFraming !== undefined) {
    if (!backgroundFraming || typeof backgroundFraming.farCameraRelative !== 'boolean' ||
      typeof backgroundFraming.farParallax !== 'number' || !Number.isFinite(backgroundFraming.farParallax) ||
      backgroundFraming.farParallax < 0 || backgroundFraming.farParallax > 1 ||
      Object.keys(backgroundFraming).some(key => !['farCameraRelative', 'farParallax'].includes(key)))
      throw new Error('Invalid background framing; parallax must be between 0 and 1');
    const room = updated.rooms.find(room => room.id === roomId)!;
    room.backgrounds = { ...room.backgrounds, ...backgroundFraming };
  }
  const output = JSON.stringify(updated, null, 2);
  const id = randomUUID();
  const backup = join(project, '.metroforge', 'room-edit-backups', id);
  mkdirSync(backup, { recursive: true });
  originals.forEach((text, index) => writeFileSync(join(backup, `${index}.json`), text, { flag: 'wx' }));
  const staged = files.map(file => `${file}.${id}.tmp`);
  const replaced: number[] = [];
  try {
    staged.forEach(file => writeFileSync(file, output, { flag: 'wx' }));
    // Detect external edits that occurred while staging, before replacing either copy.
    if (files.some((file, index) => hash(readFileSync(file, 'utf8')) !== fingerprints[index]))
      throw new Error('Gameplay changed while saving; reload before saving');
    files.forEach((file, index) => { renameSync(staged[index]!, file); replaced.push(index); });
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const index of replaced) {
      try { writeFileSync(files[index]!, originals[index]!); }
      catch (rollback) { rollbackErrors.push(String(rollback)); }
    }
    if (rollbackErrors.length) throw new Error(`Save failed: ${String(error)}; restore backups at ${backup}: ${rollbackErrors.join('; ')}`);
    throw error;
  } finally {
    staged.forEach(file => { if (existsSync(file)) unlinkSync(file); });
  }
  return { fingerprints: [hash(output), hash(output)], backup, restartRequired: true as const };
}
