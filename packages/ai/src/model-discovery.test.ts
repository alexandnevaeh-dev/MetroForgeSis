import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelEntrySchema } from '@metroforge/schemas';
import { ModelCatalogService, rankModelsForCapability } from './model-catalog.js';
import { ModelScout } from './model-scout.js';
import { HardwareProfiler } from './hardware-profiler.js';
import { CompatibleChatProvider } from './providers/compatible-chat.js';
import { ModelRegistry } from './registry.js';
import { reconcileModelCatalog, reconcileCatalogEntries } from './catalog-reconciliation.js';
import { bootstrapProviders } from './bootstrap.js';

const hardware = {
  os: 'win32',
  cpuArch: 'x64',
  cpuCores: 2,
  totalRamMb: 8192,
  profile: 'LOW_RESOURCE' as const,
  cudaAvailable: false,
  rocmAvailable: false,
  directMlAvailable: false,
  metalAvailable: false,
};
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'metroforge-discovery-'));
  vi.spyOn(HardwareProfiler.prototype, 'profile').mockReturnValue(hardware);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});
const entry = (provider: string) =>
  ModelEntrySchema.parse({
    id: 'shared-model',
    name: 'Shared',
    provider,
    modality: 'text',
    capabilities: ['TEXT_GENERATION'],
    local: false,
    license: 'Unknown',
    commercialUse: 'unknown',
  });
const provider = (id: string) =>
  new CompatibleChatProvider({
    id,
    name: id,
    baseUrl: 'https://example.test/v1',
    apiKey: 'synthetic',
    license: 'Model-dependent',
  });

describe('model discovery and identity', () => {
  it('keeps identical API identifiers from different providers distinct across save/reload and installation', () => {
    const catalog = new ModelCatalogService(directory);
    expect(catalog.mergeDiscovered([entry('together'), entry('cerebras')]).added).toBe(2);
    expect(catalog.get('shared-model')).toBeUndefined();
    catalog.markInstalled('shared-model', 'E:/test', 'cerebras');
    catalog.save();
    const saved = new ModelCatalogService(directory);
    expect(saved.get('shared-model', 'together')?.installed).toBe(false);
    expect(saved.get('shared-model', 'cerebras')?.installed).toBe(true);
  });

  it('discovers all configured new connectors without overwriting curated metadata or fabricating license, hardware and quality', async () => {
    const scout = new ModelScout(directory);
    scout
      .getCatalog()
      .mergeDiscovered([
        {
          ...entry('together'),
          license: 'Verified license',
          commercialUse: 'allowed',
          priority: 81,
          minRamMb: 999999,
        },
      ]);
    const connectors = ['together', 'cerebras', 'mistral', 'lmstudio'].map(provider);
    for (const connector of connectors)
      vi.spyOn(connector, 'listModels').mockResolvedValue(['shared-model']);
    const report = await scout.refresh({ sources: [], providers: connectors });
    expect(report.modelsAdded).toBe(3);
    expect(report.modelsUpdated).toBe(1);
    expect(report.sourcesChecked).toEqual(['together', 'cerebras', 'mistral', 'lmstudio']);
    expect(scout.getCatalog().get('shared-model', 'together')).toMatchObject({
      license: 'Verified license',
      commercialUse: 'allowed',
      priority: 81,
    });
    const discovered = scout.getCatalog().get('shared-model', 'mistral')!;
    expect(discovered.commercialUse).toBe('unknown');
    expect(discovered.minRamMb).toBeUndefined();
    expect(discovered.estimatedQuality).toBeUndefined();
    expect(discovered.installed).toBe(false);
    expect(scout.getCatalog().filter({ commercialAllowed: true })).not.toContain(discovered);
  });

  it('preserves successful discovery when another connector fails and never includes a raw credential error', async () => {
    const scout = new ModelScout(directory);
    const good = provider('cerebras');
    const bad = provider('together');
    const disabled = provider('mistral');
    disabled.enabled = false;
    vi.spyOn(good, 'listModels').mockResolvedValue(['shared-model']);
    vi.spyOn(bad, 'listModels').mockRejectedValue(new Error('synthetic-secret-token'));
    const untouched = vi.spyOn(disabled, 'listModels');
    const report = await scout.refresh({ sources: [], providers: [good, bad, disabled] });
    expect(report.modelsAdded).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain('synthetic-secret-token');
    expect(untouched).not.toHaveBeenCalled();
  });

  it('does not replace a corrupt user catalog with builtin defaults', () => {
    const file = join(directory, 'models.catalog.json');
    const original = '{corrupt: user data';
    writeFileSync(file, original);
    expect(() => new ModelCatalogService(directory)).toThrow('has not been replaced');
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it('reconciles candidates by provider and excludes models absent from a successful live list', () => {
    const catalog = new ModelCatalogService(directory);
    catalog.mergeDiscovered([entry('together'), entry('cerebras')]);
    const registry = new ModelRegistry();
    registry.load(reconcileModelCatalog(catalog, new Set(['together'])));
    const rows = reconcileCatalogEntries(
      catalog,
      registry,
      new Map([['together', new Set<string>()]]),
      new Set(['together', 'cerebras']),
    );
    expect(
      rows.find((row) => row.provider === 'together' && row.id === 'shared-model')?.routable,
    ).toBe(false);
    expect(
      rows.find((row) => row.provider === 'cerebras' && row.id === 'shared-model')?.routable,
    ).toBe(false);
  });

  it('ranks local hardware preferences without modifying catalog priorities or rejecting hosted models for local RAM', () => {
    const hosted = { ...entry('together'), minRamMb: 999999 };
    const local = { ...entry('ollama'), local: true, tags: ['cpu-friendly'] };
    const ranked = rankModelsForCapability([hosted, local], 'TEXT_GENERATION', hardware);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.model.provider).toBe('ollama');
    expect(local.priority).toBe(50);
  });

  it('loads the explicitly selected data directory during provider bootstrap', async () => {
    const catalog = new ModelCatalogService(directory);
    catalog.mergeDiscovered([entry('together')]);
    catalog.save();
    const bootstrapped = await bootstrapProviders({
      mode: 'HYBRID_FREE',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      dataDir: directory,
      skipHealthChecks: true,
    });
    expect(bootstrapped.catalog.get('shared-model', 'together')).toBeDefined();
  });
});
