import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertAssetId, assetFile, commitAssetFiles, fileBytes, invalidateAssetValidation, lockAssetMutation, sameBytes } from './asset-files.js';

export interface AssetVersionRecord {
  version: number;
  path: string;
  backupPath: string;
  sourcePath?: string;
  sourceBackupPath?: string;
  artifact?: Record<string, unknown>;
  timestamp: string;
  prompt?: string;
  seed?: number;
  provider?: string;
  manual?: boolean;
}

export function recordAssetVersion(projectPath: string, assetId: string, entry: {
  path: string; prompt?: string; seed?: number; provider?: string; manual?: boolean;
}): AssetVersionRecord {
  assertAssetId(assetId);
  const release = lockAssetMutation(projectPath);
  try {
    const manifestPath = assetFile(projectPath, 'generation_manifest.json');
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { artifacts: [] };
    const versions: AssetVersionRecord[] = manifest.assetHistory?.[assetId] ?? [];
    const version = Math.max(0, ...versions.map(v => v.version)) + 1;
    if (!Number.isSafeInteger(version)) throw new Error('Asset history is invalid');
    const backupPath = `.metroforge/asset_history/${assetId}_v${version}.png`;
    const source = assetFile(projectPath, entry.path);
    const backup = assetFile(projectPath, backupPath);
    if (!entry.path.startsWith('assets/') || !entry.path.endsWith('.png')) throw new Error('Invalid artwork path');
    if (!existsSync(source)) throw new Error('Artwork is missing; no version was recorded');
    if (existsSync(backup)) throw new Error('History backup already exists; existing versions were preserved');
    const artifact = manifest.artifacts?.find((row: Record<string, unknown>) => row.id === assetId);
    const record: AssetVersionRecord = { version, ...entry, backupPath, timestamp: new Date().toISOString(),
      artifact: artifact ? { ...artifact } : undefined };
    manifest.assetHistory = { ...manifest.assetHistory, [assetId]: [...versions, record] };
    commitAssetFiles(new Map([[backup, readFileSync(source)], [manifestPath, Buffer.from(JSON.stringify(manifest, null, 2))]]));
    return record;
  } finally { release(); }
}

export function listAssetHistory(projectPath: string, assetId: string): AssetVersionRecord[] {
  // Reading a registry key does not construct a filename; legacy scene IDs may contain dots.
  if (typeof assetId !== 'string' || !assetId || assetId.length > 240) throw new Error('Invalid asset ID');
  const manifestPath = assetFile(projectPath, 'generation_manifest.json');
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const history = manifest.assetHistory;
  if (history != null && (typeof history !== 'object' || Array.isArray(history))) throw new Error('Asset history is invalid; existing records were preserved');
  const records = history && Object.hasOwn(history, assetId) ? history[assetId] : [];
  if (!Array.isArray(records) || records.some(record => !record ||
      !Number.isSafeInteger(record.version) || record.version < 1 ||
      typeof record.path !== 'string' || typeof record.backupPath !== 'string' ||
      typeof record.timestamp !== 'string')) throw new Error('Asset history is invalid; existing records were preserved');
  return records;
}

export function restoreAssetVersion(projectPath: string, assetId: string, version: number): { success: boolean; path?: string; error?: string } {
  let release: (() => void) | undefined;
  try {
    assertAssetId(assetId);
    release = lockAssetMutation(projectPath);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error('Invalid version');
    const record = listAssetHistory(projectPath, assetId).find(v => v.version === version);
    if (!record) throw new Error('Version not found');
    const writes = new Map<string, Buffer>();
    const restore = (path: string, backupPath: string) => {
      if (!path.startsWith('assets/') || !path.endsWith('.png') || !backupPath.startsWith('.metroforge/asset_history/')) throw new Error('Invalid artwork history path');
      const backup = assetFile(projectPath, backupPath);
      const target = assetFile(projectPath, path);
      const runtime = assetFile(projectPath, `Assets/StreamingAssets/${path}`);
      if (!existsSync(backup)) throw new Error('Backup file missing');
      if (existsSync(runtime) && !sameBytes(fileBytes(target), fileBytes(runtime))) throw new Error('Asset runtime copies differ; reconcile them before restoring');
      writes.set(target, readFileSync(backup));
      if (existsSync(runtime)) writes.set(runtime, readFileSync(backup));
    };
    const manifest = JSON.parse(readFileSync(join(projectPath, 'generation_manifest.json'), 'utf8'));
    const matches = (manifest.artifacts ?? []).filter((row: Record<string, unknown>) => row.id === assetId);
    if (matches.length > 1 || (matches.length === 1 && matches[0].path !== record.path)) throw new Error('Asset registration changed; reconcile history before restoring');
    restore(record.path, record.backupPath);
    if (record.sourcePath && record.sourceBackupPath) restore(record.sourcePath, record.sourceBackupPath);
    const current = fileBytes(assetFile(projectPath, record.path));
    if (current && !sameBytes(current, writes.get(assetFile(projectPath, record.path))!)) {
      const versions: AssetVersionRecord[] = manifest.assetHistory?.[assetId] ?? [];
      const next = Math.max(0, ...versions.map(v => v.version)) + 1;
      if (!Number.isSafeInteger(next)) throw new Error('Asset history is invalid');
      const backupPath = `.metroforge/asset_history/${assetId}_v${next}.png`;
      const backup = assetFile(projectPath, backupPath);
      if (existsSync(backup)) throw new Error('History backup already exists; existing artwork was preserved');
      writes.set(backup, current);
      const row = matches[0];
      const snapshot: AssetVersionRecord = { version: next, path: record.path, backupPath,
        timestamp: new Date().toISOString(), prompt: row?.prompt, provider: row?.provider, seed: row?.seed, manual: true,
        artifact: row ? { ...row } : undefined };
      if (record.sourcePath && record.sourceBackupPath) {
        const sourceBytes = fileBytes(assetFile(projectPath, record.sourcePath));
        if (sourceBytes) {
          const sourceBackupPath = `.metroforge/asset_history/${assetId}_v${next}_source.png`;
          const sourceBackup = assetFile(projectPath, sourceBackupPath);
          if (existsSync(sourceBackup)) throw new Error('Source history backup already exists');
          writes.set(sourceBackup, sourceBytes);
          snapshot.sourcePath = record.sourcePath; snapshot.sourceBackupPath = sourceBackupPath;
        }
      }
      manifest.assetHistory = { ...manifest.assetHistory, [assetId]: [...versions, snapshot] };
    }
    if (record.artifact && (record.artifact.id !== assetId || record.artifact.path !== record.path)) throw new Error('History metadata does not match the registered artwork');
    if (matches[0]) {
      manifest.artifacts[manifest.artifacts.indexOf(matches[0])] = {
        ...(record.artifact ?? matches[0]), prompt: record.prompt, provider: record.provider,
        seed: record.seed, productionReady: false, restoredFromVersion: version,
      };
    }
    writes.set(assetFile(projectPath, 'generation_manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)));
    invalidateAssetValidation(projectPath, writes);
    commitAssetFiles(writes);
    return { success: true, path: record.path };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
  finally { release?.(); }
}
