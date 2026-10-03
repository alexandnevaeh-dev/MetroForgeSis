import { describe, it, expect } from 'vitest';
import { summarizeTextHealth } from './aiOpsShared.js';
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
