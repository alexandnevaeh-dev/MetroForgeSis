import { describe, expect, it } from 'vitest';
import { qualityProfileForGenerationMode, resolveAssetQualityProfile } from './quality-profiles.js';

describe('asset quality profiles', () => {
  it('maps generation modes onto profiles without hardcoding models', () => {
    expect(qualityProfileForGenerationMode('FASTEST')).toBe('DRAFT');
    expect(qualityProfileForGenerationMode('LOW_VRAM')).toBe('DRAFT');
    expect(qualityProfileForGenerationMode('HIGHEST_QUALITY')).toBe('QUALITY');
    expect(qualityProfileForGenerationMode('BALANCED')).toBe('BALANCED');
  });

  it('lets an explicit profile override the generation mode', () => {
    expect(resolveAssetQualityProfile('MAXIMUM_SUPPORTED', 'FASTEST').id).toBe('MAXIMUM_SUPPORTED');
    expect(resolveAssetQualityProfile('MAXIMUM_SUPPORTED', 'FASTEST').vramBudgetFactor).toBeGreaterThan(
      resolveAssetQualityProfile('DRAFT').vramBudgetFactor,
    );
  });
});
