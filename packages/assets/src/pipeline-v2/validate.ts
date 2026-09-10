import { decodePngRgba } from '../png.js';
import type {
  AssetPlanV2,
  AssetRequestV2,
  CompilationResultV2,
  ProcessingResultV2,
  ValidationResultV2,
  ValidationRuleResultV2,
} from './types.js';

function hasAlpha(buffer: Buffer): boolean {
  const { rgba } = decodePngRgba(buffer);
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! < 255) return true;
  }
  return false;
}

/** Explicit, machine-readable Validation stage. Every category has its own rule set; a failure
 *  here blocks the asset from advancing to maturity/manifest regardless of how generation went. */
export function validateAssetV2(
  plan: AssetPlanV2,
  request: AssetRequestV2,
  processing: ProcessingResultV2,
  compilation: CompilationResultV2,
): ValidationResultV2 {
  const rules: ValidationRuleResultV2[] = [];
  const check = (rule: string, passed: boolean, message?: string) => rules.push({ rule, passed, message });

  for (const ruleId of plan.validationRuleIds) {
    switch (ruleId) {
      case 'dimensions_match':
        check('dimensions_match', compilation.compiledHeight === plan.finalHeight, `expected height ${plan.finalHeight}, got ${compilation.compiledHeight}`);
        break;
      case 'alpha_present':
        check('alpha_present', plan.transparency === 'opaque' || hasAlpha(compilation.compiledBuffer), 'expected alpha channel to be used');
        break;
      case 'animation_frames_exist':
        check('animation_frames_exist', plan.animationStrategy === 'none' || (processing.frameCount ?? 0) >= 4, 'expected >=4 animation frames');
        break;
      case 'npc_no_hostile_metadata':
        check('npc_no_hostile_metadata', request.hostile !== true && request.isFinalBoss !== true && !request.attacks?.length, 'NPC request must not carry hostile/boss metadata');
        break;
      case 'runtime_reference_resolves':
        check('runtime_reference_resolves', compilation.godotResourcePath.endsWith('.tres') && compilation.extraResources.some((r) => r.path === compilation.godotResourcePath), 'character SpriteFrames resource must be emitted');
        break;
      case 'tileset_compiled':
        check('tileset_compiled', compilation.compiledBuffer.length > 0, 'tileset atlas buffer must be non-empty');
        break;
      case 'terrain_tres_present':
        check('terrain_tres_present', compilation.extraResources.some((r) => r.path.endsWith('terrain.tres')), 'terrain.tres must be emitted');
        break;
      case 'no_character_processing':
        check('no_character_processing', processing.processor !== 'character', 'must not route through character animation processing');
        break;
      case 'aspect_matches':
        check('aspect_matches', compilation.compiledWidth === plan.finalWidth && compilation.compiledHeight === plan.finalHeight, 'background must keep its plan aspect/dimensions');
        break;
      case 'no_animation_frames':
        check('no_animation_frames', (processing.frameCount ?? 1) === 1, 'background must not carry animation frames');
        break;
      case 'no_terrain_or_ui_classification':
        check('no_terrain_or_ui_classification', processing.processor === 'prop_pickup', 'prop/pickup must not be classified as terrain or UI');
        break;
      case 'square_dimensions':
        check('square_dimensions', compilation.compiledWidth === compilation.compiledHeight, 'UI icon/hud asset must be square');
        break;
      case 'runtime_path_correct':
        check('runtime_path_correct', compilation.godotResourcePath.startsWith('assets/ui/'), 'UI assets must live under assets/ui/');
        break;
      case 'temporal_structure':
        check('temporal_structure', Boolean(processing.animationClip) && (processing.frameCount ?? 0) >= 4 && (processing.fps ?? 0) > 0, 'animated assets require named clip metadata, >=4 frames, and positive playback timing');
        break;
      default:
        check(ruleId, true);
    }
  }

  return { passed: rules.every((r) => r.passed), ruleResults: rules };
}
