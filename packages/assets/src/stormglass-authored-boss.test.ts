import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'authored', 'stormglass-tempest-abbot');
const actions = ['idle', 'locomotion', 'slam', 'telegraph', 'projectile', 'burst', 'recovery', 'hurt', 'death'] as const;

describe('Stormglass Tempest Abbot candidate animation foundation', () => {
  it.each(actions)('%s is an eight-frame 160px transparent sheet without cell bleed', async (action) => {
    const image = sharp(join(root, `tempest-abbot-${action}-v1.png`));
    const metadata = await image.metadata();
    expect([metadata.width, metadata.height, metadata.hasAlpha]).toEqual([1280, 160, true]);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const digests = new Set<string>();
    for (let frame = 0; frame < 8; frame += 1) {
      let opaque = 0;
      const frameBytes: number[] = [];
      for (let y = 0; y < info.height; y += 1) {
        for (let localX = 0; localX < 160; localX += 1) {
          const x = frame * 160 + localX;
          const index = (y * info.width + x) * info.channels;
          const alpha = data[index + 3]!;
          if (alpha >= 18) opaque += 1;
          frameBytes.push(data[index]!, data[index + 1]!, data[index + 2]!, alpha);
          if (localX === 0 || localX === 159) expect(alpha).toBe(0);
        }
      }
      expect(opaque).toBeGreaterThan(250);
      digests.add(createHash('sha256').update(Buffer.from(frameBytes)).digest('hex'));
    }
    expect(digests.size).toBe(8);
  });
});
