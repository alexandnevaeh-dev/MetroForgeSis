import type { GenerationMode } from '@metroforge/shared';
import type { FoundryCostClass, FoundryRoutingMode } from '@metroforge/schemas';

export interface ImageModeFlags {
  freeOnly: boolean;
  localOnly: boolean;
  nvidiaOnly: boolean;
  offline: boolean;
  commercialSafeOnly: boolean;
  lowestCost: boolean;
  fastest: boolean;
  highestQuality: boolean;
  routingMode: FoundryRoutingMode;
}

export function generationModeToFoundryRouting(mode?: GenerationMode): FoundryRoutingMode {
  switch (mode) {
    case 'FREE_ONLY':
      return 'free-only';
    case 'LOCAL_ONLY':
      return 'local-only';
    case 'OFFLINE':
      return 'offline';
    case 'FASTEST':
      return 'fastest';
    case 'HIGHEST_QUALITY':
      return 'highest-quality';
    case 'LOWEST_COST':
      return 'lowest-cost';
    case 'NVIDIA_ONLY':
      return 'nvidia-first';
    case 'CUSTOM':
      return 'custom';
    case 'BALANCED':
    case 'HYBRID_FREE':
    case 'COMMERCIAL_SAFE':
    case 'LOW_VRAM':
    default:
      return 'balanced';
  }
}

export function imageModeFlags(
  mode?: GenerationMode,
  routingOverride?: FoundryRoutingMode,
): ImageModeFlags {
  const routingMode = routingOverride ?? generationModeToFoundryRouting(mode);
  const commercialSafeOnly = mode === 'COMMERCIAL_SAFE';
  return {
    routingMode,
    commercialSafeOnly,
    freeOnly: routingMode === 'free-only',
    localOnly: routingMode === 'local-only' || routingMode === 'offline',
    nvidiaOnly: routingMode === 'nvidia-first',
    offline: routingMode === 'offline',
    lowestCost: routingMode === 'lowest-cost',
    fastest: routingMode === 'fastest',
    highestQuality: routingMode === 'highest-quality',
  };
}

const COST_RANK: Record<FoundryCostClass, number> = {
  free: 0,
  local: 1,
  credit: 2,
  paid: 3,
};

export function imageCostRank(cost: FoundryCostClass): number {
  return COST_RANK[cost];
}

export function resolveImageCostClass(
  local: boolean,
  costClass?: FoundryCostClass,
): FoundryCostClass {
  if (costClass) return costClass;
  return local ? 'local' : 'credit';
}

/** Paid or metered providers must not be used in free-only. Local runtimes are allowed. */
export function allowedByFreeOnly(cost: FoundryCostClass): boolean {
  return cost === 'free' || cost === 'local';
}

export function nvidiaFamily(id: string, family?: string): boolean {
  return family === 'nvidia' || id === 'nvidia-image' || id === 'nvidia' || id.startsWith('nvidia');
}
