import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  RoomFurnishingReview,
  RoomFurnishingEntry,
  RoomFurnishingFootprint,
} from '@metroforge/engines';

const unavailable = (error: string): RoomFurnishingReview => ({
  status: 'unavailable',
  error,
});
const text = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : undefined;
function footprint(value: unknown): RoomFurnishingFootprint | undefined {
  if (!value || typeof value !== 'object') return;
  const r = value as Record<string, unknown>;
  if (
    ![r.x, r.floorY, r.width, r.height].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
    Number(r.width) <= 0 ||
    Number(r.height) <= 0
  )
    return;
  return {
    x: Number(r.x),
    floorY: Number(r.floorY),
    width: Number(r.width),
    height: Number(r.height),
  };
}
/** Read exported placement facts without changing authored records, assets or geometry. */
export function readRoomFurnishingReviews(
  projectPath: string,
  roomIds: string[],
): Record<string, RoomFurnishingReview> {
  const result: Record<string, RoomFurnishingReview> = {};
  const file = join(projectPath, 'Assets/StreamingAssets/gameplay.json');
  if (!existsSync(file)) {
    for (const id of roomIds) result[id] = unavailable('This Unity export has no furnishing data.');
    return result;
  }
  let rooms: Array<Record<string, unknown>>, revision: string;
  try {
    if (statSync(file).size > 8 * 1024 * 1024) throw Error('limit');
    const bytes = readFileSync(file),
      pack = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(pack.rooms) || pack.rooms.length > 512) throw Error('rooms');
    rooms = pack.rooms;
    revision = createHash('sha256').update(bytes).digest('hex');
  } catch {
    for (const id of roomIds)
      result[id] = unavailable(
        'Furnishing data could not be read. Saved geometry is still available.',
      );
    return result;
  }
  for (const id of roomIds) {
    const matches = rooms.filter((r) => r?.id === id),
      room = matches[0];
    if (
      matches.length !== 1 ||
      !Array.isArray(room?.furnishings) ||
      !Array.isArray(room.furnishingOmissions)
    ) {
      result[id] = unavailable('Furnishing metadata is unavailable for this room export.');
      continue;
    }
    const entries: RoomFurnishingEntry[] = [];
    try {
      if (room.furnishings.length + room.furnishingOmissions.length > 512) throw Error('limit');
      for (const item of room.furnishings) {
        const box = footprint(item);
        if (
          !text(item?.id) ||
          !text(item?.anchor) ||
          !box ||
          item.collision !== 'none' ||
          !['rear', 'front'].includes(item.layer)
        )
          throw Error('placement');
        entries.push({
          id: item.id,
          status: 'placed',
          role: text(item.role),
          anchor: item.anchor,
          layer: item.layer,
          collision: 'none',
          footprint: box,
        });
      }
      for (const item of room.furnishingOmissions) {
        if (!text(item?.id) || !text(item?.reason)) throw Error('omission');
        entries.push({
          id: item.id,
          status: 'omitted',
          reason: item.reason,
          role: text(item.role),
          footprint: footprint(item.footprint),
        });
      }
      result[id] = {
        status: 'ready',
        source: 'unity-export',
        revision,
        entries,
        ...(room.terrainMaterial === 'stormglass-masonry-v1'
          ? { material: 'stormglass-masonry-v1' as const }
          : {}),
      };
    } catch {
      result[id] = unavailable(
        'Furnishing records are incomplete or invalid. Saved geometry is still available.',
      );
    }
  }
  return result;
}
