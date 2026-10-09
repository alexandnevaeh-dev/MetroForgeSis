import type { ImageGenerationProfile } from './types/vision.js';
import { decodePngRgba, knockoutVfxBackground } from './png.js';
import { PixelArtProcessor } from './pixel-art-processor.js';

export interface ManualImagePlan {
  profile: ImageGenerationProfile;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  transparent: boolean;
  grounded: boolean;
}

/** Manual artwork has its own canvas contract; runtime sprite-sheet compilation is unchanged. */
export function manualImagePlan(
  type: string,
  id: string,
  existing?: Buffer,
  backgroundDetail?: 'standard' | 'detailed',
  sourceDetail?: 'standard' | 'detailed',
): ManualImagePlan {
  if (sourceDetail !== undefined) {
    if (!['standard', 'detailed'].includes(sourceDetail))
      throw new Error('Choose standard or detailed source artwork');
    if (type === 'background') throw new Error('Use background detail for background artwork');
  }
  if (backgroundDetail !== undefined) {
    if (!['standard', 'detailed'].includes(backgroundDetail))
      throw new Error('Choose standard or detailed background artwork');
    if (type !== 'background' || existing)
      throw new Error('Background detail applies only to new background images');
  }
  const roles: Record<string, [ImageGenerationProfile, number, number, boolean, boolean]> = {
    player_sprite: ['CHARACTER', 64, 64, true, true],
    enemy: ['ENEMY', 64, 64, true, true],
    npc: ['NPC', 64, 64, true, true],
    boss: ['BOSS', id.includes('final') ? 160 : 96, id.includes('final') ? 160 : 96, true, true],
    character_concept: ['CONCEPT_ART', 512, 768, false, false],
    portrait: ['PORTRAIT', 256, 256, false, false],
    weapon: ['WEAPON', 64, 64, true, false],
    item: ['ITEM', 32, 32, true, false],
    prop: ['ENVIRONMENT', 64, 96, true, true],
    tileset: ['TILE_SOURCE', 128, 128, false, false],
    tile: ['TILE_SOURCE', 128, 128, false, false],
    background: ['BACKGROUND', 640, 360, false, false],
    ui_icon: ['ICON', 64, 64, true, false],
    ui_panel: ['UI_ART', 256, 128, true, false],
    vfx_texture: ['VFX_TEXTURE', 64, 64, true, false],
  };
  const role = roles[type];
  if (!role) throw new Error(`Unsupported manual artwork type: ${type}`);
  let [profile, width, height, transparent, grounded] = role;
  if (backgroundDetail === 'detailed') {
    width = 1024;
    height = 576;
  }
  if (existing) ({ width, height } = decodePngRgba(existing));
  if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 16_777_216) {
    throw new Error('Artwork canvas must be between 1 and 4096 pixels per side');
  }
  // Match canvas proportions without the legacy fourfold upscale of large background plates.
  const longest = Math.min(1024, Math.max(profile === 'BACKGROUND' || sourceDetail === 'detailed' ? 1024 : 512, width, height));
  const ratio = longest / Math.max(width, height);
  const sourceWidth = Math.max(8, Math.round((width * ratio) / 8) * 8);
  const sourceHeight = Math.max(8, Math.round((height * ratio) / 8) * 8);
  return { profile, width, height, sourceWidth, sourceHeight, transparent, grounded };
}

export function compileManualImage(source: Buffer, plan: ManualImagePlan): Buffer {
  // Opaque architecture, portraits and concept plates never pass through chroma knockout.
  const input = plan.transparent ? knockoutVfxBackground(source) : source;
  const compiled = new PixelArtProcessor().process(input, {
    targetWidth: plan.width,
    targetHeight: plan.height,
    skipQuantize: true,
    fitOpaque: plan.grounded,
    preserveAlphaGradient: plan.profile === 'VFX_TEXTURE' || !plan.transparent,
  }).buffer;
  const { rgba } = decodePngRgba(compiled);
  if (!rgba.some((value, index) => index % 4 === 3 && value > 0)) {
    throw new Error('Generated artwork is fully transparent');
  }
  return compiled;
}
