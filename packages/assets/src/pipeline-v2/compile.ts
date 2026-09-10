import { buildGroundTerrainTresText } from '../tile-roles.js';
import type { AssetPlanV2, CompilationResultV2, ExtraResourceV2, ProcessingResultV2 } from './types.js';

/** Explicit Compilation stage. Converts processed assets into engine-ready artifacts. Reuses
 *  the verified terrain.tres builder (tile-roles.ts) rather than re-deriving Godot resource
 *  syntax here — Godot-specific text formats live in one place, not duplicated per pipeline. */
export function compileAssetV2(plan: AssetPlanV2, processing: ProcessingResultV2): CompilationResultV2 {
  const extraResources: ExtraResourceV2[] = [];
  let compiler = 'pixel-art-processor';

  if (plan.category === 'environment') {
    const biomeIndex = 0;
    const tresText = buildGroundTerrainTresText(biomeIndex, 16);
    const terrainPath = plan.godotDestination.replace(/source\.png$/, 'terrain.tres');
    extraResources.push({ path: terrainPath, contents: Buffer.from(tresText, 'utf8') });
    compiler = 'tile-compiler+terrain-tres';
    return {
      compiledBuffer: processing.buffer,
      compiledWidth: plan.finalWidth,
      compiledHeight: plan.finalHeight,
      godotResourcePath: terrainPath,
      godotResourceType: plan.godotResourceType,
      extraResources,
      compiler,
    };
  } else if (plan.compilationStrategy === 'character_sheet' && (processing.frameCount ?? 1) > 1) {
    const frameCount = processing.frameCount ?? 1;
    const tresPath = plan.godotDestination.replace(/\.png$/, '.tres');
    const texturePath = `res://${plan.godotDestination.replace(/\\/g, '/')}`;
    const frames = Array.from({ length: frameCount }, (_, index) =>
      `{ "duration": 1.0, "texture": SubResource("AtlasTexture_${index}") }`,
    ).join(', ');
    const subResources = Array.from({ length: frameCount }, (_, index) =>
      `[sub_resource type="AtlasTexture" id="AtlasTexture_${index}"]\natlas = ExtResource("Texture_sheet")\nregion = Rect2(${index * plan.finalWidth}, 0, ${plan.finalWidth}, ${plan.finalHeight})`,
    ).join('\n\n');
    const clip = processing.animationClip;
    const tres = `[gd_resource type="SpriteFrames" load_steps=${frameCount + 2} format=3]\n\n[ext_resource type="Texture2D" path="${texturePath}" id="Texture_sheet"]\n\n${subResources}\n\n[resource]\nanimations = [{\n"frames": [${frames}],\n"loop": ${clip?.loop ?? true},\n"name": &"${clip?.name ?? 'default'}",\n"speed": ${clip?.fps ?? processing.fps ?? 8}.0\n}]\n`;
    extraResources.push({ path: tresPath, contents: Buffer.from(tres, 'utf8') });
    compiler = 'animation-sheet-compiler';
    return {
      compiledBuffer: processing.buffer,
      compiledWidth: plan.finalWidth * frameCount,
      compiledHeight: plan.finalHeight,
      godotResourcePath: tresPath,
      godotResourceType: plan.godotResourceType,
      extraResources,
      compiler,
    };
  }

  return {
    compiledBuffer: processing.buffer,
    compiledWidth: plan.finalWidth * (plan.compilationStrategy === 'character_sheet' ? processing.frameCount ?? 1 : 1),
    compiledHeight: plan.finalHeight,
    godotResourcePath: plan.godotDestination,
    godotResourceType: plan.godotResourceType,
    extraResources,
    compiler,
  };
}
