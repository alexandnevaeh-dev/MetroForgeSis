import { describe, it, expect } from 'vitest';
import {
  artifactNeedsMaturityBackfill,
  backfillArtifactMaturityFields,
  backfillManifestMaturity,
} from './backfill-asset-maturity.js';

describe('backfillArtifactMaturityFields', () => {
  it('fills missing maturity / productionReady / sourceType for procedural fallbacks', () => {
    const { artifact, updated } = backfillArtifactMaturityFields({
      path: 'assets/characters/player.png',
      provider: 'procedural',
      fallbackGenerated: true,
      critiquePassed: true,
      critiqueScore: 75,
    });

    expect(updated).toBe(true);
    expect(artifact.maturity).toBe('PLACEHOLDER');
    expect(artifact.productionReady).toBe(false);
    expect(artifact.sourceType).toBe('procedural');
  });

  it('does not overwrite existing maturity fields (idempotent)', () => {
    const original = {
      path: 'assets/characters/player.png',
      provider: 'procedural',
      fallbackGenerated: true,
      maturity: 'GENERATED_SOURCE',
      productionReady: true,
      sourceType: 'manual',
    };
    const { artifact, updated } = backfillArtifactMaturityFields(original);
    expect(updated).toBe(false);
    expect(artifact).toEqual(original);
    expect(artifactNeedsMaturityBackfill(original)).toBe(false);
  });

  it('only fills the missing fields when some are already set', () => {
    const { artifact, updated } = backfillArtifactMaturityFields({
      provider: 'nvidia-image',
      fallbackGenerated: false,
      critiquePassed: true,
      maturity: 'QA_REVIEW',
    });
    expect(updated).toBe(true);
    expect(artifact.maturity).toBe('QA_REVIEW');
    expect(artifact.productionReady).toBe(false);
    expect(artifact.sourceType).toBe('ai_generated');
  });

  it('treats empty maturity string as missing', () => {
    expect(artifactNeedsMaturityBackfill({ maturity: '', productionReady: false, sourceType: 'procedural' })).toBe(
      true,
    );
    const { artifact, updated } = backfillArtifactMaturityFields({
      maturity: '   ',
      productionReady: false,
      sourceType: 'procedural',
      fallbackGenerated: true,
      provider: 'procedural',
    });
    expect(updated).toBe(true);
    expect(artifact.maturity).toBe('PLACEHOLDER');
    expect(artifact.productionReady).toBe(false);
  });
});

describe('backfillManifestMaturity', () => {
  it('updates only incomplete artifacts and leaves complete ones alone', () => {
    const { manifest, updatedCount, skippedCount } = backfillManifestMaturity({
      artifacts: [
        {
          path: 'a.png',
          provider: 'procedural',
          fallbackGenerated: true,
        },
        {
          path: 'b.png',
          provider: 'comfyui',
          maturity: 'GENERATED_SOURCE',
          productionReady: false,
          sourceType: 'ai_generated',
        },
      ],
    });

    expect(updatedCount).toBe(1);
    expect(skippedCount).toBe(1);
    expect(manifest.artifacts?.[0]?.maturity).toBe('PLACEHOLDER');
    expect(manifest.artifacts?.[1]?.maturity).toBe('GENERATED_SOURCE');

    const second = backfillManifestMaturity(manifest);
    expect(second.updatedCount).toBe(0);
    expect(second.skippedCount).toBe(2);
  });
});
