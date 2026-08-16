import { describe, it, expect } from 'vitest';
import { Automatic1111Provider } from './automatic1111.js';
import { KenneyProvider } from './kenney.js';

describe('Automatic1111Provider', () => {
  it('health-checks and does not assume localhost is up', async () => {
    const provider = new Automatic1111Provider({
      baseUrl: 'http://127.0.0.1:9',
      fetchImpl: async () => {
        throw new Error('connection refused');
      },
    });
    const report = await provider.getHealthReport();
    expect(report.status).toBe('UNAVAILABLE');
    expect(await provider.checkHealth()).toBe(false);
  });

  it('decodes txt2img JSON when the mocked API is healthy', async () => {
    const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0]);
    const provider = new Automatic1111Provider({
      baseUrl: 'http://127.0.0.1:7860',
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes('/sd-models')) {
          return new Response('[]', { status: 200 });
        }
        return new Response(JSON.stringify({ images: [pngHeader.toString('base64')] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    expect(await provider.checkHealth()).toBe(true);
    const result = await provider.generateImage({
      profile: 'ITEM',
      prompt: 'crate',
      width: 32,
      height: 32,
      seed: 1,
    });
    expect(result.provider).toBe('automatic1111');
    expect(result.image.length).toBeGreaterThan(8);
  });
});

describe('KenneyProvider', () => {
  it('is a CC0 catalog source, not an implied AI generator', async () => {
    const kenney = new KenneyProvider();
    const hits = kenney.search('ui icon', 'icon');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.entry.license).toBe('CC0-1.0');
    const report = await kenney.getHealthReport();
    expect(report.status).toBe('HEALTHY');
  });
});
