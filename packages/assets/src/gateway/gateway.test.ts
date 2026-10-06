import { describe, it, expect } from 'vitest';
import { GenerationCancelledError } from '@metroforge/shared';
import { encodePng } from '../png.js';
import type { ImageGenerator, ImageGenRequest, ImageGenResult, ImageProviderHealthReport } from '../types/image-gen.js';
import { ImageProviderRegistry } from '../image-router.js';
import { AssetFoundry } from '../foundry/foundry.js';
import {
  AuthenticationError,
  LicenseRejectedError,
  ProviderUnavailableError,
  RateLimitError,
} from '../foundry/errors.js';
import { classifyFailure, isFallbackEligible } from './classify-failure.js';
import { LegacyAssetGenerationGateway } from './legacy-gateway.js';
import { FoundryAssetGenerationGateway } from './foundry-gateway.js';
import { CompositeAssetGenerationGateway } from './composite-gateway.js';
import { createAssetGenerationGateway } from './index.js';
import type { AssetGenerationRequest } from './types.js';

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
  callCount = 0;
  constructor(
    id: string,
    private readonly healthy: boolean,
    private readonly failWith?: Error,
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
    this.callCount += 1;
    if (this.failWith) throw this.failWith;
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

function canonicalRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    id: 'player',
    assetType: 'player',
    path: 'assets/characters/player.png',
    prompt: 'a hero character, pixel art',
    width: 64,
    height: 64,
    seed: 42,
    visualStyle: 'HD pixel art',
    pixelArt: true,
    transparentBackground: true,
    commercialUseRequired: false,
    freeOnly: false,
    localOnly: false,
    ...overrides,
  };
}

describe('classifyFailure / isFallbackEligible', () => {
  it('classifies known Foundry error types', () => {
    expect(classifyFailure(new RateLimitError('slow down'))).toBe('rate-limited');
    expect(classifyFailure(new ProviderUnavailableError('down'))).toBe('provider-unavailable');
    expect(classifyFailure(new AuthenticationError('bad key'))).toBe('authentication');
    expect(classifyFailure(new LicenseRejectedError('no license'))).toBe('license-rejection');
    expect(classifyFailure(new GenerationCancelledError('user cancelled'))).toBe('cancelled');
  });

  it('classifies an unrecognized error as unknown', () => {
    expect(classifyFailure(new Error('something else'))).toBe('unknown');
  });

  it('never allows fallback for cancellation or license/policy rejection', () => {
    expect(isFallbackEligible('cancelled')).toBe(false);
    expect(isFallbackEligible('invalid-request')).toBe(false);
    expect(isFallbackEligible('policy-rejection')).toBe(false);
    expect(isFallbackEligible('license-rejection')).toBe(false);
  });

  it('allows fallback for transient/provider failures', () => {
    expect(isFallbackEligible('transient')).toBe(true);
    expect(isFallbackEligible('rate-limited')).toBe(true);
    expect(isFallbackEligible('provider-unavailable')).toBe(true);
    expect(isFallbackEligible('unknown')).toBe(true);
  });
});

describe('LegacyAssetGenerationGateway', () => {
  it('reports provider-unavailable, non-fallback-eligible when no provider is configured', async () => {
    const gateway = new LegacyAssetGenerationGateway(null);
    const outcome = await gateway.generate(canonicalRequest());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.backend).toBe('legacy');
      expect(outcome.failureClass).toBe('provider-unavailable');
    }
  });

  it('returns real bytes and provider/model on success', async () => {
    const gateway = new LegacyAssetGenerationGateway(new MockProvider('mock', true));
    const outcome = await gateway.generate(canonicalRequest());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.backend).toBe('legacy');
      expect(outcome.provider).toBe('mock');
      expect(outcome.modelId).toBe('mock-model');
      expect(outcome.buffer.length).toBeGreaterThan(0);
    }
  });

  it('classifies a thrown provider error and marks it fallback-eligible', async () => {
    const gateway = new LegacyAssetGenerationGateway(new MockProvider('mock', true, new RateLimitError('slow down')));
    const outcome = await gateway.generate(canonicalRequest());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failureClass).toBe('rate-limited');
      expect(outcome.fallbackEligible).toBe(true);
    }
  });
});

describe('FoundryAssetGenerationGateway', () => {
  it('maps a successful AssetFoundry.fulfill() result to the canonical outcome shape', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockProvider('mock-primary', true),
      local: true,
      priority: 90,
      costClass: 'local',
      commercialUse: 'allowed',
      license: 'MIT',
      capabilities: ['image-generation'],
    });
    const gateway = new FoundryAssetGenerationGateway(new AssetFoundry({ registry }));
    const outcome = await gateway.generate(canonicalRequest());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.backend).toBe('foundry');
      expect(outcome.provider).toBe('mock-primary');
      expect(outcome.qaScore).toBeGreaterThan(0);
      expect(outcome.license).toBeDefined();
      expect(outcome.provenance).toBeDefined();
      expect(outcome.transformations!.length).toBeGreaterThan(0);
    }
  });

  it('preserves an unknown commercial-use classification instead of promoting it to safe', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockProvider('mock-unknown-license', true),
      local: false,
      priority: 90,
      costClass: 'free',
      // no commercialUse declared — must not be inferred as 'allowed'
      capabilities: ['image-generation'],
    });
    const gateway = new FoundryAssetGenerationGateway(new AssetFoundry({ registry }));
    const outcome = await gateway.generate(canonicalRequest({ freeOnly: true }));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.license!.commercialUse).toBe(false);
      expect(outcome.license!.status).not.toBe('approved');
    }
  });

  it('classifies a Foundry failure (no eligible provider) honestly', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockProvider('mock-unhealthy', false),
      local: false,
      priority: 90,
      costClass: 'free',
      commercialUse: 'allowed',
      capabilities: ['image-generation'],
    });
    const gateway = new FoundryAssetGenerationGateway(new AssetFoundry({ registry }));
    const outcome = await gateway.generate(canonicalRequest());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.backend).toBe('foundry');
      expect(outcome.failureClass).toBe('provider-unavailable');
    }
  });

  it('propagates freeOnly so a paid-only registry yields no eligible candidate', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockProvider('paid-only', true),
      local: false,
      priority: 100,
      costClass: 'paid',
      commercialUse: 'allowed',
      capabilities: ['image-generation'],
    });
    const gateway = new FoundryAssetGenerationGateway(new AssetFoundry({ registry }));
    const outcome = await gateway.generate(canonicalRequest({ freeOnly: true }));
    expect(outcome.ok).toBe(false);
  });
});

describe('CompositeAssetGenerationGateway (foundry-with-legacy-fallback)', () => {
  it('uses Foundry when it succeeds, without touching legacy at all', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockProvider('foundry-healthy', true),
      local: true,
      priority: 90,
      costClass: 'local',
      commercialUse: 'allowed',
      capabilities: ['image-generation'],
    });
    const foundry = new FoundryAssetGenerationGateway(new AssetFoundry({ registry }));
    const legacyProvider = new MockProvider('legacy-provider', true);
    const legacy = new LegacyAssetGenerationGateway(legacyProvider);
    const gateway = new CompositeAssetGenerationGateway(foundry, legacy);

    const outcome = await gateway.generate(canonicalRequest());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.backend).toBe('foundry');
    expect(legacyProvider.callCount).toBe(0);
  });

  it('falls back to legacy on a fallback-eligible Foundry failure, and records why', async () => {
    const registry = new ImageProviderRegistry(); // empty — Foundry has no candidates
    const foundry = new FoundryAssetGenerationGateway(new AssetFoundry({ registry }));
    const legacy = new LegacyAssetGenerationGateway(new MockProvider('legacy-provider', true));
    const gateway = new CompositeAssetGenerationGateway(foundry, legacy);

    const outcome = await gateway.generate(canonicalRequest());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.backend).toBe('legacy');
      expect(outcome.provider).toBe('legacy-provider');
      expect(outcome.fallbackReason).toContain('foundry failed');
    }
  });

  it('does NOT fall back to legacy on a non-fallback-eligible failure (cancellation)', async () => {
    const registry = new ImageProviderRegistry();
    registry.register({
      provider: new MockProvider('foundry-cancels', true, new GenerationCancelledError('user cancelled')),
      local: true,
      priority: 90,
      costClass: 'local',
      commercialUse: 'allowed',
      capabilities: ['image-generation'],
    });
    const foundry = new FoundryAssetGenerationGateway(new AssetFoundry({ registry }));
    const legacyProvider = new MockProvider('legacy-provider', true);
    const legacy = new LegacyAssetGenerationGateway(legacyProvider);
    const gateway = new CompositeAssetGenerationGateway(foundry, legacy);

    const outcome = await gateway.generate(canonicalRequest());
    expect(outcome.ok).toBe(false);
    expect(legacyProvider.callCount).toBe(0);
  });

  it('surfaces the Foundry failure when the legacy fallback also fails', async () => {
    const registry = new ImageProviderRegistry();
    const foundry = new FoundryAssetGenerationGateway(new AssetFoundry({ registry }));
    const legacy = new LegacyAssetGenerationGateway(null);
    const gateway = new CompositeAssetGenerationGateway(foundry, legacy);

    const outcome = await gateway.generate(canonicalRequest());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.backend).toBe('foundry');
  });
});

describe('createAssetGenerationGateway', () => {
  it('legacy mode returns a LegacyAssetGenerationGateway', () => {
    const gateway = createAssetGenerationGateway('legacy', {
      registry: new ImageProviderRegistry(),
      legacyImageGen: null,
    });
    expect(gateway).toBeInstanceOf(LegacyAssetGenerationGateway);
    expect(gateway.backend).toBe('legacy');
  });

  it('foundry mode returns a FoundryAssetGenerationGateway', () => {
    const gateway = createAssetGenerationGateway('foundry', {
      registry: new ImageProviderRegistry(),
      legacyImageGen: null,
    });
    expect(gateway).toBeInstanceOf(FoundryAssetGenerationGateway);
    expect(gateway.backend).toBe('foundry');
  });

  it('foundry-with-legacy-fallback mode returns a CompositeAssetGenerationGateway', () => {
    const gateway = createAssetGenerationGateway('foundry-with-legacy-fallback', {
      registry: new ImageProviderRegistry(),
      legacyImageGen: null,
    });
    expect(gateway).toBeInstanceOf(CompositeAssetGenerationGateway);
  });
});
