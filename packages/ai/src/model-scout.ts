import type { ModelEntry } from '@metroforge/schemas';
import { generateId } from '@metroforge/shared';
import { ModelCatalogService, rankModelsForCapability } from './model-catalog.js';
import { HardwareProfiler } from './hardware-profiler.js';
import { ModelBenchmarkService } from './model-benchmark.js';
import type { ScoutReport, ModelCapability } from '@metroforge/schemas';
import { ModelEntrySchema } from '@metroforge/schemas';
import type { TextGenerationProvider } from './types.js';

export interface ScoutOptions {
  sources?: ('ollama' | 'huggingface' | 'builtin' | 'local')[];
  runBenchmarks?: boolean;
  ollamaBaseUrl?: string;
  /** Already-configured providers; discovery never changes credentials or enablement. */
  providers?: TextGenerationProvider[];
}

export class ModelScout {
  private readonly catalog: ModelCatalogService;
  private readonly hardware: HardwareProfiler;
  private readonly benchmark: ModelBenchmarkService;

  constructor(dataDir?: string) {
    this.catalog = new ModelCatalogService(dataDir);
    this.hardware = new HardwareProfiler();
    this.benchmark = new ModelBenchmarkService();
  }

  async refresh(options: ScoutOptions = {}): Promise<ScoutReport> {
    const sources = options.sources ?? ['ollama', 'builtin', 'local'];
    const report: ScoutReport = {
      id: generateId('scout'),
      startedAt: new Date().toISOString(),
      sourcesChecked: [],
      modelsDiscovered: 0,
      modelsUpdated: 0,
      modelsAdded: 0,
      benchmarksRun: 0,
      errors: [],
    };

    const discovered: ModelEntry[] = [];

    if (sources.includes('ollama')) {
      report.sourcesChecked.push('ollama');
      try {
        discovered.push(
          ...(await this.scoutOllama(options.ollamaBaseUrl ?? 'http://localhost:11434')),
        );
      } catch (err) {
        report.errors.push(
          `Ollama scout failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (sources.includes('local')) {
      report.sourcesChecked.push('local');
      discovered.push(...this.scoutLocalInstalled());
    }

    const chatProviders = (options.providers ?? []).filter(
      (provider) =>
        provider.enabled && ['lmstudio', 'together', 'cerebras', 'mistral'].includes(provider.id),
    );
    const results = await Promise.all(
      chatProviders.map(async (provider) => {
        report.sourcesChecked.push(provider.id);
        try {
          const ids = await provider.listModels();
          return ids.map((id) => {
            const existing = this.catalog.get(id, provider.id);
            return existing
              ? { ...existing, health: provider.health, lastScoutedAt: new Date().toISOString() }
              : ModelEntrySchema.parse({
                  id,
                  name: id,
                  provider: provider.id,
                  modality: 'text',
                  capabilities: [
                    'TEXT_GENERATION',
                    'CODE_GENERATION',
                    'NARRATIVE',
                    'JSON_GENERATION',
                  ],
                  local: provider.local,
                  enabled: true,
                  costClass: provider.costClass,
                  license: 'Unverified — review model license and provider terms',
                  commercialUse: 'unknown',
                  modelSource: 'provider',
                  runtime: provider.id,
                  executionTargets: [provider.local ? 'LOCAL_SERVICE' : 'REMOTE_API'],
                  installed: false,
                  health: provider.health,
                  priority: provider.priority,
                  tags: ['discovered', 'license-unverified'],
                });
          });
        } catch {
          report.errors.push(
            `${provider.name} discovery unavailable. Check its connection, key and model server in Settings.`,
          );
          return [];
        }
      }),
    );
    discovered.push(...results.flat());

    report.modelsDiscovered = discovered.length;
    const { added, updated } = this.catalog.mergeDiscovered(discovered);
    report.modelsAdded = added;
    report.modelsUpdated = updated;

    if (options.runBenchmarks) {
      const hw = this.hardware.profile();
      const toBenchmark = this.catalog
        .list()
        .filter((m) => m.installed && m.modality === 'text')
        .slice(0, 3);

      for (const model of toBenchmark) {
        try {
          const result = await this.benchmark.benchmarkModel(model, hw, options.ollamaBaseUrl);
          model.benchmarkScore = result.overallScore;
          report.benchmarksRun++;
        } catch (err) {
          report.errors.push(
            `Benchmark ${model.id} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // Apply hardware preferences during ranking, never by repeatedly changing saved priorities.
    this.catalog.save();

    report.completedAt = new Date().toISOString();
    return report;
  }

  private async scoutOllama(baseUrl: string): Promise<ModelEntry[]> {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as { models?: { name: string }[] };
    const installed = new Set((data.models ?? []).map((m) => m.name));

    return this.catalog
      .list()
      .filter((m) => m.provider === 'ollama')
      .map((m) => {
        const isInstalled = [...installed].some(
          (name) => name === m.id || (!m.id.includes(':') && name === `${m.id}:latest`),
        );
        return {
          ...m,
          installed: isInstalled,
          health: isInstalled ? ('healthy' as const) : m.health,
          lastScoutedAt: new Date().toISOString(),
        };
      });
  }

  private scoutLocalInstalled(): ModelEntry[] {
    return this.catalog
      .list()
      .filter((m) => m.runtime === 'native' || m.provider === 'metroforge')
      .map((m) => ({ ...m, installed: true, health: 'healthy' as const }));
  }

  getRecommendedForCapability(
    capability: ModelCapability,
    opts: { freeOnly?: boolean; localOnly?: boolean } = {},
  ): ModelEntry | null {
    const hw = this.hardware.profile();
    const ranked = rankModelsForCapability(this.catalog.list(), capability, hw, {
      ...opts,
      preferInstalled: true,
    });
    return ranked[0]?.model ?? null;
  }

  getCatalog(): ModelCatalogService {
    return this.catalog;
  }
}
