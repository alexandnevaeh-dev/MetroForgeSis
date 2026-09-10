import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import {
  loadConfig,
  resolveGeneratedGamesPath,
  resolveProjectPathSafe,
  UnsafeProjectPathError,
  readVisualSliceApproval,
  writeVisualSliceApproval,
  isVisualSliceApprovalCurrent,
} from '@metroforge/shared';
import { computeVisualEvidenceHash, writeCandidateVisualReviewPack } from '@metroforge/generation';

function resolve(slug: string): { projectPath: string } | null {
  const config = loadConfig();
  try {
    return { projectPath: resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug) };
  } catch (err) {
    console.log(err instanceof UnsafeProjectPathError ? `✗ ${err.message}` : `✗ ${String(err)}`);
    process.exitCode = 1;
    return null;
  }
}

interface LatestExportReadiness {
  runtimeReady: boolean;
  assetReady: boolean;
  packageReady: boolean;
  foundAt?: string;
}

/** Reuse the last real `metroforge export` run's own readiness computation rather than
 *  re-deriving it here — this command reports evidence, it does not recompute gates. */
function latestExportReadiness(projectPath: string, slug: string): LatestExportReadiness {
  const fallback: LatestExportReadiness = { runtimeReady: false, assetReady: false, packageReady: false };
  const exportsDir = join(projectPath, '..', '..', 'Exports', slug);
  if (!existsSync(exportsDir)) return fallback;
  try {
    const stagingDirs = readdirSync(exportsDir)
      .map((name) => join(exportsDir, name))
      .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'export_manifest.json')))
      .sort((a, b) => statSync(join(b, 'export_manifest.json')).mtimeMs - statSync(join(a, 'export_manifest.json')).mtimeMs);
    const latest = stagingDirs[0];
    if (!latest) return fallback;
    const manifest = JSON.parse(readFileSync(join(latest, 'export_manifest.json'), 'utf-8')) as {
      readiness?: { runtimeReady?: boolean; assetReady?: boolean; packageReady?: boolean };
    };
    return {
      runtimeReady: manifest.readiness?.runtimeReady === true,
      assetReady: manifest.readiness?.assetReady === true,
      packageReady: manifest.readiness?.packageReady === true,
      foundAt: join(latest, 'export_manifest.json'),
    };
  } catch {
    return fallback;
  }
}

export function registerCandidateCommand(program: Command): void {
  const candidate = program.command('candidate').description('Release-candidate governance: human visual-direction review and approval');

  candidate
    .command('review-pack <slug>')
    .description('Generate the Candidate Human Visual Review Pack — capture paths, asset status, and readiness fields for a human to inspect before approving')
    .action(async (slug: string) => {
      const resolved = resolve(slug);
      if (!resolved) return;
      const readiness = latestExportReadiness(resolved.projectPath, slug);
      const reclassifyReportPath = join(resolved.projectPath, 'reports', 'reclassification-report.json');
      let reclassifyChanges: Array<{ id: string; path: string; oldMaturity: string; newMaturity: string }> = [];
      if (existsSync(reclassifyReportPath)) {
        try {
          const report = JSON.parse(readFileSync(reclassifyReportPath, 'utf-8')) as { changes?: typeof reclassifyChanges };
          reclassifyChanges = report.changes ?? [];
        } catch {
          /* leave empty if unreadable */
        }
      }
      const { path, pack } = writeCandidateVisualReviewPack(resolved.projectPath, { ...readiness, reclassifyChanges });
      console.log(`Review pack written: ${path}`);
      console.log(`  captures found: ${Object.keys(pack.capturePaths).length}`);
      console.log(`  automated visual score: ${pack.automatedVisualScore} (${pack.automatedVisualVerdict})`);
      console.log(
        `  runtimeReady=${readiness.runtimeReady} assetReady=${readiness.assetReady} packageReady=${readiness.packageReady}` +
          (readiness.foundAt ? ` (from ${readiness.foundAt})` : ' (no export_manifest.json found yet — run `metroforge export --windows` first)'),
      );
    });

  candidate
    .command('status <slug>')
    .description('Show current visual-slice approval status and whether it is stale relative to current evidence')
    .action(async (slug: string) => {
      const resolved = resolve(slug);
      if (!resolved) return;
      const approval = readVisualSliceApproval();
      const currentHash = computeVisualEvidenceHash(resolved.projectPath);
      const scopedToThisProject = approval.projectSlug === slug;
      const current = scopedToThisProject && isVisualSliceApprovalCurrent(approval, currentHash);

      console.log(`Candidate: ${slug}`);
      console.log(`  recorded status: ${approval.status}`);
      console.log(`  recorded for project: ${approval.projectSlug ?? '(none)'}`);
      console.log(`  current evidence hash: ${currentHash}`);
      console.log(`  recorded evidence hash: ${approval.evidenceHash ?? '(none)'}`);
      console.log(`  approval currently valid for this exact evidence: ${current}`);
      if (approval.visualSliceApproved && scopedToThisProject && !current) {
        console.log('  [!] STALE APPROVAL — visual evidence has changed since this was approved. Treat as not approved.');
      }
      console.log(`  visualSliceApproved (effective): ${current}`);
    });

  candidate
    .command('approve-visual <slug>')
    .description(
      'Record explicit human approval of this candidate\'s current visual direction. ' +
        'This is a governance action for a human to run — never invoke it automatically or on a human\'s behalf.',
    )
    .option('--reviewer <name>', 'Reviewer identity, if known')
    .option('--notes <text>', 'Review notes')
    .action(async (slug: string, opts: { reviewer?: string; notes?: string }) => {
      const resolved = resolve(slug);
      if (!resolved) return;
      const evidenceHash = computeVisualEvidenceHash(resolved.projectPath);
      writeVisualSliceApproval({
        visualSliceApproved: true,
        status: 'VISUAL_SLICE_APPROVED',
        projectSlug: slug,
        approvedAt: new Date().toISOString(),
        notes: opts.notes,
        evidenceHash,
        reviewer: opts.reviewer,
      });
      console.log(`✓ Recorded human visual approval for ${slug} (evidence hash ${evidenceHash})`);
      console.log('  This approval is tied to the current visual evidence — it becomes stale (see `candidate status`)');
      console.log('  the next time that evidence changes (rescoring, asset reclassification, regeneration).');
    });

  candidate
    .command('reject-visual <slug>')
    .description('Record explicit human rejection of this candidate\'s current visual direction')
    .option('--reviewer <name>', 'Reviewer identity, if known')
    .option('--notes <text>', 'Reason for rejection')
    .action(async (slug: string, opts: { reviewer?: string; notes?: string }) => {
      const resolved = resolve(slug);
      if (!resolved) return;
      const evidenceHash = computeVisualEvidenceHash(resolved.projectPath);
      writeVisualSliceApproval({
        visualSliceApproved: false,
        status: 'VISUAL_SLICE_REJECTED',
        projectSlug: slug,
        rejectedAt: new Date().toISOString(),
        notes: opts.notes,
        evidenceHash,
        reviewer: opts.reviewer,
      });
      console.log(`✗ Recorded human visual rejection for ${slug}`);
    });
}
