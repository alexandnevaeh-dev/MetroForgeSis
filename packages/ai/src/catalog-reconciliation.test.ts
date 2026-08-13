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

  it('reconcileCatalogEntries surfaces liveListed from provider model lists', () => {
    const catalog = new ModelCatalogService();
    const models = new ModelRegistry();
    models.load(reconcileModelCatalog(catalog, new Set(['nvidia'])));

    const nvidiaEntry = models
      .list()
      .find((m) => m.provider === 'nvidia' && m.enabled);
    expect(nvidiaEntry).toBeDefined();

    const liveIds = new Map<string, Set<string>>([
      ['nvidia', new Set([nvidiaEntry!.id])],
    ]);

    const reconciled = reconcileCatalogEntries(catalog, models, liveIds, new Set(['nvidia']));
    const row = reconciled.find((m) => m.id === nvidiaEntry!.id);
    expect(row?.routable).toBe(true);
    expect(row?.liveListed).toBe(true);

    const staleIds = new Map<string, Set<string>>([['nvidia', new Set(['model/that-does-not-exist'])]]);
    const stale = reconcileCatalogEntries(catalog, models, staleIds, new Set(['nvidia'])).find(
      (m) => m.id === nvidiaEntry!.id,
    );
    expect(stale?.routable).toBe(true);
    expect(stale?.liveListed).toBe(false);
  });
});
