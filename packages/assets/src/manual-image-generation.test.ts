import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssetPipeline } from './asset-pipeline.js';
import { decodePngRgba, encodePng } from './png.js';
import type { GameDNA } from '@metroforge/schemas';

const mock = vi.hoisted(() => ({ generate: vi.fn(), select: vi.fn(), health: vi.fn() }));
vi.mock('./image-router.js', () => ({
  ImageProviderRegistry: class {
    selectHealthy = mock.select;
  },
}));
vi.mock('./foundry/register.js', () => ({ registerFoundryImageProviders: vi.fn() }));
vi.mock('./vision-critic-factory.js', () => ({
  createVisionCritic: () => ({ isAvailable: mock.health }),
}));
const dna = {
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: { title: 'Stormglass', visualStyle: 'Detailed HD pixel art' },
  technical: { tileSize: 16 },
} as GameDNA;
const png = () => {
  const rgba = new Uint8Array(80 * 40 * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([120, 90 + ((i / 4) % 120), 180, 255], i);
  return encodePng(80, 40, rgba);
};
afterEach(() => vi.clearAllMocks());

describe('manual pipeline uses role-aware compile and retains source proof', () => {
  it('isolates an opaque actor before compilation while retaining the original provider source', async () => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests', { recursive: true });
    const output = mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/matte-');
    const raw = png(); const pixels = decodePngRgba(raw);
    for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++)
      if (x < 20 || x >= 60 || y < 4 || y >= 36) pixels.rgba[(y * pixels.width + x) * 4 + 3] = 0;
    const masked = encodePng(pixels.width, pixels.height, pixels.rgba);
    mock.health.mockResolvedValue(false);
    mock.select.mockResolvedValue({ generator: { id: 'fixture', generateImage: mock.generate }, warnings: [], fallbackDepth: 0 });
    mock.generate.mockResolvedValue({ image: raw, provider: 'fixture', modelId: 'controlled', fallbackGenerated: false });
    const segmentForeground = vi.fn().mockResolvedValue({ ok: true, buffer: masked, model: 'u2net' });
    const asset = await new AssetPipeline().generateManual({
      gameDna: dna, description: 'Single gray-robed caster', assetType: 'enemy', assetId: 'caster',
      relPath: 'assets/caster.png', outputDir: output, seed: 42,
      foregroundIsolationProvider: { segmentForeground },
    });
    expect(segmentForeground).toHaveBeenCalledWith(raw);
    expect(asset.executionMetadata?.foregroundIsolation).toMatchObject({ applied: true, matteSource: 'segmentation_model', model: 'u2net' });
    expect(readFileSync(join(output, asset.sourcePath!)).equals(raw)).toBe(true);
    const compiled = decodePngRgba(asset.buffer);
    expect([compiled.width, compiled.height]).toEqual([64, 64]);
    expect(compiled.rgba.some((value, i) => i % 4 === 3 && value === 0)).toBe(true);
  });
  it('sends the authored style/exclusions without legacy project-prefix expansion', async () => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests', { recursive: true });
    const output = mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/brief-');
    mock.health.mockResolvedValue(false);
    mock.select.mockResolvedValue({generator: {id:'fixture',generateImage:mock.generate},warnings:[],fallbackDepth:0});
    mock.generate.mockResolvedValue({image:png(),provider:'fixture',modelId:'controlled',fallbackGenerated:false});
    const subject='Ash librarian, brass book';
    await new AssetPipeline().generateManual({gameDna:dna,description:subject,styleDirection:'HD pixel art, charcoal cloth',
      negativePrompt:'text, watermark',assetType:'enemy',assetId:'librarian',relPath:'assets/librarian.png',outputDir:output,seed:42,
      styleBible:{promptPrefixes:{CHARACTER:'irrelevant cavernous shafts and ability-gated traversal'}} as any});
    const request=mock.generate.mock.calls[0][0];
    expect(request.prompt).toContain(subject);
    expect(request.prompt).toContain('charcoal cloth');
    expect(request.prompt).not.toContain('ability-gated');
    expect(request.negativePrompt).toBe('text, watermark');
  });
  it.each([
    ['background', 'BACKGROUND', 640, 360],
    ['portrait', 'PORTRAIT', 256, 256],
    ['prop', 'ENVIRONMENT', 64, 96],
    ['tileset', 'TILE_SOURCE', 128, 128],
    ['ui_panel', 'UI_ART', 256, 128],
  ])('generates %s with its declared profile and canvas', async (type, profile, width, height) => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests', { recursive: true });
    const output = mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/case-');
    const raw = png();
    mock.health.mockResolvedValue(false);
    mock.select.mockResolvedValue({
      generator: { id: 'fixture', generateImage: mock.generate },
      warnings: [],
      fallbackDepth: 0,
    });
    mock.generate.mockResolvedValue({
      image: raw,
      provider: 'fixture',
      modelId: 'controlled',
      fallbackGenerated: false,
      executionMetadata: { actualDevice: 'fixture' },
    });
    const asset = await new AssetPipeline().generateManual({
      gameDna: dna,
      description: 'Detailed castle artwork',
      assetType: String(type),
      assetId: 'castle',
      relPath: 'assets/castle.png',
      outputDir: output,
      seed: 42,
      mode: 'LOCAL_ONLY',
    });
    expect(mock.generate.mock.calls[0][0]).toMatchObject({ profile });
    expect(decodePngRgba(asset.buffer)).toMatchObject({ width, height });
    expect(readFileSync(join(output, 'assets/castle_source.png'))).toEqual(raw);
    expect(asset.executionMetadata).toEqual({
      actualDevice: 'fixture',
      foregroundIsolation: { applied: false, matteSource: type === 'prop' ? 'unavailable_fallback' : 'skipped_category' },
    });
    expect(asset.imagePlan).toMatchObject({ profile, width, height });
  });
  it('requests full local detail and rejects invalid sizing before selecting a provider', async () => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests', { recursive: true });
    const output = mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/detail-');
    mock.health.mockResolvedValue(false);
    mock.select.mockResolvedValue({
      generator: { id: 'fixture', generateImage: mock.generate },
      warnings: [],
      fallbackDepth: 0,
    });
    mock.generate.mockResolvedValue({
      image: png(),
      provider: 'fixture',
      modelId: 'controlled',
      fallbackGenerated: false,
    });
    const options = {
      gameDna: dna,
      description: 'Gothic gallery',
      assetType: 'background',
      assetId: 'gallery',
      relPath: 'assets/gallery.png',
      outputDir: output,
      seed: 42,
      backgroundDetail: 'detailed' as const,
    };
    const asset = await new AssetPipeline().generateManual(options);
    expect(mock.generate.mock.calls[0][0]).toMatchObject({
      width: 1024,
      height: 576,
      profile: 'BACKGROUND',
    });
    expect(decodePngRgba(asset.buffer)).toMatchObject({ width: 1024, height: 576 });
    expect(asset.imagePlan).toMatchObject({ width: 1024, height: 576 });
    mock.select.mockClear();
    await expect(
      new AssetPipeline().generateManual({ ...options, backgroundDetail: 'ultra' as any }),
    ).rejects.toThrow('Choose standard or detailed');
    expect(mock.select).not.toHaveBeenCalled();
  });
  it('keeps a replacement canvas, refuses corrupt original art before provider selection', async () => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests', { recursive: true });
    const output = mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/replace-');
    mkdirSync(join(output, 'assets'));
    writeFileSync(join(output, 'assets/castle.png'), png());
    mock.health.mockResolvedValue(false);
    mock.select.mockResolvedValue({
      generator: { id: 'fixture', generateImage: mock.generate },
      warnings: [],
      fallbackDepth: 0,
    });
    mock.generate.mockResolvedValue({
      image: png(),
      provider: 'fixture',
      modelId: 'controlled',
      fallbackGenerated: false,
    });
    const options = {
      gameDna: dna,
      description: 'castle',
      assetType: 'background',
      assetId: 'castle',
      relPath: 'assets/castle.png',
      outputDir: output,
      seed: 42,
    };
    const result = await new AssetPipeline().generateManual(options);
    expect(decodePngRgba(result.buffer)).toMatchObject({ width: 80, height: 40 });
    writeFileSync(join(output, 'assets/castle.png'), 'corrupt');
    mock.select.mockClear();
    await expect(new AssetPipeline().generateManual(options)).rejects.toThrow();
    expect(mock.select).not.toHaveBeenCalled();
  });
});
