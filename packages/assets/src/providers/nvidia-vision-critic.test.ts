import { describe, it, expect, vi, afterEach } from 'vitest';
import { NvidiaVisionCritic } from './nvidia-vision-critic.js';
import { generateProceduralSprite } from '../png.js';

const FAKE_KEY = 'nvapi-THIS_IS_A_FAKE_TEST_KEY_1234567890';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function samplePng() {
  return generateProceduralSprite({
    id: 'enemy',
    width: 16,
    height: 16,
    fill: [1, 2, 3, 255],
    shape: 'enemy',
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NvidiaVisionCritic — configuration', () => {
  it('reports nvidia-vision backend id', () => {
    const critic = new NvidiaVisionCritic({ apiKey: FAKE_KEY });
    expect(critic.backendId()).toBe('nvidia-vision');
  });

  it('is unavailable without an API key', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const critic = new NvidiaVisionCritic({ apiKey: undefined });
    expect(await critic.isAvailable()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('NvidiaVisionCritic — availability', () => {
  it('checks /models with Bearer auth', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    const critic = new NvidiaVisionCritic({
      apiKey: FAKE_KEY,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
    });
    expect(await critic.isAvailable()).toBe(true);

    expect(fetchSpy).toHaveBeenCalled();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_KEY}`);
  });
});

describe('NvidiaVisionCritic — critique', () => {
  it('falls back to deterministic critique without a key', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const critic = new NvidiaVisionCritic({ apiKey: undefined });
    const result = await critic.critique({ image: samplePng(), assetType: 'enemy' });
    expect(result.tags).toContain('deterministic-check');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends vision chat/completions with base64 image content', async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                passed: true,
                score: 88,
                issues: [],
                tags: ['clear-subject'],
                description: 'Good sprite',
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const critic = new NvidiaVisionCritic({
      apiKey: FAKE_KEY,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      modelId: 'meta/llama-3.2-11b-vision-instruct',
    });

    const png = samplePng();
    const result = await critic.critique({
      image: png,
      assetType: 'enemy',
      artDirection: 'dark pixel art',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalled();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('meta/llama-3.2-11b-vision-instruct');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content[0].type).toBe('text');
    expect(body.messages[0].content[1].type).toBe('image_url');
    expect(body.messages[0].content[1].image_url.url).toContain('data:image/png;base64,');

    expect(result.passed).toBe(true);
    expect(result.score).toBe(88);
    expect(result.tags).toContain('nvidia-vision');
    expect(result.tags).toContain('clear-subject');
  });

  it('falls back to deterministic critique on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'rate limited' }, 429)));
    const critic = new NvidiaVisionCritic({ apiKey: FAKE_KEY, baseUrl: 'https://x' });
    const result = await critic.critique({ image: samplePng(), assetType: 'boss' });
    expect(result.tags).toContain('deterministic-check');
  });
});
