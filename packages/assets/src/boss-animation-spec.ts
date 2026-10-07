import type { PlayerAnimationDefinition, AnimationMetadataSidecar } from './player-animation-spec.js';
import { buildAnimationMetadataSidecar } from './player-animation-spec.js';

/** Combat-cycle clips consumed by Boss.tscn extra_animation_sheets and BossController. */
export const BOSS_ANIMATION_SPEC: Record<string, PlayerAnimationDefinition> = {
  idle: {
    name: 'idle',
    frameCount: 6,
    fps: 6,
    loop: true,
    mode: 'progression-oscillate',
    poseKey: 'boss_idle',
    minUniqueFrameRatio: 0.5,
  },
  telegraph: {
    name: 'telegraph',
    frameCount: 4,
    fps: 8,
    loop: true,
    mode: 'progression-oscillate',
    poseKey: 'boss_telegraph',
    minUniqueFrameRatio: 0.5,
  },
  recovery: {
    name: 'recovery',
    frameCount: 4,
    fps: 8,
    loop: true,
    mode: 'progression-oscillate',
    poseKey: 'boss_recovery',
    minUniqueFrameRatio: 0.5,
  },
  walk: { name: 'walk', frameCount: 6, fps: 6, loop: true, mode: 'walk-cycle', minUniqueFrameRatio: 0.5 },
  attack: {
    name: 'attack',
    frameCount: 6,
    fps: 12,
    loop: false,
    mode: 'attack-arc',
    arcKind: 'horizontal',
    minUniqueFrameRatio: 0.6,
  },
  attack_projectile: {
    name: 'attack_projectile',
    frameCount: 6,
    fps: 12,
    loop: false,
    mode: 'progression-ramp',
    poseKey: 'boss_projectile',
    minUniqueFrameRatio: 0.5,
  },
  attack_burst: {
    name: 'attack_burst',
    frameCount: 6,
    fps: 12,
    loop: false,
    mode: 'progression-ramp',
    poseKey: 'boss_burst',
    minUniqueFrameRatio: 0.5,
  },
  hurt: { name: 'hurt', frameCount: 3, fps: 12, loop: false, mode: 'hurt-flash', minUniqueFrameRatio: 0.5 },
  death: { name: 'death', frameCount: 8, fps: 8, loop: false, mode: 'death-sink', minUniqueFrameRatio: 0.5 },
};

export function buildBossAnimationSidecar(includeSideViewRun = false): AnimationMetadataSidecar {
  const clips = Object.values(BOSS_ANIMATION_SPEC);
  if (includeSideViewRun) clips.push({name:'run',frameCount:12,fps:14,loop:true,mode:'run-cycle',minUniqueFrameRatio:0.8});
  return buildAnimationMetadataSidecar(clips);
}
