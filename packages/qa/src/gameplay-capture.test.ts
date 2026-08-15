import { describe, expect, it } from 'vitest';
import { headlessTextureNull, needsWindowedCaptureFallback } from '../src/gameplay-capture.js';
import { encodePng } from '@metroforge/assets';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('GameplayCaptureStrategy detection', () => {
  it('detects dummy renderer texture_2d_get null', () => {
    expect(
      headlessTextureNull('ERROR: Parameter "t" is null.\ntexture_2d_get failed'),
    ).toBe(true);
    expect(headlessTextureNull('CAPTURE_STRATEGY_HEADLESS_TEXTURE_NULL shot=spawn')).toBe(true);
    expect(headlessTextureNull('all checks passed')).toBe(false);
  });

  it('requires windowed fallback when the headless shot is missing', () => {
    const dir = join(tmpdir(), `mf-capture-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    expect(
      needsWindowedCaptureFallback({
        headlessOutput: 'texture_2d_get Parameter t is null',
        screenshotPath: join(dir, 'missing.png'),
      }),
    ).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not fallback for a structured gameplay PNG without dummy-renderer errors', () => {
    const dir = join(tmpdir(), `mf-capture-ok-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const width = 160;
    const height = 90;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = x < 20 ? 40 : 18;
        rgba[i + 1] = y > 60 ? 80 : 30;
        rgba[i + 2] = 50 + (x % 40);
        rgba[i + 3] = 255;
      }
    }
    const path = join(dir, 'screenshot_gameplay.png');
    writeFileSync(path, encodePng(width, height, rgba));
    expect(
      needsWindowedCaptureFallback({
        headlessOutput: 'SMOKE_TEST_RESULTS_END',
        screenshotPath: path,
      }),
    ).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
