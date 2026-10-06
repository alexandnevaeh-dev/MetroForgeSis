import { describe, expect, it } from 'vitest';
import { computeFrameQualityMetrics, decodePngRgba } from './png.js';
import {
  generateTopDownPlayerSheet,
  TOP_DOWN_FACINGS,
  topDownPlayerFrameCount,
  type TopDownAction,
} from './topdown-player-sprites.js';

describe('separate top-down player sprites', () => {
  for (const action of ['idle', 'walk', 'run', 'attack', 'hurt', 'death'] as TopDownAction[]) {
    it(`builds crisp, animated ${action} strips for all eight facings`, () => {
      const count = topDownPlayerFrameCount(action);
      for (const facing of TOP_DOWN_FACINGS) {
        const decoded = decodePngRgba(generateTopDownPlayerSheet(action, facing));
        expect(decoded.width).toBe(64 * count);
        expect(decoded.height).toBe(64);
        const quality = computeFrameQualityMetrics(decoded.rgba, 64, 64, count);
        expect(quality.uniqueFrameRatio).toBeGreaterThan(action === 'idle' ? 0.2 : 0.45);
        expect(quality.alphaBoundsConsistency).toBeGreaterThan(0.55);
      }
    });
  }

  it('uses different silhouettes for north, east and south', () => {
    const north = generateTopDownPlayerSheet('idle', 'N');
    expect(generateTopDownPlayerSheet('idle', 'E').equals(north)).toBe(false);
    expect(generateTopDownPlayerSheet('idle', 'S').equals(north)).toBe(false);
  });
});
