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
});
