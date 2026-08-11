import type { Command } from 'commander';
import { loadConfig } from '@metroforge/shared';
import { ModelCatalogService, rankModelsForCapability } from '@metroforge/ai';
import { HardwareProfiler, getStarterPack } from '@metroforge/ai';
import type { ModelCapability } from '@metroforge/schemas';

export function registerModelsCommand(program: Command): void {
  const models = program.command('models').description('List and filter AI models');

  models
    .command('list')
    .description('List models from catalog')
    .option('--capability <cap>', 'Filter by capability')
    .option('--installed', 'Show installed only')
    .option('--local', 'Show local models only')
    .option('--low-vram', 'Show low VRAM models')
    .option('--modality <mod>', 'Filter by modality')
    .action((opts: { capability?: string; installed?: boolean; local?: boolean; lowVram?: boolean; modality?: string }) => {
      const catalog = new ModelCatalogService();
      let entries = catalog.list();

      if (opts.capability) {
        entries = catalog.findByCapability(opts.capability as ModelCapability);
      }
      if (opts.installed) entries = entries.filter((m) => m.installed);
      if (opts.local) entries = entries.filter((m) => m.local);
      if (opts.lowVram) entries = catalog.filter({ lowVram: true });
      if (opts.modality) entries = entries.filter((m) => m.modality === opts.modality);

      console.log(`Models (${entries.length}):\n`);
      for (const m of entries) {
        const inst = m.installed ? '✓' : ' ';
        const caps = m.capabilities.slice(0, 3).join(', ');
        console.log(
          `[${inst}] ${m.id.padEnd(28)} ${m.modality.padEnd(12)} ${m.provider.padEnd(12)} ${caps}`,
        );
      }
    });

  models
    .command('rank <capability>')
    .description('Rank models for a capability on this hardware')
    .option('--mode <mode>', 'Generation mode', 'LOCAL_ONLY')
    .action((capability: string, opts: { mode: string }) => {
      const catalog = new ModelCatalogService();
      const hw = new HardwareProfiler().profile();
      const ranked = rankModelsForCapability(
        catalog.list(),
        capability as ModelCapability,
        hw,
        {
          localOnly: opts.mode === 'LOCAL_ONLY',
          freeOnly: opts.mode === 'FREE_ONLY' || opts.mode === 'HYBRID_FREE',
          preferInstalled: true,
        },
      );

      console.log(`Hardware: ${hw.profile} (${hw.totalRamMb} MB RAM, VRAM: ${hw.vramMb ?? 'N/A'} MB)\n`);
      console.log(`Ranked for ${capability}:\n`);

      for (const r of ranked.slice(0, 10)) {
        console.log(
          `  ${r.score.toFixed(0).padStart(4)}  ${r.model.id.padEnd(28)} ${r.model.installed ? '[installed]' : ''}`,
        );
      }
    });

  models
    .command('starter-pack')
    .description('Show hardware-appropriate starter model pack')
    .action(() => {
      const hw = new HardwareProfiler().profile();
      const pack = getStarterPack(hw);
      console.log(`Hardware profile: ${hw.profile}`);
      console.log(`RAM: ${hw.totalRamMb} MB | VRAM: ${hw.vramMb ?? 'N/A'} MB\n`);
      console.log('Recommended starter pack:');
      for (const id of pack) console.log(`  - ${id}`);
      console.log('\nUse: metroforge models download <id> --approve');
    });

  models
    .command('download <modelId>')
    .description('Download a model (requires --approve)')
    .option('--approve', 'Explicitly approve download')
    .action(async (modelId: string, opts: { approve?: boolean }) => {
      const { ModelCatalogService, ModelDownloadManager } = await import('@metroforge/ai');
      const catalog = new ModelCatalogService();
      const model = catalog.get(modelId);
      if (!model) {
        console.error(`Model not found: ${modelId}`);
        process.exitCode = 1;
        return;
      }

      const dm = new ModelDownloadManager();
      const plan = dm.planDownload(model);
      console.log(`Download plan for ${modelId}:`);
      console.log(`  Size: ~${plan.estimatedSizeMb} MB`);
      console.log(`  License: ${plan.license} (${plan.commercialUse})`);
      console.log(`  Adapter: ${plan.adapter ?? 'none'}`);
      for (const w of plan.warnings) console.log(`  ! ${w}`);

      if (!opts.approve) {
        console.log('\nRe-run with --approve to download');
        return;
      }

      try {
        await dm.download(model, { modelId, approved: true }, (p) => {
          console.log(`  [${p.status}] ${p.message}`);
        });
        console.log(`\n✓ Downloaded ${modelId}`);
      } catch (err) {
        console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}

export function registerScoutCommand(program: Command): void {
  program
    .command('scout')
    .description('Refresh model catalog and discover installed models')
    .option('--benchmark', 'Run benchmarks on installed text models')
    .option('--source <sources>', 'Comma-separated: ollama,local,builtin', 'ollama,local')
    .action(async (opts: { benchmark?: boolean; source: string }) => {
      const config = loadConfig();
      const { ModelScout } = await import('@metroforge/ai');
      const scout = new ModelScout();
      const sources = opts.source.split(',') as ('ollama' | 'local' | 'builtin')[];

      console.log('Scouting models...\n');
      const report = await scout.refresh({
        sources,
        runBenchmarks: opts.benchmark,
        ollamaBaseUrl: config.ollamaBaseUrl,
      });

      console.log(`Scout ID: ${report.id}`);
      console.log(`Sources: ${report.sourcesChecked.join(', ')}`);
      console.log(`Discovered: ${report.modelsDiscovered} | Added: ${report.modelsAdded} | Updated: ${report.modelsUpdated}`);
      if (report.benchmarksRun > 0) console.log(`Benchmarks run: ${report.benchmarksRun}`);
      if (report.errors.length > 0) {
        console.log('\nErrors:');
        for (const e of report.errors) console.log(`  ! ${e}`);
      }
      console.log(`\nCatalog saved. Use: metroforge models list --installed`);
    });
}
