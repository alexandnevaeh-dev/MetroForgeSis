import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readRoomFurnishingReviews } from './room-furnishing-review.js';
const root = join(
  'E:/MetroForgeData/Development/castle-furnishing-review-20261010',
  'reader-tests-' + randomUUID(),
);
mkdirSync(root, { recursive: true });
const placement = {
  id: 'RecordsDesk',
  role: 'desk',
  x: 480,
  floorY: 128,
  width: 80,
  height: 40,
  layer: 'rear',
  collision: 'none',
  anchor: 'Platform_8',
  asset: 'private-value-not-for-ipc',
};
function fixture(name: string, rooms: unknown[]) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'Assets/StreamingAssets'), { recursive: true });
  writeFileSync(join(dir, 'Assets/StreamingAssets/gameplay.json'), JSON.stringify({ rooms }));
  return dir;
}
describe('read-only room furnishing review', () => {
  it('retains authored anchors and omitted footprints without exposing asset fields or writing files', () => {
    const dir = fixture('exact', [
      {
        id: 'loft',
        furnishings: [placement],
        furnishingOmissions: [
          {
            id: 'desk-gap',
            reason: 'unsupported-full-footprint',
            role: 'desk',
            footprint: { x: 768, floorY: 128, width: 80, height: 40 },
          },
        ],
      },
    ]);
    const file = join(dir, 'Assets/StreamingAssets/gameplay.json'),
      before = readFileSync(file);
    const data = readRoomFurnishingReviews(dir, ['loft']).loft;
    expect(data?.status).toBe('ready');
    expect(data?.entries?.[0]).toMatchObject({
      anchor: 'Platform_8',
      collision: 'none',
      footprint: { x: 480, floorY: 128 },
    });
    expect(data?.entries?.[1]).toMatchObject({
      status: 'omitted',
      reason: 'unsupported-full-footprint',
      footprint: { x: 768, floorY: 128 },
    });
    expect(JSON.stringify(data)).not.toContain('private-value');
    expect(readFileSync(file)).toEqual(before);
  });
  it('keeps older omission reasons when a footprint is unavailable', () => {
    const dir = fixture('legacy', [
      {
        id: 'loft',
        furnishings: [],
        furnishingOmissions: [{ id: 'old-desk', reason: 'stair-flight-clearance' }],
      },
    ]);
    expect(readRoomFurnishingReviews(dir, ['loft']).loft?.entries?.[0]).toEqual({
      id: 'old-desk',
      status: 'omitted',
      reason: 'stair-flight-clearance',
      role: undefined,
      footprint: undefined,
    });
  });
  it('reports invalid rooms separately without hiding other geometry', () => {
    const dir = fixture('partial', [
      {
        id: 'loft',
        furnishings: [{ ...placement, collision: 'solid' }],
        furnishingOmissions: [],
      },
      { id: 'vault', furnishings: [], furnishingOmissions: [] },
    ]);
    const result = readRoomFurnishingReviews(dir, ['loft', 'vault']);
    expect(result.loft?.status).toBe('unavailable');
    expect(result.vault?.status).toBe('ready');
  });
  it('rejects duplicate room identities as unavailable', () => {
    const room = { id: 'loft', furnishings: [], furnishingOmissions: [] };
    const dir = fixture('duplicate', [room, room]);
    expect(readRoomFurnishingReviews(dir, ['loft']).loft?.status).toBe('unavailable');
  });
  it('does not invent a passing check for missing or malformed exports', () => {
    const dir = fixture('bad', []),
      file = join(dir, 'Assets/StreamingAssets/gameplay.json');
    writeFileSync(file, '{');
    expect(readRoomFurnishingReviews(dir, ['loft']).loft?.status).toBe('unavailable');
    expect(readRoomFurnishingReviews(join(root, 'absent'), ['loft']).loft?.status).toBe(
      'unavailable',
    );
  });
});
