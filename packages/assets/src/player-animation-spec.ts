/**
 * Canonical, data-driven descriptor for every player animation clip — the single source of
 * truth asset-pipeline.ts's generators read frame counts from, and that gets written out as a
 * runtime sidecar JSON (`player_animations.json`) so AnimatedAssetSprite.gd can set real
 * per-clip FPS/loop instead of one global `frame_count`/hardcoded loop-exclusion list. Replaces
 * the previous pattern of frame counts and loop flags scattered as literals across
 * asset-pipeline.ts, png.ts call sites, and AnimatedAssetSprite.gd.
 */

export type PlayerAnimationGenerationMode = 'walk-cycle' | 'run-cycle' | 'progression-ramp' | 'progression-oscillate' | 'attack-arc' | 'hurt-flash' | 'death-sink';

export interface AttackSyncMetadata {
  /** Frame index (0-based) the attack hitbox activates on. */
  hitboxOnFrame: number;
  /** Frame index the attack hitbox deactivates on. */
  hitboxOffFrame: number;
  /** Frame index a hit-impact VFX should spawn on. */
  vfxFrame: number;
  /** Frame index the swing SFX should fire on (usually just before impact). */
  sfxFrame: number;
  /** Frame index after which pressing attack again continues the combo instead of restarting it. */
  comboCancelOpenFrame: number;
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
  combatSync?: AttackSyncMetadata;
  /** Minimum acceptable uniqueFrameRatio from computeFrameQualityMetrics for this clip to be
   *  accepted as production-ready rather than falling back. */
  minUniqueFrameRatio: number;
}

export const PLAYER_ANIMATION_SPEC: Record<string, PlayerAnimationDefinition> = {
  idle: { name: 'idle', frameCount: 8, fps: 8, loop: true, mode: 'progression-oscillate', poseKey: 'idle', minUniqueFrameRatio: 0.5 },
  walk: { name: 'walk', frameCount: 10, fps: 10, loop: true, mode: 'walk-cycle', minUniqueFrameRatio: 0.7 },
  run: { name: 'run', frameCount: 12, fps: 14, loop: true, mode: 'run-cycle', minUniqueFrameRatio: 0.8 },
  jump_start: { name: 'jump_start', frameCount: 6, fps: 12, loop: false, mode: 'progression-ramp', poseKey: 'jump_start', minUniqueFrameRatio: 0.6 },
  jump: { name: 'jump', frameCount: 6, fps: 8, loop: true, mode: 'progression-oscillate', poseKey: 'jump', minUniqueFrameRatio: 0.5 },
  fall: { name: 'fall', frameCount: 6, fps: 8, loop: true, mode: 'progression-oscillate', poseKey: 'fall', minUniqueFrameRatio: 0.5 },
  land: { name: 'land', frameCount: 8, fps: 14, loop: false, mode: 'progression-ramp', poseKey: 'land', minUniqueFrameRatio: 0.6 },
  dash: { name: 'dash', frameCount: 8, fps: 16, loop: false, mode: 'progression-ramp', poseKey: 'dash', minUniqueFrameRatio: 0.6 },
  wall_slide: { name: 'wall_slide', frameCount: 6, fps: 8, loop: true, mode: 'progression-oscillate', poseKey: 'wall_slide', minUniqueFrameRatio: 0.5 },
  wall_jump: { name: 'wall_jump', frameCount: 8, fps: 14, loop: false, mode: 'progression-ramp', poseKey: 'wall_jump', minUniqueFrameRatio: 0.6 },
  swim: { name: 'swim', frameCount: 12, fps: 10, loop: true, mode: 'progression-oscillate', poseKey: 'swim', minUniqueFrameRatio: 0.5 },
  attack: {
    name: 'attack', frameCount: 12, fps: 18, loop: false, mode: 'attack-arc', arcKind: 'horizontal', minUniqueFrameRatio: 0.7,
    combatSync: { hitboxOnFrame: 7, hitboxOffFrame: 9, vfxFrame: 8, sfxFrame: 6, comboCancelOpenFrame: 9 },
  },
  attack_2: {
    name: 'attack_2', frameCount: 14, fps: 18, loop: false, mode: 'attack-arc', arcKind: 'upward', minUniqueFrameRatio: 0.7,
    combatSync: { hitboxOnFrame: 8, hitboxOffFrame: 10, vfxFrame: 9, sfxFrame: 7, comboCancelOpenFrame: 10 },
  },
  attack_3: {
    name: 'attack_3', frameCount: 16, fps: 16, loop: false, mode: 'attack-arc', arcKind: 'downward', minUniqueFrameRatio: 0.7,
    combatSync: { hitboxOnFrame: 9, hitboxOffFrame: 12, vfxFrame: 10, sfxFrame: 8, comboCancelOpenFrame: 13 },
  },
  hurt: { name: 'hurt', frameCount: 6, fps: 14, loop: false, mode: 'hurt-flash', minUniqueFrameRatio: 0.6 },
  death: { name: 'death', frameCount: 16, fps: 10, loop: false, mode: 'death-sink', minUniqueFrameRatio: 0.6 },
};

export const PLAYER_ANIMATION_NAMES = Object.keys(PLAYER_ANIMATION_SPEC);

/** Runtime sidecar shape written next to a character's sheets — one entry per animation this
 *  character actually has a generated clip for. Consumed by AnimatedAssetSprite.gd to set real
 *  per-clip playback speed/loop instead of a single global frame_count/hardcoded loop list. */
export interface AnimationMetadataSidecar {
  [animationName: string]: { frameCount: number; fps: number; loop: boolean };
}

export function buildAnimationMetadataSidecar(defs: PlayerAnimationDefinition[]): AnimationMetadataSidecar {
  const sidecar: AnimationMetadataSidecar = {};
  for (const def of defs) {
    sidecar[def.name] = { frameCount: def.frameCount, fps: def.fps, loop: def.loop };
  }
  return sidecar;
}
