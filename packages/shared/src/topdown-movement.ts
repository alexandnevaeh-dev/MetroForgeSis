/**
 * Top-down / three-quarter planar movement — NOT side-view-without-gravity.
 * Written into movement.json for TopDownPlayerController / PlayerMovementConfig.
 */

export type TopDownFacingMode = 'snap_8' | 'snap_4' | 'analog' | 'independent_aim';
export type TopDownPerspectiveKind = 'TOP_DOWN_FLAT' | 'TOP_DOWN_THREE_QUARTER' | 'ISOMETRIC';

export interface TopDownMovementProfile {
  maxWalkSpeed: number;
  maxRunSpeed: number;
  acceleration: number;
  deceleration: number;
  turningResponsiveness: number;
  dodgeSpeed: number;
  dodgeDuration: number;
  dodgeCooldown: number;
  dodgeInvulnerability: number;
  diagonalNormalization: boolean;
  analogDeadzone: number;
  facingMode: TopDownFacingMode;
  movementDirections: 4 | 8;
  knockbackDecay: number;
  perspective: TopDownPerspectiveKind;
  /** Separate aim stick / mouse aim when true (twin-stick). */
  independentAim: boolean;
}

export const DEFAULT_TOP_DOWN_MOVEMENT_PROFILE: TopDownMovementProfile = {
  maxWalkSpeed: 110,
  maxRunSpeed: 160,
  acceleration: 800,
  deceleration: 1000,
  turningResponsiveness: 14,
  dodgeSpeed: 280,
  dodgeDuration: 0.22,
  dodgeCooldown: 0.55,
  dodgeInvulnerability: 0.18,
  diagonalNormalization: true,
  analogDeadzone: 0.2,
  facingMode: 'snap_8',
  movementDirections: 8,
  knockbackDecay: 600,
  perspective: 'TOP_DOWN_THREE_QUARTER',
  independentAim: false,
};

/** Payload merged into movement.json for planar genres. */
export function buildTopDownMovementJson(
  overrides: Partial<TopDownMovementProfile> & {
    walkSpeed?: number;
    runSpeed?: number;
    acceleration?: number;
    deceleration?: number;
    knockbackDecay?: number;
    movementDirections?: number;
    worldStyle?: string;
  } = {},
): Record<string, unknown> {
  const profile: TopDownMovementProfile = {
    ...DEFAULT_TOP_DOWN_MOVEMENT_PROFILE,
    maxWalkSpeed: overrides.maxWalkSpeed ?? overrides.walkSpeed ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.maxWalkSpeed,
    maxRunSpeed: overrides.maxRunSpeed ?? overrides.runSpeed ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.maxRunSpeed,
    acceleration: overrides.acceleration ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.acceleration,
    deceleration: overrides.deceleration ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.deceleration,
    knockbackDecay: overrides.knockbackDecay ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.knockbackDecay,
    movementDirections:
      overrides.movementDirections === 4 || overrides.movementDirections === 8
        ? overrides.movementDirections
        : DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.movementDirections,
    turningResponsiveness: overrides.turningResponsiveness ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.turningResponsiveness,
    dodgeSpeed: overrides.dodgeSpeed ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.dodgeSpeed,
    dodgeDuration: overrides.dodgeDuration ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.dodgeDuration,
    dodgeCooldown: overrides.dodgeCooldown ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.dodgeCooldown,
    dodgeInvulnerability:
      overrides.dodgeInvulnerability ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.dodgeInvulnerability,
    diagonalNormalization:
      overrides.diagonalNormalization ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.diagonalNormalization,
    analogDeadzone: overrides.analogDeadzone ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.analogDeadzone,
    facingMode: overrides.facingMode ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.facingMode,
    perspective: overrides.perspective ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.perspective,
    independentAim: overrides.independentAim ?? DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.independentAim,
  };

  return {
    // Legacy keys consumed by existing PlayerMovementConfig / tests
    walkSpeed: profile.maxWalkSpeed,
    runSpeed: profile.maxRunSpeed,
    jumpHeight: 0,
    gravity: 0,
    acceleration: profile.acceleration,
    deceleration: profile.deceleration,
    knockbackDecay: profile.knockbackDecay,
    movementDirections: profile.movementDirections,
    worldStyle: overrides.worldStyle ?? 'continuous',
    // Explicit top-down profile
    topDown: profile,
  };
}
