import { describe, it, expect } from 'vitest';
import { ImageProviderRegistry, explainImageProviderRouting } from './image-router.js';
import type { ImageGenerator, ImageGenRequest, ImageGenResult } from './types/image-gen.js';

class MockImageGenerator implements ImageGenerator {
  callCount = 0;

  constructor(
    public id: string,
    private readonly healthy: boolean,
  ) {}

  async checkHealth(): Promise<boolean> {
    return this.healthy;
  }

  async generateImage(_request: ImageGenRequest): Promise<ImageGenResult> {
    this.callCount++;
    return { image: Buffer.from('fake'), provider: this.id, modelId: this.id, seed: 1, fallbackGenerated: false };
  }
}

describe('ImageProviderRegistry', () => {
  it('selects the highest-priority healthy candidate', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({ provider: new MockImageGenerator('low', true), local: true, priority: 10 });
    registry.register({ provider: new MockImageGenerator('high', true), local: true, priority: 90 });

    const result = await registry.selectHealthy();

    expect(result.generator?.id).toBe('high');
  });

  it('falls through to the next candidate when the highest-priority one is unhealthy', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({ provider: new MockImageGenerator('primary', false), local: true, priority: 90 });
    registry.register({ provider: new MockImageGenerator('secondary', true), local: true, priority: 50 });

    const result = await registry.selectHealthy();

    expect(result.generator?.id).toBe('secondary');
    expect(result.warnings.some((w) => w.startsWith('primary:'))).toBe(true);
  });

  it('returns null (not a throw) when every registered candidate is unhealthy, so the caller can fall back to procedural generation', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({ provider: new MockImageGenerator('a', false), local: true, priority: 90 });
    registry.register({ provider: new MockImageGenerator('b', false), local: true, priority: 50 });

    const result = await registry.selectHealthy();

    expect(result.generator).toBeNull();
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/^a:/);
    expect(result.warnings[1]).toMatch(/^b:/);
    expect(result.fallbackDepth).toBe(2);
    expect(result.fallbackReason).toMatch(/procedural placeholder/i);
  });

  it('LOCAL_ONLY excludes a registered hosted (non-local) provider', async () => {
    const registry = new ImageProviderRegistry();
    const hosted = new MockImageGenerator('hosted', true);
    const local = new MockImageGenerator('local', true);
    registry.register({ provider: hosted, local: false, priority: 100 });
    registry.register({ provider: local, local: true, priority: 1 });

    const result = await registry.selectHealthy({ mode: 'LOCAL_ONLY' });

    expect(result.generator?.id).toBe('local');
  });

  it('LOW_RESOURCE prefers remote over higher-priority local', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('comfyui', true),
      local: true,
      priority: 90,
    });
    registry.register({
      provider: new MockImageGenerator('nvidia-image', true),
      local: false,
      priority: 88,
    });

    const result = await registry.selectHealthy({ hardwareProfile: 'LOW_RESOURCE' });
    expect(result.generator?.id).toBe('nvidia-image');
  });

  it('without LOW_RESOURCE, higher priority local still wins', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('comfyui', true),
      local: true,
      priority: 90,
    });
    registry.register({
      provider: new MockImageGenerator('nvidia-image', true),
      local: false,
      priority: 88,
    });

    const result = await registry.selectHealthy({ hardwareProfile: 'BALANCED' });
    expect(result.generator?.id).toBe('comfyui');
  });

  it('without a mode constraint, a higher-priority hosted provider is still eligible', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({ provider: new MockImageGenerator('hosted', true), local: false, priority: 100 });
    registry.register({ provider: new MockImageGenerator('local', true), local: true, priority: 1 });

    const result = await registry.selectHealthy();

    expect(result.generator?.id).toBe('hosted');
  });

  it('with no registered candidates, returns null immediately with no warnings', async () => {
    const registry = new ImageProviderRegistry();
    const result = await registry.selectHealthy();

    expect(result.generator).toBeNull();
    expect(result.warnings).toEqual([]);
  });
});

describe('explainImageProviderRouting', () => {
  it('lists unhealthy providers as rejected with health + locality reasons and marks degradedFallback', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({ provider: new MockImageGenerator('comfyui', false), local: true, priority: 90 });
    registry.register({ provider: new MockImageGenerator('nvidia-image', false), local: false, priority: 88 });

    const explanation = await explainImageProviderRouting(registry, {
      hardware: { profile: 'mid', ramMb: 16000, vramMb: 8000 },
    });

    expect(explanation.candidates).toHaveLength(0);
    expect(explanation.degradedFallback).toBe(true);
    expect(explanation.rejected.map((r) => r.provider).sort()).toEqual(['comfyui', 'nvidia-image']);
    expect(explanation.rejected.every((r) => r.reasons.some((x) => /health/i.test(x)))).toBe(true);
    expect(explanation.rejected.some((r) => r.reasons.some((x) => /VRAM N\/A/i.test(x)))).toBe(true);
    expect(explanation.hardware?.note).toMatch(/remote/i);
  });

  it('accepts a healthy provider as selected with score and accept reasons', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({ provider: new MockImageGenerator('diffusers', true), local: true, priority: 85 });

    const explanation = await explainImageProviderRouting(registry);
    expect(explanation.degradedFallback).toBe(false);
    expect(explanation.selected?.provider).toBe('diffusers');
    expect(explanation.candidates[0]?.score).toBeGreaterThan(0);
    expect(explanation.candidates[0]?.reasons.some((r) => /local runtime/i.test(r))).toBe(true);
  });
});

describe('VRAM-aware image routing', () => {
  it('skips a local GPU workflow that exceeds total VRAM and falls back to remote', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('qwen-image-edit', true),
      local: true,
      priority: 95,
      estimatedVramMb: 16384,
    });
    registry.register({
      provider: new MockImageGenerator('nvidia-image', true),
      local: false,
      priority: 88,
    });

    const result = await registry.selectHealthy({
      hardware: { profile: 'BALANCED', ramMb: 16384, vramMb: 8151, freeVramMb: 7420 },
    });

    expect(result.generator?.id).toBe('nvidia-image');
    expect(result.warnings.some((w) => w.includes('INSUFFICIENT_VRAM'))).toBe(true);
  });

  it('keeps a local GPU workflow that fits the 8 GB budget', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('comfyui', true),
      local: true,
      priority: 90,
      estimatedVramMb: 6144,
    });
    registry.register({
      provider: new MockImageGenerator('nvidia-image', true),
      local: false,
      priority: 88,
    });

    const result = await registry.selectHealthy({
      hardware: { profile: 'BALANCED', ramMb: 16384, vramMb: 8151, freeVramMb: 7420 },
      qualityProfile: 'BALANCED',
    });

    expect(result.generator?.id).toBe('comfyui');
  });

  it('never VRAM-filters a remote provider', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('nvidia-image', true),
      local: false,
      priority: 10,
      estimatedVramMb: 24000,
    });

    const result = await registry.selectHealthy({
      hardware: { profile: 'BALANCED', ramMb: 16384, vramMb: 8151 },
    });
    expect(result.generator?.id).toBe('nvidia-image');
  });

  it('DRAFT prefers the faster local provider when both fit', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('quality-local', true),
      local: true,
      priority: 90,
      qualityScore: 95,
      speedScore: 30,
      estimatedVramMb: 4096,
    });
    registry.register({
      provider: new MockImageGenerator('fast-local', true),
      local: true,
      priority: 80,
      qualityScore: 50,
      speedScore: 95,
      estimatedVramMb: 2048,
    });

    const result = await registry.selectHealthy({
      hardware: { profile: 'BALANCED', ramMb: 16384, vramMb: 8151, freeVramMb: 7000 },
      qualityProfile: 'DRAFT',
    });
    expect(result.generator?.id).toBe('fast-local');
  });
});
