import type { GenerationMode } from '@metroforge/shared';
import type { RoutingContext } from './types.js';

/** Default VRAM budget for LOW_VRAM mode when callers do not override. */
export const DEFAULT_LOW_VRAM_BUDGET_MB = 8192;

export interface ModeRoutingFlags {
  freeOnly: boolean;
  localOnly: boolean;
  nvidiaOnly: boolean;
  offline: boolean;
  commercialSafeOnly: boolean;
  qualityTarget: RoutingContext['qualityTarget'];
  maxVramMb?: number;
}

/** Maps a GenerationMode to CapabilityRouter filter flags — single source of truth for
 *  GenerationRouter.generate() and any other text-routing entry point. */
export function modeRoutingFlags(mode: GenerationMode): ModeRoutingFlags {
  switch (mode) {
    case 'FREE_ONLY':
      return {
        freeOnly: true,
        localOnly: false,
        nvidiaOnly: false,
        offline: false,
        commercialSafeOnly: false,
        qualityTarget: 'balanced',
      };
    case 'HYBRID_FREE':
      return {
        freeOnly: false,
        localOnly: false,
        nvidiaOnly: false,
        offline: false,
        commercialSafeOnly: false,
        qualityTarget: 'balanced',
      };
    case 'LOCAL_ONLY':
      return {
        freeOnly: false,
        localOnly: true,
        nvidiaOnly: false,
        offline: false,
        commercialSafeOnly: false,
        qualityTarget: 'balanced',
      };
    case 'OFFLINE':
      return {
        freeOnly: false,
        localOnly: true,
        nvidiaOnly: false,
        offline: true,
        commercialSafeOnly: false,
        qualityTarget: 'balanced',
      };
    case 'NVIDIA_ONLY':
      return {
        freeOnly: false,
        localOnly: false,
        nvidiaOnly: true,
        offline: false,
        commercialSafeOnly: false,
        qualityTarget: 'balanced',
      };
    case 'COMMERCIAL_SAFE':
      return {
        freeOnly: false,
        localOnly: false,
        nvidiaOnly: false,
        offline: false,
        commercialSafeOnly: true,
        qualityTarget: 'balanced',
      };
    case 'FASTEST':
      return {
        freeOnly: false,
        localOnly: false,
        nvidiaOnly: false,
        offline: false,
        commercialSafeOnly: false,
        qualityTarget: 'fast',
      };
    case 'HIGHEST_QUALITY':
      return {
        freeOnly: false,
        localOnly: false,
        nvidiaOnly: false,
        offline: false,
        commercialSafeOnly: false,
        qualityTarget: 'quality',
      };
    case 'LOW_VRAM':
      return {
        freeOnly: false,
        localOnly: false,
        nvidiaOnly: false,
        offline: false,
        commercialSafeOnly: false,
        qualityTarget: 'balanced',
        maxVramMb: DEFAULT_LOW_VRAM_BUDGET_MB,
      };
    case 'BALANCED':
    case 'CUSTOM':
    default:
      return {
        freeOnly: false,
        localOnly: false,
        nvidiaOnly: false,
        offline: false,
        commercialSafeOnly: false,
        qualityTarget: 'balanced',
      };
  }
}

/** True when bootstrap should register hosted (API-key-gated) text providers. */
export function modeRegistersHostedProviders(mode: GenerationMode): boolean {
  return (
    mode === 'HYBRID_FREE' ||
    mode === 'FREE_ONLY' ||
    mode === 'CUSTOM' ||
    mode === 'COMMERCIAL_SAFE' ||
    mode === 'NVIDIA_ONLY' ||
    mode === 'FASTEST' ||
    mode === 'HIGHEST_QUALITY' ||
    mode === 'LOW_VRAM' ||
    mode === 'BALANCED'
  );
}

export function buildTextRoutingContext(
  mode: GenerationMode,
  base: Pick<RoutingContext, 'task' | 'capability'>,
  overrides?: Partial<Pick<RoutingContext, 'qualityTarget' | 'maxVramMb'>>,
): RoutingContext {
  const flags = modeRoutingFlags(mode);
  return {
    task: base.task,
    capability: base.capability,
    freeOnly: flags.freeOnly,
    localOnly: flags.localOnly,
    nvidiaOnly: flags.nvidiaOnly,
    offline: flags.offline,
    commercialSafeOnly: flags.commercialSafeOnly,
    qualityTarget: overrides?.qualityTarget ?? flags.qualityTarget,
    maxVramMb: overrides?.maxVramMb ?? flags.maxVramMb,
  };
}
