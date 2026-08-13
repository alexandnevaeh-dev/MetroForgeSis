import { describe, it, expect } from 'vitest';
import { GenerationRouter, createGenerationRouter } from './generation-router.js';
import { CapabilityRouter, FallbackManager, ProviderRegistry, ModelRegistry } from './registry.js';
import type { AICapability, TextGenerationProvider, TextGenerationRequest } from './types.js';

class MockProvider implements TextGenerationProvider {
  local: boolean;
  enabled = true;
  costClass: 'free' | 'low' | 'medium' | 'high' = 'free';
  license = 'test';
  commercialUse?: 'allowed' | 'restricted' | 'unknown';
  capabilities: AICapability[];
  health: 'healthy' | 'degraded' | 'unavailable' = 'healthy';
  priority: number;
  private readonly response: string;
  private readonly shouldThrow: boolean;
  callCount = 0;

  constructor(
    public id: string,
    public name: string,
    opts: {
      local?: boolean;
      priority?: number;
      capabilities?: AICapability[];
      response?: string;
      throws?: boolean;
      commercialUse?: 'allowed' | 'restricted' | 'unknown';
    } = {},
  ) {
    // Defaults to local:true so tests not specifically about LOCAL_ONLY exclusion aren't
    // silently filtered out by generate()'s own LOCAL_ONLY default mode.
    this.local = opts.local ?? true;
    this.priority = opts.priority ?? 50;
    this.capabilities = opts.capabilities ?? ['text_generation', 'json_generation'];
    this.response = opts.response ?? 'mock response';
    this.shouldThrow = opts.throws ?? false;
    this.commercialUse = opts.commercialUse;
  }

  async initialize(): Promise<void> {}
  async checkHealth() {
    return this.health;
  }
  async listModels(): Promise<string[]> {
    return [this.id];
  }
  async generateText(_request: TextGenerationRequest) {
    this.callCount++;
    if (this.shouldThrow) throw new Error(`${this.id} failed`);
    return { text: this.response, model: this.id, provider: this.id, durationMs: 1 };
  }
}

function buildRouter(providers: TextGenerationProvider[]): GenerationRouter {
  const registry = new ProviderRegistry();
  for (const p of providers) registry.register(p);
  const capabilityRouter = new CapabilityRouter(registry, new ModelRegistry());
  const fallback = new FallbackManager(capabilityRouter);
  return createGenerationRouter(capabilityRouter, fallback);
}

describe('GenerationRouter — capability mapping', () => {
  it('routes JSON_GENERATION to a registered provider and returns its text', async () => {
    const local = new MockProvider('ollama', 'Ollama', { local: true, response: '{"ok":true}' });
    const router = buildRouter([local]);

    const result = await router.generate({
      capability: 'JSON_GENERATION',
      prompt: 'test',
      mode: 'LOCAL_ONLY',
    });

    expect(result.result).toBe('{"ok":true}');
    expect(result.provider).toBe('ollama');
    expect(local.callCount).toBe(1);
  });

  it('throws CAPABILITY_MISMATCH for a capability with no text-provider mapping', async () => {
    const router = buildRouter([new MockProvider('ollama', 'Ollama', { local: true })]);

    await expect(
      router.generate({ capability: 'IMAGE_GENERATION', prompt: 'test' }),
    ).rejects.toMatchObject({ reason: 'CAPABILITY_MISMATCH' });
  });

  it('throws CAPABILITY_MISMATCH when no provider is registered at all', async () => {
    const router = buildRouter([]);

    await expect(
      router.generate({ capability: 'JSON_GENERATION', prompt: 'test' }),
    ).rejects.toMatchObject({ reason: 'CAPABILITY_MISMATCH' });
  });
});

describe('GenerationRouter — mode constraints', () => {
  it('LOCAL_ONLY never selects a hosted (non-local) provider', async () => {
    const hosted = new MockProvider('nvidia', 'NVIDIA NIM', { local: false, priority: 90 });
    const local = new MockProvider('ollama', 'Ollama', { local: true, priority: 10 });
    const router = buildRouter([hosted, local]);

    const result = await router.generate({
      capability: 'JSON_GENERATION',
      prompt: 'test',
      mode: 'LOCAL_ONLY',
    });

    expect(result.provider).toBe('ollama');
    expect(hosted.callCount).toBe(0);
  });

  it('LOCAL_ONLY fails outright if only hosted providers are registered', async () => {
    const hosted = new MockProvider('nvidia', 'NVIDIA NIM', { local: false });
    const router = buildRouter([hosted]);

    await expect(
      router.generate({ capability: 'JSON_GENERATION', prompt: 'test', mode: 'LOCAL_ONLY' }),
    ).rejects.toMatchObject({ reason: 'CAPABILITY_MISMATCH' });
    expect(hosted.callCount).toBe(0);
  });

  it('FREE_ONLY excludes a paid (non-free) provider', async () => {
    const paid = new MockProvider('paid-provider', 'Paid');
    paid.costClass = 'medium';
    const free = new MockProvider('free-provider', 'Free', { priority: 10 });
    const router = buildRouter([paid, free]);

    const result = await router.generate({
      capability: 'JSON_GENERATION',
      prompt: 'test',
      mode: 'FREE_ONLY',
    });

    expect(result.provider).toBe('free-provider');
    expect(paid.callCount).toBe(0);
  });

  it('COMMERCIAL_SAFE excludes providers with commercialUse=unknown', async () => {
    const unknown = new MockProvider('unknown-license', 'Unknown', {
      local: true,
      priority: 100,
      commercialUse: 'unknown',
    });
    const safe = new MockProvider('safe-license', 'Safe', {
      local: true,
      priority: 10,
      commercialUse: 'allowed',
    });
    const router = buildRouter([unknown, safe]);

    const result = await router.generate({
      capability: 'JSON_GENERATION',
      prompt: 'test',
      mode: 'COMMERCIAL_SAFE',
    });

    expect(result.provider).toBe('safe-license');
    expect(unknown.callCount).toBe(0);
  });

  it('NVIDIA_ONLY selects only the nvidia provider', async () => {
    const nvidia = new MockProvider('nvidia', 'NVIDIA NIM', { local: false, priority: 90 });
    const ollama = new MockProvider('ollama', 'Ollama', { local: true, priority: 10 });
    const router = buildRouter([nvidia, ollama]);

    const result = await router.generate({
      capability: 'JSON_GENERATION',
      prompt: 'test',
      mode: 'NVIDIA_ONLY',
    });

    expect(result.provider).toBe('nvidia');
    expect(ollama.callCount).toBe(0);
  });

  it('OFFLINE behaves like LOCAL_ONLY for provider selection', async () => {
    const hosted = new MockProvider('nvidia', 'NVIDIA NIM', { local: false, priority: 90 });
    const local = new MockProvider('ollama', 'Ollama', { local: true, priority: 10 });
    const router = buildRouter([hosted, local]);

    const result = await router.generate({
      capability: 'JSON_GENERATION',
      prompt: 'test',
      mode: 'OFFLINE',
    });

    expect(result.provider).toBe('ollama');
    expect(hosted.callCount).toBe(0);
  });

  it('a disabled provider is never selected as a candidate', async () => {
    const disabled = new MockProvider('disabled', 'Disabled', { priority: 100 });
    disabled.enabled = false;
    const enabled = new MockProvider('enabled', 'Enabled', { priority: 1 });
    const router = buildRouter([disabled, enabled]);

    const result = await router.generate({ capability: 'JSON_GENERATION', prompt: 'test' });

    expect(result.provider).toBe('enabled');
    expect(disabled.callCount).toBe(0);
  });
});

describe('GenerationRouter — fallback behavior', () => {
  it('falls back to the next candidate when the highest-priority provider fails', async () => {
    const failing = new MockProvider('failing', 'Failing', { priority: 100, throws: true });
    const working = new MockProvider('working', 'Working', { priority: 50, response: 'ok' });
    const router = buildRouter([failing, working]);

    const result = await router.generate({ capability: 'JSON_GENERATION', prompt: 'test' });

    expect(result.result).toBe('ok');
    expect(result.provider).toBe('working');
    expect(failing.callCount).toBe(1);
    expect(working.callCount).toBe(1);
  });

  it('throws GENERATION_FAILED when every candidate fails', async () => {
    const a = new MockProvider('a', 'A', { throws: true, priority: 2 });
    const b = new MockProvider('b', 'B', { throws: true, priority: 1 });
    const router = buildRouter([a, b]);

    await expect(
      router.generate({ capability: 'JSON_GENERATION', prompt: 'test' }),
    ).rejects.toMatchObject({ reason: 'GENERATION_FAILED' });
    expect(a.callCount).toBe(1);
    expect(b.callCount).toBe(1);
  });

  it('prefers higher-priority providers when multiple are viable', async () => {
    const low = new MockProvider('low', 'Low', { priority: 10, response: 'low' });
    const high = new MockProvider('high', 'High', { priority: 90, response: 'high' });
    const router = buildRouter([low, high]);

    const result = await router.generate({ capability: 'JSON_GENERATION', prompt: 'test' });

    expect(result.provider).toBe('high');
    expect(low.callCount).toBe(0);
  });
});
