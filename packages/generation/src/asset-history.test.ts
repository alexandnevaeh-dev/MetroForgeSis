import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordAssetVersion, listAssetHistory, restoreAssetVersion } from './asset-history.js';

describe('asset-history', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'metroforge-history-'));
    writeFileSync(join(projectPath, 'generation_manifest.json'), JSON.stringify({ artifacts: [] }));
    mkdirSync(join(projectPath, 'assets'), { recursive: true });
    writeFileSync(join(projectPath, 'assets', 'test.png'), Buffer.from('v1'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('records and restores asset versions', () => {
    recordAssetVersion(projectPath, 'test_asset', {
      path: 'assets/test.png',
      prompt: 'first',
    });
    writeFileSync(join(projectPath, 'assets', 'test.png'), Buffer.from('v2'));

    const history = listAssetHistory(projectPath, 'test_asset');
    expect(history).toHaveLength(1);
    expect(history[0]!.version).toBe(1);

    const restored = restoreAssetVersion(projectPath, 'test_asset', 1);
    expect(restored.success).toBe(true);
    expect(readFileSync(join(projectPath, 'assets', 'test.png')).toString()).toBe('v1');
    expect(existsSync(join(projectPath, '.metroforge', 'asset_history', 'test_asset_v1.png'))).toBe(true);
  });
  it('restores the existing Unity runtime copy together with the library asset', () => {
    recordAssetVersion(projectPath, 'test_asset', { path: 'assets/test.png' });
    const runtime = join(projectPath, 'Assets', 'StreamingAssets', 'assets', 'test.png');
    mkdirSync(join(runtime, '..'), { recursive: true });
    writeFileSync(runtime, 'v2');
    writeFileSync(join(projectPath, 'assets', 'test.png'), 'v2');
    expect(restoreAssetVersion(projectPath, 'test_asset', 1).success).toBe(true);
    expect(readFileSync(runtime, 'utf8')).toBe('v1');
    expect(readFileSync(join(projectPath, 'assets', 'test.png'), 'utf8')).toBe('v1');
  });

  it('preserves divergent runtime artwork rather than overwriting it', () => {
    recordAssetVersion(projectPath, 'test_asset', { path: 'assets/test.png' });
    const runtime = join(projectPath, 'Assets', 'StreamingAssets', 'assets', 'test.png');
    mkdirSync(join(runtime, '..'), { recursive: true });
    writeFileSync(runtime, 'runtime edit');
    writeFileSync(join(projectPath, 'assets', 'test.png'), 'library edit');
    expect(restoreAssetVersion(projectPath, 'test_asset', 1).success).toBe(false);
    expect(readFileSync(runtime, 'utf8')).toBe('runtime edit');
    expect(readFileSync(join(projectPath, 'assets', 'test.png'), 'utf8')).toBe('library edit');
  });
});
