import type { VisualCell } from './surface-roles.js';
import { createOccupancy, getKind, setKind } from './surface-roles.js';
import { resolveSurfaceTiles } from './surface-resolver.js';
import { suppressRepetition } from './repetition.js';
import {
  type RoomBlueprint,
  type GeometryRect,
  type LandmarkPlan,
  type RoomPlan,
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

function buildRoomPlan(input: ComposeVisualsInput): RoomPlan {
  const floorTop = input.floorRow * input.tileSize;
  const boss = input.archetype === 'boss' || input.archetype === 'miniboss';
  const calm = input.archetype === 'save' || input.archetype === 'ability_shrine';
  const vertical = input.archetype === 'traversal' || input.archetype === 'challenge';
  const focusX = Math.round(input.width * (input.archetype === 'ability_shrine' ? 0.5 : 0.58));
  const focusY = floorTop - (calm ? input.tileSize * 3 : input.tileSize * 2);
  const connections = input.connections ?? [];
  const entries = connections.filter((connection) => connection.direction === 'left' || connection.direction === 'down');
  const exits = connections.filter((connection) => !entries.includes(connection));
  const edgeAnchors = boss
    ? [{ role: 'arena_frame' as const, x: input.width * 0.1, grounded: true }, { role: 'arena_frame' as const, x: input.width * 0.9, grounded: true }]
    : calm
      ? [{ role: 'focal_frame' as const, x: focusX, grounded: true }]
      : [{ role: 'edge_pillar' as const, x: input.width * 0.12, grounded: true }, { role: 'edge_pillar' as const, x: input.width * 0.88, grounded: true }];
  const combat = { x: Math.round(input.width * 0.24), y: floorTop - input.tileSize * 5, width: Math.round(input.width * 0.52), height: input.tileSize * 5 };
  const quiet = { x: Math.round(input.width * 0.36), y: floorTop - input.tileSize * 6, width: Math.round(input.width * 0.28), height: input.tileSize * 6 };
  return {
    dominantAxis: vertical ? 'vertical' : boss || input.archetype === 'combat' || input.archetype === 'arena' ? 'balanced' : 'horizontal',
    entryPoints: entries.map((connection) => ({ direction: connection.direction, x: connection.direction === 'left' ? 0 : input.width * 0.5, y: floorTop })),
    exitPoints: exits.map((connection) => ({ direction: connection.direction, x: connection.direction === 'right' ? input.width : input.width * 0.5, y: floorTop })),
    gameplayFloors: [{ x: 0, y: floorTop, width: input.width, height: input.tileSize * 2 }],
    platformRegions: [...input.platforms],
    wallRegions: [{ x: 0, y: 0, width: input.tileSize, height: floorTop }, { x: input.width - input.tileSize, y: 0, width: input.tileSize, height: floorTop }],
    ceilingRegions: [{ x: 0, y: 0, width: input.width, height: input.tileSize }],
    majorArchitecture: edgeAnchors,
    focalPoint: { x: focusX, y: focusY, kind: calm ? 'reward_or_save' : boss ? 'boss' : 'traversal' },
    safeZones: calm ? [{ ...quiet }] : [],
    combatZones: boss || input.archetype === 'combat' || input.archetype === 'arena' ? [combat] : [],
    // Two workstation clusters, kept off spawn footprints and the central combat band.
    // Isolated mid-floor scatter was reading as density farming, not a room.
    decorationZones: boss
      ? []
      : calm
        ? [{ purpose: 'decoration', x: input.width * 0.42, y: floorTop - input.tileSize * 2, width: input.width * 0.16, height: input.tileSize * 2 }]
        : [
            { purpose: 'decoration', x: input.width * 0.32, y: floorTop - input.tileSize * 2, width: input.width * 0.14, height: input.tileSize * 2 },
            { purpose: 'decoration', x: input.width * 0.70, y: floorTop - input.tileSize * 2, width: input.width * 0.14, height: input.tileSize * 2 },
          ],
    noDecorationZones: [{ purpose: 'no_decoration', ...quiet }],
    foregroundExclusionZones: [{ purpose: 'foreground_exclusion', ...combat }],
    visualTheme: 'industrial_transit',
    landmarkType: calm ? 'sanctuary_frame' : boss ? 'arena_frame' : vertical ? 'shaft_frame' : 'edge_supports',
    propBudget: { clusters: boss ? 0 : calm ? 1 : 2, propsPerCluster: 2, majorStructures: edgeAnchors.length },
  };
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
  const platformExtras = dressPlatforms({ grid, platforms, tileSize, floorRow, strategy, biomeId: input.biomeId });

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
  const plan = buildRoomPlan(input);
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
    plan,
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
