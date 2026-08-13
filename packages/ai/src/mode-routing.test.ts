import { describe, it, expect } from 'vitest';
import {
  buildTextRoutingContext,
  modeRegistersHostedProviders,
  modeRoutingFlags,
} from './mode-routing.js';

describe('modeRoutingFlags', () => {
  it('COMMERCIAL_SAFE enables commercialSafeOnly', () => {
    expect(modeRoutingFlags('COMMERCIAL_SAFE').commercialSafeOnly).toBe(true);
  });

  it('LOCAL_ONLY and OFFLINE restrict to local providers', () => {
    expect(modeRoutingFlags('LOCAL_ONLY').localOnly).toBe(true);
    expect(modeRoutingFlags('OFFLINE').localOnly).toBe(true);
    expect(modeRoutingFlags('OFFLINE').offline).toBe(true);
  });

  it('NVIDIA_ONLY sets nvidiaOnly', () => {
    expect(modeRoutingFlags('NVIDIA_ONLY').nvidiaOnly).toBe(true);
  });

  it('FASTEST and HIGHEST_QUALITY adjust qualityTarget', () => {
    expect(modeRoutingFlags('FASTEST').qualityTarget).toBe('fast');
    expect(modeRoutingFlags('HIGHEST_QUALITY').qualityTarget).toBe('quality');
  });

  it('LOW_VRAM sets maxVramMb budget', () => {
    expect(modeRoutingFlags('LOW_VRAM').maxVramMb).toBeGreaterThan(0);
  });
});

describe('buildTextRoutingContext', () => {
  it('merges mode flags with task/capability', () => {
    const ctx = buildTextRoutingContext('COMMERCIAL_SAFE', {
      task: 'game_dna',
      capability: 'json_generation',
    });
    expect(ctx.commercialSafeOnly).toBe(true);
    expect(ctx.task).toBe('game_dna');
    expect(ctx.capability).toBe('json_generation');
  });
});

describe('modeRegistersHostedProviders', () => {
  it('registers hosted providers for COMMERCIAL_SAFE and NVIDIA_ONLY', () => {
    expect(modeRegistersHostedProviders('COMMERCIAL_SAFE')).toBe(true);
    expect(modeRegistersHostedProviders('NVIDIA_ONLY')).toBe(true);
  });

  it('does not register hosted providers for LOCAL_ONLY or OFFLINE', () => {
    expect(modeRegistersHostedProviders('LOCAL_ONLY')).toBe(false);
    expect(modeRegistersHostedProviders('OFFLINE')).toBe(false);
  });
});
