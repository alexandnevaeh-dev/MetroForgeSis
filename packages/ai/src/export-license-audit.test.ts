import { describe, expect, it } from 'vitest';
import { auditExportLicense } from './export-license-audit.js';
import { resolveArtifactLicense } from './provider-license-metadata.js';

describe('auditExportLicense', () => {
  it('passes procedural-only manifests as commercial-safe', () => {
    const audit = auditExportLicense([
      {
        id: 'player',
        path: 'assets/characters/player.png',
        provider: 'procedural',
        fallbackGenerated: true,
        commercialUse: 'allowed',
        license: 'MetroForge Procedural Generator (original work)',
      },
    ]);
    expect(audit.commercialSafe).toBe(true);
    expect(audit.blockedArtifacts).toHaveLength(0);
  });

  it('blocks unknown-provider artifacts in commercial-safe audit', () => {
    const audit = auditExportLicense([
      {
        id: 'boss',
        path: 'assets/bosses/boss_final.png',
        provider: 'comfyui',
      },
    ]);
    expect(audit.commercialSafe).toBe(false);
    expect(audit.blockedArtifacts[0]?.status).toBe('UNKNOWN');
  });

  it('blocks restricted commercialUse even when provider is known', () => {
    const audit = auditExportLicense([
      {
        id: 'sprite',
        path: 'assets/generated/manual.png',
        provider: 'manual',
        commercialUse: 'restricted',
        license: 'Research only',
      },
    ]);
    expect(audit.commercialSafe).toBe(false);
    expect(audit.blockedArtifacts[0]?.status).toBe('RESEARCH_ONLY');
  });
});

describe('resolveArtifactLicense', () => {
  it('prefers explicit manifest license fields', () => {
    const subject = resolveArtifactLicense({
      provider: 'procedural',
      commercialUse: 'unknown',
      license: 'Custom',
    });
    expect(subject.commercialUse).toBe('unknown');
    expect(subject.license).toBe('Custom');
  });

  it('inherits pixel-art-processor licenses from the nvidia-image source character', () => {
    const artifacts = [
      {
        id: 'player',
        path: 'assets/characters/player.png',
        provider: 'nvidia-image',
        commercialUse: 'allowed' as const,
        license: 'NVIDIA API Terms / model card',
      },
      {
        id: 'player_walk',
        path: 'assets/characters/player_walk.png',
        provider: 'pixel-art-processor',
        commercialUse: 'unknown' as const,
        license: 'Unverified provider: pixel-art-processor',
      },
    ];
    const walk = resolveArtifactLicense(artifacts[1]!, artifacts);
    expect(walk.commercialUse).toBe('allowed');
    expect(walk.license).toContain('NVIDIA');
    const audit = auditExportLicense(artifacts);
    expect(audit.commercialSafe).toBe(true);
  });

  it('keeps unknown compiler artifacts unknown when no source exists', () => {
    const audit = auditExportLicense([
      {
        id: 'orphan_walk',
        path: 'assets/characters/orphan_walk.png',
        provider: 'pixel-art-processor',
        commercialUse: 'unknown',
        license: 'Unverified provider: pixel-art-processor',
      },
    ]);
    expect(audit.commercialSafe).toBe(false);
    expect(audit.blockedArtifacts[0]?.status).toBe('UNKNOWN');
  });
});
