import { describe, expect, it } from 'vitest';
import { ModelCatalogService } from './model-catalog.js';
import { ModelRegistry } from './registry.js';
import {
  reconcileCatalogEntries,
  reconcileModelCatalog,
} from './catalog-reconciliation.js';

describe('catalog reconciliation', () => {
  it('marks hosted NVIDIA models routable only when the provider is live-enabled', () => {
    const catalog = new ModelCatalogService();
    const disabled = reconcileModelCatalog(catalog, new Set(['ollama']));
    const nvidiaDisabled = disabled.filter((m) => m.provider === 'nvidia');
    expect(nvidiaDisabled.length).toBeGreaterThan(0);
    expect(nvidiaDisabled.every((m) => !m.enabled)).toBe(true);

    const enabled = reconcileModelCatalog(catalog, new Set(['ollama', 'nvidia']));
    expect(enabled.some((m) => m.provider === 'nvidia' && m.enabled)).toBe(true);
  });

  it('marks offline providers runtime-ineligible and not routable', () => {
    const catalog = new ModelCatalogService();
    const models = new ModelRegistry();
    models.load(reconcileModelCatalog(catalog, new Set(['ollama'])));
    const liveIds = new Map<string, Set<string>>();
    const health = new Map([['ollama', 'unavailable']]);
    const reconciled = reconcileCatalogEntries(catalog, models, liveIds, new Set(['ollama']), {
      providerHealthById: health,
      hardware: { totalRamMb: 32768, vramMb: 8192 },
    });
    const local = reconciled.find((m) => m.provider === 'ollama');
    expect(local).toBeDefined();
    expect(local?.providerAvailable).toBe(true);
    expect(local?.runtimeEligible).toBe(false);
    expect(local?.routable).toBe(false);
  });

  it('reconcileCatalogEntries surfaces liveListed from provider model lists', () => {
    const catalog = new ModelCatalogService();
    const models = new ModelRegistry();
    models.load(reconcileModelCatalog(catalog, new Set(['nvidia'])));

    const nvidiaEntry = models.list().find((m) => m.provider === 'nvidia' && m.enabled);
    expect(nvidiaEntry).toBeDefined();

    const liveIds = new Map<string, Set<string>>([['nvidia', new Set([nvidiaEntry!.id])]]);
    const reconciled = reconcileCatalogEntries(catalog, models, liveIds, new Set(['nvidia']), {
      providerHealthById: new Map([['nvidia', 'healthy']]),
      hardware: { totalRamMb: 65536, vramMb: 24576 },
    });
    const row = reconciled.find((m) => m.id === nvidiaEntry!.id);
    expect(row?.routable).toBe(true);
    expect(row?.liveListed).toBe(true);

    const staleIds = new Map<string, Set<string>>([['nvidia', new Set(['model/that-does-not-exist'])]]);
    const stale = reconcileCatalogEntries(catalog, models, staleIds, new Set(['nvidia']), {
      providerHealthById: new Map([['nvidia', 'healthy']]),
    }).find((m) => m.id === nvidiaEntry!.id);
    expect(stale?.routable).toBe(true);
    expect(stale?.liveListed).toBe(false);
  });

  it('does not mark hosted models hardware-incompatible for low VRAM', () => {
    const catalog = new ModelCatalogService();
    const models = new ModelRegistry();
    models.load(reconcileModelCatalog(catalog, new Set(['nvidia'])));
    const reconciled = reconcileCatalogEntries(
      catalog,
      models,
      new Map(),
      new Set(['nvidia']),
      {
        hardware: { totalRamMb: 65536, vramMb: 512 },
        providerHealthById: new Map([['nvidia', 'healthy']]),
      },
    );
    const hosted = reconciled.find((m) => m.provider === 'nvidia' && !m.local);
    expect(hosted).toBeDefined();
    expect(hosted?.hardwareCompatible).toBe(true);
    expect(hosted?.catalogEligible).toBe(true);
  });
});
