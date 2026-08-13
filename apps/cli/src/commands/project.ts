import type { Command } from 'commander';
import {
  deleteProject,
  duplicateProject,
  renameProject,
  resolveProjectBySlug,
  refreshProjectTemplate,
  refreshAllProjectTemplates,
} from '@metroforge/tools';
import {
  backfillProjectAssetMaturity,
  setProjectAllowPlaceholders,
  getProjectAllowPlaceholders,
  remapProjectAbilities,
} from '@metroforge/generation';
import { loadConfig, resolveGeneratedGamesPath } from '@metroforge/shared';

export function registerProjectCommand(program: Command): void {
  const project = program.command('project').description('Manage generated game projects');

  project
    .command('delete <slug>')
    .description('Delete a generated project by slug')
    .option('--force', 'Skip confirmation prompt', false)
    .action((slug: string, opts: { force?: boolean }) => {
      const config = loadConfig();
      const root = resolveGeneratedGamesPath(config, process.cwd());
      const resolved = resolveProjectBySlug(root, slug);
      if (!resolved.success || !resolved.projectPath) {
        console.log(`✗ ${resolved.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      if (!opts.force) {
        console.log(`Use --force to delete ${resolved.projectPath}`);
        process.exitCode = 1;
        return;
      }
      const result = deleteProject(resolved.projectPath);
      if (!result.success) {
        console.log(`✗ ${result.errors.join('; ')}`);
        process.exitCode = 1;
      } else {
        console.log(`✓ Deleted project ${slug}`);
      }
    });

  project
    .command('rename <slug> <new-slug>')
    .description('Rename a generated project folder')
    .action((slug: string, newSlug: string) => {
      const config = loadConfig();
      const root = resolveGeneratedGamesPath(config, process.cwd());
      const resolved = resolveProjectBySlug(root, slug);
      if (!resolved.success || !resolved.projectPath) {
        console.log(`✗ ${resolved.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      const result = renameProject(resolved.projectPath, newSlug, root);
      if (!result.success) {
        console.log(`✗ ${result.errors.join('; ')}`);
        process.exitCode = 1;
      } else {
        console.log(`✓ Renamed to ${result.projectPath}`);
      }
    });

  project
    .command('duplicate <slug> <new-slug>')
    .description('Copy a generated project to a new slug')
    .action((slug: string, newSlug: string) => {
      const config = loadConfig();
      const root = resolveGeneratedGamesPath(config, process.cwd());
      const resolved = resolveProjectBySlug(root, slug);
      if (!resolved.success || !resolved.projectPath) {
        console.log(`✗ ${resolved.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      const result = duplicateProject(resolved.projectPath, newSlug, root);
      if (!result.success) {
        console.log(`✗ ${result.errors.join('; ')}`);
        process.exitCode = 1;
      } else {
        console.log(`✓ Duplicated to ${result.projectPath}`);
      }
    });

  project
    .command('refresh-template [slug]')
    .description(
      'Copy current runtime template files into a generated project (or all projects with --all)',
    )
    .option('--all', 'Refresh every project under GeneratedGames', false)
    .action((slug: string | undefined, opts: { all?: boolean }) => {
      const config = loadConfig();
      const root = resolveGeneratedGamesPath(config, process.cwd());

      if (opts.all) {
        const results = refreshAllProjectTemplates(root);
        if (results.length === 0) {
          console.log('No generated projects found.');
          return;
        }
        let failed = 0;
        for (const result of results) {
          const name = result.projectPath ? result.projectPath.split(/[/\\]/).pop() : 'unknown';
          if (!result.success) {
            failed += 1;
            console.log(`✗ ${name}: ${result.errors.join('; ')}`);
            continue;
          }
          console.log(
            `✓ ${name}: ${result.copied.length} files copied, ${result.removed.length} orphans removed`,
          );
        }
        if (failed > 0) process.exitCode = 1;
        return;
      }

      if (!slug) {
        console.log('Provide a project slug or pass --all');
        process.exitCode = 1;
        return;
      }

      const resolved = resolveProjectBySlug(root, slug);
      if (!resolved.success || !resolved.projectPath) {
        console.log(`✗ ${resolved.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      const result = refreshProjectTemplate(resolved.projectPath);
      if (!result.success) {
        console.log(`✗ ${result.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      console.log(
        `✓ Refreshed ${slug}: ${result.copied.length} files copied, ${result.removed.length} orphans removed`,
      );
      for (const rel of result.removed) {
        console.log(`  - removed ${rel}`);
      }
    });

  project
    .command('backfill-maturity <slug>')
    .description(
      'Fill missing maturity / productionReady / sourceType on generation_manifest.json (idempotent)',
    )
    .option('--dry-run', 'Report updates without writing the manifest', false)
    .action((slug: string, opts: { dryRun?: boolean }) => {
      const config = loadConfig();
      const root = resolveGeneratedGamesPath(config, process.cwd());
      const resolved = resolveProjectBySlug(root, slug);
      if (!resolved.success || !resolved.projectPath) {
        console.log(`✗ ${resolved.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      const result = backfillProjectAssetMaturity(resolved.projectPath, { dryRun: opts.dryRun === true });
      if (!result.success) {
        console.log(`✗ ${result.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      const mode = result.dryRun ? 'dry-run' : 'wrote';
      console.log(
        `✓ Backfill maturity (${mode}): updated ${result.updatedCount} / ${result.artifactCount} artifacts` +
          (result.skippedCount ? `, skipped ${result.skippedCount}` : ''),
      );
    });

  project
    .command('allow-placeholders <slug>')
    .description('Get or set project.json allowPlaceholders for AssetProductionGate')
    .option('--enable', 'Set allowPlaceholders=true', false)
    .option('--disable', 'Set allowPlaceholders=false', false)
    .action((slug: string, opts: { enable?: boolean; disable?: boolean }) => {
      const config = loadConfig();
      const root = resolveGeneratedGamesPath(config, process.cwd());
      const resolved = resolveProjectBySlug(root, slug);
      if (!resolved.success || !resolved.projectPath) {
        console.log(`✗ ${resolved.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      if (opts.enable && opts.disable) {
        console.log('✗ Pass only one of --enable or --disable');
        process.exitCode = 1;
        return;
      }
      if (opts.enable || opts.disable) {
        const result = setProjectAllowPlaceholders(resolved.projectPath, opts.enable === true);
        if (!result.success) {
          console.log(`✗ ${result.errors.join('; ')}`);
          process.exitCode = 1;
          return;
        }
        console.log(`✓ allowPlaceholders=${result.allowPlaceholders}`);
        return;
      }
      const current = getProjectAllowPlaceholders(resolved.projectPath);
      if (!current.success) {
        console.log(`✗ ${current.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      console.log(`allowPlaceholders=${current.allowPlaceholders}`);
    });

  project
    .command('remap-abilities <slug>')
    .description('Remap game_dna.json ability ids onto registered runtime abilities')
    .option('--dry-run', 'Report remaps without writing files', false)
    .action((slug: string, opts: { dryRun?: boolean }) => {
      const config = loadConfig();
      const root = resolveGeneratedGamesPath(config, process.cwd());
      const resolved = resolveProjectBySlug(root, slug);
      if (!resolved.success || !resolved.projectPath) {
        console.log(`✗ ${resolved.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      const result = remapProjectAbilities(resolved.projectPath, {
        dryRun: opts.dryRun === true,
      });
      if (!result.success) {
        console.log(`✗ ${result.errors.join('; ')}`);
        process.exitCode = 1;
        return;
      }
      const mode = result.dryRun ? 'dry-run' : result.changed ? 'wrote' : 'unchanged';
      console.log(
        `✓ Remap abilities (${mode}): ${result.abilityCount} abilities` +
          (result.remapped.length
            ? `, remapped ${result.remapped.map((p) => `${p.from}→${p.to}`).join(', ')}`
            : '') +
          (result.removed.length ? `, removed ${result.removed.join(', ')}` : '') +
          (result.referenceFilesUpdated?.length
            ? `, refs in ${result.referenceFilesUpdated.join(', ')}`
            : ''),
      );
      for (const w of result.warnings) {
        console.log(`  ! ${w}`);
      }
    });
}