import { describe, expect, it } from 'vitest';
import { encodePng, knockoutVfxBackground } from '../src/png.js';
import { processLocalAssetImage } from '../src/local-asset-worker.js';

function magentaSprite(): Buffer {
  const w = 16;
  const h = 16;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = x >= 4 && x < 12 && y >= 4 && y < 12;
      if (inside) {
        rgba[i] = 40;
        rgba[i + 1] = 80;
        rgba[i + 2] = 160;
        rgba[i + 3] = 255;
      } else {
        rgba[i] = 255;
        rgba[i + 1] = 0;
        rgba[i + 2] = 255;
        rgba[i + 3] = 255;
      }
    }
  }
  return encodePng(w, h, rgba);
}

describe('processLocalAssetImage', () => {
  it('knocks out magenta and slices a sheet in-process when the Python worker is unavailable', async () => {
    const source = magentaSprite();
    const result = await processLocalAssetImage({
      image: source,
      knockout: true,
      rows: 1,
      cols: 2,
      workerPath: '/tmp/metroforge-missing-asset-gen.py',
    });
    expect(result.via).toBe('typescript');
    expect(result.slices).toHaveLength(2);
    const knocked = knockoutVfxBackground(source);
    expect(result.image.equals(knocked)).toBe(true);
  });
});
