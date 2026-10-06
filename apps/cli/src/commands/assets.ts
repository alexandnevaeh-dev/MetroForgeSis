import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { loadConfig, resolveGeneratedGamesPath, resolveProjectPathSafe, UnsafeProjectPathError } from '@metroforge/shared';
import { reclassifyProjectAssetMaturity, loadProjectContext, buildAssetCoverageReport, decideProjectAssetQa, loadQaReviewHistory } from '@metroforge/generation';
import { assessProductionCapacity, buildGenerationSpecification, currentCapacityProfile, generationRequestHash, remoteWorkerBackendFromEnvironment, type AssetRequestV2 } from '@metroforge/assets';

export function registerAssetsCommand(program: Command): void {
  const assets = program.command('assets').description('Operations on a generated project\'s asset manifest');

  assets
    .command('capacity')
    .description('Assess local production inference capacity and cheaply probe an explicitly configured remote worker')
    .option('--width <pixels>', 'Requested source width', '384')
    .option('--height <pixels>', 'Requested source height', '384')
    .option('--steps <count>', 'Inference step count', '6')
    .option('--model <id>', 'Locked model identity', 'sd-1.5')
    .option('--device <id>', 'Expected local device', 'GPU')
    .action(async (opts: { width: string; height: string; steps: string; model: string; device: string }) => {
      const request: AssetRequestV2 = { id: 'capacity-probe', category: 'player', runtimeUse: 'production capacity probe', artDirection: 'capacity only; no generation', seed: 0, inferenceSteps: Number(opts.steps) };
      const spec = buildGenerationSpecification(request, { model: opts.model, prompt: 'capacity probe only', width: Number(opts.width), height: Number(opts.height) });
      const profile = currentCapacityProfile({ devices: (process.env.METROFORGE_LOCAL_DEVICES ?? 'CPU,GPU').split(','), graphicsMemoryMb: process.env.METROFORGE_LOCAL_VRAM_MB ? Number(process.env.METROFORGE_LOCAL_VRAM_MB) : undefined });
      const local = assessProductionCapacity(spec, profile, { expectedDevice: opts.device });
      const remote = remoteWorkerBackendFromEnvironment();
      const remoteProbe = remote ? await remote.probe(spec) : undefined;
      console.log(JSON.stringify({ request: { width: spec.width, height: spec.height, steps: spec.steps, model: spec.model, hash: generationRequestHash(spec) }, local, configuredBackend: remote?.id ?? null, remoteProbe: remoteProbe ?? { reachable: false, reason: 'not configured' }, generationStarted: false }, null, 2));
    });

  assets
    .command('status <slug> [assetId]')
    .description('Show generation hashes, backend provenance, QA and production-readiness status')
    .action((slug: string, assetId?: string) => {
      const config = loadConfig();
      try {
        const projectPath = resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug);
        const parsed = JSON.parse(readFileSync(join(projectPath, 'generation_manifest.json'), 'utf8')) as { artifacts?: Array<Record<string, unknown>> };
        const artifacts = (parsed.artifacts ?? []).filter((item) => !assetId || item.id === assetId || item.assetId === assetId).map((item) => ({ id: item.id ?? item.assetId, dimensions: item.dimensions, requestHash: item.requestHash, sourceHash: item.sourceHash, finalHash: item.finalHash ?? item.hash, generationStatus: item.generationStatus ?? 'complete', backendProvenance: item.provenance, qaStatus: item.maturity, productionReady: item.productionReady === true }));
        console.log(JSON.stringify({ projectPath, configuredBackend: remoteWorkerBackendFromEnvironment()?.id ?? null, artifacts }, null, 2));
      } catch (err) { console.log(`✗ ${err instanceof Error ? err.message : String(err)}`); process.exitCode = 1; }
    });

  assets
    .command('qa <action> <slug> <assetId>')
    .description('Inspect or record an explicit hash-bound QA decision (approve, reject, or rework)')
    .option('--expected-hash <sha256>', 'Required final artifact hash for every decision')
    .option('--reviewer <identity>', 'Reviewer identity', 'human:cli')
    .option('--notes <text>', 'Reviewer notes')
    .option('--reason <code...>', 'Structured reason codes')
    .action((action: string, slug: string, assetId: string, opts: { expectedHash?: string; reviewer: string; notes?: string; reason?: string[] }) => {
      const config = loadConfig();
      let projectPath: string;
      try { projectPath = resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug); }
      catch (err) { console.log(err instanceof UnsafeProjectPathError ? `✗ ${err.message}` : `✗ ${String(err)}`); process.exitCode = 1; return; }
      if (action === 'inspect') {
        const history = loadQaReviewHistory(projectPath, assetId);
        console.log(JSON.stringify({ assetId, reviews: history }, null, 2));
        return;
      }
      const decisions = { approve: 'APPROVE', reject: 'REJECT', rework: 'NEEDS_REWORK' } as const;
      const decision = decisions[action as keyof typeof decisions];
      if (!decision) { console.log('✗ action must be inspect, approve, reject, or rework'); process.exitCode = 1; return; }
      if (!opts.expectedHash) { console.log('✗ --expected-hash <sha256> is required for decisions'); process.exitCode = 1; return; }
      const result = decideProjectAssetQa(projectPath, { assetId, expectedHash: opts.expectedHash, decision, reviewer: opts.reviewer, notes: opts.notes, reasonCodes: opts.reason });
      if (!result.success) { console.log(`✗ ${result.error}`); process.exitCode = 1; return; }
      console.log(`✓ ${assetId}: ${decision} -> ${result.maturity}`);
      console.log(`  Review: ${result.reviewPath}`);
    });

  assets
    .command('reclassify <slug>')
    .description(
      'Re-evaluate every artifact in generation_manifest.json against the current production-intent ' +
        'predicate. Never overwrites recorded provider/critique evidence — only recomputes maturity/' +
        'productionReady and records why. Never lowers a threshold; only reports what the current ' +
        'predicate actually says.',
    )
    .option('--dry-run', 'Report expected changes without writing the manifest')
    .option('--artifact <id...>', 'Limit reclassification to specific artifact ids or paths')
    .action(async (slug: string, opts: { dryRun?: boolean; artifact?: string[] }) => {
      const config = loadConfig();
      let projectPath: string;
      try {
        projectPath = resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug);
      } catch (err) {
        console.log(err instanceof UnsafeProjectPathError ? `✗ ${err.message}` : `✗ ${String(err)}`);
        process.exitCode = 1;
        return;
      }

      const result = reclassifyProjectAssetMaturity(projectPath, {
        dryRun: opts.dryRun,
        artifactIds: opts.artifact,
      });

      if (!result.success) {
        for (const err of result.errors) console.log(`✗ ${err}`);
        process.exitCode = 1;
        return;
      }

      console.log(`Reclassifying: ${projectPath}${result.dryRun ? ' (dry run)' : ''}`);
      console.log(`  evaluated: ${result.evaluatedCount}/${result.artifactCount}  changed: ${result.changedCount}  unchanged: ${result.unchangedCount}`);
      for (const change of result.changes) {
        console.log(`  [${change.oldMaturity} -> ${change.newMaturity}] ${change.path}`);
        console.log(`    ${change.reason}`);
      }

      const reportPath = join(projectPath, 'reports', 'reclassification-report.json');
      if (!result.dryRun) {
        writeFileSync(
          reportPath,
          JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              projectPath: result.projectPath,
              artifactCount: result.artifactCount,
              evaluatedCount: result.evaluatedCount,
              changedCount: result.changedCount,
              unchangedCount: result.unchangedCount,
              changes: result.changes,
            },
            null,
            2,
          ),
        );
        console.log(`  Report: ${reportPath}`);

        if (result.changedCount > 0) {
          try {
            const loaded = loadProjectContext(projectPath);
            const coverage = buildAssetCoverageReport(loaded);
            writeFileSync(join(projectPath, 'asset_coverage.json'), JSON.stringify(coverage, null, 2));
            console.log('  asset_coverage.json refreshed from current manifest state');
          } catch (err) {
            console.log(`  [!] Could not refresh asset_coverage.json: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    });
}
