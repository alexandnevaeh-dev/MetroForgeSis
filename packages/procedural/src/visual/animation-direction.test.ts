import { describe, expect, it } from 'vitest';
import { animationPoseGuidance } from './animation-direction.js';
describe('state-specific animation direction', () => {
  it.each([
    ['walk', 'opposing arm and leg'], ['run', 'contact and flight'],
    ['jump', 'no planted feet'], ['land', 'knees and hips absorb'],
    ['attack_2', 'anticipation strike and recovery'], ['death', 'no rigid whole-body sinking'],
  ])('%s has distinct mechanics-aware body action', (state, expected) => {
    const value = animationPoseGuidance(state);
    expect(value).toContain(expected);
    expect(value).toContain('stable canvas anchor');
    expect(value).toContain('shoulders elbows hips knees and head');
  });
});
