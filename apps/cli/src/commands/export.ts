import type { Command } from 'commander';
import { loadConfig, resolveGeneratedGamesPath, resolveProjectPathSafe, UnsafeProjectPathError } from '@metroforge/shared';
import { exportProject } from '@metroforge/tools';

export function registerExportCommand(program: Command): void {
  program
    .command('export <slug>')
    .description('Package a generated Godot project with export_manifest.json')
    .option('--no-zip', 'Stage export folder only, skip zip archive')
    .option('--force', 'Export even if validation has not passed')
    .option('--commercial-safe', 'Block export unless all artifacts pass commercial-safe license audit')
    .option('--require-production-assets', 'Block export if any artifact is PLACEHOLDER/BLOCKOUT/REJECTED maturity')
    .option('--output <dir>', 'Override export output directory')
    .action(async (slug: string, opts: { zip?: boolean; force?: boolean; commercialSafe?: boolean; requireProductionAssets?: boolean; output?: string }) => {
      const config = loadConfig();
      let projectPath: string;
      try {
        projectPath = resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug);
      } catch (err) {
        console.log(err instanceof UnsafeProjectPathError ? `✗ ${err.message}` : `✗ ${String(err)}`);
        process.exitCode = 1;
        return;
      }

      const result = exportProject({
        projectPath,
        outputDir: opts.output,
        zip: opts.zip !== false,
        requireValidation: !opts.force,
        requireCommercialSafe: opts.commercialSafe,
        requireProductionAssets: opts.requireProductionAssets,
      });

      for (const warning of result.warnings) console.log(`[!] ${warning}`);
      if (!result.success) {
        for (const error of result.errors) console.log(`✗ ${error}`);
        process.exitCode = 1;
        return;
      }

      console.log(`✓ Exported ${slug}`);
      if (result.manifest) {
        console.log(`  Validation: ${result.manifest.validationPassed ? 'PASSED' : 'FAILED'} (${result.manifest.validationLevel ?? 'unknown'})`);
        console.log(`  Production ready: ${result.manifest.productionReady ? 'yes' : 'no'}`);
        console.log(`  Commercial safe: ${result.manifest.licenseSummary.commercialSafe ? 'yes' : 'no'}`);
        console.log(`  Non-production assets: ${result.manifest.nonProductionAssetCount}`);
        console.log(`  Rooms: ${result.manifest.roomCount}, Artifacts: ${result.manifest.artifactCount}`);
      }
      if (result.archivePath) console.log(`  Output: ${result.archivePath}`);
      if (result.manifestPath) console.log(`  Manifest: ${result.manifestPath}`);
    });
}
