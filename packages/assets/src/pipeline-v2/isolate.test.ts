import { describe, expect, it } from 'vitest';
import { isolateForegroundV2, hasRealAlpha, type ForegroundIsolationProvider } from './isolate.js';
import { buildAssetPlan } from './planner.js';
import { encodePng } from '../png.js';
import type { AssetRequestV2 } from './types.js';

function req(overrides: Partial<AssetRequestV2> & Pick<AssetRequestV2, 'id' | 'category'>): AssetRequestV2 {
  return { runtimeUse: 'test', artDirection: 'test', seed: 1, ...overrides };
}

function opaqueRgbPng(w = 8, h = 8): Buffer {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 100; rgba[i + 1] = 100; rgba[i + 2] = 100; rgba[i + 3] = 255;
  }
  return encodePng(w, h, rgba);
}

function halfTransparentPng(w = 8, h = 8): Buffer {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rgba[i] = 100; rgba[i + 1] = 100; rgba[i + 2] = 100;
      rgba[i + 3] = x < w / 2 ? 0 : 255; // left half fully transparent, right half opaque
    }
  }
  return encodePng(w, h, rgba);
}

function stubProvider(result: Awaited<ReturnType<ForegroundIsolationProvider['segmentForeground']>>): ForegroundIsolationProvider {
  return { segmentForeground: async () => result };
}

describe('hasRealAlpha', () => {
  it('reports false for a fully-opaque RGB source (what diffusion providers actually emit)', () => {
    expect(hasRealAlpha(opaqueRgbPng())).toBe(false);
  });

  it('reports true for a source with a substantial transparent region', () => {
    expect(hasRealAlpha(halfTransparentPng())).toBe(true);
  });
});

describe('isolateForegroundV2 — gating (regression for the eighth-session subject-loss defect)', () => {
  it('skips categories that keep a full background (environment/background) even with a provider available', async () => {
    const plan = buildAssetPlan(req({ id: 'tile', category: 'environment' }));
    const provider = stubProvider({ ok: true, buffer: opaqueRgbPng() });
    const source = opaqueRgbPng();
    const result = await isolateForegroundV2(source, plan, provider);
    expect(result.applied).toBe(false);
    expect(result.matteSource).toBe('skipped_category');
    expect(result.buffer).toBe(source);
  });

  it('skips a source that already has real alpha (e.g. procedural output) even with a provider available -- zero behavior change for existing callers', async () => {
    const plan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    const provider = stubProvider({ ok: true, buffer: opaqueRgbPng() });
    const source = halfTransparentPng();
    const result = await isolateForegroundV2(source, plan, provider);
    expect(result.applied).toBe(false);
    expect(result.matteSource).toBe('existing_alpha');
    expect(result.buffer).toBe(source);
  });

  it('falls back to the original buffer, honestly labeled, when no provider is supplied -- exactly today\'s behavior for every caller that omits foregroundIsolationProvider', async () => {
    const plan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    const source = opaqueRgbPng();
    const result = await isolateForegroundV2(source, plan, undefined);
    expect(result.applied).toBe(false);
    expect(result.matteSource).toBe('unavailable_fallback');
    expect(result.buffer).toBe(source);
  });

  it('runs the provider and returns its matte when the category needs it and the source lacks real alpha', async () => {
    const plan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    const isolated = halfTransparentPng();
    const provider = stubProvider({ ok: true, buffer: isolated, model: 'u2net', modelVersion: 'test-v1' });
    const result = await isolateForegroundV2(opaqueRgbPng(), plan, provider);
    expect(result.applied).toBe(true);
    expect(result.matteSource).toBe('segmentation_model');
    expect(result.buffer).toBe(isolated);
    expect(result.model).toBe('u2net');
    expect(result.modelVersion).toBe('test-v1');
  });

  it('falls back honestly (never silently treated as success) when the provider itself fails', async () => {
    const plan = buildAssetPlan(req({ id: 'metro_power_terminal', category: 'prop' }));
    const source = opaqueRgbPng();
    const provider = stubProvider({ ok: false, error: 'model unavailable' });
    const result = await isolateForegroundV2(source, plan, provider);
    expect(result.applied).toBe(false);
    expect(result.matteSource).toBe('unavailable_fallback');
    expect(result.error).toBe('model unavailable');
    expect(result.buffer).toBe(source);
  });

  it('applies to prop/pickup categories too, not just player/character categories', async () => {
    const plan = buildAssetPlan(req({ id: 'metro_power_terminal', category: 'prop' }));
    expect(plan.transparency).toBe('required');
    const isolated = halfTransparentPng();
    const provider = stubProvider({ ok: true, buffer: isolated });
    const result = await isolateForegroundV2(opaqueRgbPng(), plan, provider);
    expect(result.applied).toBe(true);
  });
});
