import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { loadConfig, resolveGeneratedGamesPath, resolveProjectPathSafe, UnsafeProjectPathError } from '@metroforge/shared';
import { QAValidator, RepairEngineer, deriveValidationLevel } from '@metroforge/qa';
import { ToolRegistry } from '@metroforge/tools';
import { rescoreVisualSlice } from '@metroforge/generation';

function isReleaseCandidate(projectPath: string): boolean {
  try {
    const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8')) as {
      profile?: string;
    };
    return dna.profile === 'RELEASE_CANDIDATE';
  } catch {
    return false;
  }
}

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
      const godotPath =
        config.godotExecutable && existsSync(config.godotExecutable)
          ? config.godotExecutable
          : (tools.find((t) => t.id === 'godot')?.path ?? null);

      let godotPassed = true;
      let runtimePassed = true;
      let screenshotPassed = true;
      let playtestPassed = true;
      const requiredShot = isReleaseCandidate(projectPath);

      if (godotPath) {
        const godotResult = validator.validateGodotHeadless(godotPath, projectPath);
        godotPassed = godotResult.passed;
        const icon = godotResult.passed ? '✓' : '✗';
        console.log(`[${icon}] ${godotResult.gate}: ${godotResult.message}`);
        report.results.push(godotResult);

        if (opts.runtime !== false) {
          const runtimeResult = validator.validateGodotRuntime(godotPath, projectPath);
          runtimePassed = runtimeResult.passed;
          const runtimeIcon = runtimeResult.passed ? '✓' : '✗';
          console.log(`[${runtimeIcon}] ${runtimeResult.gate}: ${runtimeResult.message}`);
          report.results.push(runtimeResult);

          const shot = validator.validateGameplayScreenshot(projectPath, {
            required: requiredShot,
            godotPath,
            headlessOutput: String(runtimeResult.details?.output ?? ''),
          });
          screenshotPassed = shot.passed;
          const shotIcon = shot.passed ? '✓' : '✗';
          console.log(`[${shotIcon}] ${shot.gate}: ${shot.message}`);
          report.results.push(shot);

          if (runtimeResult.passed) {
            const playtest = validator.validateGodotPlaytest(godotPath, projectPath);
            playtestPassed = playtest.passed;
            const playtestIcon = playtest.passed ? '✓' : '✗';
            console.log(`[${playtestIcon}] ${playtest.gate}: ${playtest.message}`);
            report.results.push(playtest);
          } else {
            report.results.push({
              gate: 'godot_playtest',
              passed: true,
              state: 'SKIPPED',
              message: 'PLAYTEST_SKIPPED: runtime smoke test failed',
            });
          }
        } else {
          console.log('[·] godot_runtime: Skipped — --no-runtime');
          report.results.push({
            gate: 'godot_runtime',
            passed: true,
            state: 'SKIPPED',
            message: 'RUNTIME_VALIDATION_SKIPPED: --no-runtime',
          });
        }
      } else {
        console.log('[!] godot_imports: Skipped — Godot not detected');
        report.results.push({
          gate: 'godot_imports',
          passed: true,
          state: 'SKIPPED',
          message: 'NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE',
        });
        if (opts.runtime !== false) {
          console.log('[!] godot_runtime: Skipped — Godot not detected');
          report.results.push({
            gate: 'godot_runtime',
            passed: true,
            state: 'SKIPPED',
            message: 'NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE',
          });
        }
        if (requiredShot) {
          screenshotPassed = false;
          console.log('[✗] gameplay_screenshot_qa: RELEASE_CANDIDATE requires gameplay screenshot evidence — Godot not detected');
          report.results.push({
            gate: 'gameplay_screenshot_qa',
            passed: false,
            state: 'FAIL',
            message: 'RELEASE_CANDIDATE requires gameplay screenshot evidence — Godot not detected',
          });
        }
      }

      const overallPassed = report.passed && godotPassed && runtimePassed && screenshotPassed && playtestPassed;
      const staticGateResults = report.results.filter(
        (r) =>
          r.gate !== 'godot_imports' &&
          r.gate !== 'godot_runtime' &&
          r.gate !== 'godot_playtest' &&
          r.gate !== 'gameplay_screenshot_qa',
      );
      const validationLevel = deriveValidationLevel({
        staticPassed: staticGateResults.every((r) => r.passed),
        importGate: report.results.find((r) => r.gate === 'godot_imports'),
        runtimeGate: report.results.find((r) => r.gate === 'godot_runtime'),
        godotAvailable: Boolean(godotPath),
        skipRuntimeValidation: opts.runtime === false,
      });

      writeFileSync(
        join(projectPath, 'validation_report.json'),
        JSON.stringify(
          {
            passed: overallPassed,
            validationLevel,
            results: report.results,
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );

      console.log('');
      console.log(overallPassed ? 'Validation PASSED' : 'Validation FAILED');
      if (!overallPassed) {
        if (!report.passed && !opts.repair) {
          console.log('Tip: run with --repair to attempt automatic fixes.');
        }
        process.exitCode = 1;
      }

      // A visual-slice score computed before Godot ever ran (e.g. a --skip-runtime-validation
      // generation) bakes in a stale functionalQuality and a missing-screenshot critic fallback.
      // Now that real validation evidence exists on disk, refresh the verdict from it so the
      // report reflects what was actually just verified, not what was true at generation time.
      if (godotPath && opts.runtime !== false) {
        const rescore = rescoreVisualSlice(projectPath);
        if (rescore.ran) {
          console.log('');
          console.log(
            `Visual slice rescored from ${validationLevel}: overall ${rescore.before?.overall ?? '?'} -> ${rescore.after?.overall} ` +
              `(${rescore.before?.verdict ?? '?'} -> ${rescore.after?.verdict})`,
          );
          if (rescore.repairsApplied && rescore.repairsApplied.length > 0) {
            console.log('  repairs applied:');
            for (const r of rescore.repairsApplied) console.log(`    - ${r}`);
          }
        }
      }
    });
}
