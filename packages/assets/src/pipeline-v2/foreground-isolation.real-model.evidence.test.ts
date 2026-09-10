import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPLE_NATIVE_MPS_PROFILE, createForegroundIsolationProvider } from '../providers/apple-native-mps-profile.js';
import { PixelArtProcessor } from '../pixel-art-processor.js';
import { decodePngRgba } from '../png.js';
import { hasRealAlpha } from './isolate.js';

/**
 * Real-model regressions for the U^2-Net foreground-isolation worker action (see
 * workers/u2net_model.py, workers/apple_mps_worker.py's `segment_foreground`). Requires the same
 * machine-specific `.venv-diffusers-mps/` + downloaded weights this repo cannot assume exists —
 * skipped, not failed, when absent. Uses the ALREADY-GENERATED player/terminal v2 source images
 * from the eighth session's real-generation runs (test-artifacts/...) — spends no new real
 * generation requests of its own.
 */
const WEIGHTS_PATH = join(process.cwd(), 'models', 'apple-native', 'u2net', 'u2net_full_weights.pth');
const VENV_PRESENT = existsSync(APPLE_NATIVE_MPS_PROFILE.pythonPath) && existsSync(APPLE_NATIVE_MPS_PROFILE.workerPath) && existsSync(WEIGHTS_PATH);

const PLAYER_SOURCE = join(process.cwd(), 'test-artifacts', 'asset-pipeline-v2-apple-native-mps-v2-fixture-2026-09-06', 'metro_player_idle_v2', 'source.png');
const TERMINAL_SOURCE = join(process.cwd(), 'test-artifacts', 'asset-pipeline-v2-apple-native-mps-v2-terminal-fix-2026-09-06', 'metro_power_terminal_v5', 'source.png');
const FIXTURES_PRESENT = existsSync(PLAYER_SOURCE) && existsSync(TERMINAL_SOURCE);

describe.skipIf(!VENV_PRESENT || !FIXTURES_PRESENT)('foreground isolation — real U2NET model against real generated sources', () => {
  const provider = createForegroundIsolationProvider();

  it('produces a real alpha matte for the opaque player source, and the framing fix places it correctly with no edge-clipping', async () => {
    const source = readFileSync(PLAYER_SOURCE);
    expect(hasRealAlpha(source), 'a diffusion source should NOT already have real alpha').toBe(false);

    const result = await provider.segmentForeground(source);
    expect(result.ok, result.error).toBe(true);
    expect(result.buffer).toBeDefined();
    expect(hasRealAlpha(result.buffer!), 'the segmented output should now have real alpha').toBe(true);
    // A full-body standing character should occupy a real, but minority, fraction of the frame —
    // not near-zero (nothing found) and not near-total (no real isolation happened).
    expect(result.occupancy).toBeGreaterThan(0.03);
    expect(result.occupancy).toBeLessThan(0.5);

    const compiled = new PixelArtProcessor().process(result.buffer!, {
      targetWidth: 64, targetHeight: 64, fitOpaque: true, skipQuantize: true,
    });
    const { rgba, width, height } = decodePngRgba(compiled.buffer);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (rgba[(y * width + x) * 4 + 3]! > 200) {
          if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
        }
      }
    }
    expect(x1, 'compiled sprite should have visible opaque pixels').toBeGreaterThan(-1);
    // No clipped limbs/head: the subject must not touch the left, right, or top edges. It MAY
    // touch the bottom (intentional ground anchor — see fitOpaqueIntoFrame's bottom alignment).
    expect(x0, 'left edge clipped').toBeGreaterThan(0);
    expect(x1, 'right edge clipped').toBeLessThan(width - 1);
    expect(y0, 'top edge clipped').toBeGreaterThan(0);
  }, { timeout: 60_000, retry: 1 });

  it('finds essentially no coherent foreground in the terminal v5 source -- confirms the loose composition is a generation defect, not a processing defect', async () => {
    const source = readFileSync(TERMINAL_SOURCE);
    const result = await provider.segmentForeground(source);
    expect(result.ok, result.error).toBe(true);
    // A very low occupancy means the saliency model could not find a single dominant object to
    // isolate at all -- there is no clean boundary for ANY isolation/framing logic to work with,
    // confirming the defect lives in what was generated, not in how it's post-processed.
    expect(result.occupancy).toBeLessThan(0.1);
  }, { timeout: 60_000, retry: 1 });
});
