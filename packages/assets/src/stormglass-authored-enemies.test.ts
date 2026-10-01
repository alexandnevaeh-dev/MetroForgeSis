import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'authored', 'stormglass-gothic-enemies-v1');
const ids = ['000', '004', '008', '012', '016'] as const;
const clips = { idle: 6, walk: 8, attack: 8, hurt: 3, death: 8 } as const;

describe('Stormglass authored Gothic enemy family', () => {
  it('preserves the transparent high-resolution source lineup on E:', async () => {
    const metadata = await sharp(join(root, 'stormglass-gothic-enemy-lineup-v1.png')).metadata();
    expect(metadata.width).toBeGreaterThanOrEqual(2000);
    expect(metadata.height).toBeGreaterThanOrEqual(700);
    expect(metadata.hasAlpha).toBe(true);
  });

  for (const id of ids) {
    for (const [clip, frameCount] of Object.entries(clips)) {
      it(`enemy_${id} ${clip} has ${frameCount} transparent 64 px frames`, async () => {
        const image = sharp(join(root, `enemy_${id}_${clip}.png`));
        const metadata = await image.metadata();
        expect(metadata.width).toBe(64 * frameCount);
        expect(metadata.height).toBe(64);
        expect(metadata.hasAlpha).toBe(true);
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let frame = 0; frame < frameCount; frame += 1) {
          let visible = 0;
          for (let y = 0; y < 64; y += 1) {
            for (let x = frame * 64; x < (frame + 1) * 64; x += 1) {
              if (data[(y * info.width + x) * info.channels + 3]! >= 18) visible += 1;
            }
          }
          expect(visible).toBeGreaterThan(90);
          expect(visible).toBeLessThan(64 * 64 * 0.72);
        }
      });
    }
  }
});
