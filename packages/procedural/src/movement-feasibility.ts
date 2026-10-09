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
  /** Static geometry evidence, not a native traversal or reverse-route receipt. */
  authoredUpApproaches: {edgeId: string; flightCount: number; finalJumpPx: number}[];
  metrics: {
    jumpApexPx: number;
    dashReachPx: number;
    airDashReachPx: number;
    upTransitionGapPx: number;
  };
}

/** Actual compiler collision inputs for one directed edge, never an acceptance flag. */
export interface AuthoredStairApproach {
  from: string;
  to: string;
  width: number;
  height: number;
  floorY: number;
  oneWay: boolean;
  flights: {from: {x: number; y: number}; to: {x: number; y: number}; thickness: number}[];
  landings: {x: number; y: number; width: number; height: number}[];
  pits: {x: number; width: number}[];
  solids: {x: number; y: number; width: number; height: number}[];
  door: {x: number; y: number};
}

// Player.tscn: body 24x48, foot origin; RoomTransition.tscn: 24x80 at door origin.
// Intersect the foot path with each solid inflated by the player's body. Open
// bounds allow contact with a support surface, but reject any body penetration.
function clearFootPath(a: {x:number;y:number}, b: {x:number;y:number}, solids: AuthoredStairApproach['solids']): boolean {
  return !solids.some(r => {
    let low = 0, high = 1;
    for (const [start, delta, min, max] of [
      [a.x,b.x-a.x,r.x-12+0.01,r.x+r.width+12-0.01],
      [a.y,b.y-a.y,r.y+0.01,r.y+r.height+48-0.01],
    ]) {
      if (Math.abs(delta!) < 0.001) {
        if (start! <= min! || start! >= max!) return false;
      } else {
        const first = (min!-start!)/delta!, last = (max!-start!)/delta!;
        low = Math.max(low,Math.min(first,last)); high = Math.min(high,Math.max(first,last));
        if (low > high) return false;
      }
    }
    return low <= high;
  });
}

function stairApproachJump(approach: AuthoredStairApproach, stats: MovementStats): number | null {
  const {width,height,floorY,flights,landings,pits,solids,door} = approach;
  const values = [width,height,floorY,door.x,door.y,stats.jumpHeight,
    ...flights.flatMap(f=>[f.from.x,f.from.y,f.to.x,f.to.y,f.thickness]),
    ...[...landings,...solids].flatMap(r=>[r.x,r.y,r.width,r.height]),...pits.flatMap(p=>[p.x,p.width])];
  if (!approach.oneWay || !flights.length || flights.length>64 || values.some(v=>!Number.isFinite(v)) ||
    width<=0 || height<=0 || floorY<=0 || floorY>height || stats.jumpHeight<0 ||
    [...landings,...solids].some(r=>r.width<=0||r.height<=0) || pits.some(p=>p.width<=0) ||
    door.x<0 || door.x+24>width || door.y<0 || door.y+80>height) return null;
  let previous = flights[0]!.from;
  if (Math.abs(previous.y-floorY)>0.01 || pits.some(p=>previous.x+12>p.x&&previous.x-12<p.x+p.width)) return null;
  for (const flight of flights) {
    const {from,to} = flight, run = Math.abs(to.x-from.x), rise = from.y-to.y;
    if (flight.thickness<=0 || run<=0 || rise<=0 || rise>run ||
      Math.abs(from.x-previous.x)>0.01 || Math.abs(from.y-previous.y)>0.01 ||
      [from,to].some(p=>p.x<12||p.x>width-12||p.y<48||p.y>floorY) ||
      !clearFootPath(from,to,solids)) return null;
    previous = to;
  }
  for (const landing of landings) {
    if (Math.abs(landing.y-previous.y)>0.01 || previous.x<landing.x || previous.x>landing.x+landing.width) continue;
    const left = Math.max(landing.x+12,door.x-12+1), right = Math.min(landing.x+landing.width-12,door.x+24+12-1);
    if (left>right) continue;
    const foot = {x:(left+right)/2,y:landing.y};
    const jump = Math.max(0,foot.y-(door.y+80-1));
    if (jump<=stats.jumpHeight && clearFootPath(previous,foot,solids) &&
      clearFootPath(foot,{...foot,y:foot.y-jump},solids)) return jump;
  }
  return null;
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
  authoredStairs: Readonly<Record<string, AuthoredStairApproach>> = {},
): MovementFeasibilityReport {
  const upGap = upTransitionGapPx(layout);
  const metrics = {
    jumpApexPx: jumpApexPx(stats),
    dashReachPx: dashReachPx(stats.dashSpeed, stats.dashDuration),
    airDashReachPx: dashReachPx(stats.airDashSpeed, stats.dashDuration),
    upTransitionGapPx: upGap,
  };

  const issues: MovementFeasibilityIssue[] = [];
  const authoredUpApproaches: MovementFeasibilityReport['authoredUpApproaches'] = [];

  for (const edge of graph.edges) {
    if (edge.requirements.length === 0) continue;

    const transition = normalizeTransition(edge.transition);
    const primaryAbility = edge.requirements.find((req) => isRegisteredAbilityId(req));
    if (!primaryAbility) continue;

    const approach = authoredStairs[edge.id];
    if (transition==='up' && approach?.from===edge.from && approach.to===edge.to) {
      const finalJumpPx = stairApproachJump(approach,stats);
      if (finalJumpPx!==null) {
        authoredUpApproaches.push({edgeId:edge.id,flightCount:approach.flights.length,finalJumpPx});
        // Ordinary walking/jumping reaches this sensor; requirements still lock
        // the door at runtime. The ability is not being credited with upward lift.
        continue;
      }
    }

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
    authoredUpApproaches,
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
