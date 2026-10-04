import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { generateManualAsset } from './manual-asset.js';
import { listAssetHistory, restoreAssetVersion } from './asset-history.js';

const fixture = vi.hoisted(() => ({ generate: vi.fn(), failManifest: false }));
vi.mock('@metroforge/assets', () => ({
  AssetPipeline: class { generateManual = fixture.generate; },
  derivedSourceRelPath: (path: string) => path.replace(/\.png$/, '_source.png'),
}));
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, renameSync: (from: string, to: string) => {
    if (fixture.failManifest && to.endsWith('generation_manifest.json')) throw new Error('Injected manifest promotion failure');
    return actual.renameSync(from, to);
  } };
});
const dna = {
  version: '0.1.0', archetype: 'SIDE_VIEW_METROIDVANIA', identity: { title: 'Castle', genre: 'Metroidvania', tone: 'dark', visualStyle: 'HD pixel art' },
  technical: { resolution: { width: 1280, height: 720 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false }, movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [], world: { biomeCount: 1, roomCount: 8 }, narrative: { premise: 'Castle', protagonist: 'Knight', centralConflict: 'Escape' }, seed: 42, profile: 'TINY_TEST',
};
describe('manual artwork promotion', () => {
  let project: string;
  const path = 'assets/characters/castle/player_still.png';
  const source = 'assets/characters/castle/player_still_source.png';
  const put = (rel: string, data: string) => { mkdirSync(dirname(join(project, rel)), { recursive: true }); writeFileSync(join(project, rel), data); };
  const bytes = (rel: string) => readFileSync(join(project, rel), 'utf8');
  const registry = () => JSON.parse(bytes('generation_manifest.json'));
  const request = () => ({ projectPath: project, description: 'Detailed armored knight', assetType: 'player_sprite' as const, assetId: 'player', operation: 'replace' as const, seed: 42 });
  const generated = (opts: any) => {
    put('provider-stage-observed.txt', opts.outputDir);
    const stagePut = (rel: string, data: string) => { mkdirSync(dirname(join(opts.outputDir, rel)), { recursive: true }); writeFileSync(join(opts.outputDir, rel), data); };
    stagePut(opts.relPath, 'new artwork'); stagePut(opts.relPath.replace(/\.png$/, '_source.png'), 'new source');
    return { id: opts.assetId, path: opts.relPath, sourcePath: opts.relPath.replace(/\.png$/, '_source.png'), buffer: Buffer.from('new artwork'), provider: 'diffusers', modelId: 'fixture', fallbackGenerated: false, critiquePassed: true, critiqueScore: 90, maturity: 'DRAFT', productionReady: false, sourceType: 'AI_GENERATED' };
  };
  beforeEach(() => {
    fixture.failManifest = false; fixture.generate.mockReset();
    project = mkdtempSync(join(tmpdir(), 'metroforge-manual-'));
    put('game_dna.json', JSON.stringify(dna));
    put(path, 'original artwork'); put(source, 'original source');
    put('assets/characters/player_walk.png', 'existing animation');
    put('generation_manifest.json', JSON.stringify({ artifacts: [
      { id: 'player', path, type: 'texture', provider: 'old provider', prompt: 'original prompt', seed: 5, license: 'original art license', commercialUse: 'unknown' },
      { id: 'player_walk', path: 'assets/characters/player_walk.png', type: 'animation', productionReady: true },
    ] }));
    put('validation_report.json', JSON.stringify({ passed: true, productionReady: true }));
    fixture.generate.mockImplementation(async opts => generated(opts));
  });
  afterEach(() => { fixture.failManifest = false; rmSync(project, { recursive: true, force: true }); });
  it('stages inference and snapshots old bytes before replacing the registered nested path', async () => {
    fixture.generate.mockImplementation(async opts => {
      expect(opts.outputDir).not.toBe(project);
      expect(readFileSync(join(opts.outputDir, path), 'utf8')).toBe('original artwork');
      const result = generated(opts); expect(bytes(path)).toBe('original artwork'); return result;
    });
    expect((await generateManualAsset(request())).success).toBe(true);
    const record = listAssetHistory(project, 'player')[0]!;
    expect(bytes(record.backupPath)).toBe('original artwork');
    expect(bytes(record.sourceBackupPath!)).toBe('original source');
    expect(record.prompt).toBe('original prompt'); expect(record.provider).toBe('old provider');
    expect(bytes(path)).toBe('new artwork');
    expect(existsSync(join(project, 'assets/characters/player.png'))).toBe(false);
    expect(JSON.parse(bytes('validation_report.json')).passed).toBe(false);
  });
  it('preserves old animation sheets and marks registered descendants for rebuilding', async () => {
    await generateManualAsset(request());
    expect(bytes('assets/characters/player_walk.png')).toBe('existing animation');
    expect(registry().artifacts[1].dirty).toBe(true); expect(registry().artifacts[1].productionReady).toBe(false);
  });
  it('uses unique IDs and paths for repeated create requests with identical prompts', async () => {
    const create = { ...request(), assetId: undefined, operation: 'create' as const };
    const a = await generateManualAsset(create); const b = await generateManualAsset(create);
    expect(a.success && b.success).toBe(true); expect(a.asset!.id).not.toBe(b.asset!.id);
    expect(bytes(a.asset!.path)).toBe('new artwork'); expect(bytes(b.asset!.path)).toBe('new artwork'); expect(bytes(path)).toBe('original artwork');
  });
  it('does not rewrite live images or registry when provider fails after checkpointing', async () => {
    const before = bytes('generation_manifest.json');
    fixture.generate.mockImplementation(async opts => { generated(opts); throw new Error('Provider unavailable'); });
    expect((await generateManualAsset(request())).success).toBe(false);
    expect(bytes(path)).toBe('original artwork'); expect(bytes(source)).toBe('original source'); expect(bytes('generation_manifest.json')).toBe(before);
  });
  it('refuses fallback artwork and unexpected paths', async () => {
    fixture.generate.mockImplementation(async opts => ({ ...generated(opts), fallbackGenerated: true }));
    expect((await generateManualAsset(request())).success).toBe(false);
    fixture.generate.mockImplementation(async opts => ({ ...generated(opts), path: 'assets/wrong.png' }));
    expect((await generateManualAsset(request())).success).toBe(false); expect(bytes(path)).toBe('original artwork');
  });
  it('preserves concurrent user edits instead of overwriting a changed project', async () => {
    fixture.generate.mockImplementation(async opts => { const result = generated(opts); put(path, 'user edit'); return result; });
    const result = await generateManualAsset(request()); expect(result.success).toBe(false); expect(result.errors.join()).toContain('Project changed');
    expect(bytes(path)).toBe('user edit'); expect(registry().assetHistory).toBeUndefined();
  });
  it('rolls back artwork, source, Unity mirror and history on manifest promotion failure', async () => {
    put('Assets/StreamingAssets/' + path, 'original artwork');
    const before = bytes('generation_manifest.json'); fixture.failManifest = true;
    expect((await generateManualAsset(request())).success).toBe(false);
    expect(bytes(path)).toBe('original artwork'); expect(bytes(source)).toBe('original source');
    expect(bytes('Assets/StreamingAssets/' + path)).toBe('original artwork');
    expect(bytes('generation_manifest.json')).toBe(before); expect(existsSync(join(project, '.metroforge/asset_history/player_v1.png'))).toBe(false);
  });
  it('updates and restores equal Unity copies and the original conditioning source', async () => {
    put('Assets/StreamingAssets/' + path, 'original artwork'); put('Assets/StreamingAssets/' + source, 'original source');
    expect((await generateManualAsset(request())).success).toBe(true);
    expect(bytes('Assets/StreamingAssets/' + path)).toBe('new artwork');
    expect(restoreAssetVersion(project, 'player', 1).success).toBe(true);
    expect(bytes(path)).toBe('original artwork'); expect(bytes(source)).toBe('original source');
    expect(bytes('Assets/StreamingAssets/' + source)).toBe('original source');
    expect(registry().artifacts[0].provider).toBe('old provider');
    expect(registry().artifacts[0].license).toBe('original art license');
    expect(registry().artifacts[0].commercialUse).toBe('unknown');
  });
  it('refuses divergent Unity copies before dispatching inference', async () => {
    put('Assets/StreamingAssets/' + path, 'Unity edit');
    expect((await generateManualAsset(request())).success).toBe(false); expect(fixture.generate).not.toHaveBeenCalled(); expect(bytes(path)).toBe('original artwork');
  });
  it('locks generation and restore while a provider is in flight', async () => {
    let finish!: () => void;
    fixture.generate.mockImplementation(async opts => { await new Promise<void>(resolve => { finish = resolve; }); return generated(opts); });
    const first = generateManualAsset(request());
    expect((await generateManualAsset(request())).errors.join()).toContain('already running');
    expect(restoreAssetVersion(project, 'player', 1).error).toContain('already running'); finish(); expect((await first).success).toBe(true);
  });
  it('rejects malformed DNA, corrupt registry, invalid seeds and traversal without inference', async () => {
    expect((await generateManualAsset({ ...request(), seed: NaN })).success).toBe(false);
    expect((await generateManualAsset({ ...request(), assetId: '../escape' })).success).toBe(false);
    put('generation_manifest.json', '{broken'); expect((await generateManualAsset(request())).success).toBe(false);
    put('game_dna.json', '{broken'); expect((await generateManualAsset(request())).success).toBe(false);
    expect(fixture.generate).not.toHaveBeenCalled(); expect(bytes(path)).toBe('original artwork');
  });
  it('rejects replacing animation sheets and duplicate registrations', async () => {
    const manifest = registry(); manifest.artifacts[0].frameCount = 8; put('generation_manifest.json', JSON.stringify(manifest));
    expect((await generateManualAsset(request())).errors.join()).toContain('Animation sheets');
    manifest.artifacts[0].frameCount = 1; manifest.artifacts.push({ ...manifest.artifacts[0] }); put('generation_manifest.json', JSON.stringify(manifest));
    expect((await generateManualAsset(request())).errors.join()).toContain('ambiguous'); expect(fixture.generate).not.toHaveBeenCalled();
  });

  it('preserves malformed history without dispatching image generation', async () => {
    const manifest = registry(); manifest.assetHistory = { player: 'broken history' };
    put('generation_manifest.json', JSON.stringify(manifest));
    expect((await generateManualAsset(request())).errors.join()).toContain('history is invalid');
    expect(fixture.generate).not.toHaveBeenCalled(); expect(registry().assetHistory.player).toBe('broken history');
    expect(bytes(path)).toBe('original artwork');
  });
  it('honors disabled image providers and keeps top-down lineage independent of side-view conventions', async () => {
    put('game_dna.json', JSON.stringify({ ...dna, archetype: 'TOP_DOWN_ACTION_ADVENTURE' }));
    const result = await generateManualAsset({ ...request(), providerEnabled: { diffusers: false } });
    expect(result.success).toBe(true); expect(fixture.generate.mock.calls[0]![0].providerEnabled).toEqual({ diffusers: false });
    expect(registry().artifacts[1].dirty).toBeUndefined(); expect(bytes('assets/characters/player_walk.png')).toBe('existing animation');
  });
});
