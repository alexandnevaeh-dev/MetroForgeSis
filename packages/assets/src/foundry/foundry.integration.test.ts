import { describe, it, expect } from 'vitest';
import type { AssetRequest } from '@metroforge/schemas';
import { encodePng } from '../png.js';
import type { ImageGenerator, ImageGenRequest, ImageGenResult, ImageProviderHealthReport } from '../types/image-gen.js';
import { ImageProviderRegistry } from '../image-router.js';
import { AssetFoundry } from './foundry.js';
import { assertProductionComplete, emptyManifest, upsertManifestAsset } from './manifest.js';
import { AssetMissingError, ProviderUnavailableError } from './errors.js';

function spritePng(width = 32, height = 32): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = 30;
      rgba[i + 1] = 90;
      rgba[i + 2] = 170;
      rgba[i + 3] = x === 0 || y === 0 ? 0 : 255;
    }
  }
  return encodePng(width, height, rgba);
}

class MockProvider implements ImageGenerator {
  id: string;
  constructor(
    id: string,
    private readonly healthy: boolean,
  ) {
    this.id = id;
  }
  async checkHealth(): Promise<boolean> {
    return this.healthy;
  }
  async getHealthReport(): Promise<ImageProviderHealthReport> {
    return this.healthy
      ? { status: 'HEALTHY', reason: 'mock', latencyMs: 1 }
      : { status: 'UNAVAILABLE', reason: 'mock down', latencyMs: 1 };
  }
  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    if (!this.healthy) throw new Error('unhealthy');
    return {
      image: spritePng(request.width, request.height),
      provider: this.id,
      modelId: `${this.id}-model`,
      seed: request.seed ?? 1,
      fallbackGenerated: false,
      productionAllowed: true,
    };
  }
}

function request(overrides: Partial<AssetRequest> = {}): AssetRequest {
  return {
    id: 'prop_crate',
    assetType: 'prop',
    prompt: 'wooden crate',
    style: { visualStyle: 'hand-painted gothic insectoid 2D', pixelArt: true },
    dimensions: { width: 32, height: 32 },
    output: { engine: 'godot', transparentBackground: true },
    constraints: { commercialUseRequired: false, freeOnly: false },
    consistency: {},
    preferRetrieved: false,
    ...overrides,
  };
}

describe('AssetFoundry integration', () => {
  it('AssetRequest → Router → Mock Provider → Compiler → QA → Manifest', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockProvider('mock-primary', false),
      local: false,
      priority: 90,
      costClass: 'paid',
      commercialUse: 'allowed',
      license: 'Apache-2.0',
      capabilities: ['image-generation'],
    });
    registry.register({
      provider: new MockProvider('mock-fallback', true),
      local: true,
      priority: 40,
      costClass: 'local',
      commercialUse: 'allowed',
      license: 'MIT',
      capabilities: ['image-generation'],
    });
    const foundry = new AssetFoundry({ registry, completionMode: 'production' });
    foundry.expectAssets(['prop_crate']);
    const result = await foundry.fulfill(request());
    expect(result.provider).toBe('mock-fallback');
    expect(result.fallbackDepth).toBeGreaterThanOrEqual(0);
    expect(result.placeholder).toBe(false);
    expect(result.godotPath).toContain('assets/props/');
    expect(result.qaScore).toBeGreaterThan(0);
    foundry.finishProduction();
    const manifest = foundry.getManifest();
    expect(manifest.validated).toBe(1);
    expect(manifest.placeholders).toEqual([]);
  });

  it('free-only does not silently use a paid provider', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockProvider('stability', true),
      local: false,
      priority: 100,
      costClass: 'paid',
      commercialUse: 'allowed',
      capabilities: ['image-generation'],
    });
    const foundry = new AssetFoundry({ registry, completionMode: 'prototype' });
    await expect(
      foundry.fulfill(request({ constraints: { commercialUseRequired: false, freeOnly: true }, routingMode: 'free-only' })),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('production mode rejects remaining placeholders', () => {
    let manifest = emptyManifest('production', ['hero']);
    manifest = upsertManifestAsset(manifest, {
      id: 'hero',
      assetType: 'player',
      provider: 'procedural',
      license: 'n/a',
      qaPassed: true,
      qaScore: 1,
      sourceType: 'procedural',
      placeholder: true,
      validated: false,
    });
    expect(() => assertProductionComplete(manifest)).toThrow(AssetMissingError);
  });
});
