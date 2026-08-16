import { describe, it, expect } from 'vitest';
import { classifyAssetLicense, licensePasses } from './license.js';

describe('classifyAssetLicense', () => {
  it('approves CC0', () => {
    const d = classifyAssetLicense({ license: 'CC0-1.0', commercialUse: 'allowed' }, true);
    expect(d.status).toBe('approved');
    expect(licensePasses(d, true)).toBe(true);
  });

  it('never auto-passes unknown when commercial use is required', () => {
    const d = classifyAssetLicense({ license: 'unknown', commercialUse: 'unknown' }, true);
    expect(d.status).toBe('unknown');
    expect(licensePasses(d, true)).toBe(false);
  });

  it('blocks CC-BY-NC when commercial use is required', () => {
    const d = classifyAssetLicense(
      { license: 'CC-BY-NC-4.0', commercialUse: 'restricted' },
      true,
    );
    expect(d.status).toBe('blocked');
    expect(licensePasses(d, true)).toBe(false);
  });

  it('marks CC-BY as approved-with-attribution', () => {
    const d = classifyAssetLicense(
      { license: 'CC-BY-4.0', commercialUse: 'allowed', attributionRequired: true, creator: 'Ada', sourceUrl: 'https://example.test' },
      true,
    );
    expect(d.status).toBe('approved-with-attribution');
    expect(d.attribution).toContain('Ada');
    expect(licensePasses(d, true)).toBe(true);
  });
});
