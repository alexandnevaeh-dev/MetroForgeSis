/**
 * Canonical player movement tuning — single source for movement.json assembly,
 * movement-feasibility QA, and Godot PlayerMovementConfig defaults.
 */

export interface PlayerMovementTuning {
  walkSpeed: number;
  runSpeed: number;
  jumpHeight: number;
  gravity: number;
  coyoteTime: number;
  jumpBufferTime: number;
  acceleration: number;
  deceleration: number;
  airAcceleration: number;
  maxFallSpeed: number;
  dashSpeed: number;
  dashDuration: number;
  dashCooldown: number;
  airDashSpeed: number;
  wallSlideSpeed: number;
  wallJumpHorizontal: number;
  wallJumpVertical: number;
  groundSlamSpeed: number;
  grappleSpeed: number;
  swimSpeed: number;
  phaseDuration: number;
  knockbackDecay: number;
}

export const DEFAULT_TOP_DOWN_MOVEMENT = {
  walkSpeed: 110,
  runSpeed: 160,
  acceleration: 800,
  deceleration: 1000,
  knockbackDecay: 600,
} as const;

export const DEFAULT_PLAYER_MOVEMENT_TUNING: PlayerMovementTuning = {
  walkSpeed: 200,
  runSpeed: 350,
  jumpHeight: 120,
  gravity: 980,
  coyoteTime: 0.12,
  jumpBufferTime: 0.1,
  acceleration: 1800,
  deceleration: 2200,
  airAcceleration: 900,
  maxFallSpeed: 650,
  dashSpeed: 500,
  dashDuration: 0.15,
  dashCooldown: 0.5,
  airDashSpeed: 450,
  wallSlideSpeed: 80,
  wallJumpHorizontal: 280,
  wallJumpVertical: -320,
  groundSlamSpeed: 900,
  grappleSpeed: 620,
  swimSpeed: 180,
  phaseDuration: 0.22,
  knockbackDecay: 600,
};

/** Core Game DNA movement fields plus optional per-game overrides. */
export type GameDnaMovementInput = {
  walkSpeed: number;
  runSpeed: number;
  jumpHeight: number;
  gravity: number;
} & Partial<Omit<PlayerMovementTuning, 'walkSpeed' | 'runSpeed' | 'jumpHeight' | 'gravity'>>;

/** Builds the runtime movement.json payload from Game DNA (core + optional overrides). */
export function buildMovementJson(dna: GameDnaMovementInput): PlayerMovementTuning {
  return {
    ...DEFAULT_PLAYER_MOVEMENT_TUNING,
    ...dna,
  };
}

/** Dash/jump subset used by movement-feasibility reach checks. */
export function movementFeasibilityStats(
  tuning: PlayerMovementTuning,
): Pick<
  PlayerMovementTuning,
  | 'walkSpeed'
  | 'runSpeed'
  | 'jumpHeight'
  | 'gravity'
  | 'dashSpeed'
  | 'dashDuration'
  | 'airDashSpeed'
  | 'grappleSpeed'
> {
  return {
    walkSpeed: tuning.walkSpeed,
    runSpeed: tuning.runSpeed,
    jumpHeight: tuning.jumpHeight,
    gravity: tuning.gravity,
    dashSpeed: tuning.dashSpeed,
    dashDuration: tuning.dashDuration,
    airDashSpeed: tuning.airDashSpeed,
    grappleSpeed: tuning.grappleSpeed,
  };
}
