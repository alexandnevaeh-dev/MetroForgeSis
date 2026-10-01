import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const assetRoot = resolve(here, '..', 'authored', 'stormglass-veilblade');
const manifest = JSON.parse(
  readFileSync(join(assetRoot, 'animation-family-v2.json'), 'utf8'),
) as {
  frameSize: [number, number];
  baseSheets: Record<string, { file: string; frameCount: number; uniqueFrameCount: number }>;
  runtimeClips: Record<string, { file: string; frameCount: number; uniqueFrameCount: number }>;
};

async function expectValidSheet(entry: {
  file: string;
  frameCount: number;
  uniqueFrameCount: number;
}) {
  const image = sharp(join(assetRoot, entry.file));
  const metadata = await image.metadata();
  expect(metadata.width).toBe(manifest.frameSize[0] * entry.frameCount);
  expect(metadata.height).toBe(manifest.frameSize[1]);
  expect(metadata.hasAlpha).toBe(true);
  expect(entry.uniqueFrameCount).toBeGreaterThanOrEqual(entry.frameCount === 1 ? 1 : 2);

  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let frame = 0; frame < entry.frameCount; frame += 1) {
    let opaquePixels = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = frame * 64; x < (frame + 1) * 64; x += 1) {
        if (data[(y * info.width + x) * info.channels + 3] >= 18) opaquePixels += 1;
      }
    }
    expect(opaquePixels).toBeGreaterThan(25);
  }
}

describe('Stormglass authored Veilblade animation family', () => {
  it('contains the complete core player action family', () => {
    expect(Object.keys(manifest.baseSheets).sort()).toEqual([
      'airborne', 'attack', 'dash', 'death', 'hurt', 'idle', 'run', 'walk',
    ]);
    expect(Object.keys(manifest.runtimeClips).sort()).toEqual([
      'fall', 'jump', 'jump_start', 'land',
    ]);
  });

  for (const [action, entry] of Object.entries({
    ...manifest.baseSheets,
    ...manifest.runtimeClips,
  })) {
    it(`${action} has nonempty transparent 64px frames`, async () => {
      await expectValidSheet(entry);
    });
  }
});
