import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './png.js';
import { generateStormglassPlayerSheet, stormglassFrameCount, type StormglassAction } from './sideview-stormglass-player.js';

const actions: StormglassAction[] = ['idle', 'walk', 'run', 'jump_start', 'jump', 'fall', 'land', 'dash', 'attack', 'hurt', 'death'];

describe('Stormglass side-view player family', () => {
  it.each(actions)('%s emits a transparent 64px strip with the declared frames', (action) => {
    const image = decodePngRgba(generateStormglassPlayerSheet(action));
    expect(image.height).toBe(64);
    expect(image.width).toBe(64 * stormglassFrameCount(action));
    expect(image.rgba.some((value, index) => index % 4 === 3 && value === 0)).toBe(true);
    expect(image.rgba.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });

  it('walk, run and attack have distinct frame silhouettes', () => {
    for (const action of ['walk', 'run', 'attack'] as const) {
      const image = decodePngRgba(generateStormglassPlayerSheet(action));
      const hashes = new Set<string>();
      for (let frame = 0; frame < stormglassFrameCount(action); frame++) {
        const alpha: number[] = [];
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) alpha.push(image.rgba[(y * image.width + frame * 64 + x) * 4 + 3]!);
        hashes.add(Buffer.from(alpha).toString('base64'));
      }
      expect(hashes.size).toBeGreaterThanOrEqual(Math.ceil(stormglassFrameCount(action) * 0.7));
    }
  });
});
