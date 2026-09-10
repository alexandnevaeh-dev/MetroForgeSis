import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type AssetProvenanceCategory =
  | 'true_debug_placeholder'
  | 'procedural_production'
  | 'ai_generated'
  | 'user_provided'
  | 'ui_debug'
  | 'missing'
  | 'other';

export interface AssetProvenanceInput {
  id: string;
  path: string;
  provider?: string | null;
  sourceType?: string;
  maturity?: string;
  fallbackGenerated?: boolean;
  fallbackReason?: string;
  critiquePassed?: boolean;
  productionReady?: boolean;
  compiler?: string;
}

export interface AssetProvenanceRecord extends AssetProvenanceInput {
  family: string;
  category: AssetProvenanceCategory;
  runtimeUsage: 'runtime' | 'qa_only';
  reason: string;
}

export interface AssetProvenanceReport {
  generatedAt: string;
  totalAssets: number;
  counts: Record<AssetProvenanceCategory, number>;
  providerFallbacks: number;
  families: Array<{
    family: string;
    count: number;
    categories: Partial<Record<AssetProvenanceCategory, number>>;
    generators: string[];
    runtimeUsage: Array<'runtime' | 'qa_only'>;
    placeholderReasons: string[];
  }>;
  assets: AssetProvenanceRecord[];
}

function familyFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const match = normalized.match(/^assets\/([^/]+)/);
  return match?.[1] ?? 'other';
}

export function classifyAssetProvenance(
  asset: AssetProvenanceInput,
  projectPath?: string,
): AssetProvenanceRecord {
  const normalized = asset.path.replace(/\\/g, '/');
  const family = familyFromPath(normalized);
  const runtimeUsage = family === 'qa' ? 'qa_only' : 'runtime';
  const provider = (asset.provider ?? '').toLowerCase();
  const sourceType = (asset.sourceType ?? '').toLowerCase();
  const missing = Boolean(projectPath) && !existsSync(join(projectPath!, ...normalized.split('/')));

  let category: AssetProvenanceCategory;
  let reason: string;
  if (missing) {
    category = 'missing';
    reason = 'manifest path does not exist';
  } else if (runtimeUsage === 'qa_only') {
    category = 'ui_debug';
    reason = 'QA/contact-sheet artifact is not runtime art';
  } else if (asset.maturity === 'PLACEHOLDER' || asset.maturity === 'BLOCKOUT') {
    category = 'true_debug_placeholder';
    reason = asset.fallbackReason ?? `explicit ${asset.maturity.toLowerCase()} maturity`;
  } else if (asset.maturity === 'PROCEDURAL_PRODUCTION') {
    category = 'procedural_production';
    reason = 'final-use procedural generator output passed validation';
  } else if (sourceType === 'manual' || provider === 'user' || provider === 'user-provided') {
    category = 'user_provided';
    reason = 'user-supplied source';
  } else if (sourceType === 'ai_generated' || (provider && !['procedural', 'checkpoint', 'pixel-art-processor', 'compiled'].includes(provider))) {
    category = 'ai_generated';
    reason = 'accepted image-provider output';
  } else {
    category = 'other';
    reason = asset.maturity ? `maturity ${asset.maturity}` : 'unclassified provenance';
  }

  return { ...asset, path: normalized, family, category, runtimeUsage, reason };
}

export function buildAssetProvenanceReport(
  assets: AssetProvenanceInput[],
  projectPath?: string,
): AssetProvenanceReport {
  const records = assets.map((asset) => classifyAssetProvenance(asset, projectPath));
  const categories: AssetProvenanceCategory[] = [
    'true_debug_placeholder', 'procedural_production', 'ai_generated', 'user_provided', 'ui_debug', 'missing', 'other',
  ];
  const counts = Object.fromEntries(categories.map((category) => [category, records.filter((record) => record.category === category).length])) as Record<AssetProvenanceCategory, number>;
  const familyNames = [...new Set(records.map((record) => record.family))].sort();
  const families = familyNames.map((family) => {
    const members = records.filter((record) => record.family === family);
    const familyCategories: Partial<Record<AssetProvenanceCategory, number>> = {};
    for (const category of categories) {
      const count = members.filter((record) => record.category === category).length;
      if (count > 0) familyCategories[category] = count;
    }
    return {
      family,
      count: members.length,
      categories: familyCategories,
      generators: [...new Set(members.map((record) => record.compiler ?? record.provider ?? 'unknown'))].sort(),
      runtimeUsage: [...new Set(members.map((record) => record.runtimeUsage))],
      placeholderReasons: [...new Set(members.filter((record) => record.category === 'true_debug_placeholder').map((record) => record.reason))],
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    totalAssets: records.length,
    counts,
    providerFallbacks: records.filter((record) => record.fallbackGenerated === true).length,
    families,
    assets: records,
  };
}

export function writeAssetProvenanceReport(projectPath: string, report: AssetProvenanceReport): string {
  const path = join(projectPath, 'reports', 'asset-provenance-report.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}