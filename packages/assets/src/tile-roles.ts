import { TILE_ATLAS, type TileRole } from './tile-compiler.js';

/** Semantic tile roles the compiler and room-layout generator share. Pixel coords never leak. */
export const REQUIRED_TILE_ROLES: readonly TileRole[] = [
  'ground',
  'wall',
  'ceiling',
  'platform',
  'left_edge',
  'right_edge',
  'top_edge',
  'bottom_edge',
  'outside_tl',
  'outside_tr',
  'outside_bl',
  'outside_br',
  'platform_left',
  'platform_right',
  'one_way',
  'hazard',
  'breakable',
];

export interface TileTerrainPeering {
  role: TileRole;
  col: number;
  row: number;
  terrainSet: 0;
  terrain: number;
  peering: {
    top?: TileRole;
    bottom?: TileRole;
    left?: TileRole;
    right?: TileRole;
  };
}

const TERRAIN_IDS: Partial<Record<TileRole, number>> = {
  ground: 0,
  wall: 0,
  ceiling: 0,
  top_edge: 0,
  bottom_edge: 0,
  left_edge: 0,
  right_edge: 0,
  platform: 1,
  platform_left: 1,
  platform_right: 1,
  one_way: 1,
  hazard: 2,
  breakable: 3,
};

export function buildTileTerrainMetadata(): TileTerrainPeering[] {
  return (Object.keys(TILE_ATLAS.roles) as TileRole[]).map((role) => {
    const pos = TILE_ATLAS.roles[role];
    return {
      role,
      col: pos.col,
      row: pos.row,
      terrainSet: 0,
      terrain: TERRAIN_IDS[role] ?? 4,
      peering: {
        top: role.includes('bottom') ? 'ground' : undefined,
        bottom: role.includes('top') ? 'ground' : undefined,
        left: role.includes('right') ? 'ground' : undefined,
        right: role.includes('left') ? 'ground' : undefined,
      },
    };
  });
}

export function missingRequiredTileRoles(present: Iterable<string>): string[] {
  const have = new Set(present);
  return REQUIRED_TILE_ROLES.filter((role) => !have.has(role));
}
