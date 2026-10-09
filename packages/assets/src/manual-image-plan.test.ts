import { describe, expect, it } from 'vitest';
import { manualImagePlan, compileManualImage } from './manual-image-plan.js';
import { encodePng, decodePngRgba } from './png.js';
import { profilePrefix } from './types/prompts.js';
import { LegacyAssetGenerationGateway } from './gateway/legacy-gateway.js';
import type { AssetGenerationRequest } from './gateway/types.js';

function source(width = 32, height = 16, alpha = 255) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([123, 87 + ((i / 4) % 120), 221, alpha], i);
  return encodePng(width, height, rgba);
}

describe('manual art canvas and processing contracts', () => {
  it('uses detailed source size without enlarging an enemy sprite', () => {
    expect(manualImagePlan('enemy', 'librarian', undefined, undefined, 'detailed')).toMatchObject({ width: 64, height: 64, sourceWidth: 1024, sourceHeight: 1024 });
    expect(manualImagePlan('enemy', 'librarian')).toMatchObject({ sourceWidth: 512, sourceHeight: 512 });
  });
  it('preserves replacement canvas and aspect ratio at detailed source size', () => {
    const plan = manualImagePlan('prop', 'desk', source(64, 96), undefined, 'detailed');
    expect(plan).toMatchObject({ width: 64, height: 96, sourceWidth: 680, sourceHeight: 1024 });
    const compiled = decodePngRgba(compileManualImage(source(32, 48), plan));
    expect([compiled.width, compiled.height]).toEqual([64, 96]);
  });
  it.each([null, [], {}, 'ultra', 1024])('rejects invalid source detail %j', value => {
    expect(() => manualImagePlan('enemy', 'librarian', undefined, undefined, value as any)).toThrow('Choose standard or detailed source artwork');
  });
  it('keeps background canvas detail separate from source detail', () => {
    expect(() => manualImagePlan('background', 'hall', undefined, undefined, 'detailed')).toThrow('Use background detail');
  });
  it.each([
    ['background', 'BACKGROUND', 640, 360],
    ['portrait', 'PORTRAIT', 256, 256],
    ['character_concept', 'CONCEPT_ART', 512, 768],
    ['weapon', 'WEAPON', 64, 64],
    ['item', 'ITEM', 32, 32],
    ['prop', 'ENVIRONMENT', 64, 96],
    ['npc', 'NPC', 64, 64],
    ['ui_icon', 'ICON', 64, 64],
    ['ui_panel', 'UI_ART', 256, 128],
    ['tileset', 'TILE_SOURCE', 128, 128],
    ['enemy', 'ENEMY', 64, 64],
    ['boss', 'BOSS', 96, 96],
    ['player_sprite', 'CHARACTER', 64, 64],
    ['vfx_texture', 'VFX_TEXTURE', 64, 64],
    ['tile', 'TILE_SOURCE', 128, 128],
  ])('%s has an explicit image role and canvas', (type, profile, width, height) => {
    const plan = manualImagePlan(String(type), 'sample');
    expect(plan).toMatchObject({ profile, width, height });
    expect(Math.max(plan.sourceWidth, plan.sourceHeight)).toBeLessThanOrEqual(1024);
    expect(plan.sourceWidth % 8).toBe(0);
    expect(plan.sourceHeight % 8).toBe(0);
  });
  it('retains the full detailed background without downsampling', () => {
    const plan = manualImagePlan('background', 'gallery', undefined, 'detailed');
    expect(plan).toMatchObject({ width: 1024, height: 576, sourceWidth: 1024, sourceHeight: 576 });
    const original = source(1024, 576);
    expect(decodePngRgba(compileManualImage(original, plan)).rgba).toEqual(
      decodePngRgba(original).rgba,
    );
    expect(manualImagePlan('background', 'gallery', undefined, 'standard')).toMatchObject({
      width: 640,
      height: 360,
    });
  });
  it.each([null, [], {}, 'ultra', 1024])('rejects invalid background detail %j', (value) => {
    expect(() => manualImagePlan('background', 'gallery', undefined, value as any)).toThrow(
      'Choose standard or detailed',
    );
  });
  it('rejects applying a create-only background size to actors or replacements', () => {
    expect(() => manualImagePlan('enemy', 'guard', undefined, 'detailed')).toThrow(
      'only to new background',
    );
    expect(() => manualImagePlan('background', 'gallery', source(), 'detailed')).toThrow(
      'only to new background',
    );
  });
  it('preserves existing landscape dimensions without an unbounded fourfold inference request', () => {
    const plan = manualImagePlan('background', 'castle', source(1920, 1080));
    expect(plan).toMatchObject({ width: 1920, height: 1080, sourceWidth: 1024, sourceHeight: 576 });
    expect(decodePngRgba(compileManualImage(source(), plan))).toMatchObject({
      width: 1920,
      height: 1080,
    });
  });
  it('keeps full background edges opaque and retains colors beyond the old sprite palette', () => {
    const plan = manualImagePlan('background', 'castle', source());
    const original = source();
    const compiled = compileManualImage(original, plan);
    expect(decodePngRgba(compiled).rgba).toEqual(decodePngRgba(original).rgba);
  });
  it('retains deliberate VFX alpha fades', () => {
    const plan = manualImagePlan('vfx_texture', 'magic', source(32, 16, 73));
    expect(decodePngRgba(compileManualImage(source(32, 16, 73), plan)).rgba[3]).toBe(73);
  });
  it('refuses corrupt replacements and fully transparent generated art', () => {
    expect(() => manualImagePlan('background', 'castle', Buffer.from('corrupt'))).toThrow();
    expect(() =>
      compileManualImage(source(32, 16, 0), manualImagePlan('ui_icon', 'spell')),
    ).toThrow('fully transparent');
    expect(() => manualImagePlan('unknown', 'sample')).toThrow('Unsupported');
  });
  it('leaves camera direction to the project prompt', () => {
    for (const profile of ['CHARACTER', 'ENEMY', 'TILE_SOURCE'] as const)
      expect(profilePrefix(profile)).not.toMatch(/side view|top-down/);
  });
  it('passes the intended role, bounded dimensions and actual execution telemetry through the gateway', async () => {
    let actual: unknown;
    const gateway = new LegacyAssetGenerationGateway({
      id: 'local',
      checkHealth: async () => true,
      generateImage: async (request) => {
        actual = request;
        return {
          image: source(),
          provider: 'local',
          modelId: 'sdxl',
          seed: 1,
          fallbackGenerated: false,
          executionMetadata: { actualDevice: 'cuda' },
        };
      },
    });
    const request: AssetGenerationRequest = {
      id: 'castle',
      assetType: 'background',
      path: 'assets/castle.png',
      prompt: 'Interior',
      width: 1920,
      height: 1080,
      seed: 1,
      visualStyle: 'HD pixel art',
      pixelArt: true,
      transparentBackground: false,
      commercialUseRequired: false,
      freeOnly: false,
      localOnly: true,
      imageProfile: 'BACKGROUND',
      sourceWidth: 1024,
      sourceHeight: 576,
    };
    const outcome = await gateway.generate(request);
    expect(actual).toMatchObject({ profile: 'BACKGROUND', width: 1024, height: 576 });
    expect(outcome).toMatchObject({ ok: true, executionMetadata: { actualDevice: 'cuda' } });
  });
  it('refuses a provider placeholder rather than labeling it generated art', async () => {
    const gateway = new LegacyAssetGenerationGateway({
      id: 'local',
      checkHealth: async () => true,
      generateImage: async () => ({
        image: source(),
        provider: 'local',
        modelId: 'none',
        seed: 1,
        fallbackGenerated: true,
      }),
    });
    const result = await gateway.generate({
      assetType: 'player',
      width: 64,
      height: 64,
      prompt: 'hero',
      seed: 1,
    } as AssetGenerationRequest);
    expect(result).toMatchObject({ ok: false });
  });
});
