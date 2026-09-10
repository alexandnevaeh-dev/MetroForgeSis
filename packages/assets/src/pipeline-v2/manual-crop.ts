import { createHash } from 'node:crypto';
import { decodePngRgba, encodePng } from '../png.js';

/**
 * A recorded HUMAN selection, not automatic duplicate detection — see
 * docs/audit/MODERN_COHESION_TEST_PROJECT.md's ninth session. When a generation renders more than
 * one usable candidate in a single image (this project's terminal asset rendered two duplicate
 * instances side by side across two separate prompt attempts), a person can choose to keep one
 * region rather than spend another real-generation request. This recipe makes that choice
 * explicit, reproducible, and hash-bound: it can only ever apply to the exact source bytes it was
 * recorded against.
 */
export interface ManualCropRecipe {
  assetId: string;
  /** sha256 of the exact source PNG this recipe was selected against. Applying it to any other
   *  byte-for-byte-different source is refused, not silently reinterpreted. */
  sourceHash: string;
  /** Inclusive pixel bounds, same convention as pixel-art-processor.ts's OpaqueBounds. */
  crop: { x0: number; y0: number; x1: number; y1: number };
  reason: string;
  recordedBy: string;
  recordedAt: string;
}

export interface ManualCropResultV2 {
  buffer: Buffer;
  applied: boolean;
  actualSourceHash: string;
  recipeSourceHash?: string;
  cropRect?: ManualCropRecipe['crop'];
  recordedBy?: string;
  reason?: string;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Applies a recorded manual-crop recipe to a source buffer. No recipe supplied is the default,
 * unmodified no-op path (`applied: false`) — every existing/other asset is entirely unaffected.
 * When a recipe IS supplied, it is either applied exactly or the whole operation throws: a
 * source-hash mismatch or an out-of-bounds crop rectangle means this recipe no longer describes
 * reality (the source was regenerated, or the recipe is wrong), and silently proceeding — either
 * by ignoring the recipe or by clamping/reinterpreting the bounds — would let a stale manual
 * decision get invisibly reapplied to the wrong bytes. Callers (the pipeline-v2 orchestrator)
 * treat a thrown error here exactly like any other stage failure.
 */
export function applyManualCropRecipe(sourceBuffer: Buffer, recipe: ManualCropRecipe | undefined): ManualCropResultV2 {
  const actualSourceHash = sha256(sourceBuffer);
  if (!recipe) return { buffer: sourceBuffer, applied: false, actualSourceHash };

  if (recipe.sourceHash !== actualSourceHash) {
    throw new Error(
      `MANUAL_CROP_SOURCE_HASH_MISMATCH: recipe for ${recipe.assetId} expects source ${recipe.sourceHash}, actual source is ${actualSourceHash} -- refusing to apply a crop recorded against different bytes`,
    );
  }

  const { rgba, width, height } = decodePngRgba(sourceBuffer);
  const { x0, y0, x1, y1 } = recipe.crop;
  const validBounds = Number.isInteger(x0) && Number.isInteger(y0) && Number.isInteger(x1) && Number.isInteger(y1)
    && x0 >= 0 && y0 >= 0 && x1 < width && y1 < height && x1 > x0 && y1 > y0;
  if (!validBounds) {
    throw new Error(
      `MANUAL_CROP_INVALID_BOUNDS: recipe for ${recipe.assetId} specifies crop ${JSON.stringify(recipe.crop)} against a ${width}x${height} source`,
    );
  }

  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y0 + y) * width + (x0 + x)) * 4;
      const di = (y * cw + x) * 4;
      out[di] = rgba[si]!; out[di + 1] = rgba[si + 1]!; out[di + 2] = rgba[si + 2]!; out[di + 3] = rgba[si + 3]!;
    }
  }

  return {
    buffer: encodePng(cw, ch, out),
    applied: true,
    actualSourceHash,
    recipeSourceHash: recipe.sourceHash,
    cropRect: recipe.crop,
    recordedBy: recipe.recordedBy,
    reason: recipe.reason,
  };
}
