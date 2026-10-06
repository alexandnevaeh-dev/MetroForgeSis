import { describe, expect, it } from 'vitest';
import { pickTerrainVariant, variantAtlasForCell } from '../src/tile-variants.js';

describe('terrain variants', () => {
  it('is deterministic for the same seed and does not always swap', () => {
    const a = pickTerrainVariant('ground', 3, 4, 42);
    const b = pickTerrainVariant('ground', 3, 4, 42);
    expect(a).toEqual(b);
    const samples = Array.from({ length: 40 }, (_, i) => pickTerrainVariant('ground', i, 0, 99));
    const canonical = samples.filter((s) => s.role === 'ground').length;
    expect(canonical).toBeGreaterThan(samples.length * 0.4);
  });

  it('maps atlas cells without throwing', () => {
    const v = variantAtlasForCell(0, 0, 2, 5, 7);
    expect(v.col).toBeGreaterThanOrEqual(0);
    expect(v.row).toBeGreaterThanOrEqual(0);
  });
});
