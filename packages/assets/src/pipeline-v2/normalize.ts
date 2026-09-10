import { PixelArtProcessor } from '../pixel-art-processor.js';
import type { AssetPlanV2, NormalizationOpId, NormalizationResultV2 } from './types.js';

const processor = new PixelArtProcessor();

/** Explicit Normalization stage — deterministic asset preparation only. Never lets raw
 *  generator output flow directly into compilation unvalidated, and never applies destructive
 *  processing (quantization, alpha binarization) when the plan doesn't call for it. */
export function normalizeAssetV2(buffer: Buffer, plan: AssetPlanV2): NormalizationResultV2 {
  const preserveAlphaGradient = plan.transparency === 'gradient_preserve';
  const skipQuantize = plan.category === 'background';
  const result = processor.process(buffer, {
    targetWidth: plan.finalWidth,
    targetHeight: plan.finalHeight,
    fitOpaque:
      plan.normalizationOps.includes('icon_framing') ||
      plan.normalizationOps.includes('sprite_alignment') ||
      plan.normalizationOps.includes('padding'),
    skipQuantize,
    preserveAlphaGradient,
    outlineColor: plan.outlineColor,
  });
  return {
    buffer: result.buffer,
    width: result.width,
    height: result.height,
    opsApplied: plan.normalizationOps as NormalizationOpId[],
  };
}
