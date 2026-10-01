import { describe, expect, it } from 'vitest';
import {
  PLAYER_ANIMATION_SPEC,
  buildAnimationMetadataSidecar,
  attackTimingToSync,
} from '../src/player-animation-spec.js';

describe('player animation AttackTiming', () => {
  it('keeps hitbox active window inside the clip and after anticipation', () => {
    for (const name of ['attack', 'attack_2', 'attack_3'] as const) {
      const def = PLAYER_ANIMATION_SPEC[name]!;
      expect(def.attackTiming).toBeDefined();
      const t = def.attackTiming!;
      expect(t.anticipationStart).toBe(0);
      expect(t.windUpStart).toBeGreaterThanOrEqual(t.anticipationStart);
      expect(t.activeStart).toBeGreaterThan(t.windUpStart);
      expect(t.activeEnd).toBeGreaterThan(t.activeStart);
      expect(t.recoveryEnd).toBe(def.frameCount - 1);
      expect(t.vfxTriggerFrame).toBeGreaterThanOrEqual(t.activeStart);
      expect(t.vfxTriggerFrame).toBeLessThanOrEqual(t.activeEnd);
      expect(t.vfxSocket).toBe('weapon_tip');
    }
  });

  it('persists combatSync + attackTiming + events in the sidecar', () => {
    const sidecar = buildAnimationMetadataSidecar([
      PLAYER_ANIMATION_SPEC.attack!,
      PLAYER_ANIMATION_SPEC.walk!,
    ]);
    expect(sidecar.attack?.combatSync).toEqual(attackTimingToSync(PLAYER_ANIMATION_SPEC.attack!.attackTiming!));
    expect(sidecar.attack?.attackTiming?.activeStart).toBe(9);
    expect(sidecar.attack?.events?.some((e) => e.id === 'hitbox_enable')).toBe(true);
    expect(sidecar.walk?.events?.some((e) => e.id === 'footstep_left')).toBe(true);
    expect(sidecar.walk?.combatSync).toBeUndefined();
  });
});
