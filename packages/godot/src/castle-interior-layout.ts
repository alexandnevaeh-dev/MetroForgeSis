import type { PlatformRect } from './tile-layout.js';

/** Authored three-storey wing: connected floors, internal chambers and reversible stairs. */
export function buildCastleInteriorLayout(width = 4096, height = 1536, tileSize = 32) {
  if (
    ![width, height, tileSize].every(Number.isSafeInteger) ||
    tileSize !== 32 ||
    width < 4096 ||
    height < 1536 ||
    width % tileSize ||
    height % tileSize
  )
    throw new Error('Three-storey wings require a 32px grid and at least 4096 by 1536 pixels');
  const lower = height - 64,
    middle = lower - 480,
    upper = middle - 480;
  const platforms: PlatformRect[] = [];
  const ascent: Array<{ x: number; y: number }> = [];
  for (let step = 0; step < 5; step++) {
    const rect = { x: 256 + step * 192, y: lower - (step + 1) * 96, width: 160, height: 32 };
    platforms.push(rect);
    ascent.push({ x: rect.x + 80, y: rect.y });
  }
  platforms.push({ x: 1024, y: middle, width: width - 1408, height: 32 });
  for (let step = 0; step < 5; step++) {
    const rect = {
      x: width - 544 - step * 192,
      y: middle - (step + 1) * 96,
      width: 160,
      height: 32,
    };
    platforms.push(rect);
    ascent.push({ x: rect.x + 80, y: rect.y });
  }
  platforms.push(
    { x: 256, y: upper, width: 1152, height: 32 },
    { x: 1536, y: upper, width: width - 2592, height: 32 },
  );
  const sections = [
    {
      id: 'lower-vestibule',
      name: 'Gate Vestibule',
      storey: 'lower',
      x: 64,
      width: 704,
      floorY: lower,
      purpose: 'Arrival and stair access',
    },
    {
      id: 'lower-nave',
      name: 'Reliquary Nave',
      storey: 'lower',
      x: 1024,
      width: 1920,
      floorY: lower,
      purpose: 'Clear combat spine',
    },
    {
      id: 'lower-watch',
      name: 'Watch Hall',
      storey: 'lower',
      x: width - 960,
      width: 896,
      floorY: lower,
      purpose: 'Exit and return route',
    },
    {
      id: 'middle-reading',
      name: 'Reading Chamber',
      storey: 'middle',
      x: 1024,
      width: 1184,
      floorY: middle,
      purpose: 'Quiet exploration chamber',
    },
    {
      id: 'middle-bridge',
      name: 'Gallery Bridge',
      storey: 'middle',
      x: 2208,
      width: 512,
      floorY: middle,
      purpose: 'Overlook and crossing',
    },
    {
      id: 'middle-armory',
      name: 'Sentinel Chamber',
      storey: 'middle',
      x: 2720,
      width: width - 3104,
      floorY: middle,
      purpose: 'Upper stair approach',
    },
    {
      id: 'upper-loft',
      name: 'Archive Loft',
      storey: 'upper',
      x: 256,
      width: 1152,
      floorY: upper,
      purpose: 'Optional return exploration',
    },
    {
      id: 'upper-observatory',
      name: 'Moon Observatory',
      storey: 'upper',
      x: 1536,
      width: width - 2592,
      floorY: upper,
      purpose: 'Upper landmark and downward loop',
    },
  ];
  const partitions: PlatformRect[] = [
    { x: 3072, y: middle, width: 32, height: 288 },
    { x: 2208, y: upper, width: 32, height: 288 },
    { x: 2048, y: upper - 480, width: 32, height: 288 },
  ];
  const surfaces = platforms.filter(
    (p, i) =>
      !platforms.some(
        (other, j) =>
          i !== j &&
          other.y === p.y &&
          other.x <= p.x &&
          other.x + other.width >= p.x + p.width &&
          other.width > p.width,
      ),
  );
  return {
    version: 1,
    width,
    height,
    tileSize,
    floors: { lower, middle, upper },
    platforms: surfaces,
    partitions,
    sections,
    ascent,
    doorsPreserved: true,
    maximumStairRise: 96,
  };
}
