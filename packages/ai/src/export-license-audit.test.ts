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
});
