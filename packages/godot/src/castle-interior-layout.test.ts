import { describe, expect, it } from 'vitest';
import { buildCastleInteriorLayout } from './castle-interior-layout.js';
describe('three-storey castle wing', () => {
  it('has connected lower, middle and upper chambers with space for the real controller', () => {
    const wing = buildCastleInteriorLayout();
    expect(wing.floors).toEqual({ lower: 1472, middle: 992, upper: 512 });
    expect(new Set(wing.sections.map((s) => s.storey)).size).toBe(3);
    expect(wing.sections).toHaveLength(8);
    for (const p of wing.platforms) {
      expect(p.x).toBeGreaterThanOrEqual(160);
      expect(p.x + p.width).toBeLessThanOrEqual(3936);
      expect(p.y).toBeLessThan(1472);
      expect(p.height).toBe(32);
    }
    for (const target of wing.ascent)
      expect(
        wing.platforms.some(
          (p) => target.x >= p.x && target.x <= p.x + p.width && target.y === p.y,
        ),
      ).toBe(true);
    expect(wing.maximumStairRise).toBeLessThan(160);
    expect(wing.floors.lower - wing.floors.middle).toBeGreaterThan(320);
    expect(wing.floors.middle - wing.floors.upper).toBeGreaterThan(320);
  });
  it.each([
    [2048, 1536, 32],
    [4096, 768, 32],
    [4097, 1536, 32],
    [4096, 1536, 16],
    [NaN, 1536, 32],
  ])('refuses an incompatible room instead of creating unreachable storeys: %j', (w, h, t) => {
    expect(() => buildCastleInteriorLayout(w, h, t)).toThrow('Three-storey');
  });
});
