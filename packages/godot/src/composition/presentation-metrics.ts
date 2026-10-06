import type { VisualCell } from './surface-roles.js';
import { analyzeRepetition } from './repetition.js';
import type { RoomBlueprint } from './room-blueprint.js';
import { isGenericBossRoom } from './boss-arena.js';

export interface PresentationRoomInput {
  id: string;
  archetype: string;
  tileCells: VisualCell[];
  cols: number;
  floorRow: number;
  blueprint?: RoomBlueprint;
}

export const PRESENTATION_VIOLATIONS = {
  EXCESSIVE_TILE_REPETITION: 'EXCESSIVE_TILE_REPETITION',
  RAW_PLATFORM_PRESENTATION: 'RAW_PLATFORM_PRESENTATION',
  RAW_COLLISION_GEOMETRY: 'RAW_COLLISION_GEOMETRY',
  DEBUG_HUD_VISIBLE: 'DEBUG_HUD_VISIBLE',
  BOSS_ROOM_GENERIC: 'BOSS_ROOM_GENERIC',
  PLAYER_UNREADABLE: 'PLAYER_UNREADABLE',
  PLAYER_SCALE_OUT_OF_BOUNDS: 'PLAYER_SCALE_OUT_OF_BOUNDS',
  MISSING_ARCHITECTURAL_TREATMENT: 'MISSING_ARCHITECTURAL_TREATMENT',
  UNSTYLED_PLATFORMS: 'UNSTYLED_PLATFORMS',
} as const;

export function hasFullHeightWallFrame(cells: VisualCell[], cols: number, floorRow: number): boolean {
  if (floorRow < 4) return false;
  const left = cells.filter((c) => c.x === 0 && c.y < floorRow).length;
  const right = cells.filter((c) => c.x === cols - 1 && c.y < floorRow).length;
  return left >= floorRow * 0.75 && right >= floorRow * 0.75;
}

export function floorMassRowCount(cells: VisualCell[], floorRow: number): number {
  const rows = new Set(
    cells.filter((c) => c.y >= floorRow && c.y <= floorRow + 3 && !(c.col >= 5 && c.row === 2)).map((c) => c.y),
  );
  return rows.size;
}

export function platformsLackCaps(cells: VisualCell[]): boolean {
  const platforms = cells.filter((c) => (c.col === 3 && c.row === 0) || (c.col <= 1 && c.row === 2));
  if (platforms.length < 2) return false;
  const hasLeft = cells.some((c) => c.col === 0 && c.row === 2);
  const hasRight = cells.some((c) => c.col === 1 && c.row === 2);
  return !hasLeft || !hasRight;
}

export function evaluateRoomPresentation(room: PresentationRoomInput): {
  score: number;
  violations: string[];
} {
  const violations: string[] = [];
  const { tileCells: cells, cols, floorRow, archetype, blueprint } = room;
  if (hasFullHeightWallFrame(cells, cols, floorRow) || floorMassRowCount(cells, floorRow) >= 3) {
    violations.push(PRESENTATION_VIOLATIONS.RAW_COLLISION_GEOMETRY);
  }
  const repetition = analyzeRepetition(cells);
  if (repetition.violations.includes('EXCESSIVE_TILE_REPETITION')) {
    violations.push(PRESENTATION_VIOLATIONS.EXCESSIVE_TILE_REPETITION);
  }
  if (platformsLackCaps(cells)) {
    violations.push(PRESENTATION_VIOLATIONS.RAW_PLATFORM_PRESENTATION);
    violations.push(PRESENTATION_VIOLATIONS.UNSTYLED_PLATFORMS);
  }
  if (
    isGenericBossRoom({
      archetype,
      composedAsBossArena: blueprint?.visualIntent.composedAsBossArena,
      landmarkCount: blueprint?.landmarks.length ?? cells.filter((c) => c.col >= 6 && c.row === 2).length,
    })
  ) {
    violations.push(PRESENTATION_VIOLATIONS.BOSS_ROOM_GENERIC);
  }
  const interiorDecor = cells.filter((c) => c.y < floorRow && c.y > 0 && c.x > 0 && c.x < cols - 1);
  if (interiorDecor.length === 0 && archetype !== 'connector') {
    violations.push(PRESENTATION_VIOLATIONS.MISSING_ARCHITECTURAL_TREATMENT);
  }
  let score = 92;
  if (violations.includes(PRESENTATION_VIOLATIONS.RAW_COLLISION_GEOMETRY)) score = Math.min(score, 28);
  if (violations.includes(PRESENTATION_VIOLATIONS.EXCESSIVE_TILE_REPETITION)) score = Math.min(score, 34);
  if (violations.includes(PRESENTATION_VIOLATIONS.BOSS_ROOM_GENERIC)) score = Math.min(score, 38);
  if (violations.includes(PRESENTATION_VIOLATIONS.RAW_PLATFORM_PRESENTATION)) score = Math.min(score, 44);
  if (violations.includes(PRESENTATION_VIOLATIONS.MISSING_ARCHITECTURAL_TREATMENT)) score = Math.min(score, 52);
  score = Math.min(score, Math.round(repetition.score));
  return { score: Math.max(0, score), violations: [...new Set(violations)] };
}

export function evaluateRoomsPresentation(rooms: PresentationRoomInput[]): {
  score: number;
  violations: string[];
} {
  if (rooms.length === 0) return { score: 70, violations: [] };
  const results = rooms.map(evaluateRoomPresentation);
  const violations = [...new Set(results.flatMap((r) => r.violations))];
  const score = Math.min(...results.map((r) => r.score));
  return { score, violations };
}
