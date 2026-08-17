/** Atlas roles must match packages/assets/src/tile-compiler.ts TILE_ATLAS.roles. */
export const SURFACE_ROLES = {
  ground: { col: 0, row: 0 },
  wall: { col: 1, row: 0 },
  ceiling: { col: 2, row: 0 },
  platform: { col: 3, row: 0 },
  left_edge: { col: 4, row: 0 },
  right_edge: { col: 5, row: 0 },
  top_edge: { col: 6, row: 0 },
  bottom_edge: { col: 7, row: 0 },
  outside_tl: { col: 0, row: 1 },
  outside_tr: { col: 1, row: 1 },
  outside_bl: { col: 2, row: 1 },
  outside_br: { col: 3, row: 1 },
  inside_tl: { col: 4, row: 1 },
  inside_tr: { col: 5, row: 1 },
  inside_bl: { col: 6, row: 1 },
  inside_br: { col: 7, row: 1 },
  platform_left: { col: 0, row: 2 },
  platform_right: { col: 1, row: 2 },
  one_way: { col: 2, row: 2 },
  hazard: { col: 3, row: 2 },
  breakable: { col: 4, row: 2 },
  door: { col: 5, row: 2 },
  decor_a: { col: 6, row: 2 },
  decor_b: { col: 7, row: 2 },
  ground_wear: { col: 0, row: 3 },
  wall_wear: { col: 1, row: 3 },
  ceiling_wear: { col: 2, row: 3 },
  platform_wear: { col: 3, row: 3 },
  ground_crack: { col: 4, row: 3 },
  wall_crack: { col: 5, row: 3 },
  ground_moss: { col: 0, row: 4 },
  wall_moss: { col: 1, row: 4 },
  ceiling_moss: { col: 2, row: 4 },
  platform_moss: { col: 3, row: 4 },
  ground_rare: { col: 4, row: 4 },
  wall_rare: { col: 5, row: 4 },
} as const;

export type SurfaceRole = keyof typeof SURFACE_ROLES;

export interface VisualCell {
  x: number;
  y: number;
  col: number;
  row: number;
}

export type SurfaceSemantic =
  | 'floor'
  | 'ceiling'
  | 'left_wall'
  | 'right_wall'
  | 'platform'
  | 'ledge'
  | 'shaft'
  | 'alcove'
  | 'door_frame'
  | 'arena_boundary'
  | 'climbable_wall'
  | 'breakable_wall'
  | 'one_way_platform'
  | 'hazard_border'
  | 'secret_surface'
  | 'transition_boundary'
  | 'pier'
  | 'support'
  | 'landmark';

export type OccupancyKind = 'empty' | 'solid' | 'platform' | 'door' | 'decor';

export interface OccupancyGrid {
  cols: number;
  rows: number;
  kind: OccupancyKind[];
}

export function createOccupancy(cols: number, rows: number): OccupancyGrid {
  return { cols, rows, kind: new Array(cols * rows).fill('empty') };
}

export function occupancyIndex(grid: OccupancyGrid, x: number, y: number): number {
  return y * grid.cols + x;
}

export function getKind(grid: OccupancyGrid, x: number, y: number): OccupancyKind {
  if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return 'empty';
  return grid.kind[occupancyIndex(grid, x, y)] ?? 'empty';
}

export function setKind(grid: OccupancyGrid, x: number, y: number, kind: OccupancyKind): void {
  if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return;
  grid.kind[occupancyIndex(grid, x, y)] = kind;
}

export function isFilled(kind: OccupancyKind): boolean {
  return kind !== 'empty';
}

export function roleToCell(x: number, y: number, role: SurfaceRole): VisualCell {
  const pos = SURFACE_ROLES[role];
  return { x, y, col: pos.col, row: pos.row };
}

export function atlasKey(col: number, row: number): string {
  return `${col},${row}`;
}
