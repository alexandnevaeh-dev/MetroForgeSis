import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inferAssetMaturity } from '@metroforge/shared';
import { proceduralProductionIntent, inferAssetTypeFromPath } from '@metroforge/assets';

/**
 * Bump whenever `proceduralProductionIntent()` / `inferAssetMaturity()` semantics change in a
 * way that could alter a reclassification outcome — recorded on every changed artifact so a
 * later audit can tell which predicate version produced a given promotion/demotion.
 */
export const RECLASSIFY_PREDICATE_VERSION = 'proceduralProductionIntent+portrait@2026-08-29';

export interface ManifestArtifactRecord extends Record<string, unknown> {
  id?: string;
  path?: string;
  provider?: string;
  fallbackGenerated?: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  maturity?: string;
  productionReady?: boolean;
  sourceType?: string;
  transformation?: string;
  parentArtifactIds?: string[];
}

export interface ReclassifiedArtifactChange {
  id: string;
  path: string;
  oldMaturity: string;
  newMaturity: string;
  oldProductionReady: boolean;
  newProductionReady: boolean;
  reason: string;
  predicateVersion: string;
}

export interface ReclassifyProjectAssetMaturityResult {
  success: boolean;
  projectPath: string;
  manifestPath: string;
  dryRun: boolean;
  artifactCount: number;
  evaluatedCount: number;
  changedCount: number;
  unchangedCount: number;
  changes: ReclassifiedArtifactChange[];
  errors: string[];
}

export interface ReclassifyOptions {
  /** Evaluate and report but do not write the manifest. */
  dryRun?: boolean;
  /** Limit reclassification to these artifact ids or paths; default is every artifact. */
  artifactIds?: string[];
}

interface EffectiveEvidence {
  provider?: string;
  critiquePassed?: boolean;
  critiqueScore?: number;
  fallbackGenerated?: boolean;
  source: 'recorded' | 'inherited-from-parent';
  parentId?: string;
}

/**
 * A portrait cropped from an NPC/character sprite (`transformation: 'npc-portrait-crop'`) carries
 * no new content beyond the parent's pixels. A past generation-time bug (fixed in
 * packages/assets/src/asset-pipeline.ts) recorded a fabricated provider/critiqueScore for these
 * crops instead of the parent's real evidence, which can permanently pin an already-generated
 * project's portrait to PLACEHOLDER even after its parent reached PROCEDURAL_PRODUCTION. This is
 * keyed off the `transformation` field — a real semantic marker applicable to any NPC portrait,
 * not a per-filename special case — not off `quest_giver` or any other name.
 */
function effectiveEvidence(
  artifact: ManifestArtifactRecord,
  byId: Map<string, ManifestArtifactRecord>,
): EffectiveEvidence {
  if (
    artifact.transformation === 'npc-portrait-crop' &&
    Array.isArray(artifact.parentArtifactIds) &&
    artifact.parentArtifactIds.length > 0
  ) {
    const parentId = String(artifact.parentArtifactIds[0]);
    const parent = byId.get(parentId);
    if (parent) {
      return {
        provider: parent.provider,
        critiquePassed: parent.critiquePassed,
        critiqueScore: parent.critiqueScore,
        fallbackGenerated: parent.fallbackGenerated,
        source: 'inherited-from-parent',
        parentId,
      };
    }
  }
  return {
    provider: artifact.provider,
    critiquePassed: artifact.critiquePassed,
    critiqueScore: artifact.critiqueScore,
    fallbackGenerated: artifact.fallbackGenerated,
    source: 'recorded',
  };
}

function buildReason(
  evidence: EffectiveEvidence,
  assetType: string,
  proceduralProduction: boolean,
  newMaturity: string,
): string {
  const parts: string[] = [];
  if (evidence.source === 'inherited-from-parent') {
    parts.push(`evidence inherited from parent artifact "${evidence.parentId}" (npc-portrait-crop)`);
  }
  parts.push(`provider=${evidence.provider ?? 'unknown'}`);
  parts.push(`critiquePassed=${String(evidence.critiquePassed ?? 'unset')}`);
  parts.push(`critiqueScore=${evidence.critiqueScore ?? 'unset'}`);
  parts.push(`fallbackGenerated=${String(evidence.fallbackGenerated ?? 'unset')}`);
  parts.push(`assetType="${assetType}"`);
  parts.push(`proceduralProductionIntent=${proceduralProduction}`);
  parts.push(`=> ${newMaturity}`);
  return parts.join(', ');
}

/**
 * Re-evaluate every artifact in a generated project's `generation_manifest.json` against the
 * *current* `proceduralProductionIntent()` / `inferAssetMaturity()` predicates, using each
 * artifact's currently-recorded evidence (or, for an npc-portrait-crop, its parent's evidence —
 * see `effectiveEvidence`). Unlike `backfillProjectAssetMaturity()`, which only fills genuinely
 * missing fields and never overwrites an existing maturity, this recomputes maturity/
 * productionReady/sourceType outright and overwrites them when the current predicate disagrees
 * with what was recorded at generation time (e.g. because the predicate itself was narrower back
 * then). It never touches an artifact's original provider/critique/fallback fields — those are
 * preserved exactly as recorded; only the derived maturity fields and a new audit trail
 * (reclassifiedFrom/reclassifiedAt/reclassifyReason/predicateVersion) are added or changed.
 *
 * Deterministic and idempotent: given unchanged manifest evidence, running this twice produces
 * the same maturity both times and reports zero changes on the second run.
 */
export function reclassifyProjectAssetMaturity(
  projectPath: string,
  opts: ReclassifyOptions = {},
): ReclassifyProjectAssetMaturityResult {
  const dryRun = opts.dryRun === true;
  const manifestPath = join(projectPath, 'generation_manifest.json');

  if (!existsSync(manifestPath)) {
    return {
      success: false,
      projectPath,
      manifestPath,
      dryRun,
      artifactCount: 0,
      evaluatedCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      changes: [],
      errors: ['generation_manifest.json missing'],
    };
  }

  let raw: { artifacts?: ManifestArtifactRecord[]; [key: string]: unknown };
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as typeof raw;
  } catch (err) {
    return {
      success: false,
      projectPath,
      manifestPath,
      dryRun,
      artifactCount: 0,
      evaluatedCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      changes: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts : [];
  const byId = new Map<string, ManifestArtifactRecord>();
  for (const artifact of artifacts) {
    const key = String(artifact.id ?? artifact.path ?? '');
    if (key) byId.set(key, artifact);
  }

  const targetIds = opts.artifactIds ? new Set(opts.artifactIds) : null;
  const changes: ReclassifiedArtifactChange[] = [];
  let evaluatedCount = 0;

  const nextArtifacts = artifacts.map((artifact) => {
    const id = String(artifact.id ?? artifact.path ?? '');
    const path = String(artifact.path ?? '').replace(/\\/g, '/');
    if (!path) return artifact;
    if (targetIds && !targetIds.has(id) && !targetIds.has(path)) return artifact;
    // proceduralProductionIntent() is a *visual* asset predicate — it explicitly excludes
    // /audio//sfx/ paths by design, because audio has its own, separate maturity pathway.
    // Applying it to non-.png artifacts would silently overwrite a valid classification this
    // reclassifier was never meant to arbitrate, not "correct" it.
    if (!path.toLowerCase().endsWith('.png')) return artifact;

    evaluatedCount += 1;

    const evidence = effectiveEvidence(artifact, byId);
    const assetType = inferAssetTypeFromPath(path);
    const proceduralProduction = proceduralProductionIntent(
      { path, provider: evidence.provider ?? '', critiquePassed: evidence.critiquePassed ?? false },
      assetType,
    );
    const inferred = inferAssetMaturity({
      fallbackGenerated: evidence.fallbackGenerated,
      provider: evidence.provider,
      critiquePassed: evidence.critiquePassed,
      critiqueScore: evidence.critiqueScore,
      proceduralProduction,
    });

    const oldMaturity = typeof artifact.maturity === 'string' ? artifact.maturity : 'UNKNOWN';
    const oldProductionReady = artifact.productionReady === true;

    if (inferred.maturity === oldMaturity && inferred.productionReady === oldProductionReady) {
      return artifact;
    }

    const reason = buildReason(evidence, assetType, proceduralProduction, inferred.maturity);
    changes.push({
      id,
      path,
      oldMaturity,
      newMaturity: inferred.maturity,
      oldProductionReady,
      newProductionReady: inferred.productionReady,
      reason,
      predicateVersion: RECLASSIFY_PREDICATE_VERSION,
    });

    return {
      ...artifact,
      maturity: inferred.maturity,
      productionReady: inferred.productionReady,
      sourceType: inferred.sourceType,
      proceduralProduction,
      reclassifiedFrom: oldMaturity,
      reclassifiedAt: new Date().toISOString(),
      reclassifyReason: reason,
      predicateVersion: RECLASSIFY_PREDICATE_VERSION,
    };
  });

  if (!dryRun && changes.length > 0) {
    writeFileSync(manifestPath, JSON.stringify({ ...raw, artifacts: nextArtifacts }, null, 2));
  }

  return {
    success: true,
    projectPath,
    manifestPath,
    dryRun,
    artifactCount: artifacts.length,
    evaluatedCount,
    changedCount: changes.length,
    unchangedCount: evaluatedCount - changes.length,
    changes,
    errors: [],
  };
}
