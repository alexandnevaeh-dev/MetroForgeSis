import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompatibleChatProvider } from './compatible-chat.js';
import { bootstrapProviders } from '../bootstrap.js';

afterEach(() => vi.unstubAllGlobals());
const create = (extra = {}) =>
  new CompatibleChatProvider({
    id: 'lmstudio',
    name: 'LM Studio',
    local: true,
    baseUrl: 'http://127.0.0.1:1234/v1',
    license: 'Model-dependent',
    ...extra,
  });
describe('local and hosted chat integrations', () => {
  it('reads Together’s array response and excludes explicitly non-chat models', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify([
              { id: 'chat-model', type: 'chat' },
              { id: 'image-model', type: 'image' },
              { id: 'voice-model', type: 'audio' },
              { id: 'base-model', type: 'language' },
              { id: 'vector-model', type: 'embedding' },
              { id: 'chat-model', type: 'chat' },
              null,
            ]),
          ),
        ),
    );
    expect(
      await create({
        id: 'together',
        local: false,
        baseUrl: 'https://api.together.ai/v1',
        apiKey: 'synthetic',
      }).listModels(),
    ).toEqual(['chat-model']);
  });
  it('honors Mistral chat capability and archived flags without assuming model type from its name', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              data: [
                { id: 'chat', capabilities: { completion_chat: true } },
                { id: 'ocr', capabilities: { completion_chat: false } },
                { id: 'old-chat', archived: true },
                { id: 1 },
                {},
              ],
            }),
          ),
        ),
    );
    expect(await create({ id: 'mistral' }).listModels()).toEqual(['chat']);
  });
  it('surfaces a malformed model list instead of reporting an empty healthy discovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"unexpected":true}')));
    await expect(create().listModels()).rejects.toThrow('invalid model list');
  });
  it('discovers a local chat model, excludes embeddings, and generates through its actual request contract', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'text-embedding' }, { id: 'loaded-chat' }] })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"title":"Castle"}' } }],
            usage: { total_tokens: 24 },
          }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const provider = create();
    await provider.initialize();
    expect(provider.health).toBe('healthy');
    const result = await provider.generateText({
      prompt: 'Plan a castle',
      systemPrompt: 'Return JSON',
      jsonMode: true,
      maxTokens: 900,
    });
    expect(result).toMatchObject({
      text: '{"title":"Castle"}',
      model: 'loaded-chat',
      provider: 'lmstudio',
      tokensUsed: 24,
    });
    const [url, init] = fetch.mock.calls[1]!;
    expect(url).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.redirect).toBe('error');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'loaded-chat',
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return JSON' },
        { role: 'user', content: 'Plan a castle' },
      ],
    });
  });
  it('supports optional local-server tokens without claiming they are required', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
      );
    vi.stubGlobal('fetch', fetch);
    await create({ apiKey: 'test-token', model: 'loaded-chat' }).generateText({ prompt: 'hi' });
    expect(fetch.mock.calls[0]![1].headers.Authorization).toBe('Bearer test-token');
  });
  it('does not misreport an empty or unavailable server as healthy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('{"data":[]}')),
    );
    const provider = create();
    await provider.initialize();
    expect(provider.health).toBe('degraded');
    await expect(provider.generateText({ prompt: 'hi' })).rejects.toThrow('Load a chat model');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })),
    );
    await provider.initialize();
    expect(provider.health).toBe('unavailable');
  });
  it('keeps hosted providers disabled without credentials and does not probe them', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const provider = create({
      local: false,
      id: 'together',
      name: 'Together AI',
      baseUrl: 'https://api.together.ai/v1',
    });
    await provider.initialize();
    expect(provider.enabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    await expect(provider.generateText({ prompt: 'hi' })).rejects.toThrow('needs an API key');
  });
  it('uses the configured hosted model and never echoes API response errors or keys', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('test-token', { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    const provider = create({
      local: false,
      id: 'cerebras',
      name: 'Cerebras',
      baseUrl: 'https://api.cerebras.ai/v1',
      apiKey: 'test-token',
      model: 'chosen-model',
    });
    await expect(provider.generateText({ prompt: 'hi' })).rejects.toThrow('HTTP 429');
    expect(JSON.parse(fetch.mock.calls[0]![1].body).model).toBe('chosen-model');
    expect(provider.costClass).toBe('medium');
  });
  it('rejects remote addresses disguised as local and credential-bearing URLs', () => {
    for (const baseUrl of [
      'http://example.com/v1',
      'http://127.0.0.1.example.com/v1',
      'http://user:password@localhost:1234/v1',
      'file:///E:/models',
      'http://localhost:1234/v1?key=secret',
    ])
      expect(() => create({ baseUrl })).toThrow('valid provider URL');
  });
  it('respects cancellation before sending a request and rejects empty completions', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"choices":[]}'));
    vi.stubGlobal('fetch', fetch);
    const provider = create({ model: 'loaded-chat' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.generateText({ prompt: 'hi', signal: controller.signal }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    await expect(provider.generateText({ prompt: 'hi' })).rejects.toThrow('returned no text');
  });
  it('registers new providers in the generation router and preserves mode and enable filters', async () => {
    const { registry, router } = await bootstrapProviders({
      mode: 'HYBRID_FREE',
      ollamaBaseUrl: 'http://localhost:11434',
      skipHealthChecks: true,
      togetherApiKey: 'test',
      cerebrasApiKey: 'test',
      mistralApiKey: 'test',
      providerEnabled: { ollama: false, cerebras: false },
    });
    expect(registry.get('lmstudio')?.local).toBe(true);
    expect(registry.get('together')?.enabled).toBe(true);
    const context = {
      task: 'plan',
      capability: 'json_generation' as const,
      freeOnly: false,
      localOnly: false,
      qualityTarget: 'balanced' as const,
    };
    const candidates = router.getCandidates(context).map((p) => p.id);
    expect(candidates).toContain('mistral');
    expect(candidates).toContain('together');
    expect(candidates).not.toContain('cerebras');
    expect(router.getCandidates({ ...context, localOnly: true }).every((p) => p.local)).toBe(true);
    expect(
      router.getCandidates({ ...context, freeOnly: true }).some((p) => p.id === 'together'),
    ).toBe(false);
  });
});
