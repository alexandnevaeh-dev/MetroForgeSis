import type { Command } from 'commander';
import { join } from 'node:path';
import { loadConfig, resolveGeneratedGamesPath } from '@metroforge/shared';
import { QAValidator, RepairEngineer } from '@metroforge/qa';
import { ToolRegistry } from '@metroforge/tools';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate <slug>')
    .description('Validate a generated Godot project')
    .option('--repair', 'Attempt deterministic repair of any failing gates, then re-validate')
    .action(async (slug: string, opts: { repair?: boolean }) => {
      const config = loadConfig();
      const projectPath = join(resolveGeneratedGamesPath(config, process.cwd()), slug);
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

      if (godotPath) {
        const godotResult = validator.validateGodotHeadless(godotPath, projectPath);
        const icon = godotResult.passed ? '✓' : '✗';
        console.log(`[${icon}] ${godotResult.gate}: ${godotResult.message}`);
      } else {
        console.log('[!] godot_imports: Skipped — Godot not detected');
      }

      console.log('');
      console.log(report.passed ? 'Validation PASSED' : 'Validation FAILED');
      if (!report.passed) {
        if (!opts.repair) console.log('Tip: run with --repair to attempt automatic fixes.');
        process.exitCode = 1;
      }
    });
}
