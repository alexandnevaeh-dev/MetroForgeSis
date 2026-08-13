import { describe, it, expect, vi, afterEach } from 'vitest';
import { createVisionCritic } from './vision-critic-factory.js';
import { generateProceduralSprite } from './png.js';

const FAKE_KEY = 'nvapi-THIS_IS_A_FAKE_TEST_KEY_1234567890';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createVisionCritic', () => {
  it('falls back to deterministic critique when no backends configured', async () => {
    const critic = createVisionCritic({});
    expect(await critic.isAvailable()).toBe(false);
    const png = generateProceduralSprite({
      id: 'x',
      width: 16,
      height: 16,
      fill: [1, 2, 3, 255],
      shape: 'enemy',
    });
    const result = await critic.critique({ image: png, assetType: 'enemy' });
    expect(result.tags).toContain('deterministic-check');
  });

  it('prefers Ollama when both Ollama and NVIDIA are configured and Ollama is reachable', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return jsonResponse({ models: [{ name: 'llava:7b' }] });
      }
      return jsonResponse({
        message: {
          content: JSON.stringify({
            passed: true,
            score: 90,
            issues: [],
            tags: ['ollama'],
            description: 'ok',
          }),
        },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const critic = createVisionCritic({
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      nvidiaApiKey: FAKE_KEY,
    });
    expect(critic.backendId()).toBe('ollama-vision+nvidia-vision');
    expect(await critic.isAvailable()).toBe(true);

    const png = generateProceduralSprite({
      id: 'x',
      width: 16,
      height: 16,
      fill: [1, 2, 3, 255],
      shape: 'enemy',
    });
    const result = await critic.critique({ image: png, assetType: 'enemy' });
    expect(result.tags).toContain('ollama');
    expect(fetchSpy.mock.calls[0]![0]).toContain('/api/tags');
  });

  it('uses NVIDIA vision when Ollama is absent and NVIDIA key is configured', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.endsWith('/models')) {
        return jsonResponse({ data: [] });
      }
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                passed: true,
                score: 82,
                issues: [],
                tags: ['hosted'],
                description: 'ok',
              }),
            },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const critic = createVisionCritic({ nvidiaApiKey: FAKE_KEY });
    expect(critic.backendId()).toBe('nvidia-vision');
    expect(await critic.isAvailable()).toBe(true);

    const png = generateProceduralSprite({
      id: 'x',
      width: 16,
      height: 16,
      fill: [1, 2, 3, 255],
      shape: 'enemy',
    });
    const result = await critic.critique({ image: png, assetType: 'tile' });
    expect(result.tags).toContain('nvidia-vision');
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/chat/completions'))).toBe(true);
  });
});
