import type { Command } from 'commander';
import { GenerationPipeline } from '@metroforge/generation';
import type { GenerateOptions } from '@metroforge/generation';
import type { GenerationMode, GenerationProfile, GameArchetype, TargetEngine } from '@metroforge/shared';

type ExternalVisualPackId = NonNullable<GenerateOptions['externalVisualPack']>;
import {
  loadConfig,
  resolveGeneratedGamesPath,
  resolveProjectPathSafe,
  UnsafeProjectPathError,
  GENERATION_PROFILES,
  parseTargetEngine,
} from '@metroforge/shared';
import { ProjectMetadataSchema } from '@metroforge/schemas';
import { HardwareProfiler } from '@metroforge/ai';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

function parseProfile(value: string | undefined): GenerationProfile | undefined {
  if (!value) return undefined;
  if (!(GENERATION_PROFILES as readonly string[]).includes(value)) {
    throw new Error(`Unknown profile "${value}". Expected: ${GENERATION_PROFILES.join(', ')}`);
  }
  return value as GenerationProfile;
}

function resolveHardwareProfile(value?: string): string {
  if (value) return value;
  try {
    return new HardwareProfiler().profile().profile;
  } catch {
    return 'LOW_RESOURCE';
  }
}

export const VISUAL_MODES = ['procedural-only', 'nvidia-enhanced', 'auto'] as const;
export type VisualMode = (typeof VISUAL_MODES)[number];

/** Validates --visual-mode. Pure/exported so it's testable without spinning up Commander. */
export function resolveVisualMode(value: string | undefined): { visualMode: VisualMode } | { error: string } {
  const candidate = value ?? 'procedural-only';
  if (!(VISUAL_MODES as readonly string[]).includes(candidate)) {
    return { error: `Unknown --visual-mode "${candidate}". Expected: ${VISUAL_MODES.join(', ')}` };
  }
  return { visualMode: candidate as VisualMode };
}

export function registerCreateCommand(program: Command): void {
  program
    .command('create')
    .description('Create and generate a new game project')
    .requiredOption('--prompt <text>', 'Natural language game description')
    .option('--profile <profile>', 'Generation profile (TINY_TEST, VISUAL_VERTICAL_SLICE, SMALL, MEDIUM, LARGE, RELEASE_CANDIDATE)', 'TINY_TEST')
    .option('--mode <mode>', 'Generation mode', 'LOCAL_ONLY')
    .option(
      '--visual-mode <mode>',
      'procedural-only (default): guaranteed procedural baseline, never calls NVIDIA NIM. ' +
        'nvidia-enhanced: always attempts NIM enhancement for the P0 visual-asset slice after the ' +
        'procedural baseline, falling back per-asset on failure. auto: attempts only when NIM ' +
        'health-checks as reachable first.',
      'procedural-only',
    )
    .option('--seed <number>', 'Random seed', '42')
    .option('--slug <slug>', 'Project directory slug')
    .option('--hardware-profile <profile>', 'LOW_RESOURCE, BALANCED, or HIGH_QUALITY')
    .option('--external-visual-pack <id>', 'Optional test pack: industrial-transit or metroforge-foundry-v3. Side-view VISUAL_VERTICAL_SLICE defaults to the authored courier+masonry pipeline path; pass metroforge-foundry-v3 for the prebuilt pack.')
    .option('--archetype <archetype>', 'Game archetype: SIDE_VIEW_METROIDVANIA, SIDE_VIEW_PLATFORMER, TOP_DOWN_ACTION_ADVENTURE, or QUANTUM_SIMULATION_ROGUELITE (LOCAL_ONLY/TINY_TEST/Godot preview)')
    .option('--engine <engine>', 'Target engine: godot (default), unity, or unreal')
    .option('--no-generate', 'Only create project metadata without generating')
    .option('--resume', 'Resume from an existing Game DNA checkpoint if the project already exists')
    .option('--skip-runtime-validation', 'Skip Godot runtime smoke test (static/import validation still runs)')
    .option('--skip-export', 'Skip staging a packaged copy under Exports/<slug>/ after generation')
    .option(
      '--asset-generation-backend <backend>',
      'legacy (default): unchanged single-provider-per-run resolver. foundry: routes the player ' +
        'key-art category through AssetFoundry (capability routing/scoring/retry/circuit-breaker/' +
        'license/provenance) — failures surface honestly, no silent fallback. ' +
        'foundry-with-legacy-fallback: Foundry first, legacy only on a fallback-eligible failure.',
      'legacy',
    )
    .option('--enable-pollinations', 'Register the free, keyless Pollinations provider as a routing candidate')
    .option(
      '--visual-reference-library',
      'Use the fourteenth-session visual reference/template library (docs/asset-pipeline/reference-library/) ' +
        'for template-driven enemy prompts/palettes, in place of the generic biome-index rotation',
    )
    .action(
      async (opts: {
        prompt: string;
        profile: string;
        mode: string;
        visualMode: string;
        seed: string;
        slug?: string;
        hardwareProfile?: string;
        externalVisualPack?: string;
        archetype?: string;
        engine?: string;
        generate: boolean;
        resume?: boolean;
        skipRuntimeValidation?: boolean;
        skipExport?: boolean;
        assetGenerationBackend?: string;
        enablePollinations?: boolean;
        visualReferenceLibrary?: boolean;
      }) => {
        let profile: GenerationProfile;
        try {
          profile = parseProfile(opts.profile) ?? 'TINY_TEST';
        } catch (err) {
          console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
          process.exitCode = 1;
          return;
        }
        const mode = opts.mode as GenerationMode;
        const visualModeResult = resolveVisualMode(opts.visualMode);
        if ('error' in visualModeResult) {
          console.log(`✗ ${visualModeResult.error}`);
          process.exitCode = 1;
          return;
        }
        const { visualMode } = visualModeResult;
        const engineResult = parseTargetEngine(opts.engine);
        if (typeof engineResult === 'object') {
          console.log(`✗ ${engineResult.error}`);
          process.exitCode = 1;
          return;
        }
        const targetEngine = engineResult;
        const seed = parseInt(opts.seed, 10);
        const hardwareProfile = resolveHardwareProfile(opts.hardwareProfile);

        if (opts.generate === false) {
          console.log('Create-only mode — use metroforge generate to run pipeline');
          return;
        }

        console.log(`Generating ${profile} game...`);
        console.log(`Mode: ${mode}`);
        console.log(`Engine: ${targetEngine}`);
        if (visualMode !== 'procedural-only') console.log(`Visual mode: ${visualMode}`);
        console.log(`Prompt: ${opts.prompt.slice(0, 80)}...`);
        console.log('');

        const pipeline = new GenerationPipeline();
        const result = await pipeline.run({
          prompt: opts.prompt,
          profile,
          mode,
          visualMode,
          externalVisualPack: opts.externalVisualPack as ExternalVisualPackId | undefined,
          seed,
          slug: opts.slug,
          archetype: opts.archetype as GameArchetype | undefined,
          targetEngine,
          resume: opts.resume,
          skipRuntimeValidation: opts.skipRuntimeValidation,
          skipExport: opts.skipExport,
          hardwareProfile,
          assetGenerationBackend: opts.assetGenerationBackend as
            | 'legacy'
            | 'foundry'
            | 'foundry-with-legacy-fallback'
            | undefined,
          enablePollinations: opts.enablePollinations,
          useVisualReferenceLibrary: opts.visualReferenceLibrary,
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
          if (targetEngine === 'godot') {
            console.log(`  Open in Godot 4.x and press F5 to play`);
          } else if (targetEngine === 'unity') {
            console.log(`  Open in Unity 6.3 LTS (generated ≠ compiled ≠ playtested)`);
          } else {
            console.log(`  Open MetroForgeGame.uproject in Unreal 5.8 (generated ≠ compiled ≠ playtested)`);
          }
          console.log(`  Job ID: ${result.jobId}`);
        }
      },
    );
}

/** `--fresh` always wins: it exists precisely to force a clean regen even though `--resume`
 * defaults to true on this command, so it must override rather than merely toggle. */
export function resolveResumeFlag(opts: { resume?: boolean; fresh?: boolean }): boolean | undefined {
  return opts.fresh ? false : opts.resume;
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate <slug>')
    .description('Generate or regenerate a game by project slug')
    .option('--profile <profile>', 'Generation profile')
    .option('--mode <mode>', 'Generation mode')
    .option(
      '--visual-mode <mode>',
      'procedural-only (default): guaranteed procedural baseline, never calls NVIDIA NIM. ' +
        'nvidia-enhanced: always attempts NIM enhancement for the P0 visual-asset slice after the ' +
        'procedural baseline, falling back per-asset on failure. auto: attempts only when NIM ' +
        'health-checks as reachable first.',
    )
    .option('--seed <number>', 'Random seed')
    .option('--archetype <archetype>', 'Game archetype')
    .option('--engine <engine>', 'Target engine: godot, unity, or unreal (defaults to project.json)')
    .option('--hardware-profile <profile>', 'LOW_RESOURCE, BALANCED, or HIGH_QUALITY')
    .option('--external-visual-pack <id>', 'Optional test pack: industrial-transit or metroforge-foundry-v3. Side-view VISUAL_VERTICAL_SLICE defaults to the authored courier+masonry pipeline path; pass metroforge-foundry-v3 for the prebuilt pack.')
    .option('--resume', 'Resume from an existing Game DNA checkpoint if present', true)
    .option(
      '--fresh',
      'Ignore any existing Game DNA checkpoint and generated asset/scene checkpoints — regenerate everything from zero (overrides --resume)',
    )
    .option('--skip-runtime-validation', 'Skip Godot runtime smoke test')
    .option('--skip-export', 'Skip staging a packaged copy under Exports/<slug>/ after generation')
    .action(async (slug: string, opts: { profile?: string; mode?: string; visualMode?: string; seed?: string; resume?: boolean; fresh?: boolean; skipRuntimeValidation?: boolean; skipExport?: boolean; hardwareProfile?: string; externalVisualPack?: string; engine?: string }) => {
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
      let savedEngine: TargetEngine | undefined;

      if (existsSync(projectJsonPath)) {
        const parsed = ProjectMetadataSchema.safeParse(
          JSON.parse(readFileSync(projectJsonPath, 'utf-8')),
        );
        if (parsed.success) {
          prompt = parsed.data.prompt;
          savedProfile = parsed.data.profile;
          savedMode = parsed.data.mode;
          savedSeed = parsed.data.seed;
          savedEngine = parsed.data.engine;
        } else {
          console.log(`Warning: project.json exists but failed validation — using defaults (${parsed.error.issues[0]?.message ?? 'unknown error'})`);
        }
      } else {
        console.log('Warning: no project.json found — regenerating with a generic placeholder prompt.');
      }

      const pipeline = new GenerationPipeline();
      let profile: GenerationProfile;
      try {
        profile = parseProfile(opts.profile) ?? savedProfile ?? 'TINY_TEST';
      } catch (err) {
        console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
        return;
      }
      if (opts.fresh) {
        console.log('--fresh: ignoring existing checkpoints — regenerating from zero');
      }
      const visualModeResult = resolveVisualMode(opts.visualMode);
      if ('error' in visualModeResult) {
        console.log(`✗ ${visualModeResult.error}`);
        process.exitCode = 1;
        return;
      }
      if (opts.engine) {
        const engineResult = parseTargetEngine(opts.engine);
        if (typeof engineResult === 'object') {
          console.log(`✗ ${engineResult.error}`);
          process.exitCode = 1;
          return;
        }
        savedEngine = engineResult;
      }
      const result = await pipeline.run({
        prompt,
        profile,
        mode: (opts.mode as GenerationMode) ?? savedMode ?? 'LOCAL_ONLY',
        visualMode: visualModeResult.visualMode,
        externalVisualPack: opts.externalVisualPack as ExternalVisualPackId | undefined,
        seed: opts.seed ? parseInt(opts.seed, 10) : (savedSeed ?? 42),
        slug,
        targetEngine: savedEngine,
        resume: resolveResumeFlag(opts),
        skipRuntimeValidation: opts.skipRuntimeValidation,
        skipExport: opts.skipExport,
        hardwareProfile: resolveHardwareProfile(opts.hardwareProfile),
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
        console.log(`! Generated but did not pass validation: ${result.outputPath} (status: ${result.projectStatus ?? 'validation_failed'})`);
        process.exitCode = 1;
      } else {
        console.log(`✓ Generated: ${result.outputPath}`);
      }
    });
}
