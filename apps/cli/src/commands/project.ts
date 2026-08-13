import type { Command } from 'commander';
import {
  deleteProject,
  duplicateProject,
  renameProject,
  resolveProjectBySlug,
  refreshProjectTemplate,
  refreshAllProjectTemplates,
} from '@metroforge/tools';
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
}
