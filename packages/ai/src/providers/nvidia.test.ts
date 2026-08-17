import { describe, it, expect, vi, afterEach } from 'vitest';
import { NvidiaProvider, NvidiaProviderError } from './nvidia.js';
import { CapabilityRouter, ProviderRegistry, ModelRegistry } from '../registry.js';

const FAKE_KEY = 'nvapi-THIS_IS_A_FAKE_TEST_KEY_1234567890';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NvidiaProvider — configuration', () => {
  it('is disabled with no API key configured', () => {
    const provider = new NvidiaProvider({ apiKey: undefined, baseUrl: '', defaultModel: '', enabled: true });
    expect(provider.enabled).toBe(false);
  });

  it('is enabled once an API key is present', () => {
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: '', defaultModel: '', enabled: true });
    expect(provider.enabled).toBe(true);
  });

  it('is never local', () => {
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: '', defaultModel: '', enabled: true });
    expect(provider.local).toBe(false);
  });

  it('rejects generation with no key configured, without ever calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new NvidiaProvider({ apiKey: undefined, baseUrl: 'https://x', defaultModel: 'm', enabled: true });

    await expect(provider.generateText({ prompt: 'hi' })).rejects.toThrow(NvidiaProviderError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('NvidiaProvider — request shape', () => {
  it('sends the Authorization Bearer header, correct URL, and model field', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: 'hello' } }] }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new NvidiaProvider({
      apiKey: FAKE_KEY,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      defaultModel: 'meta/llama-3.1-8b-instruct',
      enabled: true,
    });

    await provider.generateText({ prompt: 'Describe a Metroidvania boss' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${FAKE_KEY}`);
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('meta/llama-3.1-8b-instruct');
    expect(body.messages[0].content).toBe('Describe a Metroidvania boss');
  });

  it('parses a successful response into choices[0].message.content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'a real answer' } }] })),
    );
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: 'https://x', defaultModel: 'm', enabled: true });

    const result = await provider.generateText({ prompt: 'hi' });
    expect(result.text).toBe('a real answer');
    expect(result.provider).toBe('nvidia');
  });

  it('throws a typed NVIDIA_INVALID_RESPONSE error on a malformed body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ nonsense: true })));
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: 'https://x', defaultModel: 'm', enabled: true });

    await expect(provider.generateText({ prompt: 'hi' })).rejects.toMatchObject({
      code: 'NVIDIA_INVALID_RESPONSE',
    });
  });
});

describe('NvidiaProvider — error handling and retry policy', () => {
  it('does not retry on 401 and reports NVIDIA_AUTH_FAILED', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401));
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: 'https://x', defaultModel: 'm', enabled: true });

    await expect(provider.generateText({ prompt: 'hi' })).rejects.toMatchObject({
      code: 'NVIDIA_AUTH_FAILED',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 before giving up, and reports NVIDIA_RATE_LIMITED', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ error: 'rate limited' }, 429));
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new NvidiaProvider({
      apiKey: FAKE_KEY,
      baseUrl: 'https://x',
      defaultModel: 'm',
      enabled: true,
      maxRetries: 1,
    });

    await expect(provider.generateText({ prompt: 'hi' })).rejects.toMatchObject({
      code: 'NVIDIA_RATE_LIMITED',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2); // initial attempt + 1 retry
  }, 10000);

  it('retries on 500 and succeeds if a later attempt returns ok', async () => {
    let call = 0;
    const fetchSpy = vi.fn(async () => {
      call += 1;
      if (call === 1) return jsonResponse({ error: 'server error' }, 500);
      return jsonResponse({ choices: [{ message: { content: 'recovered' } }] });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new NvidiaProvider({
      apiKey: FAKE_KEY,
      baseUrl: 'https://x',
      defaultModel: 'm',
      enabled: true,
      maxRetries: 2,
    });

    const result = await provider.generateText({ prompt: 'hi' });
    expect(result.text).toBe('recovered');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  }, 10000);

  it('maps a fetch timeout to NVIDIA_TIMEOUT', async () => {
    const fetchSpy = vi.fn(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'TimeoutError';
      throw err;
    });
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new NvidiaProvider({
      apiKey: FAKE_KEY,
      baseUrl: 'https://x',
      defaultModel: 'm',
      enabled: true,
      maxRetries: 0,
    });

    await expect(provider.generateText({ prompt: 'hi' })).rejects.toMatchObject({
      code: 'NVIDIA_TIMEOUT',
    });
  });

  it('never leaks the raw API key into a thrown error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: `bad request for key ${FAKE_KEY}` }, 400)),
    );
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: 'https://x', defaultModel: 'm', enabled: true });

    try {
      await provider.generateText({ prompt: 'hi' });
      throw new Error('expected generateText to throw');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(FAKE_KEY);
    }
  });
});

describe('NvidiaProvider — routing constraints', () => {
  it('is excluded from LOCAL_ONLY candidate selection', () => {
    const registry = new ProviderRegistry();
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: 'https://x', defaultModel: 'm', enabled: true });
    registry.register(provider);
    const router = new CapabilityRouter(registry, new ModelRegistry());

    const candidates = router.getCandidates({
      task: 'game_dna',
      capability: 'json_generation',
      freeOnly: false,
      localOnly: true,
      qualityTarget: 'balanced',
    });

    expect(candidates.find((c) => c.id === 'nvidia')).toBeUndefined();
  });

  it('is included as a candidate under FREE_ONLY (its costClass is free)', () => {
    const registry = new ProviderRegistry();
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: 'https://x', defaultModel: 'm', enabled: true });
    provider.health = 'healthy';
    registry.register(provider);
    const router = new CapabilityRouter(registry, new ModelRegistry());

    const candidates = router.getCandidates({
      task: 'game_dna',
      capability: 'json_generation',
      freeOnly: true,
      localOnly: false,
      qualityTarget: 'balanced',
    });

    expect(candidates.find((c) => c.id === 'nvidia')).toBeDefined();
  });

  it('is skipped when a provider is disabled (no key)', () => {
    const registry = new ProviderRegistry();
    const provider = new NvidiaProvider({ apiKey: undefined, baseUrl: 'https://x', defaultModel: 'm', enabled: true });
    registry.register(provider); // registered, but .enabled is false — listEnabled() must skip it

    const router = new CapabilityRouter(registry, new ModelRegistry());
    const candidates = router.getCandidates({
      task: 'game_dna',
      capability: 'json_generation',
      freeOnly: false,
      localOnly: false,
      qualityTarget: 'balanced',
    });

    expect(candidates.find((c) => c.id === 'nvidia')).toBeUndefined();
  });
});

describe('NvidiaProvider — health', () => {
  it('reports unconfigured (no key) without making any network request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new NvidiaProvider({ apiKey: undefined, baseUrl: 'https://x', defaultModel: 'm', enabled: true });

    const details = await provider.getHealthDetails();
    expect(details.configured).toBe(false);
    expect(details.reachable).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports reachable when the models endpoint responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [] })));
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: 'https://x', defaultModel: 'm', enabled: true });

    const details = await provider.getHealthDetails();
    expect(details.configured).toBe(true);
    expect(details.reachable).toBe(true);
    expect(details.errorCode).toBeNull();
  });

  it('reports NVIDIA_AUTH_FAILED when the models endpoint rejects the key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401)));
    const provider = new NvidiaProvider({ apiKey: FAKE_KEY, baseUrl: 'https://x', defaultModel: 'm', enabled: true });

    const details = await provider.getHealthDetails();
    expect(details.reachable).toBe(false);
    expect(details.errorCode).toBe('NVIDIA_AUTH_FAILED');
  });
});
