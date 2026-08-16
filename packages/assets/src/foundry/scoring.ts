import type { AssetRequest, FoundryCostClass } from '@metroforge/schemas';
import type { ImageModeFlags } from './mode-flags.js';
import { imageCostRank, nvidiaFamily } from './mode-flags.js';

export interface ScoreableProvider {
  id: string;
  local: boolean;
  priority: number;
  costClass: FoundryCostClass;
  capabilities: string[];
  supportsReferenceImages: boolean;
  supportsEditing?: boolean;
  supports3D?: boolean;
  qualityScore: number;
  speedScore: number;
  consistencyScore: number;
  reliabilityScore: number;
  licenseScore: number;
  localityScore: number;
  family?: string;
  healthPenalty: number;
  expectedCost: number;
  expectedLatencyMs: number;
}

export interface ScoreBreakdown {
  total: number;
  capabilityMatch: number;
  quality: number;
  consistency: number;
  speed: number;
  reliability: number;
  license: number;
  locality: number;
  costPenalty: number;
  latencyPenalty: number;
  healthPenalty: number;
}

const WEIGHTS = {
  capability: 40,
  quality: 12,
  consistency: 10,
  speed: 8,
  reliability: 8,
  license: 10,
  locality: 6,
  cost: 14,
  latency: 6,
  health: 20,
} as const;

export function capabilityNameForAsset(assetType: AssetRequest['assetType']): string {
  if (assetType === '3d-model' || assetType === 'material') return '3d-generation';
  if (assetType === 'audio' || assetType === 'music' || assetType === 'voice') return 'audio';
  return 'image-generation';
}

export function scoreProvider(
  provider: ScoreableProvider,
  request: AssetRequest,
  flags: ImageModeFlags,
): ScoreBreakdown {
  const needed = capabilityNameForAsset(request.assetType);
  const capOk =
    provider.capabilities.length === 0 ||
    provider.capabilities.includes(needed) ||
    provider.capabilities.includes('image-generation');
  const capabilityMatch = capOk ? 1 : 0;
  if (request.consistency.characterConsistency && !provider.supportsReferenceImages) {
    // still eligible, just lower consistency
  }

  const qualityNeed = flags.highestQuality ? 1.4 : 1;
  const speedNeed = flags.fastest || flags.lowestCost ? 1.4 : 1;
  const localityNeed = flags.localOnly || flags.offline ? 1.5 : 1;
  const costNeed = flags.lowestCost || request.constraints.freeOnly ? 1.6 : 1;

  const quality = (provider.qualityScore / 100) * WEIGHTS.quality * qualityNeed;
  const consistency =
    (provider.consistencyScore / 100) *
    WEIGHTS.consistency *
    (request.consistency.characterConsistency ? 1.3 : 1);
  const speed = (provider.speedScore / 100) * WEIGHTS.speed * speedNeed;
  const reliability = (provider.reliabilityScore / 100) * WEIGHTS.reliability;
  const license = (provider.licenseScore / 100) * WEIGHTS.license;
  const locality = (provider.localityScore / 100) * WEIGHTS.locality * localityNeed;
  const costPenalty = (provider.expectedCost / 100) * WEIGHTS.cost * costNeed;
  const latencyPenalty =
    Math.min(1, provider.expectedLatencyMs / Math.max(request.constraints.maxLatencyMs ?? 120_000, 1)) *
    WEIGHTS.latency;
  const nvidiaBoost = flags.nvidiaOnly && nvidiaFamily(provider.id, provider.family) ? 15 : 0;
  const priorityNudge = provider.priority / 20;
  const total =
    capabilityMatch * WEIGHTS.capability +
    quality +
    consistency +
    speed +
    reliability +
    license +
    locality +
    nvidiaBoost +
    priorityNudge -
    costPenalty -
    latencyPenalty -
    provider.healthPenalty * WEIGHTS.health;

  return {
    total,
    capabilityMatch,
    quality,
    consistency,
    speed,
    reliability,
    license,
    locality,
    costPenalty,
    latencyPenalty,
    healthPenalty: provider.healthPenalty,
  };
}

export function compareByScoreThenCost(
  a: { score: number; costClass: FoundryCostClass; priority: number },
  b: { score: number; costClass: FoundryCostClass; priority: number },
  lowestCost: boolean,
): number {
  if (lowestCost) {
    const cost = imageCostRank(a.costClass) - imageCostRank(b.costClass);
    if (cost !== 0) return cost;
  }
  if (b.score !== a.score) return b.score - a.score;
  return b.priority - a.priority;
}
