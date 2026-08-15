import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NvidiaImageProvider,
  NvidiaInvalidImagePayloadError,
  assertValidNvidiaImageBytes,
  NVIDIA_MIN_DECODED_IMAGE_BYTES,
} from './nvidia-image.js';
import { encodePng } from '../png.js';

function colorfulPng(size = 64): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      rgba[i] = 40 + (x % 200);
      rgba[i + 1] = 80 + (y % 150);
      rgba[i + 2] = 160;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

function blankBlackPng(size = 64): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  // fully transparent / black — should fail visible-content check
  return encodePng(size, size, rgba);
}

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
    const details = await provider.getHealthDetails();
    expect(details.status).toBe('MISCONFIGURED');
    expect(details.reason).toMatch(/NVIDIA_API_KEY/i);
    expect(details.reason).not.toMatch(/nvapi-/i);
  });

  it('checkHealth returns true when models + genai path respond', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'meta/llama-3.1-8b-instruct' }] }), {
          status: 200,
        });
      }
      // GET genai/{model} → 405 means path exists (POST-only)
      return new Response('method not allowed', { status: 405 });
    });

    const provider = new NvidiaImageProvider({
      apiKey: 'nvapi-test-key',
      modelId: 'black-forest-labs/flux.1-dev',
    });
    const details = await provider.getHealthDetails();
    expect(details.status).toBe('HEALTHY');
    await expect(provider.checkHealth()).resolves.toBe(true);
  });

  it('maps HTTP 401 to AUTH_FAILED without echoing the API key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const provider = new NvidiaImageProvider({ apiKey: 'nvapi-secret-should-not-leak' });
    const details = await provider.getHealthDetails();
    expect(details.status).toBe('AUTH_FAILED');
    expect(details.reason).not.toContain('nvapi-secret');
    await expect(provider.checkHealth()).resolves.toBe(false);
  });

  it('maps HTTP 429 to RATE_LIMITED', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('slow down', { status: 429 }));
    const provider = new NvidiaImageProvider({ apiKey: 'nvapi-test-key' });
    const details = await provider.getHealthDetails();
    expect(details.status).toBe('RATE_LIMITED');
  });

  it('marks MODEL_UNAVAILABLE when genai path 404s', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'meta/llama-3.1-8b-instruct' }] }), {
          status: 200,
        });
      }
      return new Response('not found', { status: 404 });
    });
    const provider = new NvidiaImageProvider({
      apiKey: 'nvapi-test-key',
      modelId: 'black-forest-labs/flux.1-schnell',
    });
    // Known model id but genai 404 → still DEGRADED/MODEL path; known ids with 404 → MODEL_UNAVAILABLE
    const details = await provider.getHealthDetails();
    expect(['MODEL_UNAVAILABLE', 'DEGRADED']).toContain(details.status);
    expect(details.suggestedModelIds?.length).toBeGreaterThan(0);
    expect(details.reason).not.toMatch(/nvapi-/i);
  });

  it('generateImage posts to genai endpoint with NVCF-POLL-SECONDS and returns PNG bytes', async () => {
    const pngBytes = colorfulPng(96);
    expect(pngBytes.length).toBeGreaterThan(NVIDIA_MIN_DECODED_IMAGE_BYTES);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ artifacts: [{ base64: pngBytes.toString('base64'), finishReason: 'SUCCESS' }] }), {
        status: 200,
        headers: { 'nvcf-status': 'fulfilled' },
      }),
    );

    const provider = new NvidiaImageProvider({
      apiKey: 'nvapi-test-key',
      modelId: 'black-forest-labs/flux.1-dev',
      maxRetries: 0,
    });

    const result = await provider.generateImage({
      profile: 'CHARACTER',
      prompt: 'pixel art hero',
      width: 64,
      height: 64,
      seed: 42,
    });

    expect(result.provider).toBe('nvidia-image');
    expect(result.modelId).toBe('black-forest-labs/flux.1-dev');
    expect(result.image[0]).toBe(137);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain('/v1/genai/black-forest-labs/flux.1-dev');
    expect(String(url)).not.toContain('/images/generations');
    const headers = init?.headers as Record<string, string>;
    expect(headers['NVCF-POLL-SECONDS']).toBe('120');
    const body = JSON.parse(String(init?.body));
    expect(body.prompt).toBe('pixel art hero');
    expect(body.seed).toBe(42);
    expect(body.width).toBe(1024);
    expect(body.height).toBe(1024);
    expect(body.model).toBeUndefined();
  });

  it('retries blank/empty NVCF payloads then succeeds on a valid artifact', async () => {
    const validPng = colorfulPng(96);
    const tinyJunk = Buffer.alloc(120, 0); // below MIN + not PNG/JPEG

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ artifacts: [] }), {
          status: 200,
          headers: { 'nvcf-status': 'fulfilled' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ artifacts: [{ base64: tinyJunk.toString('base64'), finishReason: 'SUCCESS' }] }),
          { status: 200, headers: { 'nvcf-status': 'fulfilled' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            artifacts: [{ base64: validPng.toString('base64'), finishReason: 'SUCCESS' }],
          }),
          { status: 200, headers: { 'nvcf-status': 'fulfilled' } },
        ),
      );

    const provider = new NvidiaImageProvider({
      apiKey: 'nvapi-test-key',
      modelId: 'black-forest-labs/flux.1-dev',
      maxRetries: 2,
      retryBackoffMs: [0, 0],
    });

    const result = await provider.generateImage({
      profile: 'ENEMY',
      prompt: 'pixel moth enemy',
      width: 64,
      height: 64,
      seed: 7,
    });

    expect(result.image[0]).toBe(137);
    expect(vi.mocked(fetch).mock.calls.length).toBe(3);
  });

  it('surfaces a clear error after exhausting retries on empty NVCF payloads', async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(JSON.stringify({ artifacts: [{ base64: '' }] }), {
          status: 200,
          headers: { 'nvcf-status': 'fulfilled' },
        }),
    );

    const provider = new NvidiaImageProvider({
      apiKey: 'nvapi-test-key',
      maxRetries: 2,
      retryBackoffMs: [0, 0],
    });

    await expect(
      provider.generateImage({
        profile: 'CHARACTER',
        prompt: 'hero',
        width: 64,
        height: 64,
        seed: 1,
      }),
    ).rejects.toThrow(/no image data|failed after 3/i);
    expect(vi.mocked(fetch).mock.calls.length).toBe(3);
  });

  it('does not retry auth failures', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('nope', { status: 401 }));
    const provider = new NvidiaImageProvider({ apiKey: 'nvapi-test-key', maxRetries: 2 });
    await expect(
      provider.generateImage({
        profile: 'CHARACTER',
        prompt: 'hero',
        width: 64,
        height: 64,
      }),
    ).rejects.toThrow(/auth failed/i);
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it('rejects blank near-black or tiny PNG artifacts', async () => {
    const blank = blankBlackPng(96);
    // Solid black PNG compresses tiny — caught by min-bytes gate (same user-facing failure path).
    expect(blank.length).toBeLessThan(NVIDIA_MIN_DECODED_IMAGE_BYTES);
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(JSON.stringify({ artifacts: [{ base64: blank.toString('base64') }] }), {
          status: 200,
        }),
    );
    const provider = new NvidiaImageProvider({ apiKey: 'nvapi-test-key', maxRetries: 0 });
    await expect(
      provider.generateImage({
        profile: 'CHARACTER',
        prompt: 'blank',
        width: 64,
        height: 64,
      }),
    ).rejects.toThrow(/too small|blank|near-black/i);
  });
});

describe('assertValidNvidiaImageBytes', () => {
  it('throws NvidiaInvalidImagePayloadError for tiny buffers', () => {
    expect(() => assertValidNvidiaImageBytes(Buffer.alloc(64))).toThrow(NvidiaInvalidImagePayloadError);
  });
});
