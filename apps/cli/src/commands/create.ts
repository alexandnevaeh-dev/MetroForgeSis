import type { Command } from 'commander';
import { GenerationPipeline } from '@metroforge/generation';
import type { GenerationMode, GenerationProfile } from '@metroforge/shared';
import { loadConfig, resolveGeneratedGamesPath } from '@metroforge/shared';
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
    .option('--no-generate', 'Only create project metadata without generating')
    .option('--resume', 'Resume from an existing Game DNA checkpoint if the project already exists')
    .action(
      async (opts: {
        prompt: string;
        profile: string;
        mode: string;
        seed: string;
        generate: boolean;
        resume?: boolean;
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
          resume: opts.resume,
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
        if (result.success) {
          console.log(`✓ Game generated: ${result.outputPath}`);
          console.log(`  Open in Godot 4.x and press F5 to play`);
          console.log(`  Job ID: ${result.jobId}`);
        } else {
          console.log('✗ Generation failed');
          process.exitCode = 1;
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
    .option('--resume', 'Resume from an existing Game DNA checkpoint if present', true)
    .action(async (slug: string, opts: { profile?: string; mode?: string; seed?: string; resume?: boolean }) => {
      const config = loadConfig();
      const projectPath = join(resolveGeneratedGamesPath(config, process.cwd()), slug);
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
      });

      if (result.success) {
        console.log(`✓ Generated: ${result.outputPath}`);
      } else {
        console.log('✗ Generation failed');
        process.exitCode = 1;
      }
    });
}
