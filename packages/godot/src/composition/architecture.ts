import { type OccupancyGrid, type VisualCell, getKind, setKind, roleToCell } from './surface-roles.js';
import {
  ENVIRONMENT_ARCHETYPES,
  sideViewGalleryPlan,
  type EnvironmentArchetypeId,
} from '@metroforge/procedural';

export interface ArchitectureMotif {
  id: string;
  cells: VisualCell[];
}

/**
 * Sparse architecture around traversal — never a filled rectangle.
 * Interior piers use edge/ceiling roles so playable-air wallpaper tests stay green.
 * Environment archetypes drive gallery ledges / alcoves / gantries as readable silhouettes,
 * not prop sprinkle into a flat box.
 */
export function placeArchitecture(input: {
  grid: OccupancyGrid;
  floorRow: number;
  archetype: string;
  /** Architectural identity (library / castle_hall / …) — drives structure, not just props. */
  environmentArchetype?: string;
  seed: number;
  leftDoor: boolean;
  rightDoor: boolean;
  upDoor: boolean;
}): { motifs: string[]; extras: VisualCell[] } {
  const extras: VisualCell[] = [];
  const motifs: string[] = [];
  const { cols } = input.grid;
  const floorRow = input.floorRow;
  const env = input.environmentArchetype ?? '';
  const envKnown = env in ENVIRONMENT_ARCHETYPES ? (env as EnvironmentArchetypeId) : undefined;
  const gallery = envKnown
    ? sideViewGalleryPlan(envKnown)
    : { platformBands: 1, balconyRows: 0 };

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
  // Libraries / halls / labs get denser vertical structure without wallpapering air.
  const centerLeft = Math.floor(cols * 0.3);
  const centerRight = Math.floor(cols * 0.7);
  const libraryLike = env === 'library' || env === 'cathedral' || env === 'chapel';
  const hallLike = env === 'castle_hall' || env === 'armory';
  const towerLike = env === 'clock_tower' || env === 'observatory';
  const labLike = env === 'laboratory';
  const industrialLike = env === 'armory' || env === 'laboratory' || env === 'dungeon' || env === 'sewer';
  const cryptLike = env === 'crypt' || env === 'dungeon';
  const spacing =
    input.archetype === 'boss'
      ? 14
      : libraryLike
        ? 5
        : labLike
          ? 6
          : hallLike
            ? 7
            : industrialLike
              ? 8
              : 9;
  let x = 4 + (input.seed % 3);
  while (x < cols - 4) {
    const inBowl = x >= centerLeft && x < centerRight;
    if (!inBowl || input.archetype === 'connector' || libraryLike || labLike) {
      let pierHeight = input.archetype === 'save' || input.archetype === 'npc' ? 3 : 2;
      if (libraryLike) pierHeight = Math.min(floorRow - 2, 5);
      if (hallLike) pierHeight = Math.min(floorRow - 2, 4);
      if (towerLike) pierHeight = Math.min(floorRow - 2, 6);
      if (labLike) pierHeight = Math.min(floorRow - 2, 4);
      for (let h = 1; h <= pierHeight; h++) {
        const y = floorRow - h;
        if (y > 1 && getKind(input.grid, x, y) === 'empty') {
          extras.push(roleToCell(x, y, h === pierHeight ? 'outside_tl' : 'left_edge'));
        }
      }
      // Sparse wall trim reads as architecture, not density farming.
      if ((libraryLike || hallLike || labLike || industrialLike) && getKind(input.grid, x, floorRow - 1) === 'empty') {
        extras.push(roleToCell(x + 1 < cols - 1 ? x + 1 : x, Math.max(2, floorRow - 2), 'decor_a'));
      }
      motifs.push(
        libraryLike
          ? 'gallery_pier'
          : towerLike
            ? 'shaft_pier'
            : labLike
              ? 'apparatus_pier'
              : industrialLike
                ? 'gantry_pier'
                : 'pier',
      );
    }
    x += spacing;
  }

  const placeGalleryLedge = (row: number, motif: string, startFrac = 0.15, endFrac = 0.85) => {
    const galleryStart = Math.floor(cols * startFrac);
    const galleryEnd = Math.floor(cols * endFrac);
    let placed = 0;
    for (let gx = galleryStart; gx < galleryEnd; gx++) {
      if (getKind(input.grid, gx, row) === 'empty') {
        extras.push(roleToCell(gx, row, 'platform'));
        placed++;
      }
    }
    if (placed > 0) motifs.push(motif);
  };

  // Upper gallery ledges — architectural identity, not prop sprinkle.
  if (libraryLike || (gallery.balconyRows >= 2 && (hallLike || labLike || towerLike))) {
    const galleryRow = Math.max(2, floorRow - 6);
    placeGalleryLedge(galleryRow, libraryLike ? 'upper_gallery' : 'observation_gallery');
  }

  if (hallLike && gallery.balconyRows >= 1) {
    const balconyRow = Math.max(2, floorRow - 4);
    // Side balconies keep the ceremonial center readable.
    placeGalleryLedge(balconyRow, 'side_balcony', 0.08, 0.28);
    placeGalleryLedge(balconyRow, 'side_balcony', 0.72, 0.92);
  }

  if (labLike && gallery.balconyRows >= 1) {
    const catwalk = Math.max(2, floorRow - 5);
    placeGalleryLedge(catwalk, 'lab_catwalk', 0.1, 0.35);
    placeGalleryLedge(catwalk, 'lab_catwalk', 0.65, 0.9);
  }

  if (hallLike && cols >= 40) {
    motifs.push('ceremonial_span');
  }

  if (cryptLike) {
    // Low alcove niches along the walls — crypt/dungeon silhouette, not mid-air platforms.
    const alcoveRow = Math.max(2, floorRow - 2);
    for (const ax of [3, cols - 4]) {
      if (ax > 1 && ax < cols - 1 && getKind(input.grid, ax, alcoveRow) === 'empty') {
        extras.push(roleToCell(ax, alcoveRow, 'decor_b'));
        extras.push(roleToCell(ax, alcoveRow - 1 > 0 ? alcoveRow - 1 : alcoveRow, 'outside_tl'));
      }
    }
    motifs.push('low_alcove');
  }

  if (env === 'armory') {
    motifs.push('rack_alcove');
  }

  if (input.archetype === 'secret' || input.archetype === 'treasure' || input.archetype === 'set_piece') {
    motifs.push('alcove');
  }
  return { motifs: [...new Set(motifs)], extras };
}
