import {
  type OccupancyGrid,
  type OccupancyKind,
  type SurfaceRole,
  type VisualCell,
  getKind,
  isFilled,
  roleToCell,
} from './surface-roles.js';

export interface NeighborMask {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
  ne: boolean;
  nw: boolean;
  se: boolean;
  sw: boolean;
}

export function neighborMask(grid: OccupancyGrid, x: number, y: number): NeighborMask {
  const filled = (ox: number, oy: number) => isFilled(getKind(grid, ox, oy));
  return {
    n: filled(x, y - 1),
    s: filled(x, y + 1),
    e: filled(x + 1, y),
    w: filled(x - 1, y),
    ne: filled(x + 1, y - 1),
    nw: filled(x - 1, y - 1),
    se: filled(x + 1, y + 1),
    sw: filled(x - 1, y + 1),
  };
}

/**
 * Topology-aware atlas role for one occupied cell.
 * Collision occupancy is independent — this only chooses visible tile roles.
 */
export function resolveSurfaceRole(kind: OccupancyKind, n: NeighborMask): SurfaceRole {
  if (kind === 'door') return 'door';
  if (kind === 'decor') return 'decor_a';
  if (kind === 'platform') {
    if (!n.w && n.e) return 'platform_left';
    if (n.w && !n.e) return 'platform_right';
    if (!n.w && !n.e) return 'one_way';
    return 'platform';
  }

  const { n: N, s: S, e: E, w: W } = n;
  const count = Number(N) + Number(S) + Number(E) + Number(W);

  if (count === 0) return 'ground_rare';

  // Thin horizontal ledge / cap.
  if (!N && !S && (E || W)) {
    if (!W && E) return 'left_edge';
    if (W && !E) return 'right_edge';
    return 'top_edge';
  }
  // Thin vertical structure.
  if (!E && !W && (N || S)) {
    if (!N && S) return 'top_edge';
    if (N && !S) return 'bottom_edge';
    return 'wall';
  }

  // Outer corners (missing two adjacent cardinals).
  if (!N && !W && (E || S)) return 'outside_tl';
  if (!N && !E && (W || S)) return 'outside_tr';
  if (!S && !W && (E || N)) return 'outside_bl';
  if (!S && !E && (W || N)) return 'outside_br';

  // Inner corners: solid on two adjacent sides, diagonal air.
  if (N && W && !n.nw) return 'inside_tl';
  if (N && E && !n.ne) return 'inside_tr';
  if (S && W && !n.sw) return 'inside_bl';
  if (S && E && !n.se) return 'inside_br';

  if (!N && E && W) return 'top_edge';
  if (!S && E && W) return 'bottom_edge';
  if (!W && N && S) return 'left_edge';
  if (!E && N && S) return 'right_edge';

  return 'ground';
}

export function resolveSurfaceTiles(grid: OccupancyGrid): VisualCell[] {
  const cells: VisualCell[] = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const kind = getKind(grid, x, y);
      if (kind === 'empty') continue;
      const role = resolveSurfaceRole(kind, neighborMask(grid, x, y));
      cells.push(roleToCell(x, y, role));
    }
  }
  return cells;
}
