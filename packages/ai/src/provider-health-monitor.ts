import type { ProviderRegistry } from './registry.js';
import type { ProviderHealth } from './types.js';

export interface ProviderHealthSnapshot {
  id: string;
  category: 'llm' | 'image' | 'vision';
  health: ProviderHealth;
  local: boolean;
  message?: string;
}

export interface ImageProviderHealthInput {
  id: string;
  local: boolean;
  healthy: boolean;
}

/** Aggregates health across text and image provider registries for dashboards/doctor. */
export class ProviderHealthMonitor {
  async snapshotTextProviders(registry: ProviderRegistry): Promise<ProviderHealthSnapshot[]> {
    return registry.listEnabled().map((provider) => ({
      id: provider.id,
      category: 'llm' as const,
      health: provider.health,
      local: provider.local,
    }));
  }

  snapshotImageProviders(providers: ImageProviderHealthInput[]): ProviderHealthSnapshot[] {
    return providers.map((p) => ({
      id: p.id,
      category: 'image' as const,
      health: p.healthy ? 'healthy' : 'unavailable',
      local: p.local,
    }));
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
