import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface AssetVersionRecord {
  version: number;
  path: string;
  backupPath: string;
  timestamp: string;
  prompt?: string;
  seed?: number;
  provider?: string;
  manual?: boolean;
}

export function recordAssetVersion(
  projectPath: string,
  assetId: string,
  entry: {
    path: string;
    prompt?: string;
    seed?: number;
    provider?: string;
    manual?: boolean;
  },
): AssetVersionRecord {
  const manifestPath = join(projectPath, 'generation_manifest.json');
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
        artifacts?: Array<Record<string, unknown>>;
        assetHistory?: Record<string, AssetVersionRecord[]>;
      })
    : { artifacts: [], assetHistory: {} };

  const history = manifest.assetHistory ?? {};
  const versions = history[assetId] ?? [];
  const version = versions.length + 1;
  const backupRel = `.metroforge/asset_history/${assetId}_v${version}.png`;
  const backupFull = join(projectPath, backupRel);
  const sourceFull = join(projectPath, ...entry.path.split('/'));

  if (existsSync(sourceFull)) {
    mkdirSync(dirname(backupFull), { recursive: true });
    copyFileSync(sourceFull, backupFull);
  }

  const record: AssetVersionRecord = {
    version,
    path: entry.path,
    backupPath: backupRel,
    timestamp: new Date().toISOString(),
    prompt: entry.prompt,
    seed: entry.seed,
    provider: entry.provider,
    manual: entry.manual,
  };

  history[assetId] = [...versions, record];
  manifest.assetHistory = history;

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return record;
}

export function listAssetHistory(
  projectPath: string,
  assetId: string,
): AssetVersionRecord[] {
  const manifestPath = join(projectPath, 'generation_manifest.json');
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      assetHistory?: Record<string, AssetVersionRecord[]>;
    };
    return manifest.assetHistory?.[assetId] ?? [];
  } catch {
    return [];
  }
}

export function restoreAssetVersion(
  projectPath: string,
  assetId: string,
  version: number,
): { success: boolean; path?: string; error?: string } {
  const versions = listAssetHistory(projectPath, assetId);
  const record = versions.find((v) => v.version === version);
  if (!record) return { success: false, error: 'Version not found' };

  const backupFull = join(projectPath, record.backupPath);
  const targetFull = join(projectPath, record.path);
  if (!existsSync(backupFull)) return { success: false, error: 'Backup file missing' };

  mkdirSync(dirname(targetFull), { recursive: true });
  copyFileSync(backupFull, targetFull);
  return { success: true, path: record.path };
}
