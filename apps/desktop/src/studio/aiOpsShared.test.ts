import { describe, it, expect } from 'vitest';
import { computeHardwareFit, summarizeTextHealth } from './aiOpsShared.js';

describe('model hardware fit', () => {
  it('keeps newly discovered local requirements unknown instead of claiming the model fits', () => {
    expect(computeHardwareFit({ local: true }, { totalRamMb: 32768, vramMb: 8192 })).toBe('Unknown');
  });
  it('distinguishes verified zero VRAM requirements from missing data and hosted inference', () => {
    expect(computeHardwareFit({ local: true, minVramMb: 0, minRamMb: 1024 }, { totalRamMb: 8192 })).toBe('Fits');
    expect(computeHardwareFit({ local: false }, { totalRamMb: 1024 })).toBe('Cloud');
  });
});
describe('text health summary', () => {
  it('excludes disabled providers from readiness', () => {
    expect(
      summarizeTextHealth([
        { enabled: true, health: 'HEALTHY' },
        { enabled: false, health: 'unavailable' },
      ]),
    ).toEqual({ healthy: 1, enabled: 1, label: '1/1 text AI ready', status: 'PASS' });
  });
  it('reports setup without implying the whole app has failed', () => {
    expect(summarizeTextHealth([]).label).toBe('Text AI not configured');
    expect(summarizeTextHealth([{ enabled: false, health: 'healthy' }]).status).toBe('WARN');
  });
  it('keeps partial readiness visible', () => {
    expect(
      summarizeTextHealth([
        { enabled: true, health: 'healthy' },
        { enabled: true, health: 'degraded' },
      ]),
    ).toEqual({ healthy: 1, enabled: 2, label: '1/2 text AI ready', status: 'WARN' });
  });
});
