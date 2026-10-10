import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AssetPipeline } from './asset-pipeline.js';
import { decodePngRgba, encodePng } from './png.js';
import type { GameDNA } from '@metroforge/schemas';

const mock = vi.hoisted(() => ({ generate: vi.fn(), select: vi.fn(), health: vi.fn(), critique: vi.fn() }));
vi.mock('./image-router.js', () => ({
  ImageProviderRegistry: class {
    selectHealthy = mock.select;
  },
}));
vi.mock('./foundry/register.js', () => ({ registerFoundryImageProviders: vi.fn() }));
vi.mock('./vision-critic-factory.js', () => ({
  createVisionCritic: () => ({ isAvailable: mock.health, critique: mock.critique }),
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
  it.each(['img2img', 'ip_adapter'] as const)('uses original full-resolution reference with explicit %s and records its hash', async (mode) => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests',{recursive:true});const output=mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/reference-');mkdirSync(join(output,'assets'));
    const source=png();const compiled=encodePng(16,16,new Uint8Array(16*16*4).fill(255));
    writeFileSync(join(output,'assets/caster.png'),compiled);writeFileSync(join(output,'assets/caster_source.png'),source);
    mock.health.mockResolvedValue(false);mock.select.mockResolvedValue({generator:{id:'fixture',supportsImageConditioning:[mode],generateImage:mock.generate},warnings:[],fallbackDepth:0});
    mock.generate.mockResolvedValue({image:source,provider:'fixture',modelId:'controlled',fallbackGenerated:false,executionMetadata:{effectiveConditioningMode:mode,effectiveConditioningStrength:0.4}});
    const asset=await new AssetPipeline().generateManual({gameDna:dna,description:'Folio caster',assetType:'enemy',assetId:'caster',relPath:'assets/caster.png',outputDir:output,seed:42,referenceMode:mode,referenceStrength:0.4});
    expect(mock.select).toHaveBeenCalledWith(expect.objectContaining({requireLocalConditioningMode:mode}));
    const request=mock.generate.mock.calls.at(-1)![0];expect(request.conditioning).toMatchObject({mode,strength:0.4,image:source});
    expect(asset.executionMetadata?.manualReference).toMatchObject({mode,strength:0.4,sourceHash:request.conditioning.sourceHash});
    expect(request.conditioning.sourceHash).toMatch(/^[a-f0-9]{64}$/);expect(asset.imagePlan).toMatchObject({width:16,height:16});
  });
  it('allows style plus explicit img2img and rejects missing conditioning echo before overwriting', async()=>{
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests',{recursive:true});const output=mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/style-reference-');mkdirSync(join(output,'assets'));const source=png();writeFileSync(join(output,'assets/caster.png'),source);
    const localStyleAdapter={path:resolve('E:/adapter.safetensors'),sha256:'a'.repeat(64),scale:1};
    mock.health.mockResolvedValue(false);mock.select.mockResolvedValue({generator:{id:'fixture',supportsLocalStyleAdapters:true,supportsImageConditioning:['img2img'],generateImage:mock.generate},warnings:[],fallbackDepth:0});
    mock.generate.mockResolvedValue({image:source,provider:'fixture',modelId:'controlled',fallbackGenerated:false,executionMetadata:{localStyleAdapter}});
    const opts={gameDna:dna,description:'Folio caster',assetType:'enemy',assetId:'caster',relPath:'assets/caster.png',outputDir:output,seed:42,referenceMode:'img2img' as const,referenceStrength:0.35,localStyleAdapter};
    await expect(new AssetPipeline().generateManual(opts)).rejects.toThrow('did not apply the selected reference');expect(readFileSync(join(output,'assets/caster.png'))).toEqual(source);
    mock.generate.mockResolvedValue({image:source,provider:'fixture',modelId:'controlled',fallbackGenerated:false,executionMetadata:{localStyleAdapter,effectiveConditioningMode:'img2img',effectiveConditioningStrength:0.35}});
    expect((await new AssetPipeline().generateManual(opts)).executionMetadata?.manualReference).toMatchObject({mode:'img2img',strength:0.35});
  });
  it.each([false, true])('keeps actor review pending when vision is unavailable or falls back to deterministic validation (%s)', async (available) => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests', { recursive: true });
    const output = mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/pending-actor-');
    const raw = png();
    mock.health.mockResolvedValue(available);
    mock.select.mockResolvedValue({ generator: { id: 'fixture', generateImage: mock.generate }, warnings: [], fallbackDepth: 0 });
    mock.generate.mockResolvedValue({ image: raw, provider: 'fixture', modelId: 'controlled', fallbackGenerated: false });
    mock.critique.mockResolvedValue({ passed: true, score: 75, issues: [], tags: ['deterministic-check'], description: 'VLM unavailable' });
    const asset = await new AssetPipeline().generateManual({ gameDna: dna, description: 'One folio caster', assetType: 'enemy', assetId: 'caster', relPath: 'assets/caster.png', outputDir: output, seed: 42 });
    expect(asset).toMatchObject({ critiquePassed: false, critiqueScore: 0, maturity: 'COMPILED', productionAllowed: false, productionReady: false,
      executionMetadata: { manualActorReview: { state: 'pending', scope: 'source-image', humanReviewRequired: true } } });
    expect(readFileSync(join(output, asset.sourcePath!))).toEqual(raw);
  });
  it.each(['player_sprite', 'enemy', 'boss', 'npc'])('retains a high-score critic rejection for manual %s and supplies the actual brief', async (assetType) => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests', { recursive: true });
    const output = mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/rejected-actor-');
    const raw = png();
    mock.health.mockResolvedValue(true);
    mock.select.mockResolvedValue({ generator: { id: 'fixture', generateImage: mock.generate }, warnings: [], fallbackDepth: 0 });
    mock.generate.mockResolvedValue({ image: raw, provider: 'fixture', modelId: 'controlled', fallbackGenerated: false });
    mock.critique.mockResolvedValue({ passed: false, score: 95, issues: ['Two figures; required folio missing'], tags: [], description: 'Rejected actor composition' });
    const asset = await new AssetPipeline().generateManual({ gameDna: dna, description: 'One right-facing caster holding an open brown folio',
      styleDirection: 'charcoal cloth, tiny turquoise pupil', negativePrompt: 'multiple figures, empty hands',
      assetType, assetId: 'caster', relPath: 'assets/caster.png', outputDir: output, seed: 42 });
    expect(asset).toMatchObject({ critiquePassed: false, critiqueScore: 95, maturity: 'REJECTED', productionAllowed: false, productionReady: false });
    expect(readFileSync(join(output, asset.sourcePath!))).toEqual(raw);
    expect(readFileSync(join(output, asset.path))).toEqual(asset.buffer);
    const request = mock.critique.mock.calls.at(-1)![0];
    expect(request.image).toEqual(raw);
    expect(request.artDirection).toContain('One right-facing caster holding an open brown folio');
    expect(request.artDirection).toContain('charcoal cloth, tiny turquoise pupil');
    expect(request.artDirection).toContain('multiple figures, empty hands');
    expect(request.artDirection).toContain('exactly one complete actor');
  });
  it('explains an unavailable styled route before vision or image generation', async () => {
    mock.select.mockResolvedValue({generator:null,warnings:[],fallbackDepth:0});
    await expect(new AssetPipeline().generateManual({gameDna:dna,description:'Folio caster',assetType:'enemy',assetId:'caster',relPath:'assets/caster.png',outputDir:'E:/MetroForgeData/Development/stormglass-style-bridge-20261009/unavailable-route',seed:42,localStyleAdapter:{path:resolve('E:/adapter.safetensors'),sha256:'a'.repeat(64),scale:1}})).rejects.toThrow('Choose a local mode or None');
    expect(mock.health).not.toHaveBeenCalled();expect(mock.generate).not.toHaveBeenCalled();
  });
  it('forwards an explicit adapter through manual generation and preserves its proven metadata', async () => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests',{recursive:true});
    const output=mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/style-');
    const localStyleAdapter={path:resolve('E:/adapter.safetensors'),sha256:'a'.repeat(64),scale:1};
    mock.health.mockResolvedValue(false);
    mock.select.mockResolvedValue({generator:{id:'fixture',supportsLocalStyleAdapters:true,generateImage:mock.generate},warnings:[],fallbackDepth:0});
    mock.generate.mockResolvedValue({image:png(),provider:'fixture',modelId:'controlled',fallbackGenerated:false,executionMetadata:{localStyleAdapter}});
    const asset=await new AssetPipeline().generateManual({gameDna:dna,description:'Folio caster',assetType:'enemy',assetId:'caster',relPath:'assets/caster.png',outputDir:output,seed:42,localStyleAdapter});
    expect(mock.select).toHaveBeenCalledWith(expect.objectContaining({requireLocalStyleAdapter:true}));
    expect(mock.generate.mock.calls[0][0].localStyleAdapter).toMatchObject({sha256:localStyleAdapter.sha256,scale:1});
    expect(asset.executionMetadata?.localStyleAdapter).toEqual(localStyleAdapter);
    expect(readFileSync(join(output,asset.sourcePath!)).equals(png())).toBe(true);
  });
  it('rejects styled replacement before provider selection and preserves the current image', async () => {
    mkdirSync('E:/MetroForgeData/Temp/manual-profile-tests',{recursive:true});const output=mkdtempSync('E:/MetroForgeData/Temp/manual-profile-tests/style-replace-');
    mkdirSync(join(output,'assets'));const existing=png();writeFileSync(join(output,'assets/caster.png'),existing);
    await expect(new AssetPipeline().generateManual({gameDna:dna,description:'Folio caster',assetType:'enemy',assetId:'caster',relPath:'assets/caster.png',outputDir:output,seed:42,localStyleAdapter:{path:resolve('E:/adapter.safetensors'),sha256:'a'.repeat(64),scale:1}})).rejects.toThrow('new artwork only');
    expect(mock.select).not.toHaveBeenCalled();expect(mock.generate).not.toHaveBeenCalled();expect(readFileSync(join(output,'assets/caster.png')).equals(existing)).toBe(true);
  });
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
