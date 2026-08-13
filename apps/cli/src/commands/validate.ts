import type { Command } from 'commander';
import { loadConfig, resolveGeneratedGamesPath, resolveProjectPathSafe, UnsafeProjectPathError } from '@metroforge/shared';
import { QAValidator, RepairEngineer } from '@metroforge/qa';
import { ToolRegistry } from '@metroforge/tools';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate <slug>')
    .description('Validate a generated Godot project')
    .option('--repair', 'Attempt deterministic repair of any failing gates, then re-validate')
    // Commander treats `--no-runtime` as the negation of `runtime` (default true).
    // Reading `opts.noRuntime` never works — use `opts.runtime === false`.
    .option('--no-runtime', 'Skip Godot runtime smoke test (import/static still run when Godot is available)')
    .action(async (slug: string, opts: { repair?: boolean; runtime?: boolean }) => {
      const config = loadConfig();
      let projectPath: string;
      try {
        projectPath = resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug);
      } catch (err) {
        console.log(err instanceof UnsafeProjectPathError ? `✗ ${err.message}` : `✗ ${String(err)}`);
        process.exitCode = 1;
        return;
      }
      const validator = new QAValidator();

      console.log(`Validating: ${projectPath}\n`);

      let report = validator.validateProject(projectPath, slug);

      if (!report.passed && opts.repair) {
        const repair = new RepairEngineer();
        const repairResult = repair.repair(projectPath, report);
        if (repairResult.repaired) {
          console.log('Repair actions:');
          for (const action of repairResult.actions) console.log(`  - ${action}`);
          console.log('');
          report = validator.validateProject(projectPath, slug);
        } else {
          console.log('No deterministic repair available for the failing gates.\n');
        }
      }

      for (const result of report.results) {
        const icon = result.passed ? '✓' : '✗';
        console.log(`[${icon}] ${result.gate}: ${result.message}`);
      }

      const toolRegistry = new ToolRegistry();
      const tools = await toolRegistry.detectAll({ godotPath: config.godotExecutable });
      const godotPath = config.godotExecutable ?? tools.find((t) => t.id === 'godot')?.path ?? null;

      let godotPassed = true;
      let runtimePassed = true;

      if (godotPath) {
        const godotResult = validator.validateGodotHeadless(godotPath, projectPath);
        godotPassed = godotResult.passed;
        const icon = godotResult.passed ? '✓' : '✗';
        console.log(`[${icon}] ${godotResult.gate}: ${godotResult.message}`);

        if (opts.runtime !== false) {
          const runtimeResult = validator.validateGodotRuntime(godotPath, projectPath);
          runtimePassed = runtimeResult.passed;
          const runtimeIcon = runtimeResult.passed ? '✓' : '✗';
          console.log(`[${runtimeIcon}] ${runtimeResult.gate}: ${runtimeResult.message}`);
        } else {
          console.log('[·] godot_runtime: Skipped — --no-runtime');
        }
      } else {
        console.log('[!] godot_imports: Skipped — Godot not detected');
        if (opts.runtime !== false) {
          console.log('[!] godot_runtime: Skipped — Godot not detected');
        }
      }

      const overallPassed = report.passed && godotPassed && runtimePassed;

      console.log('');
      console.log(overallPassed ? 'Validation PASSED' : 'Validation FAILED');
      if (!overallPassed) {
        if (!report.passed && !opts.repair) {
          console.log('Tip: run with --repair to attempt automatic fixes.');
        }
        process.exitCode = 1;
      }
    });
}
