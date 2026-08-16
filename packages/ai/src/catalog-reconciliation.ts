import type { ModelEntry } from '@metroforge/schemas';
import type { HardwareProfile } from '@metroforge/schemas';
import type { ModelCatalogService } from './model-catalog.js';
import { CAPABILITY_TO_AI_CAPABILITY } from './generation-router.js';
import type { ModelMetadata, ProviderHealth } from './types.js';
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
  /** In the static catalog with at least one capability mapping. */
  catalogEligible: boolean;
  /** Provider is registered/enabled in this bootstrap. */
  providerAvailable: boolean;
  /** Provider health allows a live route (healthy or degraded). */
  runtimeEligible: boolean;
  /** Hardware fits for local models; always true for hosted/remote (VRAM not applied). */
  hardwareCompatible: boolean;
  /** True when this model is selectable by CapabilityRouter right now. */
  routable: boolean;
  /** True when the model's provider is registered and enabled in this bootstrap. */
  providerEnabled: boolean;
  /** When the provider was queried live, whether its API listed this model id. */
  liveListed: boolean | null;
  providerHealth?: ProviderHealth | 'disabled' | 'unconfigured' | 'offline';
}

export function computeHardwareCompatible(
  entry: Pick<ModelEntry, 'local' | 'minRamMb' | 'minVramMb'>,
  hardware: Pick<HardwareProfile, 'totalRamMb' | 'vramMb'> | null | undefined,
): boolean {
  if (!entry.local) return true;
  if (!hardware) return true;
  if (entry.minRamMb && hardware.totalRamMb < entry.minRamMb * 0.85) return false;
  if (entry.minVramMb && entry.minVramMb > 0) {
    if (!hardware.vramMb || hardware.vramMb < entry.minVramMb * 0.85) return false;
  }
  return true;
}

function normalizeProviderHealth(
  raw: string | undefined | null,
): ProviderHealth | 'disabled' | 'unconfigured' | 'offline' | undefined {
  if (raw == null || raw === '') return undefined;
  const s = String(raw).toLowerCase();
  if (s === 'healthy' || s === 'ok') return 'healthy';
  if (s === 'degraded' || s === 'warn' || s === 'warning') return 'degraded';
  if (s === 'disabled') return 'disabled';
  if (s === 'unconfigured' || s === 'not_configured') return 'unconfigured';
  if (s === 'offline') return 'offline';
  if (s === 'unavailable' || s === 'unhealthy' || s === 'error' || s === 'fail') return 'unavailable';
  return undefined;
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

export interface ReconcileCatalogOptions {
  hardware?: Pick<HardwareProfile, 'totalRamMb' | 'vramMb'> | null;
  /** provider id → live health */
  providerHealthById?: Map<string, string>;
}

/** Merges static catalog metadata with live router + provider API reconciliation for UI/IPC. */
export function reconcileCatalogEntries(
  catalog: ModelCatalogService,
  models: ModelRegistry,
  liveModelIdsByProvider: Map<string, Set<string>>,
  providerLiveEnabled: Set<string>,
  options: ReconcileCatalogOptions = {},
): ReconciledCatalogEntry[] {
  const routableById = new Map(models.list().filter((m) => m.enabled).map((m) => [m.id, m]));
  const hw = options.hardware;

  return catalog.list().map((entry) => {
    const providerEnabled = providerLiveEnabled.has(entry.provider);
    const healthRaw = options.providerHealthById?.get(entry.provider);
    const providerHealth = normalizeProviderHealth(healthRaw);
    const runtimeEligible =
      providerEnabled &&
      providerHealth !== 'unavailable' &&
      providerHealth !== 'offline' &&
      providerHealth !== 'disabled' &&
      providerHealth !== 'unconfigured';
    const hardwareCompatible = computeHardwareCompatible(entry, hw);
    const inRouter = routableById.has(entry.id);
    const routable = inRouter && runtimeEligible && hardwareCompatible;
    const liveSet = liveModelIdsByProvider.get(entry.provider);
    const liveListed =
      liveSet == null ? null : liveSet.has(entry.id) || liveSet.has(entry.id.split('/').pop() ?? '');

    return {
      ...entry,
      catalogEligible: true,
      providerAvailable: providerEnabled,
      runtimeEligible,
      hardwareCompatible,
      enabled: routable,
      routable,
      providerEnabled,
      liveListed,
      providerHealth,
      installed: entry.installed,
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
