import { describe, it, expect } from 'vitest';
import {
  inferAssetMaturity,
  isNonProductionMaturity,
  projectAllowsPlaceholders,
} from './asset-maturity.js';

describe('inferAssetMaturity', () => {
  it('marks procedural / fallback art as PLACEHOLDER, never PRODUCTION_READY', () => {
    const a = inferAssetMaturity({ fallbackGenerated: true, provider: 'procedural' });
    expect(a.maturity).toBe('PLACEHOLDER');
    expect(a.productionReady).toBe(false);
    expect(a.sourceType).toBe('procedural');
    expect(isNonProductionMaturity(a.maturity)).toBe(true);
  });

  it('marks successful AI generation as GENERATED_SOURCE', () => {
    const a = inferAssetMaturity({
      fallbackGenerated: false,
      provider: 'nvidia-image',
      critiquePassed: undefined,
    });
    expect(a.maturity).toBe('GENERATED_SOURCE');
    expect(a.productionReady).toBe(false);
  });

  it('promotes critique-passed assets to QA_REVIEW but not PRODUCTION_READY', () => {
    const a = inferAssetMaturity({
      fallbackGenerated: false,
      provider: 'comfyui',
      critiquePassed: true,
      critiqueScore: 90,
    });
    expect(a.maturity).toBe('QA_REVIEW');
    expect(a.productionReady).toBe(false);
  });

  it('marks hard critique failures as REJECTED', () => {
    const a = inferAssetMaturity({
      fallbackGenerated: false,
      provider: 'diffusers',
      critiquePassed: false,
      critiqueScore: 40,
    });
    expect(a.maturity).toBe('REJECTED');
    expect(isNonProductionMaturity(a.maturity)).toBe(true);
  });

  it('soft-passes strict critic (score >= 70) to QA_REVIEW instead of REJECTED', () => {
    const a = inferAssetMaturity({
      fallbackGenerated: false,
      provider: 'nvidia-image',
      critiquePassed: false,
      critiqueScore: 80,
    });
    expect(a.maturity).toBe('QA_REVIEW');
    expect(a.productionReady).toBe(false);
    expect(a.sourceType).toBe('ai_generated');
  });
});

describe('projectAllowsPlaceholders', () => {
  it('reads allowPlaceholders from project meta', () => {
    expect(projectAllowsPlaceholders({ allowPlaceholders: true })).toBe(true);
    expect(projectAllowsPlaceholders({ settings: { placeholdersAllowed: true } })).toBe(true);
    expect(projectAllowsPlaceholders({})).toBe(false);
  });
});
