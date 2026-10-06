import { decodePngRgba } from '../png.js';
import type { AssetPlanV2 } from './types.js';

/** Any local capability that can turn a fully-opaque source image into one with a real alpha
 *  matte separating foreground from background. `DiffusersProvider.segmentForeground()` is the
 *  concrete implementation used in production (see apple-native-mps-profile.ts's
 *  `createForegroundIsolationProvider()`); this interface exists so tests can inject a stub
 *  without spawning a real Python/ML worker. */
export interface ForegroundIsolationProvider {
  segmentForeground(png: Buffer): Promise<{ ok: boolean; buffer?: Buffer; error?: string; model?: string; modelVersion?: string }>;
}

export type ForegroundIsolationMatteSource =
  | 'skipped_category'
  | 'existing_alpha'
  | 'segmentation_model'
  | 'unavailable_fallback';

export interface ForegroundIsolationResultV2 {
  buffer: Buffer;
  applied: boolean;
  matteSource: ForegroundIsolationMatteSource;
  model?: string;
  modelVersion?: string;
  error?: string;
}

/** A source PNG counts as already having a real alpha matte only if a substantial fraction of
 *  its pixels are meaningfully transparent — a single anti-aliased edge pixel at alpha 254 must
 *  not count, but a real isolated subject's background (typically 30-95% of the frame) does.
 *  Diffusion providers in this pipeline (see docs/audit/MODERN_COHESION_TEST_PROJECT.md's eighth
 *  session) emit fully-opaque RGB with no alpha channel at all — decodePngRgba fills alpha=255
 *  for every pixel in that case, so this check correctly reports "no real alpha" for them. */
export function hasRealAlpha(png: Buffer, minTransparentFraction = 0.02): boolean {
  const { rgba } = decodePngRgba(png);
  let transparentCount = 0;
  const pixelCount = rgba.length / 4;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! < 200) transparentCount++;
  }
  return transparentCount / pixelCount >= minTransparentFraction;
}

function needsIsolation(plan: AssetPlanV2): boolean {
  return plan.transparency === 'required';
}

/** Isolation stage — runs between SourceGeneration and Normalization. Never touches the category
 *  categories that keep a full background (environment tiles are 'opaque', backgrounds are
 *  'gradient_preserve') and never runs at all unless a provider is supplied AND the source
 *  actually lacks real alpha, so every existing caller that doesn't pass a
 *  `foregroundIsolationProvider` — including every procedural/offline test in this repo — sees
 *  zero behavior change. When a provider IS supplied but the source already has real alpha (the
 *  procedural generator's own output, for instance), the model is still skipped: there is nothing
 *  to fix, and running it would only cost time. Failure of the isolation call itself is
 *  non-fatal — the pipeline falls back to the original (unisolated) buffer rather than failing
 *  the whole asset, but this is recorded honestly (`matteSource: 'unavailable_fallback'`), never
 *  silently treated as success. */
export async function isolateForegroundV2(
  sourceBuffer: Buffer,
  plan: AssetPlanV2,
  provider?: ForegroundIsolationProvider,
): Promise<ForegroundIsolationResultV2> {
  if (!needsIsolation(plan)) {
    return { buffer: sourceBuffer, applied: false, matteSource: 'skipped_category' };
  }
  if (hasRealAlpha(sourceBuffer)) {
    return { buffer: sourceBuffer, applied: false, matteSource: 'existing_alpha' };
  }
  if (!provider) {
    return { buffer: sourceBuffer, applied: false, matteSource: 'unavailable_fallback' };
  }
  const result = await provider.segmentForeground(sourceBuffer);
  if (!result.ok || !result.buffer) {
    return { buffer: sourceBuffer, applied: false, matteSource: 'unavailable_fallback', error: result.error };
  }
  return { buffer: result.buffer, applied: true, matteSource: 'segmentation_model', model: result.model, modelVersion: result.modelVersion };
}
