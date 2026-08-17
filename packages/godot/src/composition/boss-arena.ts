import { roleToCell, type VisualCell } from './surface-roles.js';
import type { GeometryRect, LandmarkPlan, LightingPlan } from './room-blueprint.js';
import { defaultLightingPlan } from './room-blueprint.js';

export interface BossArenaComposition {
  cells: VisualCell[];
  landmarks: LandmarkPlan[];
  lighting: LightingPlan;
  composedAsBossArena: true;
  negativeSpaceReason: 'boss staging';
}

/** Dedicated arena visuals — not a combat room with a boss sprite dropped in. */
export function composeBossArena(input: {
  cols: number;
  floorRow: number;
  width: number;
  height: number;
  platforms: GeometryRect[];
  tileSize: number;
}): BossArenaComposition {
  const cx = Math.floor(input.cols / 2);
  const landmarkRow = Math.max(2, input.floorRow - 3);
  const cells: VisualCell[] = [
    roleToCell(cx - 1, landmarkRow, 'decor_a'),
    roleToCell(cx, landmarkRow, 'decor_b'),
    roleToCell(cx + 1, landmarkRow, 'decor_a'),
    roleToCell(cx, landmarkRow - 1 > 1 ? landmarkRow - 1 : landmarkRow, 'decor_b'),
  ];
  // Arena boundary markers at the flanks, not a box frame.
  cells.push(roleToCell(2, input.floorRow - 1, 'hazard'));
  cells.push(roleToCell(input.cols - 3, input.floorRow - 1, 'hazard'));

  const lighting = defaultLightingPlan('boss', input.width, input.height);
  lighting.focalPoint = {
    x: Math.round(input.width * 0.5),
    y: Math.round(input.platforms[0] ? input.platforms[0].y : input.height * 0.45),
  };

  return {
    cells,
    landmarks: [
      {
        id: 'boss_arena_landmark',
        importance: 'room_defining',
        x: cx * input.tileSize,
        y: landmarkRow * input.tileSize,
        kind: 'ancient_mechanism',
      },
    ],
    lighting,
    composedAsBossArena: true,
    negativeSpaceReason: 'boss staging',
  };
}

export function isGenericBossRoom(input: { archetype: string; composedAsBossArena?: boolean; landmarkCount: number }): boolean {
  return input.archetype === 'boss' && (!input.composedAsBossArena || input.landmarkCount < 1);
}
