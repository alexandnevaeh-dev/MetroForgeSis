import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { detectProjectEngine } from '@metroforge/engines';
import type { EntityPlacement } from '@metroforge/godot';

export interface AuthoredPlacementIdentity {
  roomId: string;
  kind: EntityPlacement['kind'];
  id: string;
}

export interface PlacementSaveSnapshot {
  identity: AuthoredPlacementIdentity;
  revision: string;
  x: number;
  y: number;
}

const kinds = new Set([
  'player_spawn',
  'enemy',
  'boss',
  'npc',
  'ability_pickup',
  'item_pickup',
  'checkpoint',
]);

/** Top-down spawn positions are authored in one world document, not room scenes. */
function readTopdownSpawn(projectPath: string, identity: AuthoredPlacementIdentity) {
  const path = join(projectPath, 'data', 'world', 'overworld.json');
  if (!existsSync(path)) return null;
  if (detectProjectEngine(projectPath) !== 'godot') throw new Error('Live placement saving requires Godot.');
  if (!identity || !/^[a-zA-Z0-9_-]+$/.test(identity.roomId) ||
      identity.kind !== 'player_spawn' || typeof identity.id !== 'string' || !identity.id) {
    throw new Error('Top-down live saving currently supports authored player spawns only.');
  }
  const text = readFileSync(path, 'utf8');
  const document = JSON.parse(text) as { areas?: Array<{ id: string; pois?: Array<{
    id: string; kind: string; x: number; y: number;
  }> }> };
  const areas = Array.isArray(document.areas) ? document.areas.filter(a => a && a.id === identity.roomId) : [];
  if (areas.length !== 1) throw new Error('Saved area is missing or ambiguous.');
  const pois = areas[0]!.pois;
  const matches = Array.isArray(pois) ? pois.filter(p => p && p.kind === 'spawn' && p.id === identity.id) : [];
  if (matches.length !== 1 || !Number.isFinite(matches[0]!.x) || !Number.isFinite(matches[0]!.y)) {
    throw new Error('Saved spawn is missing, ambiguous, or invalid.');
  }
  return { path, document, placement: matches[0]!, revision: createHash('sha256').update(text).digest('hex') };
}

/** Read the two source artifacts together. A revision covers both, including unrelated edits. */
function readPlacement(projectPath: string, identity: AuthoredPlacementIdentity) {
  if (detectProjectEngine(projectPath) !== 'godot') {
    throw new Error(
      'Live placement saving currently requires a Godot project. Unity and Unreal need their own save adapters.',
    );
  }
  if (
    !identity ||
    !/^[a-zA-Z0-9_-]+$/.test(identity.roomId) ||
    !kinds.has(identity.kind) ||
    typeof identity.id !== 'string' ||
    !identity.id
  ) {
    throw new Error('Invalid authored placement identity');
  }
  const roomsPath = join(projectPath, 'data', 'rooms', 'rooms.json');
  const scenePath = join(projectPath, 'scenes', 'rooms', `${identity.roomId}.tscn`);
  const roomsText = readFileSync(roomsPath, 'utf8');
  const sceneText = readFileSync(scenePath, 'utf8');
  const document = JSON.parse(roomsText) as {
    rooms?: Record<string, { entityPlacements?: EntityPlacement[] }>;
  };
  const placements = document.rooms?.[identity.roomId]?.entityPlacements;
  if (!Array.isArray(placements)) throw new Error('Room has no saved entity placements');
  const matches = placements.filter((p) => p && p.kind === identity.kind && p.id === identity.id);
  if (matches.length !== 1 || !Number.isFinite(matches[0]!.x) || !Number.isFinite(matches[0]!.y)) {
    throw new Error('Saved placement is missing, ambiguous, or invalid');
  }

  // Generated scene sections retain their original text. Never match a child sprite,
  // a display name, or a substring of an ID as the persistence target.
  const sections = sceneText.split(/(?=^\[)/m);
  const targets = sections
    .map((section, index) => {
      if (!/^\[node [^\r\n]* parent="\."[\s\]]/.test(section)) return -1;
      const metadata: Record<string, unknown> = {};
      for (const line of section.split(/\r?\n/).slice(1)) {
        const match = /^metadata\/metroforge_(room_id|entity_kind|entity_id) = (.+)$/.exec(line);
        if (!match) continue;
        if (Object.hasOwn(metadata, match[1]!))
          throw new Error('Duplicate authoring metadata in scene');
        metadata[match[1]!] = JSON.parse(match[2]!);
      }
      return metadata.room_id === identity.roomId &&
        metadata.entity_kind === identity.kind &&
        metadata.entity_id === identity.id
        ? index
        : -1;
    })
    .filter((index) => index >= 0);
  if (targets.length !== 1)
    throw new Error(
      'Scene has no unique authored placement. Regenerate or recompile it before saving live edits.',
    );
  const sectionIndex = targets[0]!;
  const positionPattern = /^position = Vector2\([^\r\n]*\)$/gm;
  if ([...sections[sectionIndex]!.matchAll(positionPattern)].length !== 1) {
    throw new Error('Scene placement has no unique position property');
  }
  const revision = createHash('sha256')
    .update(JSON.stringify([roomsText, sceneText]))
    .digest('hex');
  return {
    roomsPath,
    scenePath,
    roomsText,
    sceneText,
    document,
    placement: matches[0]!,
    sections,
    sectionIndex,
    positionPattern,
    revision,
  };
}

export function inspectPlacementForSave(
  projectPath: string,
  identity: AuthoredPlacementIdentity,
): PlacementSaveSnapshot {
  const source = readTopdownSpawn(projectPath, identity) ?? readPlacement(projectPath, identity);
  return {
    identity: { ...identity },
    revision: source.revision,
    x: source.placement.x,
    y: source.placement.y,
  };
}

/** Save explicit coordinates; this never changes or restarts the running game.
 * Callers must verify the runtime session/acknowledgement and record returned history.
 */
export function saveAuthoredPlacement(
  projectPath: string,
  identity: AuthoredPlacementIdentity,
  expectedRevision: string,
  position: { x: number; y: number },
): { saved: PlacementSaveSnapshot; previousRoom: Record<string, unknown> } {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error('Saved position must contain finite coordinates');
  }
  const topdown = readTopdownSpawn(projectPath, identity);
  if (topdown) {
    if (topdown.revision !== expectedRevision) throw new Error('World source changed since inspection. Inspect again before saving.');
    // Existing placement history consumes a normalized placement snapshot and replays
    // coordinates through this adapter; it never restores this as an entire area.
    const previousRoom = { entityPlacements: [{ ...identity, x: topdown.placement.x, y: topdown.placement.y }] };
    topdown.placement.x = position.x;
    topdown.placement.y = position.y;
    const next = JSON.stringify(topdown.document, null, 2);
    const temporary = `${topdown.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, next, { flag: 'wx' });
      renameSync(temporary, topdown.path);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return { previousRoom, saved: { identity: { ...identity }, ...position,
      revision: createHash('sha256').update(next).digest('hex') } };
  }
  const source = readPlacement(projectPath, identity);
  if (source.revision !== expectedRevision) {
    throw new Error('Room source changed since inspection. Inspect again before saving.');
  }
  const previousRoom = structuredClone(source.document.rooms![identity.roomId]!) as Record<
    string,
    unknown
  >;
  source.placement.x = position.x;
  source.placement.y = position.y;
  source.sections[source.sectionIndex] = source.sections[source.sectionIndex]!.replace(
    source.positionPattern,
    `position = Vector2(${position.x}, ${position.y})`,
  );
  const nextRooms = JSON.stringify(source.document, null, 2);
  const nextScene = source.sections.join('');
  // Synchronous operation prevents other Studio requests interleaving. Restore both
  // artifacts on I/O failure; this is not a crash-safe multi-file transaction.
  try {
    writeFileSync(source.scenePath, nextScene);
    writeFileSync(source.roomsPath, nextRooms);
  } catch (error) {
    const failures: unknown[] = [error];
    for (const [path, text] of [
      [source.scenePath, source.sceneText],
      [source.roomsPath, source.roomsText],
    ]) {
      try {
        writeFileSync(path!, text!);
      } catch (restoreError) {
        failures.push(restoreError);
      }
    }
    throw new AggregateError(
      failures,
      failures.length > 1
        ? 'Placement save failed and rollback was incomplete. Inspect source files before retrying.'
        : 'Placement save failed; original source restored.',
    );
  }
  return {
    previousRoom,
    saved: {
      identity: { ...identity },
      x: position.x,
      y: position.y,
      revision: createHash('sha256')
        .update(JSON.stringify([nextRooms, nextScene]))
        .digest('hex'),
    },
  };
}
