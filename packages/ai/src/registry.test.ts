import { describe, it, expect } from 'vitest';
import { ProviderRegistry, CapabilityRouter, ModelRegistry } from './registry.js';
import type { AICapability, ProviderHealth, TextGenerationProvider, TextGenerationRequest } from './types.js';

class MockProvider implements TextGenerationProvider {
  local = true;
  enabled = true;
  costClass: 'free' | 'low' | 'medium' | 'high' = 'free';
  license = 'test';
  capabilities: AICapability[] = ['text_generation'];

  constructor(
    public id: string,
    public name: string,
    public priority: number,
    public health: ProviderHealth,
  ) {}

  async initialize(): Promise<void> {}
  async checkHealth(): Promise<ProviderHealth> {
    return this.health;
  }
  async listModels(): Promise<string[]> {
    return [];
  }
  async generateText(_request: TextGenerationRequest) {
    return { text: '', model: this.id, provider: this.id, durationMs: 0 };
  }
}

function baseContext() {
  return {
    task: 'test',
    capability: 'text_generation' as const,
    freeOnly: false,
    localOnly: false,
    qualityTarget: 'balanced' as const,
  };
}

describe('CapabilityRouter — health-aware ranking', () => {
  it('ranks a healthy lower-priority provider above an unavailable higher-priority one', () => {
    const registry = new ProviderRegistry();
    const highPriorityUnavailable = new MockProvider('a', 'A', 100, 'unavailable');
    const lowPriorityHealthy = new MockProvider('b', 'B', 10, 'healthy');
    registry.register(highPriorityUnavailable);
    registry.register(lowPriorityHealthy);

    const router = new CapabilityRouter(registry, new ModelRegistry());
    const candidates = router.getCandidates(baseContext());

    expect(candidates.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('never excludes a degraded or unavailable provider — only reorders it', () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider('a', 'A', 100, 'unavailable'));
    const router = new CapabilityRouter(registry, new ModelRegistry());

    expect(router.getCandidates(baseContext()).map((p) => p.id)).toEqual(['a']);
  });

  it('falls back to priority ordering within the same health tier', () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider('low', 'Low', 10, 'healthy'));
    registry.register(new MockProvider('high', 'High', 90, 'healthy'));
    const router = new CapabilityRouter(registry, new ModelRegistry());

    expect(router.getCandidates(baseContext()).map((p) => p.id)).toEqual(['high', 'low']);
  });

  it('re-ranks live: candidate order tracks provider.health without any cached/stale state', () => {
    const registry = new ProviderRegistry();
    const flaky = new MockProvider('flaky', 'Flaky', 100, 'unavailable');
    const steady = new MockProvider('steady', 'Steady', 50, 'healthy');
    registry.register(flaky);
    registry.register(steady);
    const router = new CapabilityRouter(registry, new ModelRegistry());

    expect(router.getCandidates(baseContext()).map((p) => p.id)).toEqual(['steady', 'flaky']);

    flaky.health = 'healthy';
    expect(router.getCandidates(baseContext()).map((p) => p.id)).toEqual(['flaky', 'steady']);
  });
});
