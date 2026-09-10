import { describe, expect, it } from 'vitest';
import { encodePng } from '../png.js';
import { PollinationsImageProvider } from './pollinations-image.js';

function fixturePng(width = 64, height = 64): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = (i * 7) % 255;
    rgba[i * 4 + 1] = (i * 11) % 255;
    rgba[i * 4 + 2] = (i * 13) % 255;
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(width, height, rgba);
}

function mockFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL) => handler(String(input))) as unknown as typeof fetch;
}

describe('PollinationsImageProvider', () => {
  it('requires no API key — enabled and constructible with zero config', () => {
    const provider = new PollinationsImageProvider();
    expect(provider.id).toBe('pollinations-image');
  });

  it('checkHealth returns true on a 200 response', async () => {
    const fetchImpl = mockFetch(() => new Response(fixturePng(), { status: 200 }));
    const provider = new PollinationsImageProvider({ fetchImpl });
    expect(await provider.checkHealth()).toBe(true);
  });

  it('checkHealth still returns true (DEGRADED, selectable) on a 5xx — health, not on/off', async () => {
    const fetchImpl = mockFetch(() => new Response('nope', { status: 503 }));
    const provider = new PollinationsImageProvider({ fetchImpl });
    expect(await provider.checkHealth()).toBe(true);
    expect((await provider.getHealthReport()).status).toBe('DEGRADED');
  });

  it('checkHealth returns false on a 4xx client error', async () => {
    const fetchImpl = mockFetch(() => new Response('not found', { status: 404 }));
    const provider = new PollinationsImageProvider({ fetchImpl });
    expect(await provider.checkHealth()).toBe(false);
  });

  it('checkHealth reports NETWORK_ERROR when fetch itself throws', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const provider = new PollinationsImageProvider({ fetchImpl });
    const report = await provider.getHealthReport();
    expect(report.status).toBe('NETWORK_ERROR');
  });

  it('generateImage builds a prompt URL with width/height/seed and returns decodable PNG bytes', async () => {
    let capturedUrl = '';
    const fetchImpl = mockFetch((url) => {
      capturedUrl = url;
      return new Response(fixturePng(64, 64), { status: 200, headers: { 'content-type': 'image/png' } });
    });
    const provider = new PollinationsImageProvider({ fetchImpl });
    const result = await provider.generateImage({
      profile: 'ENVIRONMENT',
      prompt: 'dark fantasy pixel art background, drowned citadel',
      width: 640,
      height: 360,
      seed: 42,
    });

    expect(capturedUrl).toContain('width=640');
    expect(capturedUrl).toContain('height=360');
    expect(capturedUrl).toContain('seed=42');
    expect(capturedUrl).toContain(encodeURIComponent('dark fantasy pixel art background, drowned citadel').slice(0, 20));
    expect(result.provider).toBe('pollinations-image');
    expect(result.fallbackGenerated).toBe(false);
    expect(result.image.length).toBeGreaterThan(0);
  });

  it('throws on an implausibly small response instead of silently succeeding', async () => {
    const fetchImpl = mockFetch(() => new Response(Buffer.from([1, 2, 3]), { status: 200 }));
    const provider = new PollinationsImageProvider({ fetchImpl });
    await expect(
      provider.generateImage({ profile: 'ITEM', prompt: 'icon', width: 32, height: 32 }),
    ).rejects.toThrow(/implausibly small/);
  });

  it('throws on a non-image response body', async () => {
    const fetchImpl = mockFetch(() => new Response('{"error":"nope"}'.repeat(50), { status: 200 }));
    const provider = new PollinationsImageProvider({ fetchImpl });
    await expect(
      provider.generateImage({ profile: 'ITEM', prompt: 'icon', width: 32, height: 32 }),
    ).rejects.toThrow(/unrecognized image bytes/);
  });

  it('propagates non-2xx HTTP responses as errors, not silent fallback', async () => {
    const fetchImpl = mockFetch(() => new Response('rate limited', { status: 429 }));
    const provider = new PollinationsImageProvider({ fetchImpl });
    await expect(
      provider.generateImage({ profile: 'ITEM', prompt: 'icon', width: 32, height: 32 }),
    ).rejects.toThrow();
  });
});
