import type { ImageGenerationProfile } from './vision.js';

export function profilePrefix(profile: ImageGenerationProfile): string {
  const map: Partial<Record<ImageGenerationProfile, string>> = {
    CHARACTER: 'pixel art game character sprite,',
    ENEMY: 'pixel art game enemy creature,',
    BOSS: 'pixel art game boss creature, imposing,',
    TILE_SOURCE: 'seamless pixel art game tileset texture,',
    ENVIRONMENT: 'pixel art game environment asset,',
    ICON: 'pixel art game item icon, centered,',
    VFX_TEXTURE:
      'isolated pixel art game VFX sprite, centered single effect, transparent silhouette, chroma-key magenta background,',
  };
  return map[profile] ?? 'pixel art game asset,';
}
