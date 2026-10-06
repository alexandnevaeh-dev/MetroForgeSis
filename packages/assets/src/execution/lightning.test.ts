import { describe, expect, it } from 'vitest';
import { LightningExecutionBackend } from './lightning.js';

describe('LightningExecutionBackend', () => {
  it('reports NOT_CONFIGURED with setup instructions when no Studio URL is set', async () => {
    const report = await new LightningExecutionBackend({}).doctor();
    expect(report.readiness).toBe('NOT_CONFIGURED');
    expect(report.setupInstructions?.some((line) => line.includes('LIGHTNING_STUDIO_URL'))).toBe(true);
  });

  it('marks the target as FREE_CREDIT cost tier, never FREE unlimited', () => {
    const backend = new LightningExecutionBackend({ studioUrl: 'https://studio.test' });
    expect(backend.target.costMetadata?.costTier).toBe('FREE_CREDIT');
    expect(backend.target.type).toBe('LIGHTNING_STUDIO');
  });

  it('reports REFERENCE_CAPABLE when the worker advertises reference capability', async () => {
    const backend = new LightningExecutionBackend({
      studioUrl: 'https://studio.test',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'ready' }), { status: 200 });
        if (url.endsWith('/capabilities')) return new Response(JSON.stringify({ capabilities: ['REFERENCE_IMAGE'] }), { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    const report = await backend.doctor();
    expect(report.readiness).toBe('REFERENCE_CAPABLE');
  });

  it('reports UNREACHABLE when the endpoint cannot be reached', async () => {
    const backend = new LightningExecutionBackend({
      studioUrl: 'https://studio.test',
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const report = await backend.doctor();
    expect(report.readiness).toBe('UNREACHABLE');
  });
});
