import { TILE_ATLAS, type TileRole } from './tile-compiler.js';

export const TERRAIN_VARIANT_ROLES = [
  'ground_wear',
  'wall_wear',
  'ceiling_wear',
  'platform_wear',
  'ground_crack',
  'wall_crack',
  'ground_moss',
  'wall_moss',
  'ceiling_moss',
  'platform_moss',
  'ground_rare',
  'wall_rare',
] as const satisfies readonly TileRole[];

const BASE_TO_VARIANTS: Partial<Record<TileRole, TileRole[]>> = {
  ground: ['ground_wear', 'ground_moss', 'ground_crack', 'ground_rare'],
  wall: ['wall_wear', 'wall_moss', 'wall_crack', 'wall_rare'],
  ceiling: ['ceiling_wear', 'ceiling_moss'],
  platform: ['platform_wear', 'platform_moss'],
  top_edge: ['ground_wear', 'ground_moss'],
  bottom_edge: ['ground_wear'],
  left_edge: ['wall_wear'],
  right_edge: ['wall_wear'],
};

function hash01(seed: number, x: number, y: number): number {
  let h = (seed ^ (x * 374761393) ^ (y * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Seeded variant pick. Biased toward the canonical tile so rooms do not checkerboard. */
export function pickTerrainVariant(
  role: TileRole,
  cellX: number,
  cellY: number,
  seed: number,
): { col: number; row: number; role: TileRole; rare: boolean } {
  const base = TILE_ATLAS.roles[role] ?? TILE_ATLAS.roles.ground;
  const variants = BASE_TO_VARIANTS[role];
  if (!variants || variants.length === 0) return { ...base, role, rare: false };
  const n = hash01(seed, cellX, cellY);
  if (n > 0.88) {
    const rare = variants.find((v) => v.includes('rare') || v.includes('crack'));
    if (rare && TILE_ATLAS.roles[rare]) return { ...TILE_ATLAS.roles[rare], role: rare, rare: true };
  }
  if (n > 0.62) {
    const moss = variants.find((v) => v.includes('moss') || v.includes('wear'));
    if (moss && TILE_ATLAS.roles[moss]) return { ...TILE_ATLAS.roles[moss], role: moss, rare: false };
  }
  return { ...base, role, rare: false };
}

export function variantAtlasForCell(col: number, row: number, cellX: number, cellY: number, seed: number): { col: number; row: number } {
  const role = (Object.entries(TILE_ATLAS.roles) as Array<[TileRole, { col: number; row: number }]>).find(
    ([, pos]) => pos.col === col && pos.row === row,
  )?.[0];
  if (!role) return { col, row };
  const picked = pickTerrainVariant(role, cellX, cellY, seed);
  return { col: picked.col, row: picked.row };
}
