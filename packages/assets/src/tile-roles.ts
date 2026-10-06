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
  'inside_tl',
  'inside_tr',
  'inside_bl',
  'inside_br',
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

export const GROUND_TERRAIN_SET_ID = 0;
export const GROUND_TERRAIN_ID = 0;

/** Cardinal-neighbor mask contract for the compiled ground terrain. Bits are N=1, E=2, S=4, W=8.
 * Masks are assigned to atlas row 0 and row 1 in linear left-to-right order: masks 0-7 ↦ (0..7, 0); masks 8-15 ↦ (0..7, 1).
 * Each mask deterministically encodes cardinal topology: isolated ground (0), top (1), right (2), top-right (3), etc.
 * The role names are canonical and never change; the atlas roles for ground terrain are fixed at rows 0-1. */
export const GROUND_TERRAIN_MASK_ROLES: Record<number, TileRole> = {
  0: 'ground',
  1: 'bottom_edge',
  2: 'left_edge',
  3: 'outside_bl',
  4: 'top_edge',
  5: 'wall',
  6: 'outside_tl',
  7: 'inside_tr',
  8: 'right_edge',
  9: 'outside_br',
  10: 'platform',
  11: 'inside_tl',
  12: 'outside_tr',
  13: 'inside_bl',
  14: 'inside_br',
  15: 'ceiling',
} as const satisfies Record<number, TileRole>;

export function groundTerrainRoleForMask(mask: number): TileRole {
  return GROUND_TERRAIN_MASK_ROLES[mask & 15] ?? 'ground';
}

export function groundTerrainPeeringForMask(mask: number): Record<'top' | 'right' | 'bottom' | 'left', number> {
  const normalized = mask & 15;
  return {
    top: normalized & 1 ? GROUND_TERRAIN_ID : -1,
    right: normalized & 2 ? GROUND_TERRAIN_ID : -1,
    bottom: normalized & 4 ? GROUND_TERRAIN_ID : -1,
    left: normalized & 8 ? GROUND_TERRAIN_ID : -1,
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

export function groundTerrainMaskAtlasCoord(mask: number): { col: number; row: number } {
  const normalized = mask & 15;
  return {
    col: normalized % 8,
    row: Math.floor(normalized / 8),
  };
}

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

/** Single source of truth for the Godot 4 TileSetAtlasSource `.tres` text — used by both the
 *  legacy asset pipeline and pipeline v2 so the verified `col:row/altId` property format
 *  (see GODOT_TILESET_TRES_FORMAT repo memory) is never duplicated/desynced across call sites. */
export function buildGroundTerrainTresText(biomeIndex: number, tileSize: number): string {
  const baseTileLines = Object.values(TILE_ATLAS.roles).map((pos) => `${pos.col}:${pos.row}/0 = 0`);
  const terrainLines = Array.from({ length: 16 }, (_, mask) => {
    const coord = groundTerrainMaskAtlasCoord(mask);
    const peering = groundTerrainPeeringForMask(mask);
    const property = `${coord.col}:${coord.row}/0`;
    return [
      `${property}/terrain_set = ${GROUND_TERRAIN_SET_ID}`,
      `${property}/terrain = ${GROUND_TERRAIN_ID}`,
      `${property}/terrains_peering_bit/top_side = ${peering.top}`,
      `${property}/terrains_peering_bit/right_side = ${peering.right}`,
      `${property}/terrains_peering_bit/bottom_side = ${peering.bottom}`,
      `${property}/terrains_peering_bit/left_side = ${peering.left}`,
    ];
  }).flat();

  return [
    '[gd_resource type="TileSet" format=3]',
    '',
    `[ext_resource type="Texture2D" path="res://assets/tilesets/biome_${biomeIndex}/source.png" id="1_atlas"]`,
    '',
    '[sub_resource type="TileSetAtlasSource" id="Atlas_0"]',
    'texture = ExtResource("1_atlas")',
    `texture_region_size = Vector2i(${tileSize}, ${tileSize})`,
    ...baseTileLines,
    ...terrainLines,
    '',
    '[resource]',
    `tile_size = Vector2i(${tileSize}, ${tileSize})`,
    'terrain_set_0/mode = 0',
    'terrain_set_0/terrain_0/name = "ground"',
    'sources/0 = SubResource("Atlas_0")',
    '',
  ].join('\n');
}
