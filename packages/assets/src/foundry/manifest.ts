import type { AssetProvenance, AssetRequest } from '@metroforge/schemas';
import { AssetMissingError } from './errors.js';

export type FoundryCompletionMode = 'prototype' | 'production';

export interface ManifestAsset {
  id: string;
  assetType: AssetRequest['assetType'];
  path?: string;
  provider: string;
  model?: string;
  license: string;
  qaPassed: boolean;
  qaScore: number;
  sourceType: AssetProvenance['sourceType'];
  placeholder: boolean;
  validated: boolean;
  godotDestination?: string;
}

export interface FoundryManifest {
  completionMode: FoundryCompletionMode;
  expected: string[];
  assets: ManifestAsset[];
  retrieved: number;
  generated: number;
  validated: number;
  missing: string[];
  failed: string[];
  placeholders: string[];
}

export function emptyManifest(mode: FoundryCompletionMode, expected: string[] = []): FoundryManifest {
  return {
    completionMode: mode,
    expected,
    assets: [],
    retrieved: 0,
    generated: 0,
    validated: 0,
    missing: [...expected],
    failed: [],
    placeholders: [],
  };
}

export function upsertManifestAsset(manifest: FoundryManifest, asset: ManifestAsset): FoundryManifest {
  const assets = manifest.assets.filter((a) => a.id !== asset.id).concat(asset);
  return summarizeManifest({ ...manifest, assets });
}

export function summarizeManifest(manifest: FoundryManifest): FoundryManifest {
  const ids = new Set(manifest.assets.map((a) => a.id));
  const missing = manifest.expected.filter((id) => !ids.has(id));
  const failed = manifest.assets.filter((a) => !a.qaPassed).map((a) => a.id);
  const placeholders = manifest.assets.filter((a) => a.placeholder).map((a) => a.id);
  return {
    ...manifest,
    missing,
    failed,
    placeholders,
    retrieved: manifest.assets.filter((a) => a.sourceType === 'retrieved').length,
    generated: manifest.assets.filter((a) => a.sourceType === 'generated').length,
    validated: manifest.assets.filter((a) => a.validated && a.qaPassed && !a.placeholder).length,
  };
}

export function assertProductionComplete(manifest: FoundryManifest): void {
  const next = summarizeManifest(manifest);
  if (next.completionMode === 'prototype') return;
  const requiredOk =
    next.expected.length > 0 &&
    next.validated === next.expected.length &&
    next.missing.length === 0 &&
    next.placeholders.length === 0 &&
    next.failed.length === 0;
  if (!requiredOk) {
    throw new AssetMissingError(
      `production completion rejected: expected ${next.expected.length} validated ${next.validated} missing=${next.missing.join(',')} placeholders=${next.placeholders.join(',')}`,
    );
  }
}
