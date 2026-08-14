import type { ProviderRegistry } from './registry.js';
import type { ProviderHealth } from './types.js';

/**
 * Unified status vocabulary for dashboards/doctor. Individual providers (e.g. NvidiaImageProvider)
 * already compute most of these distinctions internally — this used to collapse all of that down
 * to a boolean before it ever reached a snapshot, discarding real diagnostic detail (was this
 * unauthenticated, rate-limited, or just plain offline?) that callers already had in hand.
 */
export type UnifiedProviderStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'MODEL_UNAVAILABLE'
  | 'MISCONFIGURED'
  | 'OFFLINE'
  | 'UNKNOWN';

function normalizeStatus(input: string | undefined): UnifiedProviderStatus {
  const s = (input ?? '').toUpperCase();
  const known: readonly UnifiedProviderStatus[] = [
    'HEALTHY',
    'DEGRADED',
    'RATE_LIMITED',
    'AUTH_FAILED',
    'NETWORK_ERROR',
    'MODEL_UNAVAILABLE',
    'MISCONFIGURED',
    'OFFLINE',
  ];
  if ((known as readonly string[]).includes(s)) return s as UnifiedProviderStatus;
  if (s === 'UNAVAILABLE' || s === 'DISABLED') return 'OFFLINE';
  return 'UNKNOWN';
}

export interface ProviderHealthSnapshot {
  id: string;
  category: 'llm' | 'image' | 'vision';
  health: ProviderHealth;
  /** Granular status — never derived from a plain boolean when a provider reports one directly. */
  status: UnifiedProviderStatus;
  local: boolean;
  message?: string;
}

export interface ImageProviderHealthInput {
  id: string;
  local: boolean;
  healthy: boolean;
  /** Granular status/reason a provider health probe already computed — carried through instead
   *  of being collapsed to `healthy` and thrown away. */
  status?: string;
  reason?: string;
}

/** Aggregates health across text and image provider registries for dashboards/doctor. */
export class ProviderHealthMonitor {
  async snapshotTextProviders(registry: ProviderRegistry): Promise<ProviderHealthSnapshot[]> {
    return registry.listEnabled().map((provider) => ({
      id: provider.id,
      category: 'llm' as const,
      health: provider.health,
      status: normalizeStatus(provider.health),
      local: provider.local,
    }));
  }

  snapshotImageProviders(providers: ImageProviderHealthInput[]): ProviderHealthSnapshot[] {
    return providers.map((p) => {
      const status = p.status ? normalizeStatus(p.status) : normalizeStatus(p.healthy ? 'HEALTHY' : 'UNAVAILABLE');
      return {
        id: p.id,
        category: 'image' as const,
        health: p.healthy ? 'healthy' : 'unavailable',
        status,
        local: p.local,
        message: p.reason,
      };
    });
  }

  async snapshotAll(input: {
    textRegistry: ProviderRegistry;
    imageProviders?: ImageProviderHealthInput[];
    extra?: ProviderHealthSnapshot[];
  }): Promise<ProviderHealthSnapshot[]> {
    const out = await this.snapshotTextProviders(input.textRegistry);
    if (input.imageProviders) {
      out.push(...this.snapshotImageProviders(input.imageProviders));
    }
    if (input.extra) {
      out.push(...input.extra);
    }
    return out;
  }
}
