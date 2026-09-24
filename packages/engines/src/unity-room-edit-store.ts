import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { GameplayPack } from './types.js';
import type { EditableObject } from './live-edit-session.js';
import { roomSolidObjects, withRoomSolids } from './room-solid-edit.js';

export interface UnityEnemyTiming { attackWindupSeconds: number; attackRecoverySeconds: number; attackCooldownSeconds: number }
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
  const enemy = pack.rooms.find(room => room.id === roomId)!.enemy;
  // Match EnemyActor.ConfigureAttack when inspecting legacy or out-of-range data.
  // Reading never rewrites the source files; normalization persists only on Save.
  const duration = (value: unknown, fallback: number, max: number) =>
    typeof value !== 'number' || !Number.isFinite(value) || value <= 0 ? fallback : Math.max(0.01, Math.min(max, value));
  const windup = duration(enemy?.attackWindupSeconds, 0.24, 10);
  const recovery = duration(enemy?.attackRecoverySeconds, 0.21, 10);
  const enemyTiming = enemy ? { attackWindupSeconds: windup, attackRecoverySeconds: recovery,
    attackCooldownSeconds: Math.max(windup + recovery, duration(enemy.attackCooldownSeconds, 0.8, 60)) } : undefined;
  return { objects, enemyTiming, farBackground: background?.far, backgroundFraming: { farCameraRelative: background?.farCameraRelative ?? false,
    farParallax: background?.farParallax ?? 0.1 }, fingerprints: originals.map(hash) };
}

/** Rollback on ordinary write failures. Backups also permit manual crash recovery. */
export function saveUnityRoomEdit(project: string, roomId: string, objects: EditableObject[], fingerprints: string[], backgroundFraming?: UnityBackgroundFraming, enemyTiming?: UnityEnemyTiming) {
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
  if (enemyTiming !== undefined) {
    const enemy = updated.rooms.find(room => room.id === roomId)!.enemy;
    if (!enemy) throw new Error('This room has no enemy to configure');
    const keys = ['attackWindupSeconds', 'attackRecoverySeconds', 'attackCooldownSeconds'] as const;
    if (!enemyTiming || Object.keys(enemyTiming).some(key => !keys.includes(key as typeof keys[number])) ||
        keys.some(key => typeof enemyTiming[key] !== 'number' || !Number.isFinite(enemyTiming[key]) || enemyTiming[key] < 0.01 || enemyTiming[key] > (key === 'attackCooldownSeconds' ? 60 : 10)) ||
        enemyTiming.attackCooldownSeconds < enemyTiming.attackWindupSeconds + enemyTiming.attackRecoverySeconds)
      throw new Error('Invalid enemy timing: use positive durations; cooldown must cover windup and recovery');
    Object.assign(enemy, enemyTiming);
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
