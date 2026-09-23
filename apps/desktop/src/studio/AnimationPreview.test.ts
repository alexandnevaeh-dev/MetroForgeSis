import { describe, it, expect } from 'vitest';
import { animationFrameRect } from './AnimationPreview.js';
describe('animation preview cropping', () => {
  it('uses the full dimensions of a high resolution horizontal strip', () => {
    expect(animationFrameRect(2048, 384, 8, 7)).toEqual({ x: 1792, y: 0, width: 256, height: 384 });
  });
  it('continues into the second row without changing proportions', () => {
    expect(animationFrameRect(1024, 768, 8, 5, 256, 384)).toEqual({ x: 256, y: 384, width: 256, height: 384 });
  });
  it('does not pretend inconsistent or missing metadata is playable', () => {
    expect(animationFrameRect(100, 100, 0, 0)).toBeNull();
    expect(animationFrameRect(100, 100, 8, 0)).toBeNull();
    expect(animationFrameRect(100, 100, 8, 0, 100, 100)).toBeNull();
  });
});