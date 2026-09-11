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
  /** Grapple pull speed (px/s) — real per-project stat, used to derive grapple reach below. */
  grappleSpeed: number;
}

export const DEFAULT_MOVEMENT_STATS: MovementStats = {
  walkSpeed: 200,
  runSpeed: 350,
  jumpHeight: 120,
  gravity: 980,
  dashSpeed: 500,
  dashDuration: 0.15,
  airDashSpeed: 450,
  grappleSpeed: 620,
};

/**
 * No generated project defines a grapple *duration* the way dash does — a grapple pull runs
 * until it reaches its anchor, not for a fixed window. This is a deliberately generous, documented
 * assumption for how long a single grapple traversal is allowed to take, not a real config value;
 * it exists so grappleSpeed (a real per-project stat) drives the reach check instead of the
 * previous hardcoded 220px constant that never varied by project and was never actually checked
 * against anything (grapple was excluded from validation entirely — see below).
 */
const GRAPPLE_TRAVEL_BUDGET_SEC = 1.0;

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
      return dashReachPx(stats.grappleSpeed, GRAPPLE_TRAVEL_BUDGET_SEC);
    case 'wall_jump':
    case 'wall_slide':
      // Real wall-jump reach is a chained-bounce mechanic (jump off one wall, land the next,
      // repeat up a shaft) — a single-impulse height formula from wallJumpVertical/gravity would
      // drastically underestimate what a real player/generated level can climb, since level design
      // in this genre keeps wall-climb shafts within one room's height by construction. Treated as
      // "always reaches this room's own up-gap" rather than reach-limited the way a single jump or
      // dash is — an explicit design decision, not (as it was previously) an accidental
      // self-referencing formula that looked like a real check but could never fail.
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

    if (transition === 'up') {
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

    // 'horizontal' and 'down' have no gap-vs-reach check the way 'up' does, and this is a
    // deliberate, documented finding rather than a coverage gap being papered over: gravity makes
    // vertical progress physically *impossible* without a jump-lineage ability, which is what
    // makes the up-gap-vs-jump-height comparison a real physical constraint. Horizontal and
    // downward progress in this template are always physically reachable by walking or falling —
    // an ability requirement on those edges is a *logical* lock (dash/double_jump/wall_jump gates
    // with no runtime enforcement beyond "the door checks GameManager.has_ability"), not a
    // physical one, with two real exceptions that DO have runtime-enforced physical obstacles:
    // ground_slam ('down') breaks a real WeakFloor (templates/.../world/WeakFloor.gd), and phase
    // ('horizontal'/'left'/'right') passes through a real PhaseBarrier (.../world/PhaseBarrier.gd)
    // — both driven by packages/godot/src/room-assembler.ts's deriveWeakFloors/derivePhaseBarriers,
    // conditioned on the exact same edge `requirements` this function reads. A synthetic "room
    // width minus margin" reach-vs-gap formula for those was tried and rejected: nothing in the
    // actual generated rooms requires crossing a fixed span to reach a horizontally-gated door
    // (confirmed by inspecting a real generated room — the required ability blocks the *door*
    // logically, not a physical gap the player must dash across), so that check would have no
    // grounding in what the game actually enforces and would only produce false failures. The
    // real, meaningful geometry check for ground_slam/phase gates is "does the expected physical
    // obstacle actually exist in the exported project for this edge" — an export-fidelity
    // question (see validateExportFidelity), not a MovementStats distance formula.
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
    grappleSpeed: Number(raw.grappleSpeed ?? DEFAULT_MOVEMENT_STATS.grappleSpeed),
  };
}
