/**
 * Canonical, data-driven descriptor for every player animation clip — the single source of
 * truth asset-pipeline.ts's generators read frame counts from, and that gets written out as a
 * runtime sidecar JSON (`player_animations.json`) so AnimatedAssetSprite.gd can set real
 * per-clip FPS/loop instead of one global `frame_count`/hardcoded loop-exclusion list.
 *
 * Attack clips carry full AttackTiming (anticipation → recovery) so hitbox / VFX / SFX / hit-stop
 * stay synchronized with the visible strike — not a fixed 0.15s timer from attack start.
 *
 * Walk/run use `walk-cycle` / `run-cycle` → png.ts blitArticulatedSheet (hip sway + opposing
 * arms/legs + compress). Do not substitute POSE_TRANSFORMS shear ramps for those modes.
 */

export type PlayerAnimationGenerationMode =
  | 'walk-cycle'
  | 'run-cycle'
  | 'progression-ramp'
  | 'progression-oscillate'
  | 'attack-arc'
  | 'hurt-flash'
  | 'death-sink';

export type AnimationEventId =
  | 'footstep_left'
  | 'footstep_right'
  | 'weapon_swing'
  | 'hitbox_enable'
  | 'hitbox_disable'
  | 'dash_start'
  | 'dash_end'
  | 'land'
  | 'jump_launch'
  | 'spell_release'
  | 'vfx_attack'
  | 'vfx_impact'
  | 'sfx_swing'
  | 'sfx_impact';

export interface AnimationEvent {
  frame: number;
  id: AnimationEventId;
}

/**
 * Full melee timing window. Frame indices are 0-based within the clip.
 * Hitbox must only be active while the weapon visually reaches the strike zone.
 */
export interface AttackTiming {
  anticipationStart: number;
  windUpStart: number;
  activeStart: number;
  activeEnd: number;
  recoveryStart: number;
  recoveryEnd: number;
  hitStopDuration: number;
  cameraImpulse: number;
  vfxTriggerFrame: number;
  sfxTriggerFrame: number;
  /** Frame after which pressing attack again continues the combo instead of restarting. */
  comboCancelOpenFrame: number;
  /** Preferred VFX socket for the slash trail (runtime attachment). */
  vfxSocket: 'weapon_tip' | 'weapon_center' | 'hand_right' | 'chest' | 'impact_origin';
}

/** @deprecated Prefer AttackTiming — kept as the compact sync view. */
export interface AttackSyncMetadata {
  hitboxOnFrame: number;
  hitboxOffFrame: number;
  vfxFrame: number;
  sfxFrame: number;
  comboCancelOpenFrame: number;
}

export function attackTimingToSync(timing: AttackTiming): AttackSyncMetadata {
  return {
    hitboxOnFrame: timing.activeStart,
    hitboxOffFrame: timing.activeEnd,
    vfxFrame: timing.vfxTriggerFrame,
    sfxFrame: timing.sfxTriggerFrame,
    comboCancelOpenFrame: timing.comboCancelOpenFrame,
  };
}

export function attackEventsFromTiming(timing: AttackTiming): AnimationEvent[] {
  return [
    { frame: timing.windUpStart, id: 'weapon_swing' },
    { frame: timing.activeStart, id: 'hitbox_enable' },
    { frame: timing.vfxTriggerFrame, id: 'vfx_attack' },
    { frame: timing.sfxTriggerFrame, id: 'sfx_swing' },
    { frame: timing.activeEnd, id: 'hitbox_disable' },
  ];
}

export interface PlayerAnimationDefinition {
  name: string;
  frameCount: number;
  fps: number;
  loop: boolean;
  mode: PlayerAnimationGenerationMode;
  /** POSE_TRANSFORMS key used for progression-ramp/progression-oscillate generation. */
  poseKey?: string;
  arcKind?: 'horizontal' | 'upward' | 'downward';
  /** Full attack phase timing — required for attack / attack_2 / attack_3. */
  attackTiming?: AttackTiming;
  /** @deprecated Use attackTiming; still accepted for older call sites. */
  combatSync?: AttackSyncMetadata;
  events?: AnimationEvent[];
  /** Minimum acceptable uniqueFrameRatio from computeFrameQualityMetrics for this clip to be
   *  accepted as production-ready rather than falling back. */
  minUniqueFrameRatio: number;
}

function meleeTiming(input: {
  frames: number;
  activeStart: number;
  activeEnd: number;
  vfx: number;
  sfx: number;
  cancel: number;
  hitStop?: number;
  impulse?: number;
}): AttackTiming {
  const anticipationStart = 0;
  const windUpStart = Math.max(1, Math.floor(input.activeStart * 0.45));
  const recoveryStart = Math.min(input.frames - 1, input.activeEnd);
  const recoveryEnd = input.frames - 1;
  return {
    anticipationStart,
    windUpStart,
    activeStart: input.activeStart,
    activeEnd: input.activeEnd,
    recoveryStart,
    recoveryEnd,
    hitStopDuration: input.hitStop ?? 0.045,
    cameraImpulse: input.impulse ?? 0.35,
    vfxTriggerFrame: input.vfx,
    sfxTriggerFrame: input.sfx,
    comboCancelOpenFrame: input.cancel,
    vfxSocket: 'weapon_tip',
  };
}

export const PLAYER_ANIMATION_SPEC: Record<string, PlayerAnimationDefinition> = {
  idle: {
    name: 'idle',
    frameCount: 8,
    fps: 8,
    loop: true,
    mode: 'progression-oscillate',
    poseKey: 'idle',
    minUniqueFrameRatio: 0.5,
  },
  walk: {
    name: 'walk',
    // 14 in-betweens keep hip sway / stride continuous at pixel scale (10f read choppy).
    frameCount: 14,
    fps: 12,
    loop: true,
    mode: 'walk-cycle',
    minUniqueFrameRatio: 0.7,
    events: [
      { frame: 3, id: 'footstep_left' },
      { frame: 10, id: 'footstep_right' },
    ],
  },
  run: {
    name: 'run',
    frameCount: 16,
    fps: 16,
    loop: true,
    mode: 'run-cycle',
    minUniqueFrameRatio: 0.8,
    events: [
      { frame: 3, id: 'footstep_left' },
      { frame: 11, id: 'footstep_right' },
    ],
  },
  jump_start: {
    name: 'jump_start',
    frameCount: 6,
    fps: 12,
    loop: false,
    mode: 'progression-ramp',
    poseKey: 'jump_start',
    minUniqueFrameRatio: 0.6,
    events: [{ frame: 2, id: 'jump_launch' }],
  },
  jump: {
    name: 'jump',
    frameCount: 6,
    fps: 8,
    loop: true,
    mode: 'progression-oscillate',
    poseKey: 'jump',
    minUniqueFrameRatio: 0.5,
  },
  fall: {
    name: 'fall',
    frameCount: 6,
    fps: 8,
    loop: true,
    mode: 'progression-oscillate',
    poseKey: 'fall',
    minUniqueFrameRatio: 0.5,
  },
  land: {
    name: 'land',
    frameCount: 8,
    fps: 14,
    loop: false,
    mode: 'progression-ramp',
    poseKey: 'land',
    minUniqueFrameRatio: 0.6,
    events: [{ frame: 1, id: 'land' }],
  },
  dash: {
    name: 'dash',
    frameCount: 8,
    fps: 16,
    loop: false,
    mode: 'progression-ramp',
    poseKey: 'dash',
    minUniqueFrameRatio: 0.6,
    events: [
      { frame: 0, id: 'dash_start' },
      { frame: 7, id: 'dash_end' },
    ],
  },
  wall_slide: {
    name: 'wall_slide',
    frameCount: 6,
    fps: 8,
    loop: true,
    mode: 'progression-oscillate',
    poseKey: 'wall_slide',
    minUniqueFrameRatio: 0.5,
  },
  wall_jump: {
    name: 'wall_jump',
    frameCount: 8,
    fps: 14,
    loop: false,
    mode: 'progression-ramp',
    poseKey: 'wall_jump',
    minUniqueFrameRatio: 0.6,
    events: [{ frame: 1, id: 'jump_launch' }],
  },
  swim: {
    name: 'swim',
    frameCount: 12,
    fps: 10,
    loop: true,
    mode: 'progression-oscillate',
    poseKey: 'swim',
    minUniqueFrameRatio: 0.5,
  },
  attack: (() => {
    const attackTiming = meleeTiming({
      frames: 16,
      activeStart: 9,
      activeEnd: 12,
      vfx: 10,
      sfx: 8,
      cancel: 12,
      hitStop: 0.05,
      impulse: 0.4,
    });
    return {
      name: 'attack',
      frameCount: 16,
      fps: 20,
      loop: false,
      mode: 'attack-arc' as const,
      arcKind: 'horizontal' as const,
      minUniqueFrameRatio: 0.7,
      attackTiming,
      combatSync: attackTimingToSync(attackTiming),
      events: attackEventsFromTiming(attackTiming),
    };
  })(),
  attack_2: (() => {
    const attackTiming = meleeTiming({
      frames: 16,
      activeStart: 9,
      activeEnd: 12,
      vfx: 10,
      sfx: 8,
      cancel: 12,
      hitStop: 0.055,
      impulse: 0.5,
    });
    return {
      name: 'attack_2',
      frameCount: 16,
      fps: 20,
      loop: false,
      mode: 'attack-arc' as const,
      arcKind: 'upward' as const,
      minUniqueFrameRatio: 0.7,
      attackTiming,
      combatSync: attackTimingToSync(attackTiming),
      events: attackEventsFromTiming(attackTiming),
    };
  })(),
  attack_3: (() => {
    const attackTiming = meleeTiming({
      frames: 18,
      activeStart: 10,
      activeEnd: 14,
      vfx: 11,
      sfx: 9,
      cancel: 14,
      hitStop: 0.07,
      impulse: 0.65,
    });
    return {
      name: 'attack_3',
      frameCount: 18,
      fps: 18,
      loop: false,
      mode: 'attack-arc' as const,
      arcKind: 'downward' as const,
      minUniqueFrameRatio: 0.7,
      attackTiming,
      combatSync: attackTimingToSync(attackTiming),
      events: attackEventsFromTiming(attackTiming),
    };
  })(),
  hurt: {
    name: 'hurt',
    frameCount: 6,
    fps: 14,
    loop: false,
    mode: 'hurt-flash',
    minUniqueFrameRatio: 0.6,
  },
  death: {
    name: 'death',
    frameCount: 16,
    fps: 10,
    loop: false,
    mode: 'death-sink',
    minUniqueFrameRatio: 0.6,
  },
};

export const PLAYER_ANIMATION_NAMES = Object.keys(PLAYER_ANIMATION_SPEC);

/** Runtime sidecar shape written next to a character's sheets. */
export interface AnimationClipSidecarEntry {
  frameCount: number;
  fps: number;
  loop: boolean;
  combatSync?: AttackSyncMetadata;
  attackTiming?: AttackTiming;
  events?: AnimationEvent[];
  rootMotionMode?: 'none' | 'planar' | 'full';
  cancelWindow?: { openFrame: number; closeFrame: number };
}

export type AnimationMetadataSidecar = Record<string, AnimationClipSidecarEntry>;

export function buildAnimationMetadataSidecar(
  defs: PlayerAnimationDefinition[],
): AnimationMetadataSidecar {
  const sidecar: AnimationMetadataSidecar = {};
  for (const def of defs) {
    const timing = def.attackTiming;
    const sync = timing ? attackTimingToSync(timing) : def.combatSync;
    const events = def.events ?? (timing ? attackEventsFromTiming(timing) : undefined);
    sidecar[def.name] = {
      frameCount: def.frameCount,
      fps: def.fps,
      loop: def.loop,
      ...(sync ? { combatSync: sync } : {}),
      ...(timing ? { attackTiming: timing } : {}),
      ...(events && events.length > 0 ? { events } : {}),
      rootMotionMode: 'none',
      ...(sync
        ? {
            cancelWindow: {
              openFrame: sync.comboCancelOpenFrame,
              closeFrame: def.frameCount - 1,
            },
          }
        : {}),
    };
  }
  return sidecar;
}
