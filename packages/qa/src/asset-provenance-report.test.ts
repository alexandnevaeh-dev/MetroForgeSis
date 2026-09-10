import { describe, expect, it } from 'vitest';
import { buildAssetProvenanceReport, classifyAssetProvenance } from './asset-provenance-report.js';

describe('asset provenance report', () => {
  it('keeps debug rectangles and failed procedural fallbacks visible as placeholders', () => {
    const record = classifyAssetProvenance({
      id: 'debug-rect',
      path: 'assets/props/debug-rect.png',
      provider: 'procedural',
      fallbackGenerated: true,
      maturity: 'PLACEHOLDER',
      critiquePassed: false,
    });
    expect(record.category).toBe('true_debug_placeholder');
  });

  it('counts final-use procedural output as production, not placeholder', () => {
    const record = classifyAssetProvenance({
      id: 'player',
      path: 'assets/characters/player.png',
      provider: 'procedural',
      sourceType: 'procedural',
      fallbackGenerated: true,
      maturity: 'PROCEDURAL_PRODUCTION',
      productionReady: true,
      critiquePassed: true,
    });
    expect(record.category).toBe('procedural_production');
  });

  it('distinguishes validated procedural production from provider fallback accounting', () => {
    const report = buildAssetProvenanceReport([
      {
        id: 'player', path: 'assets/characters/player.png', provider: 'procedural', sourceType: 'procedural',
        fallbackGenerated: true, maturity: 'PROCEDURAL_PRODUCTION', productionReady: true, critiquePassed: true,
      },
      {
        id: 'background', path: 'assets/backgrounds/biome_0/far.png', provider: 'pollinations-image',
        sourceType: 'ai_generated', fallbackGenerated: false, maturity: 'QA_REVIEW', critiquePassed: true,
      },
      {
        id: 'contact', path: 'assets/qa/player-sheet.png', provider: 'pixel-art-processor',
        sourceType: 'compiled', maturity: 'QA_REVIEW', critiquePassed: true,
      },
    ]);
    expect(report.counts.procedural_production).toBe(1);
    expect(report.counts.ai_generated).toBe(1);
    expect(report.counts.ui_debug).toBe(1);
    expect(report.providerFallbacks).toBe(1);
  });
});