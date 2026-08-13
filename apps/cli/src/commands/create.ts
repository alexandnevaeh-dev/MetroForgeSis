import type { Command } from 'commander';
import { GenerationPipeline } from '@metroforge/generation';
import type { GenerationMode, GenerationProfile, GameArchetype } from '@metroforge/shared';
import { loadConfig, resolveGeneratedGamesPath, resolveProjectPathSafe, UnsafeProjectPathError } from '@metroforge/shared';
import { ProjectMetadataSchema } from '@metroforge/schemas';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

export function registerCreateCommand(program: Command): void {
  program
    .command('create')
    .description('Create and generate a new game project')
    .requiredOption('--prompt <text>', 'Natural language game description')
    .option('--profile <profile>', 'Generation profile', 'TINY_TEST')
    .option('--mode <mode>', 'Generation mode', 'LOCAL_ONLY')
    .option('--seed <number>', 'Random seed', '42')
    .option('--archetype <archetype>', 'Game archetype: SIDE_VIEW_METROIDVANIA or TOP_DOWN_ACTION_ADVENTURE')
    .option('--no-generate', 'Only create project metadata without generating')
    .option('--resume', 'Resume from an existing Game DNA checkpoint if the project already exists')
    .option('--skip-runtime-validation', 'Skip Godot runtime smoke test (static/import validation still runs)')
    .option('--skip-export', 'Skip staging a packaged copy under Exports/<slug>/ after generation')
    .action(
      async (opts: {
        prompt: string;
        profile: string;
        mode: string;
        seed: string;
        archetype?: string;
        generate: boolean;
        resume?: boolean;
        skipRuntimeValidation?: boolean;
        skipExport?: boolean;
      }) => {
        const profile = opts.profile as GenerationProfile;
        const mode = opts.mode as GenerationMode;
        const seed = parseInt(opts.seed, 10);

        if (opts.generate === false) {
          console.log('Create-only mode — use metroforge generate to run pipeline');
          return;
        }

        console.log(`Generating ${profile} game...`);
        console.log(`Mode: ${mode}`);
        console.log(`Prompt: ${opts.prompt.slice(0, 80)}...`);
        console.log('');

        const pipeline = new GenerationPipeline();
        const result = await pipeline.run({
          prompt: opts.prompt,
          profile,
          mode,
          seed,
          archetype: opts.archetype as GameArchetype | undefined,
          resume: opts.resume,
          skipRuntimeValidation: opts.skipRuntimeValidation,
          skipExport: opts.skipExport,
        });

        console.log('');
        console.log('--- Generation Phases ---');
        for (const phase of result.phases) {
          const icon =
            phase.status === 'PASSED'
              ? '✓'
              : phase.status === 'FAILED'
                ? '✗'
                : phase.status === 'SKIPPED'
                  ? '-'
                  : phase.status === 'WARN'
                    ? '!'
                    : '·';
          const msg = phase.message ? ` (${phase.message})` : '';
          console.log(`  [${icon}] ${phase.phase}: ${phase.status}${msg}`);
        }

        if (result.warnings.length > 0) {
          console.log('\nWarnings:');
          for (const w of result.warnings) console.log(`  ! ${w}`);
        }

        if (result.errors.length > 0) {
          console.log('\nErrors:');
          for (const e of result.errors) console.log(`  ✗ ${e}`);
        }

        console.log('');
        if (!result.success) {
          console.log('✗ Generation failed');
          process.exitCode = 1;
        } else if (result.validationPassed === false) {
          console.log(`! Game generated but did not pass validation: ${result.outputPath}`);
          console.log(`  Status: ${result.projectStatus ?? 'validation_failed'}`);
          console.log(`  See validation_report.json in the project folder for gate-by-gate detail.`);
          console.log(`  Job ID: ${result.jobId}`);
          process.exitCode = 1;
        } else {
          console.log(`✓ Game generated: ${result.outputPath}`);
          console.log(`  Validation: ${result.validationLevel ?? (result.validationPassed ? 'RUNTIME_VALIDATED' : 'FAILED')}`);
          console.log(`  Open in Godot 4.x and press F5 to play`);
          console.log(`  Job ID: ${result.jobId}`);
        }
      },
    );
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate <slug>')
    .description('Generate or regenerate a game by project slug')
    .option('--profile <profile>', 'Generation profile')
    .option('--mode <mode>', 'Generation mode')
    .option('--seed <number>', 'Random seed')
    .option('--archetype <archetype>', 'Game archetype')
    .option('--resume', 'Resume from an existing Game DNA checkpoint if present', true)
    .option('--skip-runtime-validation', 'Skip Godot runtime smoke test')
    .option('--skip-export', 'Skip staging a packaged copy under Exports/<slug>/ after generation')
    .action(async (slug: string, opts: { profile?: string; mode?: string; seed?: string; resume?: boolean; skipRuntimeValidation?: boolean; skipExport?: boolean }) => {
      const config = loadConfig();
      let projectPath: string;
      try {
        projectPath = resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug);
      } catch (err) {
        console.log(err instanceof UnsafeProjectPathError ? `✗ ${err.message}` : `✗ ${String(err)}`);
        process.exitCode = 1;
        return;
      }
      const projectJsonPath = join(projectPath, 'project.json');

      // project.json is written by every successful `create`/`generate` run (see
      // pipeline.ts) — reading it back here is what makes regeneration actually reliable,
      // rather than falling back to a generic placeholder prompt that loses the user's
      // original intent. Explicit CLI flags still take priority over the saved metadata.
      let prompt = `Regenerate Metroidvania project ${slug}`;
      let savedProfile: GenerationProfile | undefined;
      let savedMode: GenerationMode | undefined;
      let savedSeed: number | undefined;

      if (existsSync(projectJsonPath)) {
        const parsed = ProjectMetadataSchema.safeParse(
          JSON.parse(readFileSync(projectJsonPath, 'utf-8')),
        );
        if (parsed.success) {
          prompt = parsed.data.prompt;
          savedProfile = parsed.data.profile;
          savedMode = parsed.data.mode;
          savedSeed = parsed.data.seed;
        } else {
          console.log(`Warning: project.json exists but failed validation — using defaults (${parsed.error.issues[0]?.message ?? 'unknown error'})`);
        }
      } else {
        console.log('Warning: no project.json found — regenerating with a generic placeholder prompt.');
      }

      const pipeline = new GenerationPipeline();
      const result = await pipeline.run({
        prompt,
        profile: (opts.profile as GenerationProfile) ?? savedProfile ?? 'TINY_TEST',
        mode: (opts.mode as GenerationMode) ?? savedMode ?? 'LOCAL_ONLY',
        seed: opts.seed ? parseInt(opts.seed, 10) : (savedSeed ?? 42),
        slug,
        resume: opts.resume,
        skipRuntimeValidation: opts.skipRuntimeValidation,
        skipExport: opts.skipExport,
      });

      if (!result.success) {
        console.log('✗ Generation failed');
        process.exitCode = 1;
      } else if (result.validationPassed === false) {
        console.log(`! Generated but did not pass validation: ${result.outputPath} (status: ${result.projectStatus ?? 'validation_failed'})`);
        process.exitCode = 1;
      } else {
        console.log(`✓ Generated: ${result.outputPath}`);
      }
    });
}
