import { type OccupancyGrid, type VisualCell, getKind, setKind, roleToCell } from './surface-roles.js';

export interface ArchitectureMotif {
  id: string;
  cells: VisualCell[];
}

/**
 * Sparse architecture around traversal — never a filled rectangle.
 * Interior piers use edge/ceiling roles so playable-air wallpaper tests stay green.
 */
export function placeArchitecture(input: {
  grid: OccupancyGrid;
  floorRow: number;
  archetype: string;
  seed: number;
  leftDoor: boolean;
  rightDoor: boolean;
  upDoor: boolean;
}): { motifs: string[]; extras: VisualCell[] } {
  const extras: VisualCell[] = [];
  const motifs: string[] = [];
  const { cols, rows: _rows } = input.grid;
  const floorRow = input.floorRow;

  // Door frames / corner piers — 2 tiles tall at walk height, not full-height walls.
  const frameTop = Math.max(1, floorRow - 3);
  if (!input.leftDoor) {
    for (let y = frameTop; y < floorRow; y++) {
      if (getKind(input.grid, 0, y) === 'empty') setKind(input.grid, 0, y, 'solid');
    }
    motifs.push('door_frame_left');
  }
  if (!input.rightDoor) {
    for (let y = frameTop; y < floorRow; y++) {
      if (getKind(input.grid, cols - 1, y) === 'empty') setKind(input.grid, cols - 1, y, 'solid');
    }
    motifs.push('door_frame_right');
  }

  // Ceiling masses only at the sides so the far plate remains visible.
  const ceilingSpan = Math.min(3, Math.max(1, Math.floor(cols * 0.08)));
  for (let x = 0; x < ceilingSpan; x++) {
    if (!input.upDoor) setKind(input.grid, x, 0, 'solid');
  }
  for (let x = cols - ceilingSpan; x < cols; x++) {
    if (!input.upDoor) setKind(input.grid, x, 0, 'solid');
  }
  motifs.push('side_ceiling_mass');

  // Sparse columns — skip the center 40% so combat/boss bowls stay open.
  const centerLeft = Math.floor(cols * 0.3);
  const centerRight = Math.floor(cols * 0.7);
  const spacing = input.archetype === 'boss' ? 14 : 9;
  let x = 4 + (input.seed % 3);
  while (x < cols - 4) {
    const inBowl = x >= centerLeft && x < centerRight;
    if (!inBowl || input.archetype === 'connector') {
      const pierHeight = input.archetype === 'save' || input.archetype === 'npc' ? 3 : 2;
      for (let h = 1; h <= pierHeight; h++) {
        const y = floorRow - h;
        if (y > 1 && getKind(input.grid, x, y) === 'empty') {
          extras.push(roleToCell(x, y, h === pierHeight ? 'outside_tl' : 'left_edge'));
        }
      }
      motifs.push('pier');
    }
    x += spacing;
  }

  if (input.archetype === 'secret' || input.archetype === 'treasure' || input.archetype === 'set_piece') {
    motifs.push('alcove');
  }
  return { motifs: [...new Set(motifs)], extras };
}
