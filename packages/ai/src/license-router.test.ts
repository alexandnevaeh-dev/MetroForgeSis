import { describe, it, expect } from 'vitest';
import { LicenseRouter } from './license-router.js';
import { ModelEntrySchema } from '@metroforge/schemas';
import type { ModelEntry } from '@metroforge/schemas';

function entry(overrides: Partial<ModelEntry>): ModelEntry {
  return ModelEntrySchema.parse({
    id: 'test-model',
    name: 'Test Model',
    provider: 'test',
    modality: 'text',
    capabilities: ['TEXT_GENERATION'],
    local: false,
    license: 'Test License',
    ...overrides,
  });
}

describe('LicenseRouter.classify', () => {
  const router = new LicenseRouter();

  it('classifies commercialUse=allowed with no recorded condition as COMMERCIAL_SAFE', () => {
    const result = router.classify(entry({ commercialUse: 'allowed', license: 'Apache-2.0' }));
    expect(result.status).toBe('COMMERCIAL_SAFE');
  });

  it('classifies commercialUse=unknown as UNKNOWN, never COMMERCIAL_SAFE', () => {
    const result = router.classify(entry({ commercialUse: 'unknown' }));
    expect(result.status).toBe('UNKNOWN');
    expect(result.status).not.toBe('COMMERCIAL_SAFE');
  });

  it('classifies commercialUse=restricted as NON_COMMERCIAL by default', () => {
    const result = router.classify(
      entry({ commercialUse: 'restricted', license: 'CC-BY-NC-4.0' }),
    );
    expect(result.status).toBe('NON_COMMERCIAL');
  });

  it('classifies a restricted, research-flavored license as RESEARCH_ONLY', () => {
    const result = router.classify(
      entry({ commercialUse: 'restricted', license: 'Research-only Non-Commercial License' }),
    );
    expect(result.status).toBe('RESEARCH_ONLY');
  });

  it('classifies commercialUse=allowed with a recorded revenue-limit condition as COMMERCIAL_CONDITIONAL', () => {
    const result = router.classify(
      entry({
        commercialUse: 'allowed',
        license: 'Llama 3.1 Community License',
        licenseDetail: { revenueLimit: 'Requires separate license above $700M MAU' },
      }),
    );
    expect(result.status).toBe('COMMERCIAL_CONDITIONAL');
  });

  it('passes usageClass through without letting it change the license status', () => {
    const result = router.classify(
      entry({
        commercialUse: 'allowed',
        license: 'NVIDIA API Terms of Use',
        usageClass: 'development_prototyping',
      }),
    );
    // development_prototyping describes API-tier reliability, not commercial-use legality —
    // a genuinely commercial-use-allowed license stays COMMERCIAL_SAFE regardless of tier.
    expect(result.status).toBe('COMMERCIAL_SAFE');
    expect(result.usageClass).toBe('development_prototyping');
  });
});

describe('LicenseRouter — COMMERCIAL_SAFE strictness (spec test matrix)', () => {
  const router = new LicenseRouter();

  it('commercial-safe rejects restricted', () => {
    expect(router.isCommercialSafe(entry({ commercialUse: 'restricted' }))).toBe(false);
  });

  it('commercial-safe rejects unknown', () => {
    expect(router.isCommercialSafe(entry({ commercialUse: 'unknown' }))).toBe(false);
  });

  it('commercial-safe accepts explicitly allowed', () => {
    expect(router.isCommercialSafe(entry({ commercialUse: 'allowed' }))).toBe(true);
  });

  it('commercial-safe rejects an allowed-but-conditional model in strict mode', () => {
    expect(
      router.isCommercialSafe(
        entry({ commercialUse: 'allowed', licenseDetail: { revenueLimit: 'some condition' } }),
      ),
    ).toBe(false);
  });

  it('filterCommercialSafe keeps only genuinely safe entries from a mixed list', () => {
    const entries = [
      entry({ id: 'a', commercialUse: 'allowed' }),
      entry({ id: 'b', commercialUse: 'restricted' }),
      entry({ id: 'c', commercialUse: 'unknown' }),
      entry({ id: 'd', commercialUse: 'allowed', licenseDetail: { revenueLimit: 'x' } }),
    ];
    const safe = router.filterCommercialSafe(entries);
    expect(safe.map((e) => e.id)).toEqual(['a']);
  });
});
