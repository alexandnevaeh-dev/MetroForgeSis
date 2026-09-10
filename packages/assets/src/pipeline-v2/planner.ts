import type { AssetCategoryV2, AssetPlanV2, AssetRequestV2 } from './types.js';
import { SILHOUETTE_ACCENT_CYAN } from '../pixel-art-processor.js';

const CHARACTER_CATEGORIES: ReadonlySet<AssetCategoryV2> = new Set(['player', 'enemy', 'boss', 'npc']);

/** Converts an AssetRequest into an explicit, deterministic AssetPlan. Category-specific behavior
 *  lives here — a player and an ability icon must never share a processing path. */
export function buildAssetPlan(request: AssetRequestV2): AssetPlanV2 {
  switch (request.category) {
    case 'player':
    case 'enemy':
    case 'npc':
      return characterPlan(request, 64, 'sheet_8');
    case 'boss':
      return characterPlan(request, request.isFinalBoss ? 128 : 96, 'sheet_8');
    case 'environment':
      return environmentPlan(request);
    case 'background':
      return backgroundPlan(request);
    case 'pickup':
      return worldSpritePlan(request, 24, 'pickup');
    case 'prop':
      return worldSpritePlan(request, 32, 'prop');
    case 'animated_environment':
      return animatedWorldPlan(request, 64, 'animated_environment');
    case 'vfx':
      return animatedWorldPlan(request, 64, 'vfx');
    case 'ability_icon':
      return uiPlan(request, 32, 'ui_icon', 'assets/ui/icons');
    case 'hud':
      return uiPlan(request, 48, 'ui_hud', 'assets/ui/hud');
    case 'ui_panel':
      return uiPlan(request, 96, 'ui_hud', 'assets/ui/panels');
    default: {
      const exhaustive: never = request.category;
      throw new Error(`buildAssetPlan: unhandled category ${String(exhaustive)}`);
    }
  }
}

function animatedWorldPlan(request: AssetRequestV2, size: number, kind: 'animated_environment' | 'vfx'): AssetPlanV2 {
  const frameCount = request.animation?.frameCount ?? 8;
  return {
    requestId: request.id, category: kind, generationMode: request.allowRealProvider ? 'provider' : 'procedural',
    sourceWidth: request.allowRealProvider ? 384 : size * 2, sourceHeight: request.allowRealProvider ? 384 : size * 2,
    finalWidth: size, finalHeight: size,
    providerPrompt: `${request.artDirection} — ${request.runtimeUse}`,
    negativePrompt: 'text, letters, watermark, scenery, multiple objects, cropped edges',
    transparency: 'required',
    normalizationOps: ['format_normalize', 'deterministic_resize', 'alpha_cleanup', 'sprite_alignment'],
    animationStrategy: `sheet_${frameCount}` as AssetPlanV2['animationStrategy'],
    compilationStrategy: 'character_sheet',
    godotDestination: `assets/${kind === 'vfx' ? 'vfx' : 'environment/animated'}/${request.id}.png`,
    godotResourceType: 'SpriteFrames',
    metadataContract: ['assetId','category','seed','sourceHash','finalHash','animation'],
    validationRuleIds: ['dimensions_match','alpha_present','animation_frames_exist','runtime_reference_resolves','temporal_structure'],
  };
}

function characterPlan(
  request: AssetRequestV2,
  finalSize: number,
  animationStrategy: AssetPlanV2['animationStrategy'],
): AssetPlanV2 {
  const dir = request.category === 'player' ? 'characters' : request.category === 'boss' ? 'bosses' : request.category === 'enemy' ? 'enemies' : 'npcs';
  const sourceSize = request.allowRealProvider ? 384 : finalSize * 2;
  return {
    requestId: request.id,
    category: request.category,
    generationMode: request.allowRealProvider ? 'provider' : 'procedural',
    sourceWidth: sourceSize,
    sourceHeight: sourceSize,
    finalWidth: finalSize,
    finalHeight: finalSize,
    providerPrompt: `${request.artDirection} — ${request.runtimeUse}`,
    negativePrompt: 'no text, no watermark, no UI chrome',
    // Player-only, explicit: the quantized silhouette can include DEFAULT_PALETTE[0]
    // ([20,24,32]), which is bit-for-bit identical to this project's Godot default_clear_color
    // -- making that part of the character invisible against empty background. Reuses the
    // palette's own existing accent color (already used for player/interaction semantics), and
    // is a no-op for every other character category (enemy/boss/npc keep today's exact behavior).
    outlineColor: request.category === 'player' ? SILHOUETTE_ACCENT_CYAN : undefined,
    transparency: 'required',
    normalizationOps: ['format_normalize', 'deterministic_resize', 'alpha_cleanup', 'sprite_alignment'],
    animationStrategy: request.animationRequired === false ? 'none' : animationStrategy,
    compilationStrategy: 'character_sheet',
    godotDestination: `assets/${dir}/${request.id}.png`,
    godotResourceType: 'SpriteFrames',
    metadataContract: ['assetId', 'category', 'seed', 'sourceHash', 'finalHash', 'animation'],
    validationRuleIds:
      request.category === 'npc'
        ? ['dimensions_match', 'alpha_present', 'animation_frames_exist', 'npc_no_hostile_metadata', 'runtime_reference_resolves']
        : ['dimensions_match', 'alpha_present', 'animation_frames_exist', 'runtime_reference_resolves'],
  };
}

function environmentPlan(request: AssetRequestV2): AssetPlanV2 {
  return {
    requestId: request.id,
    category: 'environment',
    generationMode: request.allowRealProvider ? 'provider' : 'procedural',
    sourceWidth: request.allowRealProvider ? 384 : 128,
    sourceHeight: request.allowRealProvider ? 384 : 96,
    finalWidth: 128,
    finalHeight: 96,
    providerPrompt: `${request.artDirection} — tileable environment source`,
    transparency: 'opaque',
    normalizationOps: ['format_normalize', 'tile_grid_align'],
    animationStrategy: 'none',
    compilationStrategy: 'tileset_atlas',
    godotDestination: `assets/tilesets/${request.id}/source.png`,
    godotResourceType: 'TileSet',
    metadataContract: ['assetId', 'category', 'seed', 'sourceHash', 'finalHash'],
    validationRuleIds: ['tileset_compiled', 'terrain_tres_present', 'no_character_processing'],
  };
}

function backgroundPlan(request: AssetRequestV2): AssetPlanV2 {
  return {
    requestId: request.id,
    category: 'background',
    generationMode: request.allowRealProvider ? 'provider' : 'procedural',
    sourceWidth: request.allowRealProvider ? 384 : 640,
    sourceHeight: request.allowRealProvider ? 384 : 360,
    finalWidth: 640,
    finalHeight: 360,
    providerPrompt: `${request.artDirection} — parallax background plate`,
    transparency: 'gradient_preserve',
    normalizationOps: ['format_normalize', 'canvas_normalize'],
    animationStrategy: 'none',
    compilationStrategy: 'background_plate',
    godotDestination: `assets/backgrounds/${request.id}.png`,
    godotResourceType: 'Texture2D',
    metadataContract: ['assetId', 'category', 'seed', 'sourceHash', 'finalHash'],
    validationRuleIds: ['aspect_matches', 'no_animation_frames', 'no_character_processing'],
  };
}

function worldSpritePlan(request: AssetRequestV2, size: number, dir: 'pickup' | 'prop'): AssetPlanV2 {
  return {
    requestId: request.id,
    category: request.category,
    generationMode: request.allowRealProvider ? 'provider' : 'procedural',
    sourceWidth: request.allowRealProvider ? 384 : size * 2,
    sourceHeight: request.allowRealProvider ? 384 : size * 2,
    finalWidth: size,
    finalHeight: size,
    providerPrompt: `${request.artDirection} — ${request.runtimeUse}`,
    // No fixed negative prompt for this category (unlike characterPlan/animatedWorldPlan) — only
    // what the caller explicitly supplies, so existing callers that never set this see no change.
    negativePrompt: request.negativePrompt,
    transparency: 'required',
    normalizationOps: ['format_normalize', 'deterministic_resize', 'alpha_cleanup', 'padding'],
    animationStrategy: 'none',
    compilationStrategy: 'world_sprite',
    godotDestination: `assets/${dir}s/${request.id}.png`,
    godotResourceType: 'Texture2D',
    metadataContract: ['assetId', 'category', 'seed', 'sourceHash', 'finalHash'],
    validationRuleIds: ['dimensions_match', 'alpha_present', 'no_terrain_or_ui_classification'],
  };
}

function uiPlan(
  request: AssetRequestV2,
  size: number,
  strategy: 'ui_icon' | 'ui_hud',
  dir: string,
): AssetPlanV2 {
  return {
    requestId: request.id,
    category: request.category,
    generationMode: request.allowRealProvider ? 'provider' : 'procedural',
    sourceWidth: request.allowRealProvider ? 384 : size,
    sourceHeight: request.allowRealProvider ? 384 : size,
    finalWidth: size,
    finalHeight: size,
    providerPrompt: `${request.artDirection} — ${request.runtimeUse}`,
    transparency: 'required',
    normalizationOps: ['format_normalize', 'icon_framing', 'alpha_cleanup', 'cropping'],
    animationStrategy: 'none',
    compilationStrategy: strategy,
    godotDestination: `${dir}/${request.id}.png`,
    godotResourceType: 'Texture2D',
    metadataContract: ['assetId', 'category', 'seed', 'sourceHash', 'finalHash'],
    validationRuleIds: ['square_dimensions', 'alpha_present', 'runtime_path_correct'],
  };
}

export function isCharacterCategory(category: AssetCategoryV2): boolean {
  return CHARACTER_CATEGORIES.has(category);
}
