import type { WorldGraph } from '@metroforge/schemas';
import { isRegisteredAbilityId } from '@metroforge/shared';

export interface MovementStats {
  walkSpeed: number;
  runSpeed: number;
  jumpHeight: number;
  gravity: number;
  dashSpeed: number;
  dashDuration: number;
  airDashSpeed: number;
}

export const DEFAULT_MOVEMENT_STATS: MovementStats = {
  walkSpeed: 200,
  runSpeed: 350,
  jumpHeight: 120,
  gravity: 980,
  dashSpeed: 500,
  dashDuration: 0.15,
  airDashSpeed: 450,
};

export interface RoomLayoutDefaults {
  width: number;
  height: number;
}

export const DEFAULT_ROOM_LAYOUT: RoomLayoutDefaults = {
  width: 800,
  height: 600,
};

export interface MovementFeasibilityIssue {
  edgeId: string;
  from: string;
  to: string;
  transition: string;
  requirements: string[];
  reason: string;
}

export interface MovementFeasibilityReport {
  feasible: boolean;
  issues: MovementFeasibilityIssue[];
  metrics: {
    jumpApexPx: number;
    dashReachPx: number;
    airDashReachPx: number;
    upTransitionGapPx: number;
  };
}

/** Transitions an ability can legitimately unlock in generated room layouts. */
const ABILITY_OK_TRANSITIONS: Record<string, readonly string[]> = {
  dash: ['horizontal', 'left', 'right'],
  double_jump: ['horizontal', 'left', 'right', 'up'],
  wall_slide: ['up'],
  wall_jump: ['up'],
  air_dash: ['horizontal', 'left', 'right', 'up'],
  ground_slam: ['down'],
  grapple: ['up'],
  swim: ['down'],
  phase: ['horizontal', 'left', 'right'],
};

function normalizeTransition(transition: string | undefined): string {
  if (!transition) return 'horizontal';
  if (transition === 'left' || transition === 'right') return 'horizontal';
  return transition;
}

function upTransitionGapPx(layout: RoomLayoutDefaults): number {
  const floorY = layout.height - 64;
  const playerY = floorY - 80;
  const upTransitionY = 48;
  return Math.max(0, playerY - upTransitionY);
}

function jumpApexPx(stats: MovementStats): number {
  return stats.jumpHeight;
}

function dashReachPx(speed: number, duration: number): number {
  return speed * duration;
}

function verticalReachPx(ability: string, stats: MovementStats): number {
  switch (ability) {
    case 'double_jump':
      return jumpApexPx(stats) * 1.85;
    case 'air_dash':
      return jumpApexPx(stats) + dashReachPx(stats.airDashSpeed, stats.dashDuration);
    case 'grapple':
      return 220;
    case 'wall_jump':
    case 'wall_slide':
      return upTransitionGapPx(DEFAULT_ROOM_LAYOUT);
    default:
      return jumpApexPx(stats);
  }
}

function abilitySupportsTransition(ability: string, transition: string): boolean {
  const allowed = ABILITY_OK_TRANSITIONS[ability];
  if (!allowed) return false;
  return allowed.includes(transition);
}

/**
 * Lightweight physics-feasibility audit for ability-gated world edges.
 * Uses the same room layout constants as `room-assembler.ts` (800×600 default,
 * up transitions near y=48, floor near y=536).
 */
export function validateMovementFeasibility(
  graph: WorldGraph,
  stats: MovementStats = DEFAULT_MOVEMENT_STATS,
  layout: RoomLayoutDefaults = DEFAULT_ROOM_LAYOUT,
): MovementFeasibilityReport {
  const upGap = upTransitionGapPx(layout);
  const metrics = {
    jumpApexPx: jumpApexPx(stats),
    dashReachPx: dashReachPx(stats.dashSpeed, stats.dashDuration),
    airDashReachPx: dashReachPx(stats.airDashSpeed, stats.dashDuration),
    upTransitionGapPx: upGap,
  };

  const issues: MovementFeasibilityIssue[] = [];

  for (const edge of graph.edges) {
    if (edge.requirements.length === 0) continue;

    const transition = normalizeTransition(edge.transition);
    const primaryAbility = edge.requirements.find((req) => isRegisteredAbilityId(req));
    if (!primaryAbility) continue;

    if (!abilitySupportsTransition(primaryAbility, transition)) {
      issues.push({
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        transition: edge.transition ?? 'horizontal',
        requirements: [...edge.requirements],
        reason: `${primaryAbility} cannot satisfy ${transition} gate`,
      });
      continue;
    }

    if (transition === 'up' && !['grapple', 'wall_jump', 'wall_slide'].includes(primaryAbility)) {
      const reach = verticalReachPx(primaryAbility, stats);
      if (reach + 24 < upGap) {
        issues.push({
          edgeId: edge.id,
          from: edge.from,
          to: edge.to,
          transition: edge.transition ?? 'up',
          requirements: [...edge.requirements],
          reason: `up gap ${upGap}px exceeds ${primaryAbility} reach ~${Math.round(reach)}px`,
        });
      }
    }
  }

  return {
    feasible: issues.length === 0,
    issues,
    metrics,
  };
}

export function movementStatsFromJson(raw: Record<string, unknown>): MovementStats {
  return {
    walkSpeed: Number(raw.walkSpeed ?? DEFAULT_MOVEMENT_STATS.walkSpeed),
    runSpeed: Number(raw.runSpeed ?? DEFAULT_MOVEMENT_STATS.runSpeed),
    jumpHeight: Number(raw.jumpHeight ?? DEFAULT_MOVEMENT_STATS.jumpHeight),
    gravity: Number(raw.gravity ?? DEFAULT_MOVEMENT_STATS.gravity),
    dashSpeed: Number(raw.dashSpeed ?? DEFAULT_MOVEMENT_STATS.dashSpeed),
    dashDuration: Number(raw.dashDuration ?? DEFAULT_MOVEMENT_STATS.dashDuration),
    airDashSpeed: Number(raw.airDashSpeed ?? DEFAULT_MOVEMENT_STATS.airDashSpeed),
  };
}
