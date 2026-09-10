import { generateWalkCycleSheet } from '../png.js';
import { TileCompiler } from '../tile-compiler.js';
import type { AssetPlanV2, AssetRequestV2, NormalizationResultV2, ProcessingResultV2 } from './types.js';

const FRAME_COUNTS: Record<AssetPlanV2['animationStrategy'], number> = {
  none: 1,
  sheet_4: 4,
  sheet_8: 8,
  sheet_12: 12,
};

/** Category-aware AssetProcessing. Character categories get real animation-sheet processing;
 *  UI/background/environment/prop categories each get their own dedicated path so, e.g., a
 *  background never enters character-sheet compilation and a UI icon never enters the
 *  animation compiler. */
export function processAssetV2(
  plan: AssetPlanV2,
  request: AssetRequestV2,
  normalized: NormalizationResultV2,
): ProcessingResultV2 {
  switch (plan.category) {
    case 'player':
    case 'enemy':
    case 'boss':
    case 'npc': {
      if (plan.animationStrategy === 'none') {
        return { buffer: normalized.buffer, frameCount: 1, processor: 'character' };
      }
      const frameCount = FRAME_COUNTS[plan.animationStrategy];
      const sheet = generateWalkCycleSheet(
        { id: request.id, width: normalized.width, height: normalized.height, fill: [80, 80, 80, 255] },
        frameCount,
        normalized.buffer,
      );
      return { buffer: sheet, frameCount, fps: request.animation?.fps ?? 8, processor: 'character', animationClip: { name: request.animation?.clip ?? 'default', frameCount, fps: request.animation?.fps ?? 8, loop: request.animation?.loop ?? true } };
    }
    case 'environment': {
      const compiled = new TileCompiler().compile({ sourcePng: normalized.buffer, tileSize: 16 });
      return { buffer: compiled.atlas, processor: 'environment' };
    }
    case 'background':
      return { buffer: normalized.buffer, processor: 'background' };
    case 'pickup':
    case 'prop':
      return { buffer: normalized.buffer, processor: 'prop_pickup' };
    case 'animated_environment':
    case 'vfx': {
      const frameCount = FRAME_COUNTS[plan.animationStrategy];
      const sheet = generateWalkCycleSheet(
        { id: request.id, width: normalized.width, height: normalized.height, fill: [80, 80, 80, 255] },
        frameCount,
        normalized.buffer,
      );
      return { buffer: sheet, frameCount, fps: request.animation?.fps ?? 10, processor: plan.category, animationClip: { name: request.animation?.clip ?? 'default', frameCount, fps: request.animation?.fps ?? 10, loop: request.animation?.loop ?? true } };
    }
    case 'ability_icon':
    case 'hud':
    case 'ui_panel':
      return { buffer: normalized.buffer, processor: 'ui' };
    default: {
      const exhaustive: never = plan.category;
      throw new Error(`processAssetV2: unhandled category ${String(exhaustive)}`);
    }
  }
}
