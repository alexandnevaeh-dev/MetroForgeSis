import type { AssetQualityProfile } from '@metroforge/schemas';
import type { GenerationMode } from '@metroforge/shared';

export interface AssetQualityProfileSpec {
  id: AssetQualityProfile;
  /** Fraction of usable VRAM the router may spend. */
  vramBudgetFactor: number;
  preferSpeed: boolean;
  preferQuality: boolean;
  maxResolution: number;
}

export const ASSET_QUALITY_PROFILES: Record<AssetQualityProfile, AssetQualityProfileSpec> = {
  DRAFT: {
    id: 'DRAFT',
    vramBudgetFactor: 0.7,
    preferSpeed: true,
    preferQuality: false,
    maxResolution: 512,
  },
  BALANCED: {
    id: 'BALANCED',
    vramBudgetFactor: 1,
    preferSpeed: false,
    preferQuality: false,
    maxResolution: 768,
  },
  QUALITY: {
    id: 'QUALITY',
    vramBudgetFactor: 1,
    preferSpeed: false,
    preferQuality: true,
    maxResolution: 1024,
  },
  MAXIMUM_SUPPORTED: {
    id: 'MAXIMUM_SUPPORTED',
    vramBudgetFactor: 1,
    preferSpeed: false,
    preferQuality: true,
    maxResolution: 1024,
  },
};

/** Map existing GenerationMode onto a quality profile. Explicit qualityProfile always wins. */
export function qualityProfileForGenerationMode(mode?: GenerationMode): AssetQualityProfile {
  switch (mode) {
    case 'FASTEST':
    case 'LOW_VRAM':
      return 'DRAFT';
    case 'HIGHEST_QUALITY':
      return 'QUALITY';
    default:
      return 'BALANCED';
  }
}

export function resolveAssetQualityProfile(
  explicit?: AssetQualityProfile,
  mode?: GenerationMode,
): AssetQualityProfileSpec {
  const id = explicit ?? qualityProfileForGenerationMode(mode);
  return ASSET_QUALITY_PROFILES[id];
}
