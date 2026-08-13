import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  inferAssetMaturity,
  type AssetSourceType,
} from '@metroforge/shared';

export interface ManifestArtifact extends Record<string, unknown> {
  path?: string;
  provider?: string;
  fallbackGenerated?: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  maturity?: string;
  productionReady?: boolean;
  sourceType?: string;
}

export interface GenerationManifestFile {
  artifacts?: ManifestArtifact[];
  [key: string]: unknown;
}

export interface BackfillAssetMaturityResult {
  success: boolean;
  projectPath: string;
  manifestPath: string;
  artifactCount: number;
  updatedCount: number;
  skippedCount: number;
  dryRun: boolean;
  errors: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** True when maturity / productionReady / sourceType need filling (empty or missing only). */
export function artifactNeedsMaturityBackfill(artifact: Record<string, unknown>): boolean {
  const missingMaturity = !isNonEmptyString(artifact.maturity);
  const missingProductionReady = typeof artifact.productionReady !== 'boolean';
  const missingSourceType = !isNonEmptyString(artifact.sourceType);
  return missingMaturity || missingProductionReady || missingSourceType;
}

/**
 * Fill missing maturity fields via inferAssetMaturity. Idempotent — never overwrites
 * existing non-empty maturity / boolean productionReady / sourceType.
 */
export function backfillArtifactMaturityFields(
  artifact: Record<string, unknown>,
): { artifact: Record<string, unknown>; updated: boolean } {
  if (!artifactNeedsMaturityBackfill(artifact)) {
    return { artifact, updated: false };
  }

  const existingSource = isNonEmptyString(artifact.sourceType)
    ? (artifact.sourceType as AssetSourceType)
    : undefined;

  const inferred = inferAssetMaturity({
    fallbackGenerated: artifact.fallbackGenerated === true,
    provider: typeof artifact.provider === 'string' ? artifact.provider : null,
    critiquePassed: typeof artifact.critiquePassed === 'boolean' ? artifact.critiquePassed : undefined,
    critiqueScore: typeof artifact.critiqueScore === 'number' ? artifact.critiqueScore : undefined,
    sourceType: existingSource,
  });

  const next: Record<string, unknown> = { ...artifact };
  let updated = false;

  if (!isNonEmptyString(next.maturity)) {
    next.maturity = inferred.maturity;
    updated = true;
  }
  if (typeof next.productionReady !== 'boolean') {
    next.productionReady = inferred.productionReady;
    updated = true;
  }
  if (!isNonEmptyString(next.sourceType)) {
    next.sourceType = inferred.sourceType;
    updated = true;
  }

  return { artifact: next, updated };
}

/** Pure backfill over an in-memory generation_manifest payload. */
export function backfillManifestMaturity(
  manifest: GenerationManifestFile,
): { manifest: GenerationManifestFile; updatedCount: number; skippedCount: number } {
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  let updatedCount = 0;
  let skippedCount = 0;
  const nextArtifacts = artifacts.map((artifact) => {
    const { artifact: filled, updated } = backfillArtifactMaturityFields(artifact ?? {});
    if (updated) updatedCount += 1;
    else skippedCount += 1;
    return filled as ManifestArtifact;
  });

  return {
    manifest: { ...manifest, artifacts: nextArtifacts },
    updatedCount,
    skippedCount,
  };
}

/** Walk generation_manifest.json and persist missing maturity fields. */
export function backfillProjectAssetMaturity(
  projectPath: string,
  opts?: { dryRun?: boolean },
): BackfillAssetMaturityResult {
  const dryRun = opts?.dryRun === true;
  const manifestPath = join(projectPath, 'generation_manifest.json');
  if (!existsSync(manifestPath)) {
    return {
      success: false,
      projectPath,
      manifestPath,
      artifactCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      dryRun,
      errors: ['generation_manifest.json missing'],
    };
  }

  let raw: GenerationManifestFile;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as GenerationManifestFile;
  } catch (err) {
    return {
      success: false,
      projectPath,
      manifestPath,
      artifactCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      dryRun,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const { manifest, updatedCount, skippedCount } = backfillManifestMaturity(raw);
  const artifactCount = Array.isArray(manifest.artifacts) ? manifest.artifacts.length : 0;

  if (!dryRun && updatedCount > 0) {
    try {
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    } catch (err) {
      return {
        success: false,
        projectPath,
        manifestPath,
        artifactCount,
        updatedCount: 0,
        skippedCount: artifactCount,
        dryRun,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  return {
    success: true,
    projectPath,
    manifestPath,
    artifactCount,
    updatedCount,
    skippedCount,
    dryRun,
    errors: [],
  };
}
