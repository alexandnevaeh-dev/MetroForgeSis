import type { PlatformRect } from './tile-layout.js';

export const CASTLE_ROOM_FAMILIES = [
  'gallery',
  'chapel',
  'library',
  'arena',
  'crypt',
  'laboratory',
  'mine',
  'entrance',
] as const;
export type CastleRoomFamily = (typeof CASTLE_ROOM_FAMILIES)[number];

/** Original architectural studies: multi-screen rooms with real enclosure and
 * optional upper circulation. Existing world doors remain on the entry floor. */
export function buildCastleRoomFamily(family: CastleRoomFamily) {
  const specifications = {
    gallery: [6144, 2304, 3],
    chapel: [4096, 4096, 5],
    library: [4096, 2304, 3],
    arena: [4096, 2304, 3],
    crypt: [6144, 1536, 2],
    laboratory: [4096, 3072, 4],
    mine: [3072, 4096, 5],
    entrance: [6144, 2304, 3],
  } as const;
  if (!specifications[family]) throw new Error('Unknown castle room family');
  const [width, height, levels] = specifications[family];
  const floorY = height - 64;
  const platforms: PlatformRect[] = [];
  const floors = Array.from({ length: levels }, (_, i) => floorY - i * 768);
  const routes: Array<{ from: number; to: number; targets: Array<{ x: number; y: number }> }> = [];
  for (let level = 0; level < levels - 1; level++) {
    const right = level % 2 === 0;
    const targets = [];
    for (let step = 0; step < 8; step++) {
      const x = right ? 256 + step * 192 : width - 416 - step * 192;
      const y = floors[level]! - (step + 1) * 96;
      platforms.push({ x, y, width: 160, height: 32 });
      targets.push({ x: x + 80, y });
    }
    const x = right ? 1600 : 192;
    const end = right ? width - 192 : width - 1600;
    platforms.push({ x, y: floors[level + 1]!, width: end - x, height: 32 });
    routes.push({ from: level, to: level + 1, targets });
  }
  // Headers divide upstairs rooms while preserving a 192px walking opening.
  for (let level = 1; level < floors.length; level++) {
    for (const x of [Math.round((width * 0.55) / 32) * 32, Math.round((width * 0.75) / 32) * 32]) {
      const support = platforms.find(
        (p) => p.y === floors[level] && x >= p.x && x + 32 <= p.x + p.width,
      );
      if (support) platforms.push({ x, y: floors[level]! - 576, width: 32, height: 384 });
    }
  }
  const ceiling = { x: 32, y: 0, width: width - 64, height: 32 };
  platforms.push(ceiling);
  return {
    version: 1,
    family,
    width,
    height,
    tileSize: 32,
    floorY,
    floors,
    platforms,
    routes,
    maximumStairRise: 96,
    productionApproved: false,
    scope: 'Original room-family study; upper circulation and art require native review.',
  };
}
