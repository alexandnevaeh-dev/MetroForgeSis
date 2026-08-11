import type { ImageGenerationProfile } from './vision.js';

export function profilePrefix(profile: ImageGenerationProfile): string {
  const map: Partial<Record<ImageGenerationProfile, string>> = {
    CHARACTER: 'pixel art game character sprite, side view,',
    ENEMY: 'pixel art game enemy creature, side view,',
    BOSS: 'pixel art game boss creature, imposing,',
    TILE_SOURCE: 'seamless pixel art game tileset texture, top-down,',
    ENVIRONMENT: 'pixel art game environment background, parallax,',
    ICON: 'pixel art game item icon, centered,',
  };
  return map[profile] ?? 'pixel art game asset,';
}
