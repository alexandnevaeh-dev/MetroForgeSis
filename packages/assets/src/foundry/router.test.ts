import { describe, it, expect } from 'vitest';
import { ImageProviderRegistry } from '../image-router.js';
import type { ImageGenerator, ImageGenRequest, ImageGenResult } from '../types/image-gen.js';

class MockImageGenerator implements ImageGenerator {
  constructor(
    public id: string,
    private readonly healthy: boolean,
  ) {}
  async checkHealth(): Promise<boolean> {
    return this.healthy;
  }
  async generateImage(_request: ImageGenRequest): Promise<ImageGenResult> {
    return { image: Buffer.from('fake'), provider: this.id, modelId: this.id, seed: 1, fallbackGenerated: false };
  }
}

describe('ImageProviderRegistry foundry modes', () => {
  it('FREE_ONLY rejects paid and credit providers', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('stability', true),
      local: false,
      priority: 100,
      costClass: 'paid',
    });
    registry.register({
      provider: new MockImageGenerator('nvidia-image', true),
      local: false,
      priority: 90,
      costClass: 'credit',
      family: 'nvidia',
    });
    registry.register({
      provider: new MockImageGenerator('kenney', true),
      local: true,
      priority: 10,
      costClass: 'free',
    });
    const result = await registry.selectHealthy({ mode: 'FREE_ONLY' });
    expect(result.generator?.id).toBe('kenney');
  });

  it('LOCAL_ONLY still rejects remote after foundry scoring fields', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('stability', true),
      local: false,
      priority: 100,
      costClass: 'paid',
    });
    registry.register({
      provider: new MockImageGenerator('comfyui', true),
      local: true,
      priority: 1,
      costClass: 'local',
    });
    const result = await registry.selectHealthy({ mode: 'LOCAL_ONLY' });
    expect(result.generator?.id).toBe('comfyui');
  });

  it('NVIDIA_ONLY keeps only nvidia family even if something else has higher priority', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('stability', true),
      local: false,
      priority: 100,
      costClass: 'paid',
    });
    registry.register({
      provider: new MockImageGenerator('nvidia-image', true),
      local: false,
      priority: 10,
      costClass: 'credit',
      family: 'nvidia',
    });
    const result = await registry.selectHealthy({ mode: 'NVIDIA_ONLY' });
    expect(result.generator?.id).toBe('nvidia-image');
  });

  it('LOWEST_COST prefers free over paid even when paid has higher priority', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockImageGenerator('stability', true),
      local: false,
      priority: 100,
      costClass: 'paid',
    });
    registry.register({
      provider: new MockImageGenerator('kenney', true),
      local: true,
      priority: 1,
      costClass: 'free',
    });
    const result = await registry.selectHealthy({ mode: 'LOWEST_COST' });
    expect(result.generator?.id).toBe('kenney');
  });
});
