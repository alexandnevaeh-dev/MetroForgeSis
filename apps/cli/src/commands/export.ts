import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import {
  loadConfig,
  resolveGeneratedGamesPath,
  resolveProjectPathSafe,
  UnsafeProjectPathError,
  readVisualSliceApproval,
  isVisualSliceApprovalCurrent,
} from '@metroforge/shared';
import { exportProject, resolveGodotExecutableCanonical } from '@metroforge/tools';
import { loadProjectContext, buildAssetCoverageReport, computeVisualEvidenceHash } from '@metroforge/generation';

export function registerExportCommand(program: Command): void {
  program
    .command('export <slug>')
    .description('Package a generated Godot project with export_manifest.json')
    .option('--no-zip', 'Stage export folder only, skip zip archive')
    .option('--force', 'Export even if validation has not passed')
    .option('--commercial-safe', 'Block export unless all artifacts pass commercial-safe license audit')
    .option('--require-production-assets', 'Block export if any artifact is PLACEHOLDER/BLOCKOUT/REJECTED maturity')
    .option('--windows', 'Produce and verify a real Godot --export-release Windows binary (not just staged files)')
    .option('--macos', 'Produce and verify a local unsigned macOS app ZIP')
    .option('--godot <path>', 'Override Godot executable used for desktop packaging')
    .option('--output <dir>', 'Override export output directory')
    .action(async (
      slug: string,
      opts: {
        zip?: boolean;
        force?: boolean;
        commercialSafe?: boolean;
        requireProductionAssets?: boolean;
        windows?: boolean;
        macos?: boolean;
        godot?: string;
        output?: string;
      },
    ) => {
      const config = loadConfig();
      let projectPath: string;
      try {
        projectPath = resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug);
      } catch (err) {
        console.log(err instanceof UnsafeProjectPathError ? `✗ ${err.message}` : `✗ ${String(err)}`);
        process.exitCode = 1;
        return;
      }

      if (opts.windows && opts.macos) {
        console.log('✗ Choose only one package target: --windows or --macos');
        process.exitCode = 1;
        return;
      }
      const resolvedGodot = resolveGodotExecutableCanonical({
        preference: opts.godot,
        envPath: config.godotExecutable,
      });
      const godotExecutable = resolvedGodot.version ? resolvedGodot.path ?? undefined : undefined;
      if ((opts.windows || opts.macos) && !godotExecutable) {
        console.log('[!] Desktop packaging requested but no working Godot executable was found');
      }

      // exportProject reads asset_coverage.json as a plain file (packages/tools cannot depend
      // on @metroforge/generation, which itself depends on tools) — a copy written once at
      // generation time and never touched again. That leaves visualReady/assetReady judged
      // against whatever assets existed hours or days ago, not what's on disk right now. Refresh
      // it here, at the one layer that already depends on both packages, immediately before export.
      try {
        const loaded = loadProjectContext(projectPath);
        const coverage = buildAssetCoverageReport(loaded);
        writeFileSync(join(projectPath, 'asset_coverage.json'), JSON.stringify(coverage, null, 2));
      } catch (err) {
        console.log(`[!] Could not refresh asset_coverage.json before export: ${err instanceof Error ? err.message : String(err)}`);
      }

      // releaseReady must never be true on technical gates alone — a human has to have approved
      // this exact visual evidence. That check lives here (the layer that already depends on both
      // @metroforge/shared and @metroforge/generation) and is passed in as a plain boolean;
      // packages/tools computes technicalReleaseReady but never claims releaseReady by itself.
      const approval = readVisualSliceApproval();
      const currentEvidenceHash = computeVisualEvidenceHash(projectPath);
      const humanVisualApprovalGranted =
        approval.projectSlug === slug && isVisualSliceApprovalCurrent(approval, currentEvidenceHash);

      const result = exportProject({
        projectPath,
        outputDir: opts.output,
        zip: opts.zip !== false,
        requireValidation: !opts.force,
        requireCommercialSafe: opts.commercialSafe,
        requireProductionAssets: opts.requireProductionAssets,
        packageWindows: opts.windows,
        packageMacOS: opts.macos,
        godotExecutable,
        humanVisualApprovalGranted,
      });

      for (const warning of result.warnings) console.log(`[!] ${warning}`);
      if (!result.success) {
        for (const error of result.errors) console.log(`✗ ${error}`);
        if (result.manifest?.packaging) {
          const p = result.manifest.packaging;
          console.log(`  Packaging: ${p.status}${p.message ? ` — ${p.message}` : ''}`);
        }
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
        if (opts.windows) {
          const p = result.manifest.packaging;
          console.log(`  Windows package: ${p.status}`);
          console.log(`    exe: ${p.exePath ?? '(none)'}`);
          console.log(`    pck: ${p.pckPath ?? '(none)'}`);
          console.log(`    binaryVerified: ${p.binaryVerified}  launchVerified: ${p.launchVerified}`);
          if (p.message) console.log(`    ${p.message}`);
        }
        if (opts.macos) {
          const p = result.manifest.packaging;
          console.log(`  macOS package: ${p.status}`);
          console.log(`    app ZIP: ${p.appZipPath ?? '(none)'}`);
          console.log(`    binaryVerified: ${p.binaryVerified}  launchVerified: ${p.launchVerified}`);
          if (p.message) console.log(`    ${p.message}`);
        }
        console.log(
          `  Readiness: runtime=${result.manifest.readiness.runtimeReady} visual=${result.manifest.readiness.visualReady} ` +
            `asset=${result.manifest.readiness.assetReady} package=${result.manifest.readiness.packageReady}`,
        );
        console.log(
          `  technicalReleaseReady=${result.manifest.readiness.technicalReleaseReady} ` +
            `humanVisualApprovalGranted=${result.manifest.readiness.humanVisualApprovalGranted} ` +
            `releaseReady=${result.manifest.readiness.releaseReady}`,
        );
        if (result.manifest.readiness.technicalReleaseReady && !result.manifest.readiness.humanVisualApprovalGranted) {
          console.log(
            '  All technical gates pass. Human visual-direction approval is still required before release ' +
              '— run `metroforge candidate review-pack` then `metroforge candidate approve-visual` once reviewed.',
          );
        }
      }
      if (result.archivePath) console.log(`  Output: ${result.archivePath}`);
      if (result.manifestPath) console.log(`  Manifest: ${result.manifestPath}`);
    });
}
