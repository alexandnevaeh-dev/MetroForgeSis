import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  registerInitialAssetVersion,
  createEditAssetVersion,
  getAssetHistory,
  acceptAssetVersion,
  rejectAssetVersion,
  revertToAssetVersion,
  loadAssetVersionIndex,
} from './asset-versioning.js';

describe('asset-versioning', () => {
  let storageRoot: string;

  beforeEach(() => {
    storageRoot = mkdtempSync(join(tmpdir(), 'metroforge-asset-ver-'));
    mkdirSync(join(storageRoot, 'assets'), { recursive: true });
    writeFileSync(join(storageRoot, 'assets', 'hero-v1.png'), Buffer.from('source-bytes'));
  });

  afterEach(() => {
    rmSync(storageRoot, { recursive: true, force: true });
  });

  it('registers v1 and creates non-destructive v2 on edit', () => {
    registerInitialAssetVersion({
      storageRoot,
      assetId: 'hero-a',
      path: 'assets/hero-v1.png',
      provider: 'nvidia-image',
      model: 'black-forest-labs/flux.1-dev',
    });

    const sourceBefore = readFileSync(join(storageRoot, 'assets', 'hero-v1.png'));
    const { version, operation, outputPath } = createEditAssetVersion({
      storageRoot,
      sourceAssetId: 'hero-a',
      sourcePath: join(storageRoot, 'assets', 'hero-v1.png'),
      outputBuffer: Buffer.from('edited-bytes'),
      provider: 'nvidia-image-edit',
      model: 'black-forest-labs/flux.1-kontext-dev',
      instruction: 'change teal to violet',
      seed: 424242,
    });

    expect(version.versionNumber).toBe(2);
    expect(version.parentAssetId).toBe('hero-a');
    expect(version.rootAssetId).toBe('hero-a');
    expect(version.operationType).toBe('IMAGE_EDIT');
    expect(operation.sourceAssetIds).toEqual(['hero-a']);
    expect(readFileSync(join(storageRoot, 'assets', 'hero-v1.png'))).toEqual(sourceBefore);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('traverses v1 → v2 → v3 history', () => {
    registerInitialAssetVersion({
      storageRoot,
      assetId: 'chain-root',
      path: 'assets/chain-v1.png',
    });
    const v2 = createEditAssetVersion({
      storageRoot,
      sourceAssetId: 'chain-root',
      sourcePath: join(storageRoot, 'assets', 'hero-v1.png'),
      outputBuffer: Buffer.from('v2'),
      provider: 'nvidia-image-edit',
      model: 'black-forest-labs/flux.1-kontext-dev',
      instruction: 'edit one',
    });
    const v3 = createEditAssetVersion({
      storageRoot,
      sourceAssetId: v2.version.assetId,
      sourcePath: v2.outputPath,
      outputBuffer: Buffer.from('v3'),
      provider: 'nvidia-image-edit',
      model: 'black-forest-labs/flux.1-kontext-dev',
      instruction: 'edit two',
    });

    const history = getAssetHistory(storageRoot, v3.version.assetId);
    expect(history.map((h) => h.versionNumber)).toEqual([1, 2, 3]);
  });

  it('reject does not delete and accept/revert are non-destructive', () => {
    registerInitialAssetVersion({ storageRoot, assetId: 'rev-root', path: 'assets/rev-v1.png' });
    const edited = createEditAssetVersion({
      storageRoot,
      sourceAssetId: 'rev-root',
      sourcePath: join(storageRoot, 'assets', 'hero-v1.png'),
      outputBuffer: Buffer.from('edited'),
      provider: 'nvidia-image-edit',
      model: 'black-forest-labs/flux.1-kontext-dev',
      instruction: 'edit',
    });

    rejectAssetVersion(storageRoot, edited.version.assetId);
    expect(loadAssetVersionIndex(storageRoot).versions[edited.version.assetId]?.status).toBe('REJECTED');
    expect(existsSync(edited.outputPath)).toBe(true);

    acceptAssetVersion(storageRoot, edited.version.assetId);
    expect(loadAssetVersionIndex(storageRoot).activeVersions['rev-root']).toBe(edited.version.assetId);

    revertToAssetVersion(storageRoot, 'rev-root');
    expect(loadAssetVersionIndex(storageRoot).activeVersions['rev-root']).toBe('rev-root');
    expect(loadAssetVersionIndex(storageRoot).versions[edited.version.assetId]).toBeDefined();
  });
});
