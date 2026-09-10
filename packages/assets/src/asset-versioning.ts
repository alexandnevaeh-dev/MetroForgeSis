import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

export type AssetVersionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'ACTIVE';
export type AssetOperationType = 'IMAGE_EDIT' | 'IMAGE_GENERATION' | 'MANUAL_IMPORT' | 'REVERT';

export interface AssetVersionRecord {
  assetId: string;
  parentAssetId?: string;
  rootAssetId: string;
  versionNumber: number;
  operationType: AssetOperationType;
  path: string;
  status: AssetVersionStatus;
  provider?: string;
  model?: string;
  instruction?: string;
  instructionHash?: string;
  seed?: number;
  createdAt: string;
  mimeType?: string;
  fileSize?: number;
  nativeWidth?: number;
  nativeHeight?: number;
  provenance?: Record<string, unknown>;
  editOperationId?: string;
}

export interface EditOperationRecord {
  editOperationId: string;
  sourceAssetIds: string[];
  outputAssetId: string;
  provider: string;
  model: string;
  instruction: string;
  instructionHash: string;
  seed?: number;
  createdAt: string;
  durationMs?: number;
  status: AssetVersionStatus;
  qaStatus?: string;
  requestedChangeScope?: string;
  observedChangeScope?: string;
}

export interface AssetVersionIndex {
  version: 1;
  versions: Record<string, AssetVersionRecord>;
  editOperations: Record<string, EditOperationRecord>;
  /** rootAssetId → currently active assetId (non-destructive pointer). */
  activeVersions: Record<string, string>;
}

const INDEX_VERSION = 1 as const;

export function hashInstruction(instruction: string): string {
  return createHash('sha256').update(instruction).digest('hex');
}

export function assetVersionIndexPath(storageRoot: string): string {
  return join(storageRoot, '.metroforge', 'asset_versions.json');
}

export function loadAssetVersionIndex(storageRoot: string): AssetVersionIndex {
  const path = assetVersionIndexPath(storageRoot);
  if (!existsSync(path)) {
    return { version: INDEX_VERSION, versions: {}, editOperations: {}, activeVersions: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as AssetVersionIndex;
    return {
      version: INDEX_VERSION,
      versions: parsed.versions ?? {},
      editOperations: parsed.editOperations ?? {},
      activeVersions: parsed.activeVersions ?? {},
    };
  } catch {
    return { version: INDEX_VERSION, versions: {}, editOperations: {}, activeVersions: {} };
  }
}

export function saveAssetVersionIndex(storageRoot: string, index: AssetVersionIndex): void {
  const path = assetVersionIndexPath(storageRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(index, null, 2));
}

export function registerInitialAssetVersion(input: {
  storageRoot: string;
  assetId: string;
  path: string;
  operationType?: AssetOperationType;
  provider?: string;
  model?: string;
  seed?: number;
  mimeType?: string;
  fileSize?: number;
  nativeWidth?: number;
  nativeHeight?: number;
  provenance?: Record<string, unknown>;
  status?: AssetVersionStatus;
}): AssetVersionRecord {
  const index = loadAssetVersionIndex(input.storageRoot);
  if (index.versions[input.assetId]) return index.versions[input.assetId]!;

  const record: AssetVersionRecord = {
    assetId: input.assetId,
    rootAssetId: input.assetId,
    versionNumber: 1,
    operationType: input.operationType ?? 'IMAGE_GENERATION',
    path: input.path,
    status: input.status ?? 'ACTIVE',
    provider: input.provider,
    model: input.model,
    seed: input.seed,
    createdAt: new Date().toISOString(),
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    nativeWidth: input.nativeWidth,
    nativeHeight: input.nativeHeight,
    provenance: input.provenance,
  };
  index.versions[input.assetId] = record;
  index.activeVersions[input.assetId] = input.assetId;
  saveAssetVersionIndex(input.storageRoot, index);
  return record;
}

function nextVersionNumber(index: AssetVersionIndex, rootAssetId: string): number {
  const siblings = Object.values(index.versions).filter((v) => v.rootAssetId === rootAssetId);
  return siblings.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
}

function deriveChildAssetId(rootAssetId: string, versionNumber: number): string {
  return `${rootAssetId}-v${versionNumber}`;
}

/**
 * Non-destructive edit: source bytes are never overwritten; output is a new immutable version.
 */
export function createEditAssetVersion(input: {
  storageRoot: string;
  sourceAssetId: string;
  sourcePath: string;
  outputBuffer: Buffer;
  outputRelPath?: string;
  provider: string;
  model: string;
  instruction: string;
  seed?: number;
  durationMs?: number;
  mimeType?: string;
  nativeWidth?: number;
  nativeHeight?: number;
  provenance?: Record<string, unknown>;
  qaStatus?: string;
  requestedChangeScope?: string;
  observedChangeScope?: string;
}): { version: AssetVersionRecord; operation: EditOperationRecord; outputPath: string } {
  const index = loadAssetVersionIndex(input.storageRoot);
  const source =
    index.versions[input.sourceAssetId] ??
    registerInitialAssetVersion({
      storageRoot: input.storageRoot,
      assetId: input.sourceAssetId,
      path: input.sourcePath,
      operationType: 'IMAGE_GENERATION',
    });

  const rootAssetId = source.rootAssetId;
  const versionNumber = nextVersionNumber(index, rootAssetId);
  const assetId = deriveChildAssetId(rootAssetId, versionNumber);
  const outputRel =
    input.outputRelPath ??
    join(dirname(source.path), `${assetId}.png`).replace(/\\/g, '/');
  const outputPath = join(input.storageRoot, ...outputRel.split('/'));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, input.outputBuffer);

  const instructionHash = hashInstruction(input.instruction);
  const editOperationId = `edit-${assetId}-${Date.now()}`;
  const operation: EditOperationRecord = {
    editOperationId,
    sourceAssetIds: [input.sourceAssetId],
    outputAssetId: assetId,
    provider: input.provider,
    model: input.model,
    instruction: input.instruction,
    instructionHash,
    seed: input.seed,
    createdAt: new Date().toISOString(),
    durationMs: input.durationMs,
    status: 'PENDING',
    qaStatus: input.qaStatus,
    requestedChangeScope: input.requestedChangeScope,
    observedChangeScope: input.observedChangeScope,
  };

  const version: AssetVersionRecord = {
    assetId,
    parentAssetId: input.sourceAssetId,
    rootAssetId,
    versionNumber,
    operationType: 'IMAGE_EDIT',
    path: outputRel.replace(/\\/g, '/'),
    status: 'PENDING',
    provider: input.provider,
    model: input.model,
    instruction: input.instruction,
    instructionHash,
    seed: input.seed,
    createdAt: operation.createdAt,
    mimeType: input.mimeType ?? 'image/png',
    fileSize: input.outputBuffer.length,
    nativeWidth: input.nativeWidth,
    nativeHeight: input.nativeHeight,
    provenance: input.provenance,
    editOperationId,
  };

  index.versions[assetId] = version;
  index.editOperations[editOperationId] = operation;
  saveAssetVersionIndex(input.storageRoot, index);

  return { version, operation, outputPath };
}

/** Ordered chain from root → … → assetId (metadata only). */
export function getAssetHistory(storageRoot: string, assetId: string): AssetVersionRecord[] {
  const index = loadAssetVersionIndex(storageRoot);
  const target = index.versions[assetId];
  if (!target) return [];

  const rootId = target.rootAssetId;
  const chain = Object.values(index.versions)
    .filter((v) => v.rootAssetId === rootId)
    .sort((a, b) => a.versionNumber - b.versionNumber);

  const upto = chain.findIndex((v) => v.assetId === assetId);
  return upto >= 0 ? chain.slice(0, upto + 1) : chain;
}

export function acceptAssetVersion(storageRoot: string, assetId: string): AssetVersionRecord | null {
  const index = loadAssetVersionIndex(storageRoot);
  const record = index.versions[assetId];
  if (!record) return null;

  record.status = 'ACCEPTED';
  index.activeVersions[record.rootAssetId] = assetId;
  for (const sibling of Object.values(index.versions)) {
    if (sibling.rootAssetId === record.rootAssetId && sibling.assetId !== assetId && sibling.status === 'ACTIVE') {
      sibling.status = 'ACCEPTED';
    }
  }
  record.status = 'ACTIVE';
  const op = record.editOperationId ? index.editOperations[record.editOperationId] : undefined;
  if (op) op.status = 'ACCEPTED';
  saveAssetVersionIndex(storageRoot, index);
  return record;
}

export function rejectAssetVersion(storageRoot: string, assetId: string): AssetVersionRecord | null {
  const index = loadAssetVersionIndex(storageRoot);
  const record = index.versions[assetId];
  if (!record) return null;
  record.status = 'REJECTED';
  const op = record.editOperationId ? index.editOperations[record.editOperationId] : undefined;
  if (op) op.status = 'REJECTED';
  saveAssetVersionIndex(storageRoot, index);
  return record;
}

/**
 * Non-destructive revert: marks an older version active without deleting newer versions.
 */
export function revertToAssetVersion(storageRoot: string, assetId: string): AssetVersionRecord | null {
  const index = loadAssetVersionIndex(storageRoot);
  const record = index.versions[assetId];
  if (!record) return null;

  for (const sibling of Object.values(index.versions)) {
    if (sibling.rootAssetId === record.rootAssetId && sibling.status === 'ACTIVE') {
      sibling.status = sibling.assetId === assetId ? 'ACTIVE' : 'ACCEPTED';
    }
  }
  record.status = 'ACTIVE';
  index.activeVersions[record.rootAssetId] = assetId;
  saveAssetVersionIndex(storageRoot, index);
  return record;
}

/** Ensure source file on disk is preserved (copy to history backup if missing from index). */
export function preserveSourceAsset(storageRoot: string, assetId: string, sourcePath: string): void {
  const index = loadAssetVersionIndex(storageRoot);
  if (index.versions[assetId]) return;
  if (!existsSync(sourcePath)) return;
  const backupRel = `.metroforge/asset_history/${assetId}_source_snapshot.png`;
  const backupFull = join(storageRoot, backupRel);
  if (!existsSync(backupFull)) {
    mkdirSync(dirname(backupFull), { recursive: true });
    copyFileSync(sourcePath, backupFull);
  }
  registerInitialAssetVersion({
    storageRoot,
    assetId,
    path: sourcePath.startsWith(storageRoot)
      ? sourcePath.slice(storageRoot.length + 1).replace(/\\/g, '/')
      : sourcePath,
    operationType: 'IMAGE_GENERATION',
    status: 'ACTIVE',
  });
}
