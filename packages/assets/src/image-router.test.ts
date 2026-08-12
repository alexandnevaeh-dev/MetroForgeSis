import { describe, it, expect } from 'vitest';
import { ImageProviderRegistry } from './image-router.js';
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
    expect(result.warnings).toContain('primary unavailable');
  });

  it('returns null (not a throw) when every registered candidate is unhealthy, so the caller can fall back to procedural generation', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({ provider: new MockImageGenerator('a', false), local: true, priority: 90 });
    registry.register({ provider: new MockImageGenerator('b', false), local: true, priority: 50 });

    const result = await registry.selectHealthy();

    expect(result.generator).toBeNull();
    expect(result.warnings).toEqual(['a unavailable', 'b unavailable']);
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
