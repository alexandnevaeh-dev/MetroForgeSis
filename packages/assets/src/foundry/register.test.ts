import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ImageProviderRegistry } from '../image-router.js';
import { registerFoundryImageProviders, foundryBootstrapFromEnv } from './register.js';

describe('registerFoundryImageProviders — Pollinations', () => {
  it('does not register Pollinations by default (opt-in, not unconditional network access)', () => {
    const registry = new ImageProviderRegistry();
    registerFoundryImageProviders(registry, {});
    expect(registry.list().some((r) => r.provider.id === 'pollinations-image')).toBe(false);
  });

  it('registers Pollinations as a real routing candidate when explicitly enabled', () => {
    const registry = new ImageProviderRegistry();
    registerFoundryImageProviders(registry, { enablePollinations: true });
    const reg = registry.list().find((r) => r.provider.id === 'pollinations-image');
    expect(reg).toBeDefined();
    expect(reg!.local).toBe(false);
    expect(reg!.costClass).toBe('free');
    expect(reg!.capabilities).toContain('image-generation');
  });

  it('is skipped (not silently dropped) when disabled via providerEnabled, same as every other provider', () => {
    const registry = new ImageProviderRegistry();
    const skipped = registerFoundryImageProviders(registry, {
      enablePollinations: true,
      providerEnabled: { 'pollinations-image': false },
    });
    expect(registry.list().some((r) => r.provider.id === 'pollinations-image')).toBe(false);
    expect(skipped.some((s) => s.id === 'pollinations-image')).toBe(true);
  });
});

describe('foundryBootstrapFromEnv — Pollinations env wiring', () => {
  const keys = ['POLLINATIONS_BASE_URL', 'POLLINATIONS_IMAGE_MODEL', 'POLLINATIONS_API_KEY', 'POLLINATIONS_ENABLED'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('reads POLLINATIONS_* env vars, defaulting enablePollinations to false when unset', () => {
    delete process.env.POLLINATIONS_ENABLED;
    delete process.env.POLLINATIONS_BASE_URL;
    const opts = foundryBootstrapFromEnv();
    expect(opts.enablePollinations).toBe(false);
  });

  it('enables Pollinations only when POLLINATIONS_ENABLED is literally "true"', () => {
    process.env.POLLINATIONS_ENABLED = 'true';
    process.env.POLLINATIONS_BASE_URL = 'https://image.pollinations.ai';
    const opts = foundryBootstrapFromEnv();
    expect(opts.enablePollinations).toBe(true);
    expect(opts.pollinationsBaseUrl).toBe('https://image.pollinations.ai');
  });

  it('an explicit extra.enablePollinations overrides the env default', () => {
    delete process.env.POLLINATIONS_ENABLED;
    const opts = foundryBootstrapFromEnv({ enablePollinations: true });
    expect(opts.enablePollinations).toBe(true);
  });
});
