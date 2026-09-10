import { describe, expect, it } from 'vitest';
import { encodePng } from '../png.js';
import { HuggingFaceImageProvider } from './huggingface-image.js';

function fixturePng(size = 64): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = (i * 3) % 255;
    rgba[i * 4 + 1] = (i * 5) % 255;
    rgba[i * 4 + 2] = (i * 7) % 255;
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(size, size, rgba);
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => handler(String(input), init)) as unknown as typeof fetch;
}

describe('HuggingFaceImageProvider.editImage — image-to-image capability', () => {
  it('requires an API key', async () => {
    const provider = new HuggingFaceImageProvider({});
    await expect(
      provider.editImage({ sourceAssets: [{ assetId: 'a', bytes: fixturePng() }], instruction: 'polish this' }),
    ).rejects.toThrow(/HUGGINGFACE_API_KEY/);
  });

  it('requires at least one source asset', async () => {
    const provider = new HuggingFaceImageProvider({ apiKey: 'hf_test' });
    await expect(provider.editImage({ sourceAssets: [], instruction: 'polish this' })).rejects.toThrow(
      /at least one source asset/,
    );
  });

  it('posts base64 source bytes + instruction to the configured edit model endpoint', async () => {
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};
    const fetchImpl = mockFetch((url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(String(init?.body));
      return new Response(fixturePng(), { status: 200, headers: { 'content-type': 'image/png' } });
    });
    const provider = new HuggingFaceImageProvider({ apiKey: 'hf_test', editModelId: 'Qwen/Qwen-Image-Edit', fetchImpl });

    const result = await provider.editImage({
      sourceAssets: [{ assetId: 'player', bytes: fixturePng(32) }],
      instruction: 'more polished modern-Metroidvania style, preserve silhouette',
      width: 64,
      height: 64,
      seed: 42,
    });

    expect(capturedUrl).toBe('https://api-inference.huggingface.co/models/Qwen/Qwen-Image-Edit');
    expect(capturedBody.parameters).toMatchObject({ prompt: 'more polished modern-Metroidvania style, preserve silhouette', width: 64, height: 64, seed: 42 });
    expect(typeof capturedBody.inputs).toBe('string'); // base64 source image
    expect(result.provider).toBe('huggingface-image');
    expect(result.model).toBe('Qwen/Qwen-Image-Edit');
    expect(result.sourceAssetIds).toEqual(['player']);
    expect(result.images[0]?.buffer.length).toBeGreaterThan(0);
    expect(result.provenance.capability).toBe('IMAGE_EDIT');
  });

  it('propagates non-2xx responses as classified errors, never a silent fallback', async () => {
    const fetchImpl = mockFetch(() => new Response('unauthorized', { status: 401 }));
    const provider = new HuggingFaceImageProvider({ apiKey: 'hf_test', fetchImpl });
    await expect(
      provider.editImage({ sourceAssets: [{ assetId: 'a', bytes: fixturePng() }], instruction: 'x' }),
    ).rejects.toThrow();
  });
});

describe('HuggingFaceImageProvider.probeEditCapability', () => {
  it('reports unavailable with no API key, without making a network call', async () => {
    const provider = new HuggingFaceImageProvider({});
    const probe = await provider.probeEditCapability();
    expect(probe.available).toBe(false);
    expect(probe.reason).toMatch(/HUGGINGFACE_API_KEY/);
  });

  it('reports available for a reachable, image-to-image-tagged model card', async () => {
    const fetchImpl = mockFetch(() =>
      new Response(JSON.stringify({ pipeline_tag: 'image-to-image', gated: false }), { status: 200 }),
    );
    const provider = new HuggingFaceImageProvider({ apiKey: 'hf_test', fetchImpl });
    const probe = await provider.probeEditCapability();
    expect(probe.available).toBe(true);
  });

  it('reports unavailable when the model card task is not image-editing capable', async () => {
    const fetchImpl = mockFetch(() =>
      new Response(JSON.stringify({ pipeline_tag: 'text-to-image', gated: false }), { status: 200 }),
    );
    const provider = new HuggingFaceImageProvider({ apiKey: 'hf_test', fetchImpl });
    const probe = await provider.probeEditCapability();
    expect(probe.available).toBe(false);
    expect(probe.reason).toMatch(/not image-editing capable/);
  });

  it('reports unavailable when the model does not exist', async () => {
    const fetchImpl = mockFetch(() => new Response('not found', { status: 404 }));
    const provider = new HuggingFaceImageProvider({ apiKey: 'hf_test', fetchImpl });
    const probe = await provider.probeEditCapability();
    expect(probe.available).toBe(false);
    expect(probe.reason).toMatch(/does not exist/);
  });
});
