import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOP_DOWN_MOVEMENT_PROFILE,
  buildTopDownMovementJson,
} from '../src/topdown-movement.js';

describe('TopDownMovementProfile', () => {
  it('writes planar profile without gravity locomotion', () => {
    const json = buildTopDownMovementJson({ movementDirections: 8 });
    expect(json.gravity).toBe(0);
    expect(json.jumpHeight).toBe(0);
    expect(json.walkSpeed).toBe(DEFAULT_TOP_DOWN_MOVEMENT_PROFILE.maxWalkSpeed);
    expect((json.topDown as { dodgeSpeed: number }).dodgeSpeed).toBeGreaterThan(0);
    expect((json.topDown as { perspective: string }).perspective).toBe('TOP_DOWN_THREE_QUARTER');
  });
});
