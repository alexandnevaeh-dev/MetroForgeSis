import type { VisualCell } from './surface-roles.js';
import { createOccupancy, getKind, setKind } from './surface-roles.js';
import { resolveSurfaceTiles } from './surface-resolver.js';
import { suppressRepetition } from './repetition.js';
import {
  type RoomBlueprint,
  type GeometryRect,
  type LandmarkPlan,
  defaultLightingPlan,
  platformStrategyFor,
  traversalFromGeometry,
} from './room-blueprint.js';
import { dressPlatforms, markPlatformOccupancy } from './platform-visual.js';
import { placeArchitecture } from './architecture.js';
import { composeBossArena } from './boss-arena.js';

export interface ComposeVisualsInput {
  cells: VisualCell[];
  platforms: GeometryRect[];
  pits: GeometryRect[];
  cols: number;
  rows: number;
  floorRow: number;
  tileSize: number;
  width: number;
  height: number;
  archetype: string;
  seed: number;
  biomeId?: string;
  roomId?: string;
  connections?: Array<{ direction: string }>;
}

export interface ComposeVisualsResult {
  cells: VisualCell[];
  blueprint: RoomBlueprint;
}

function isSpecialCell(cell: VisualCell): boolean {
  return (
    (cell.col === 5 && cell.row === 2) ||
    (cell.col === 6 && cell.row === 2) ||
    (cell.col === 7 && cell.row === 2) ||
    (cell.col === 3 && cell.row === 2) ||
    (cell.col === 4 && cell.row === 2)
  );
}

function inPit(x: number, pits: GeometryRect[], tileSize: number): boolean {
  const px = x * tileSize;
  return pits.some((pit) => px >= pit.x && px < pit.x + pit.width);
}

function mergeCells(base: VisualCell[], extra: VisualCell[]): VisualCell[] {
  const map = new Map<string, VisualCell>();
  for (const cell of [...base, ...extra]) {
    map.set(`${cell.x},${cell.y}`, cell);
  }
  return [...map.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Rebuild visible tiles from gameplay geometry.
 * Collision platforms/pits/floor StaticBodies are authored separately and must not change here.
 */
export function composePlayableVisuals(input: ComposeVisualsInput): ComposeVisualsResult {
  const {
    cols,
    rows,
    floorRow,
    tileSize,
    platforms,
    pits,
    archetype,
    seed,
    width,
    height,
  } = input;
  const grid = createOccupancy(cols, rows);
  const connections = input.connections ?? [];
  const leftDoor = connections.some((c) => c.direction === 'left');
  const rightDoor = connections.some((c) => c.direction === 'right');
  const upDoor = connections.some((c) => c.direction === 'up');

  for (let x = 0; x < cols; x++) {
    if (inPit(x, pits, tileSize)) continue;
    setKind(grid, x, floorRow, 'solid');
    if (floorRow + 1 < rows) setKind(grid, x, floorRow + 1, 'solid');
  }

  markPlatformOccupancy(grid, platforms, tileSize);
  const strategy = platformStrategyFor(archetype);
  const platformExtras = dressPlatforms({ grid, platforms, tileSize, floorRow, strategy });

  const architecture = placeArchitecture({
    grid,
    floorRow,
    archetype,
    seed,
    leftDoor,
    rightDoor,
    upDoor,
  });

  const specials = input.cells.filter(isSpecialCell);
  for (const cell of specials) {
    if (getKind(grid, cell.x, cell.y) === 'empty') {
      if (cell.col === 5 && cell.row === 2) setKind(grid, cell.x, cell.y, 'door');
    }
  }

  let resolved = resolveSurfaceTiles(grid);
  resolved = mergeCells(resolved, architecture.extras);
  resolved = mergeCells(resolved, platformExtras);
  resolved = mergeCells(resolved, specials);

  let landmarks: LandmarkPlan[] = architecture.motifs.includes('alcove')
    ? [
        {
          id: `${input.roomId ?? 'room'}_alcove`,
          importance: 'minor' as const,
          x: tileSize * 2,
          y: (floorRow - 2) * tileSize,
          kind: 'alcove',
        },
      ]
    : [];

  let lighting = defaultLightingPlan(archetype, width, height);
  let composedAsBossArena = false;
  let negativeSpaceReason: string | undefined =
    archetype === 'combat' || archetype === 'arena' ? 'combat arena' : undefined;

  if (archetype === 'boss' || archetype === 'miniboss') {
    const arena = composeBossArena({ cols, floorRow, width, height, platforms, tileSize });
    resolved = mergeCells(resolved, arena.cells);
    landmarks = arena.landmarks;
    lighting = arena.lighting;
    composedAsBossArena = true;
    negativeSpaceReason = arena.negativeSpaceReason;
  } else if (archetype === 'save' || archetype === 'set_piece' || archetype === 'secret') {
    const lx = Math.floor(cols * 0.48);
    resolved = mergeCells(resolved, [
      { x: lx, y: Math.max(2, floorRow - 2), col: 6, row: 2 },
      { x: lx + 1, y: Math.max(2, floorRow - 2), col: 7, row: 2 },
    ]);
    landmarks = [
      {
        id: `${input.roomId ?? 'room'}_landmark`,
        importance: archetype === 'set_piece' ? 'biome_defining' : 'room_defining',
        x: lx * tileSize,
        y: (floorRow - 2) * tileSize,
        kind: archetype === 'save' ? 'altar' : 'collapsed_architecture',
      },
    ];
    negativeSpaceReason = archetype === 'save' ? 'rest / sanctuary' : 'environmental storytelling';
  }

  const visualCells = suppressRepetition(resolved, seed);

  const floorTop = floorRow * tileSize;
  const blueprint: RoomBlueprint = {
    id: input.roomId ?? 'room',
    biomeId: input.biomeId ?? 'biome_0',
    archetype,
    dimensions: { width, height },
    seeds: {
      worldSeed: seed,
      roomSeed: seed,
      compositionSeed: seed ^ 0x9e3779b9,
      dressingSeed: seed ^ 0x7f4a7c15,
      encounterSeed: seed ^ 0x85ebca6b,
      lightingSeed: seed ^ 0xc2b2ae35,
    },
    traversal: traversalFromGeometry(platforms, pits, floorTop, archetype),
    composition: {
      platformStrategy: strategy,
      architecturalMotifs: architecture.motifs,
    },
    encounters: {
      intent:
        archetype === 'boss'
          ? 'boss'
          : archetype === 'combat' || archetype === 'arena'
            ? 'arena'
            : archetype === 'secret'
              ? 'ambush'
              : 'patrol',
    },
    lighting,
    atmosphere: {
      fogAlpha: archetype === 'boss' ? 0.12 : 0.07,
      particles: archetype === 'boss' ? 'embers' : 'dust',
    },
    landmarks,
    visualIntent: {
      depthLayers: [
        'far_background',
        'background_architecture',
        'midground',
        'gameplay_plane',
        'near_decoration',
        'foreground',
        'lighting',
        'atmosphere',
      ],
      platformStrategy: strategy,
      negativeSpaceReason,
      composedAsBossArena,
      openPlayableAir: true,
    },
  };

  return { cells: visualCells, blueprint };
}
