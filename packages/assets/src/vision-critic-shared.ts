import type { AssetCritiqueRequest } from './vlm-critic.js';
import type { VisionAnalysisResponse } from './types/vision.js';
import { critiqueAnimationSheet, critiqueTilesetSheet } from './animation-critic.js';

export function deterministicCritique(request: AssetCritiqueRequest): VisionAnalysisResponse {
  if (request.animationKind === 'tileset') {
    return critiqueTilesetSheet(request.image, request.tileSize ?? 16);
  }
  if (request.frameCount && request.frameCount > 1 && request.animationKind) {
    return critiqueAnimationSheet(request.image, {
      frameCount: request.frameCount,
      kind: request.animationKind,
    });
  }

  const size = request.image.length;
  const passed = size > 100 && size < 10_000_000;
  return {
    passed,
    score: passed ? 75 : 30,
    issues: passed ? [] : ['Image buffer invalid or empty'],
    tags: [request.assetType, 'deterministic-check'],
    description: 'Deterministic validation (VLM unavailable)',
  };
}
