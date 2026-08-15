import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { loadConfig, resolveGeneratedGamesPath, resolveProjectPathSafe, UnsafeProjectPathError } from '@metroforge/shared';
import { runQualityPass } from '@metroforge/qa';

export function registerQualityCommand(program: Command): void {
  program
    .command('quality <slug>')
    .description('Run QualityDirector analysis and typed production-polish repairs')
    .option('--plan-only', 'Analyze and emit a plan without mutating the project')
    .option('--no-recapture', 'Skip windowed screenshot recapture after apply')
    .option('--playtest', 'Re-run Godot playtest after apply (rollback on fail)')
    .option('--godot <path>', 'Override Godot executable')
    .action(async (
      slug: string,
      opts: { planOnly?: boolean; recapture?: boolean; playtest?: boolean; godot?: string },
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

      const godotPath =
        opts.godot && existsSync(opts.godot)
          ? opts.godot
          : config.godotExecutable && existsSync(config.godotExecutable)
            ? config.godotExecutable
            : null;

      console.log(`QualityDirector: ${projectPath}`);
      const report = runQualityPass({
        projectPath,
        godotPath,
        apply: !opts.planOnly,
        recapture: opts.recapture !== false && !opts.planOnly,
        playtest: Boolean(opts.playtest) && !opts.planOnly,
      });

      console.log(`  tier: ${report.tier}`);
      console.log(
        `  before: quality ${report.before.qualityScore} (tech ${report.before.technicalScore} / pres ${report.before.presentationScore}) critic ${report.snapshotBefore.criticScore} luma ${report.snapshotBefore.lumaStdDev.toFixed(2)}`,
      );
      console.log(
        `  after:  quality ${report.after.qualityScore} (tech ${report.after.technicalScore} / pres ${report.after.presentationScore}) critic ${report.snapshotAfter.criticScore} luma ${report.snapshotAfter.lumaStdDev.toFixed(2)}`,
      );
      console.log(`  commercialSafe: ${report.commercialSafe} placeholders: ${report.placeholderCount}`);
      console.log(`  applied: ${report.applied.filter((a) => a.ok).length}/${report.applied.length}  rolledBack: ${report.rolledBack}`);
      for (const note of report.notes) console.log(`  - ${note}`);
      if (report.rolledBack) process.exitCode = 1;
    });
}
