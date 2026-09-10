import { decodePngRgba, encodePng } from '../png.js';

export interface AlphaReconciliationOptions {
  /** Grow the source alpha mask outward by N pixels before applying — keeps a thin outline/detail
   *  the AI added right at the silhouette edge from being hard-clipped. 0 = no dilation. */
  maskDilatePx?: number;
  /** Blur the mask edge by N pixels so the cutout doesn't look pasted-on. 0 = hard edge. */
  maskFeatherPx?: number;
}

export interface AlphaReconciliationResult {
  buffer: Buffer;
  width: number;
  height: number;
  /** True when the AI output's own alpha channel already had real transparency and reconciliation
   *  was a no-op passthrough — useful for provenance/debugging. */
  passthrough: boolean;
}

function nearestResize(
  rgba: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  if (srcW === dstW && srcH === dstH) return rgba;
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      const srcI = (sy * srcW + sx) * 4;
      const dstI = (y * dstW + x) * 4;
      out[dstI] = rgba[srcI]!;
      out[dstI + 1] = rgba[srcI + 1]!;
      out[dstI + 2] = rgba[srcI + 2]!;
      out[dstI + 3] = rgba[srcI + 3]!;
    }
  }
  return out;
}

function dilateAlpha(alpha: Uint8Array, width: number, height: number, radiusPx: number): Uint8Array {
  if (radiusPx <= 0) return alpha;
  let current = alpha;
  for (let pass = 0; pass < radiusPx; pass++) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        let max = current[i]!;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const v = current[ny * width + nx]!;
          if (v > max) max = v;
        }
        next[i] = max;
      }
    }
    current = next;
  }
  return current;
}

function featherAlpha(alpha: Uint8Array, width: number, height: number, radiusPx: number): Uint8Array {
  if (radiusPx <= 0) return alpha;
  // Simple box blur, separable, radiusPx passes for a soft-enough edge without a real Gaussian.
  const out = new Uint8Array(alpha.length);
  const r = radiusPx;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += alpha[ny * width + nx]!;
          count++;
        }
      }
      out[y * width + x] = count > 0 ? Math.round(sum / count) : 0;
    }
  }
  return out;
}

/** True when a decoded image has genuine transparency variance (not fully opaque, not fully
 *  blank) — the precondition for treating its own alpha as usable rather than needing reconciliation. */
function hasRealTransparency(alpha: Uint8Array): boolean {
  let minA = 255;
  let maxA = 0;
  for (const a of alpha) {
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
  }
  return maxA - minA > 40; // meaningfully varies, not a uniform opaque/blank plane
}

/**
 * Composites an AI edit's RGB channels onto the procedural source's alpha mask. Many image-edit
 * providers (NVIDIA hosted preview, most third-party inference APIs) don't reliably preserve or
 * produce transparency — they return a fully opaque image even when asked for "transparent
 * background". Rather than rejecting every such candidate outright, reuse the procedural source's
 * already-correct silhouette/alpha (it was generated with real transparency by png.ts) and let the
 * AI only improve surface detail — exactly the "preserve footprint, enhance material" split the
 * task asks for. If the AI output already has real transparency of its own, this is a no-op
 * passthrough (resized to match source dimensions only).
 */
export function reconcileAlpha(
  aiOutputPng: Buffer,
  sourcePng: Buffer,
  options: AlphaReconciliationOptions = {},
): AlphaReconciliationResult {
  const ai = decodePngRgba(aiOutputPng);
  const source = decodePngRgba(sourcePng);

  const aiResized = nearestResize(ai.rgba, ai.width, ai.height, source.width, source.height);

  const aiAlpha = new Uint8Array(source.width * source.height);
  for (let i = 0; i < aiAlpha.length; i++) aiAlpha[i] = aiResized[i * 4 + 3]!;
  if (hasRealTransparency(aiAlpha)) {
    return { buffer: encodePng(source.width, source.height, aiResized), width: source.width, height: source.height, passthrough: true };
  }

  const sourceAlpha = new Uint8Array(source.width * source.height);
  for (let i = 0; i < sourceAlpha.length; i++) sourceAlpha[i] = source.rgba[i * 4 + 3]!;
  const dilated = dilateAlpha(sourceAlpha, source.width, source.height, options.maskDilatePx ?? 0);
  const mask = featherAlpha(dilated, source.width, source.height, options.maskFeatherPx ?? 0);

  const out = new Uint8Array(source.width * source.height * 4);
  for (let i = 0; i < mask.length; i++) {
    out[i * 4] = aiResized[i * 4]!;
    out[i * 4 + 1] = aiResized[i * 4 + 1]!;
    out[i * 4 + 2] = aiResized[i * 4 + 2]!;
    out[i * 4 + 3] = mask[i]!;
  }

  return {
    buffer: encodePng(source.width, source.height, out),
    width: source.width,
    height: source.height,
    passthrough: false,
  };
}
