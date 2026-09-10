import type { LocalCharacterSheetResult } from './providers/local-sprite-worker.js';

/**
 * Versioned manifest for one local-sprite-worker output. Field names deliberately mirror this
 * repo's existing AssetManifestEntry convention (packages/godot/src/assembler.ts: provider,
 * modelId, sourceLicense, commercialUse, sourcePath) rather than inventing a parallel vocabulary,
 * extended with the frame-rect/animation-timing fields a multi-frame sheet actually needs and
 * that convention doesn't carry.
 */
export interface LocalAssetManifest {
  schemaVersion: 1;
  id: string;
  path: string;
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameRects: Array<{ x: number; y: number; width: number; height: number }>;
  animations: Array<{ name: string; frameIndices: number[]; fps: number; loop: boolean }>;
  provider: string;
  modelId: string;
  seed: number;
  generationParams: Record<string, unknown>;
  generatedAt: string;
  license: string;
  commercialUse: 'allowed' | 'restricted' | 'unknown';
  sourceLicense: string;
  requiresNetwork: boolean;
  requiresPayment: boolean;
}

export class ManifestValidationError extends Error {}

/** Builds the manifest for a successful character-sheet generation. Throws
 * ManifestValidationError on a malformed result rather than writing a manifest that lies about
 * the asset it describes — callers should treat that as a real, actionable failure, not an
 * empty/default manifest silently written to disk. */
export function buildLocalCharacterSheetManifest(
  id: string,
  destinationPath: string,
  result: LocalCharacterSheetResult,
  generationParams: Record<string, unknown>,
): LocalAssetManifest {
  if (!result.ok) {
    throw new ManifestValidationError(`cannot build a manifest for a failed generation (id=${id}): ${result.error?.message ?? result.subprocessFailure?.detail ?? 'unknown failure'}`);
  }
  if (typeof result.width !== 'number' || typeof result.height !== 'number' || !result.frameRects?.length) {
    throw new ManifestValidationError(`generation result for id=${id} is missing required dimension/frameRects fields`);
  }

  return {
    schemaVersion: 1,
    id,
    path: destinationPath,
    width: result.width,
    height: result.height,
    frameWidth: result.frameWidth ?? result.width,
    frameHeight: result.frameHeight ?? result.height,
    frameCount: result.frameCount ?? result.frameRects.length,
    frameRects: result.frameRects,
    animations: [{ name: 'walk', frameIndices: result.frameRects.map((_, i) => i), fps: 8, loop: true }],
    provider: result.provider,
    modelId: result.modelId ?? '',
    seed: result.seed ?? 0,
    generationParams,
    generatedAt: new Date().toISOString(),
    license: result.license ?? '',
    commercialUse: 'allowed',
    sourceLicense: result.license ?? '',
    requiresNetwork: result.requiresNetwork ?? false,
    requiresPayment: result.requiresPayment ?? false,
  };
}
