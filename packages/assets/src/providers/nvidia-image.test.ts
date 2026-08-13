import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NvidiaImageProvider } from './nvidia-image.js';

describe('NvidiaImageProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checkHealth returns false without an API key', async () => {
    const provider = new NvidiaImageProvider({ apiKey: undefined, enabled: false });
    await expect(provider.checkHealth()).resolves.toBe(false);
  });

  it('checkHealth returns true when models endpoint responds', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'black-forest-labs/flux.1-schnell' }] }), {
        status: 200,
      }),
    );

    const provider = new NvidiaImageProvider({ apiKey: 'nvapi-test-key' });
    await expect(provider.checkHealth()).resolves.toBe(true);
  });

  it('generateImage posts to /images/generations and returns decoded PNG bytes', async () => {
    const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ b64_json: pngBytes.toString('base64') }] }), {
        status: 200,
      }),
    );

    const provider = new NvidiaImageProvider({
      apiKey: 'nvapi-test-key',
      modelId: 'black-forest-labs/flux.1-schnell',
    });

    const result = await provider.generateImage({
      profile: 'CHARACTER',
      prompt: 'pixel art hero',
      width: 64,
      height: 64,
      seed: 42,
    });

    expect(result.provider).toBe('nvidia-image');
    expect(result.modelId).toBe('black-forest-labs/flux.1-schnell');
    expect(result.image.equals(pngBytes)).toBe(true);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain('/images/generations');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('black-forest-labs/flux.1-schnell');
    expect(body.response_format).toBe('b64_json');
  });
});
