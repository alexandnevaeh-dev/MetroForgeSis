import { describe, expect, it } from 'vitest';
import { classifyAssetTier, certifyVisualAssets } from './asset-foundry-quality.js';

describe('asset foundry visual certification', () => {
  it('never promotes placeholders to production-ready', () => {
    expect(classifyAssetTier({ placeholder: true, productionReady: true })).toBe('PROCEDURAL_PLACEHOLDER');
    expect(classifyAssetTier({ maturity: 'BLOCKOUT', productionReady: true })).toBe('BLOCKOUT');
  });

  it('marks placeholder-heavy projects visually degraded', () => {
    const report = certifyVisualAssets(
      [
        { id: 'player', path: 'player.png', tier: 'PRODUCTION_READY', placeholder: false, productionReady: true },
        { id: 'enemy', path: 'enemy.png', tier: 'PROCEDURAL_PLACEHOLDER', placeholder: true, productionReady: false },
        { id: 'boss', path: 'boss.png', tier: 'PROCEDURAL_PLACEHOLDER', placeholder: true, productionReady: false },
      ],
      { id: 'constitution', version: '1.0.0' },
      90,
    );
    expect(report.placeholderRatio).toBeCloseTo(2 / 3);
    expect(report.certification).toBe('VISUAL_DEGRADED');
    expect(report.hardFailures.length).toBeGreaterThan(0);
  });

  it('requires both production-ready coverage and consistency for visual production readiness', () => {
    const assets = Array.from({ length: 10 }, (_, index) => ({
      id: `asset-${index}`,
      path: `asset-${index}.png`,
      tier: 'PRODUCTION_READY' as const,
      placeholder: false,
      productionReady: true,
    }));
    expect(certifyVisualAssets(assets, { id: 'constitution', version: '1.0.0' }, 90).certification).toBe('VISUAL_PRODUCTION_READY');
    expect(certifyVisualAssets(assets, { id: 'constitution', version: '1.0.0' }, 70).certification).toBe('VISUAL_DEGRADED');
  });
});
