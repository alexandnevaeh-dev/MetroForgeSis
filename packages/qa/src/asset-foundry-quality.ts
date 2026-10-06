import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VisualAssetQualityTier, VisualCertification } from '@metroforge/schemas';
import { NON_PRODUCTION_MATURITIES } from '@metroforge/shared';

export interface AssetQualityRecord {
  id: string;
  path: string;
  tier: VisualAssetQualityTier;
  maturity?: string;
  placeholder: boolean;
  productionReady: boolean;
  constitutionVersion?: string;
  provider?: string;
  model?: string;
  defects?: string[];
}

export interface AssetFoundryQualityReport {
  generatedAt: string;
  constitutionId: string;
  constitutionVersion: string;
  totalAssets: number;
  placeholderAssets: number;
  approvedAssets: number;
  productionReadyAssets: number;
  failedAssets: number;
  placeholderRatio: number;
  approvedRatio: number;
  productionReadyRatio: number;
  visualConsistencyScore: number;
  certification: VisualCertification;
  hardFailures: string[];
  assets: AssetQualityRecord[];
}

export interface VisualCertificationPolicy {
  maxPlaceholderRatio: number;
  minProductionReadyRatio: number;
  minConsistencyScore: number;
}

export const DEFAULT_VISUAL_CERTIFICATION_POLICY: VisualCertificationPolicy = {
  maxPlaceholderRatio: 0.2,
  minProductionReadyRatio: 0.8,
  minConsistencyScore: 80,
};

export function classifyAssetTier(input: {
  placeholder?: boolean;
  maturity?: string;
  productionReady?: boolean;
  qaPassed?: boolean;
}): VisualAssetQualityTier {
  if (input.maturity && NON_PRODUCTION_MATURITIES.has(input.maturity as never)) {
    return input.maturity === 'BLOCKOUT' ? 'BLOCKOUT' : 'PROCEDURAL_PLACEHOLDER';
  }
  if (input.placeholder) return 'PROCEDURAL_PLACEHOLDER';
  if (input.productionReady) return 'PRODUCTION_READY';
  if (input.qaPassed) return 'VISUALLY_VALIDATED';
  return 'DRAFT_GENERATED';
}

export function certifyVisualAssets(
  assets: AssetQualityRecord[],
  constitution: { id: string; version: string },
  consistencyScore: number,
  policy: VisualCertificationPolicy = DEFAULT_VISUAL_CERTIFICATION_POLICY,
): AssetFoundryQualityReport {
  const totalAssets = assets.length;
  const placeholderAssets = assets.filter((a) => a.placeholder || a.tier === 'BLOCKOUT' || a.tier === 'PROCEDURAL_PLACEHOLDER').length;
  const approvedAssets = assets.filter((a) => a.tier === 'APPROVED' || a.tier === 'PRODUCTION_READY').length;
  const productionReadyAssets = assets.filter((a) => a.productionReady || a.tier === 'PRODUCTION_READY').length;
  const failedAssets = assets.filter((a) => (a.defects?.length ?? 0) > 0 || a.tier === 'DRAFT_GENERATED').length;
  const placeholderRatio = totalAssets ? placeholderAssets / totalAssets : 0;
  const approvedRatio = totalAssets ? approvedAssets / totalAssets : 0;
  const productionReadyRatio = totalAssets ? productionReadyAssets / totalAssets : 0;
  const hardFailures: string[] = [];
  if (placeholderRatio > policy.maxPlaceholderRatio) hardFailures.push(`placeholder ratio ${(placeholderRatio * 100).toFixed(1)}% exceeds ${(policy.maxPlaceholderRatio * 100).toFixed(1)}%`);
  if (productionReadyRatio < policy.minProductionReadyRatio) hardFailures.push(`production-ready ratio ${(productionReadyRatio * 100).toFixed(1)}% below ${(policy.minProductionReadyRatio * 100).toFixed(1)}%`);
  if (consistencyScore < policy.minConsistencyScore) hardFailures.push(`visual consistency ${consistencyScore} below ${policy.minConsistencyScore}`);
  const certification: VisualCertification = hardFailures.length
    ? 'VISUAL_DEGRADED'
    : productionReadyRatio >= policy.minProductionReadyRatio && consistencyScore >= policy.minConsistencyScore
      ? 'VISUAL_PRODUCTION_READY'
      : 'VISUAL_VALIDATED';
  return {
    generatedAt: new Date().toISOString(),
    constitutionId: constitution.id,
    constitutionVersion: constitution.version,
    totalAssets,
    placeholderAssets,
    approvedAssets,
    productionReadyAssets,
    failedAssets,
    placeholderRatio,
    approvedRatio,
    productionReadyRatio,
    visualConsistencyScore: consistencyScore,
    certification,
    hardFailures,
    assets,
  };
}

export function writeAssetFoundryReport(projectPath: string, report: AssetFoundryQualityReport): void {
  const reportPath = join(projectPath, 'asset-foundry-report.json');
  const visualPath = join(projectPath, 'visual-qa-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(visualPath, JSON.stringify({ ...report, assets: report.assets.filter((a) => (a.defects?.length ?? 0) > 0) }, null, 2));
}

export function readAssetFoundryReport(projectPath: string): AssetFoundryQualityReport | null {
  const path = join(projectPath, 'asset-foundry-report.json');
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')) as AssetFoundryQualityReport; } catch { return null; }
}
