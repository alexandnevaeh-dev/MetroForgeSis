import { describe, expect, it } from 'vitest';
import { previewFrameAtTime } from './animation-clock.js';
describe('animation preview clock', () => {
  it('preserves sub-one FPS timing', () => {
    expect(previewFrameAtTime(0, 1999, 8, .5)).toBe(0);
    expect(previewFrameAtTime(0, 2000, 8, .5)).toBe(1);
  });
  it('catches up after delayed callbacks and wraps from a stepped frame', () => {
    expect(previewFrameAtTime(6, 375, 8, 8)).toBe(1);
    expect(previewFrameAtTime(6, 1000375, 8, 8)).toBe(1);
  });
  it('uses safe defaults for invalid metadata and time', () => {
    expect(previewFrameAtTime(0, 125, 8, Infinity)).toBe(1);
    expect(previewFrameAtTime(2, -10, 8, 12)).toBe(2);
    expect(previewFrameAtTime(2, 100, 0, 12)).toBe(0);
  });
});
