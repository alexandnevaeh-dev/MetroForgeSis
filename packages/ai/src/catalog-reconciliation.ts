import type { ModelEntry } from '@metroforge/schemas';
import type { ModelCatalogService } from './model-catalog.js';
import { CAPABILITY_TO_AI_CAPABILITY } from './generation-router.js';
import type { ModelMetadata } from './types.js';
import type { ProviderRegistry, ModelRegistry } from './registry.js';

/**
 * Maps config/models.catalog.json into the live ModelRegistry using the same rules as
 * bootstrapProviders() — hosted-provider `enabled` flags in the catalog file are static
 * author-time defaults and are overridden by whether the provider was actually registered.
 */
export function reconcileModelCatalog(
  catalog: ModelCatalogService,
  providerLiveEnabled: Set<string>,
): ModelMetadata[] {
  const out: ModelMetadata[] = [];
  for (const entry of catalog.list()) {
    const capabilities = dedupeCapabilities(entry.capabilities);
    if (capabilities.length === 0) continue;

    out.push({
      id: entry.id,
      provider: entry.provider,
      capabilities,
      local: entry.local,
      enabled: entry.local
        ? entry.enabled && providerLiveEnabled.has(entry.provider)
        : providerLiveEnabled.has(entry.provider),
      costClass: entry.costClass,
      license: entry.license,
      contextWindow: entry.contextWindow ?? null,
      supportsTools: entry.supportsTools,
      supportsVision: entry.supportsVision,
      priority: entry.priority,
    });
  }
  return out;
}

export interface ReconciledCatalogEntry extends ModelEntry {
  /** True when this model is selectable by CapabilityRouter right now. */
  routable: boolean;
  /** True when the model's provider is registered and enabled in this bootstrap. */
  providerEnabled: boolean;
  /** When the provider was queried live, whether its API listed this model id. */
  liveListed: boolean | null;
}

/** Fetches live model id lists from every enabled provider (NVIDIA GET /v1/models, Ollama /api/tags, etc.). */
export async function fetchLiveModelIdsByProvider(
  registry: ProviderRegistry,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const provider of registry.listEnabled()) {
    try {
      const ids = await provider.listModels();
      out.set(provider.id, new Set(ids));
    } catch {
      /* provider listModels already degrades gracefully — skip on throw */
    }
  }
  return out;
}

/** Merges static catalog metadata with live router + provider API reconciliation for UI/IPC. */
export function reconcileCatalogEntries(
  catalog: ModelCatalogService,
  models: ModelRegistry,
  liveModelIdsByProvider: Map<string, Set<string>>,
  providerLiveEnabled: Set<string>,
): ReconciledCatalogEntry[] {
  const routableById = new Map(models.list().filter((m) => m.enabled).map((m) => [m.id, m]));

  return catalog.list().map((entry) => {
    const routable = routableById.has(entry.id);
    const providerEnabled = providerLiveEnabled.has(entry.provider);
    const liveSet = liveModelIdsByProvider.get(entry.provider);
    const liveListed =
      liveSet == null ? null : liveSet.has(entry.id) || liveSet.has(entry.id.split('/').pop() ?? '');

    return {
      ...entry,
      enabled: routable,
      routable,
      providerEnabled,
      liveListed,
    };
  });
}

function dedupeCapabilities(capabilities: ModelEntry['capabilities']): ModelMetadata['capabilities'] {
  const seen = new Set<ModelMetadata['capabilities'][number]>();
  for (const c of capabilities) {
    const mapped = CAPABILITY_TO_AI_CAPABILITY[c];
    if (mapped) seen.add(mapped);
  }
  return Array.from(seen);
}
