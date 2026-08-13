import type { Command } from 'commander';
import {
  loadConfig,
  resolveGeneratedGamesPath,
  resolveProjectPathSafe,
  UnsafeProjectPathError,
} from '@metroforge/shared';
import {
  formatAcceptanceReport,
  runProjectAcceptance,
} from '@metroforge/qa';
import { loadProjectContext, analyzeProjectCompletion } from '@metroforge/generation';
import { ToolRegistry } from '@metroforge/tools';

export function registerAcceptCommand(program: Command): void {
  program
    .command('accept <slug>')
    .description('Run full acceptance checks (static QA, Godot import/runtime, completion analysis)')
    .option('--no-runtime', 'Skip Godot runtime smoke test')
    .action(async (slug: string, opts: { noRuntime?: boolean }) => {
      const config = loadConfig();
      let projectPath: string;
      try {
        projectPath = resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug);
      } catch (err) {
        console.log(err instanceof UnsafeProjectPathError ? `✗ ${err.message}` : `✗ ${String(err)}`);
        process.exitCode = 1;
        return;
      }

      const project = loadProjectContext(projectPath);
      const completion = analyzeProjectCompletion(project);

      const toolRegistry = new ToolRegistry();
      const tools = await toolRegistry.detectAll({ godotPath: config.godotExecutable });
      const godotPath = config.godotExecutable ?? tools.find((t) => t.id === 'godot')?.path ?? null;

      const report = await runProjectAcceptance({
        slug,
        projectPath,
        godotPath,
        skipRuntime: opts.noRuntime,
        completion,
      });

      console.log(formatAcceptanceReport(report));
      console.log('');
      if (!report.accepted) {
        process.exitCode = 1;
      }
    });
}
