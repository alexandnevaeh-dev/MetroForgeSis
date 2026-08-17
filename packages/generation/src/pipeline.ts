import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import type { GenerationMode, GenerationProfile, GameArchetype } from '@metroforge/shared';
import {
  createLogger,
  generateId,
  loadConfig,
  PRODUCT,
  PROFILE_DEFAULTS,
  resolveGeneratedGamesPath,
  resolveProjectPathSafe,
  slugify,
  type StageStatus,
  isTopDownArchetype,
  inferGameArchetypeFromPrompt,
  isRegisteredAbilityId,
  missingReleaseCandidateAbilities,
  assertMassVisualGenerationAllowed,
  isMassVisualProfile,
  isProductionQualityProfile,
  GenerationCancelledError,
  throwIfCancelled,
} from '@metroforge/shared';
import { remapGameDnaAbilities } from './remap-project-abilities.js';
import { createDatabase, type MetroForgeDatabase } from '@metroforge/database';
import { bootstrapProviders, licenseFieldsForArtifact, OllamaEmbeddingProvider, HardwareProfiler } from '@metroforge/ai';
import { generateGameDNA, type GameDNATextSource } from '@metroforge/ai';
import { GameDNASchema, ProjectMetadataSchema, type GenerationJob } from '@metroforge/schemas';
import {
  generateWorldTopology,
  validateReachability,
  validateWorldConnectivity,
  validateWorldReachability,
  generateGameContent,
  synthesizeAllSfx,
  resolveRoomCount,
  generateDesignBible,
  generateStyleBible,
  generateCharacterVisualDNA,
  generateVisualDNA,
  generateAllBiomeVisualDNA,
  generateEnvironmentKit,
  biomeKitFromEnvironment,
  generateMusicFromAudioBible,
  enhanceMusicWithStableAudio,
  generateTopDownWorld,
  buildProgressionProof,
} from '@metroforge/procedural';
import { AssetPipeline } from '@metroforge/assets';
import { GodotProjectAssembler } from '@metroforge/godot';
import { ToolRegistry, exportProject, resolveGodotExecutableCanonical, readProjectGodotOverride } from '@metroforge/tools';
import { QAValidator, RepairEngineer, deriveValidationLevel, runQualityPass, scoreVisualQuality, fingerprintFile, planVisualRepairs, applyVisualRepairs, VISUAL_REPAIR_BUDGET, type QAReport, type QAGateResult } from '@metroforge/qa';
import { createProjectCheckpoint } from './project-checkpoint.js';
import { assertPhaseArtifacts, phaseCompleteStatus } from './phase-contract.js';
import { withCategory, type GenerationEvent } from './events.js';
import {
  shouldPauseAtMilestone,
  writeReviewState,
  type GenerationControlMode,
  type ReviewMilestone,
  type ReviewPauseContext,
} from './interactive-generation.js';
import { loadProjectContext } from './project-loader.js';
import { buildProjectMemoryIndex } from './project-memory-service.js';
import { synthesizeDialogueVoices } from './dialogue-voice.js';
import { buildAssetCoverageReport } from './asset-coverage.js';
import { writeVisualSliceReviewRequired } from './visual-review.js';
import { writeVisualSliceReports, collectVisualSliceEvidence } from './visual-slice-report.js';
import { writeVgf2VisualSliceReport } from './vgf2-report.js';
import { inheritDerivativeLicense } from './derivative-license.js';

export interface GenerateOptions {
  prompt: string;
  profile: GenerationProfile;
  mode: GenerationMode;
  seed: number;
  slug?: string;
  cwd?: string;
  archetype?: GameArchetype;
  /** Skip the AI/network-dependent Game DNA phase if a checkpoint already exists on disk. */
  resume?: boolean;
  /** Skip Godot import, runtime smoke, and playtest subprocesses. Static validation still runs. */
  skipRuntimeValidation?: boolean;
  /** Skip staging a packaged copy under Exports/<slug>/ after final QA. */
  skipExport?: boolean;
  onPhase?: (phase: string, status: string, message?: string) => void;
  /** Typed live-generation events for studio UI / IPC subscribers. */
  onEvent?: (event: GenerationEvent) => void;
  /** Pause at review milestones for studio approve/continue flow. */
  generationControl?: GenerationControlMode;
  reviewMilestones?: ReviewMilestone[];
  waitForReview?: (ctx: ReviewPauseContext) => Promise<'approve' | 'cancel'>;
  /** When aborted, pipeline stops at the next phase boundary and returns `cancelled: true`. */
  signal?: AbortSignal;
  /** Per-provider Settings toggles (missing ⇒ enabled). */
  providerEnabled?: Record<string, boolean>;
  /** Override NVIDIA_IMAGE_MODEL (Settings prefs / CLI). */
  nvidiaImageModel?: string;
  /** When LOW_RESOURCE, prefer remote image providers over local VRAM runtimes. */
  hardwareProfile?: string;
}

export interface GenerateResult {
  /** True whenever project files were assembled to disk — distinct from `validationPassed`,
   *  which reflects whether QA/Godot runtime validation actually passed. A project can be
   *  `success: true, validationPassed: false` (files exist, but a real gameplay defect was
   *  caught by the runtime smoke test) — check `validationPassed`/`projectStatus`, not just
   *  `success`, before treating a generation run as genuinely done. */
  success: boolean;
  /** True when the run was stopped via `signal` abort (distinct from review-gate cancel). */
  cancelled?: boolean;
  projectSlug: string;
  outputPath: string;
  jobId: string;
  errors: string[];
  warnings: string[];
  phases: { phase: string; status: string; message?: string }[];
  /** Whether every QA gate (static + Godot headless + Godot runtime, when available) passed
   *  after the repair loop completed. */
  validationPassed?: boolean;
  /** Mirrors the Project.status written to the database: 'complete' or 'validation_failed'. */
  projectStatus?: string;
  /** Granular validation outcome — see ValidationLevel in @metroforge/qa. */
  validationLevel?: import('@metroforge/qa').ValidationLevel;
  /** One entry per repair attempt (max 3), recording which gates were failing going in and
   *  whether the project passed after that attempt's deterministic repair + revalidation. */
  repairAttempts?: { attempt: number; failedGates: string[]; actions: string[]; passedAfter: boolean }[];
  /** Staged export folder (or zip) when the export phase ran successfully. */
  exportPath?: string;
}

export class GenerationPipeline {
  private readonly logger = createLogger('generation-pipeline');
  private readonly assembler = new GodotProjectAssembler();
  private readonly qa = new QAValidator();
  private readonly repair = new RepairEngineer();

  async run(options: GenerateOptions): Promise<GenerateResult> {
    const cwd = options.cwd ?? process.cwd();
    const config = loadConfig();
    const phases: GenerateResult['phases'] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    let db: MetroForgeDatabase | null = null;
    let job: GenerationJob | null = null;
    let stageIdByPhase = new Map<string, string>();
    // intake/game_dna/design_bible necessarily report() before db.jobs.create() can run (job
    // creation needs project.id, which needs gameDna.identity.title) — buffer their updates
    // here and flush once stageIdByPhase is populated, rather than silently dropping them and
    // leaving those stage rows permanently PENDING.
    const pendingDbUpdates: { phase: string; status: string; message?: string }[] = [];

    const toDbStatus = (status: string): StageStatus | null =>
      status === 'RUNNING'
        ? 'RUNNING'
        : status === 'PASSED' || status === 'WARN' || status === 'DEGRADED'
          ? 'PASSED'
          : status === 'SKIPPED'
            ? 'SKIPPED'
            : status === 'FAILED'
              ? 'FAILED'
              : status === 'CANCELLED'
                ? 'FAILED'
                : null;

    const writeStageStatus = (phase: string, status: string, message?: string) => {
      const stageId = stageIdByPhase.get(phase);
      if (!db || !stageId) return;
      const dbStatus = toDbStatus(status);
      if (dbStatus) db.jobs.updateStageStatus(stageId, dbStatus, status === 'FAILED' ? (message ?? 'Failed') : null);
    };

    const report = (phase: string, status: string, message?: string) => {
      throwIfCancelled(options.signal);
      phases.push({ phase, status, message });
      options.onPhase?.(phase, status, message);

      if (status === 'RUNNING') {
        emit({ type: 'PhaseStarted', phase, status, message });
      } else if (['PASSED', 'FAILED', 'SKIPPED', 'WARN', 'DEGRADED', 'REPAIRING', 'CANCELLED'].includes(status)) {
        emit({ type: 'PhaseCompleted', phase, status, message });
      } else {
        emit({ type: 'PhaseProgress', phase, status, message });
      }

      if (stageIdByPhase.size === 0) {
        pendingDbUpdates.push({ phase, status, message });
        return;
      }
      writeStageStatus(phase, status, message);
    };

    const slug = options.slug ?? (slugify(options.prompt.slice(0, 60)) || 'untitled-game');
    const outputBase = resolveGeneratedGamesPath(config, cwd);
    // Defense-in-depth on top of the CLI-layer check (apps/cli/src/commands/create.ts) — this
    // is the actual filesystem-writing entry point, and GenerationPipeline.run() is a public
    // API any future caller (a test, a future HTTP endpoint) could invoke directly without
    // going through the CLI's own validation first.
    const outputPath = resolveProjectPathSafe(outputBase, slug);
    mkdirSync(outputPath, { recursive: true });

    let emitJobId: string | undefined;
    const emit = (partial: Record<string, unknown> & { type: GenerationEvent['type'] }) => {
      options.onEvent?.(
        withCategory({
          ...partial,
          timestamp: new Date().toISOString(),
          jobId: emitJobId,
          projectSlug: slug,
          projectPath: outputPath,
        } as GenerationEvent),
      );
    };

    emit({
      type: 'GenerationStarted',
      profile: options.profile,
      mode: options.mode,
      seed: options.seed,
      prompt: options.prompt,
    });

    const maybePause = async (
      milestone: ReviewMilestone,
      phase: string,
      message: string,
    ): Promise<boolean> => {
      throwIfCancelled(options.signal);
      if (!shouldPauseAtMilestone(options.generationControl, options.reviewMilestones, milestone)) {
        return true;
      }
      const ctx: ReviewPauseContext = { milestone, phase, projectPath: outputPath, message };
      writeReviewState(outputPath, {
        status: 'paused',
        milestone,
        phase,
        timestamp: new Date().toISOString(),
        message,
      });
      emit({ type: 'ReviewPauseStarted', milestone, phase, message });
      const decision = options.waitForReview ? await options.waitForReview(ctx) : 'approve';
      if (decision === 'cancel') {
        emit({ type: 'GenerationFailed', reason: `Cancelled at ${milestone} review`, phase });
        return false;
      }
      writeReviewState(outputPath, {
        status: 'approved',
        milestone,
        phase,
        timestamp: new Date().toISOString(),
        message,
      });
      emit({ type: 'ReviewApproved', milestone, phase });
      return true;
    };

    const finalizeCancellation = (message: string): GenerateResult => {
      for (let i = phases.length - 1; i >= 0; i--) {
        const entry = phases[i]!;
        if (entry.status === 'RUNNING') {
          phases[i] = { phase: entry.phase, status: 'CANCELLED', message };
          writeStageStatus(entry.phase, 'CANCELLED', message);
          emit({ type: 'PhaseCompleted', phase: entry.phase, status: 'CANCELLED', message });
          break;
        }
      }
      if (db && job) {
        const proj = db.projects.findBySlug(slug);
        if (proj) db.projects.updateStatus(proj.id, 'cancelled');
        db.jobs.updateJobStatus(job.id, 'cancelled', phases.at(-1)?.phase ?? null);
      }
      db?.close();
      emit({
        type: 'GenerationFailed',
        reason: message,
        phase: phases.at(-1)?.phase ?? 'unknown',
      });
      return {
        success: false,
        cancelled: true,
        projectSlug: slug,
        outputPath,
        jobId: job?.id ?? emitJobId ?? '',
        errors: [message],
        warnings,
        phases,
      };
    };

    try {
    const dataDir = config.dataDir || join(cwd, '.metroforge');
    mkdirSync(dataDir, { recursive: true });
    db = await createDatabase(dataDir);
    const hardwareProfile =
      options.hardwareProfile ?? new HardwareProfiler().profile().profile;

    report('intake', 'PASSED');

    const gameDnaCheckpointPath = join(outputPath, 'game_dna.json');
    let gameDna;
    let dnaSource = 'deterministic';

    if (options.resume && existsSync(gameDnaCheckpointPath)) {
      report('game_dna', 'RUNNING');
      gameDna = GameDNASchema.parse(JSON.parse(readFileSync(gameDnaCheckpointPath, 'utf-8')));
      dnaSource = 'checkpoint';
      report('game_dna', 'SKIPPED', 'Resumed from existing game_dna.json checkpoint');
    } else {
      const { generationRouter } = await bootstrapProviders({
        mode: options.mode,
        ollamaBaseUrl: config.ollamaBaseUrl,
        ollamaDefaultModel: process.env.OLLAMA_DEFAULT_MODEL,
        geminiApiKey: process.env.GEMINI_API_KEY,
        groqApiKey: process.env.GROQ_API_KEY,
        openrouterApiKey: process.env.OPENROUTER_API_KEY,
        huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
        nvidiaApiKey: process.env.NVIDIA_API_KEY,
        nvidiaApiBaseUrl: process.env.NVIDIA_API_BASE_URL,
        providerEnabled: options.providerEnabled,
      });

      // Routes through the canonical GenerationRouter facade (capability in, text out) rather
      // than reaching for a specific provider directly. GenerationRouter's own FallbackManager
      // already retries across up to 3 candidate providers on a transport-level failure —
      // generateGameDNA separately catches any final failure (including malformed/unparseable
      // JSON, which surfaces after this adapter already returned successfully) and falls back
      // to createDeterministicGameDNA(), the same safety net verified live all session.
      const textSource: GameDNATextSource = {
        health: 'healthy',
        async generateText(req) {
          const result = await generationRouter.generate({
            capability: 'JSON_GENERATION',
            task: 'game_dna',
            prompt: req.prompt,
            systemPrompt: req.systemPrompt,
            jsonMode: req.jsonMode,
            mode: options.mode,
          });
          return { text: result.result };
        },
      };

      report('game_dna', 'RUNNING');
      const result = await generateGameDNA(
        {
          prompt: options.prompt,
          profile: options.profile,
          seed: options.seed,
          archetype: options.archetype ?? inferGameArchetypeFromPrompt(options.prompt),
        },
        textSource,
      );
      gameDna = result.dna;
      dnaSource = result.source;
      report('game_dna', 'PASSED', `Source: ${dnaSource}`);
      writeFileSync(gameDnaCheckpointPath, JSON.stringify(gameDna, null, 2));
    }

    // Normalize LLM/deterministic ability ids onto registered runtime implementations.
    // No-op for TOP_DOWN_ACTION_ADVENTURE — see remapGameDnaAbilities's own doc comment
    // (packages/generation/src/remap-project-abilities.ts) for why.
    const abilityRemap = remapGameDnaAbilities(gameDna);
    gameDna = abilityRemap.dna;
    if (options.profile === 'VISUAL_VERTICAL_SLICE') {
      gameDna.technical.tileSize = 32;
      writeFileSync(gameDnaCheckpointPath, JSON.stringify(gameDna, null, 2));
    }
    if (abilityRemap.changed) {
      writeFileSync(gameDnaCheckpointPath, JSON.stringify(gameDna, null, 2));
      for (const pair of abilityRemap.remapped) {
        warnings.push(`Remapped ability "${pair.from}" → "${pair.to}"`);
      }
      for (const id of abilityRemap.removed) {
        warnings.push(`Removed unknown ability "${id}" (no registered runtime implementation)`);
      }
      for (const w of abilityRemap.warnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    }

    const enabledAbilityIds = gameDna.abilities.filter((a) => a.enabled !== false).map((a) => a.id);
    if (!isTopDownArchetype(gameDna.archetype)) {
      const unknownRequired = enabledAbilityIds.filter((id) => !isRegisteredAbilityId(id));
      if (unknownRequired.length > 0) {
        errors.push(
          `Unknown required abilities remain after remap (no runtime implementation): ${unknownRequired.join(', ')}`,
        );
      }
      if (options.profile === 'RELEASE_CANDIDATE') {
        const missingRc = missingReleaseCandidateAbilities(enabledAbilityIds);
        if (missingRc.length > 0) {
          errors.push(
            `RELEASE_CANDIDATE DNA missing required registered abilities: ${missingRc.join(', ')}`,
          );
        }
      }
    }

    report('design_bible', 'RUNNING');
    const designBible = generateDesignBible(gameDna, options.profile, options.seed);
    writeFileSync(
      join(outputPath, 'design_bible.json'),
      JSON.stringify(designBible, null, 2),
    );
    const styleBible = generateStyleBible(gameDna, designBible.art);
    writeFileSync(join(outputPath, 'style_bible.json'), JSON.stringify(styleBible, null, 2));
    writeFileSync(
      join(outputPath, 'style_contract.json'),
      JSON.stringify(
        {
          artStyle: styleBible.artStyle ?? styleBible.renderingStyle,
          palette: styleBible.palette.map((p) => p.hex),
          outlineRules: styleBible.outlineRules,
          lightingDirection: styleBible.lightingDirection,
          saturation: styleBible.saturation,
          characterScale: styleBible.characterScale,
          foregroundBackgroundSeparation: styleBible.backgroundDepthRules ?? styleBible.parallaxRules,
        },
        null,
        2,
      ),
    );
    const characterVisualDna = generateCharacterVisualDNA(gameDna, designBible.art);
    writeFileSync(
      join(outputPath, 'character_visual_dna.json'),
      JSON.stringify(characterVisualDna, null, 2),
    );
    const visualDNA = generateVisualDNA({ gameDna, artBible: designBible.art, styleBible });
    const visualDir = join(outputPath, 'data', 'visual');
    mkdirSync(visualDir, { recursive: true });
    writeFileSync(join(visualDir, 'visual_dna.json'), JSON.stringify(visualDNA, null, 2));
    writeFileSync(join(outputPath, 'visual_dna.json'), JSON.stringify(visualDNA, null, 2));
    const biomeVisualDNAs = generateAllBiomeVisualDNA({ visualDNA, gameDna });
    writeFileSync(join(visualDir, 'biomes.json'), JSON.stringify(biomeVisualDNAs, null, 2));
    const environmentKits = biomeVisualDNAs.map((biome) =>
      generateEnvironmentKit({ visualDNA, biome, profile: options.profile, seed: options.seed }),
    );
    writeFileSync(join(visualDir, 'environment_kits.json'), JSON.stringify(environmentKits, null, 2));
    writeFileSync(
      join(visualDir, 'biome_kits.json'),
      JSON.stringify(
        environmentKits.map((kit) => biomeKitFromEnvironment(kit, visualDNA.palette.global ?? [])),
        null,
        2,
      ),
    );
    writeFileSync(
      join(visualDir, 'lighting.json'),
      JSON.stringify(
        {
          energy: 1,
          biomes: biomeVisualDNAs.map((biome) => ({
            biomeId: biome.biomeId,
            lighting: biome.lighting,
            ambientVfx: biome.ambientVfx,
            fog: biome.fog,
          })),
        },
        null,
        2,
      ),
    );
    const bibleArtifacts = assertPhaseArtifacts(outputPath, [
      'game_dna.json',
      'design_bible.json',
      'style_bible.json',
      'style_contract.json',
      'character_visual_dna.json',
      'data/visual/visual_dna.json',
    ]);
    report(
      'design_bible',
      phaseCompleteStatus(bibleArtifacts, errors.length === 0 || options.profile !== 'RELEASE_CANDIDATE'),
      bibleArtifacts.ok
        ? `${designBible.art.palette.length} palette colors, ${designBible.audio.biomeThemes.length} biome themes`
        : `missing artifacts: ${bibleArtifacts.missing.join(', ')}`,
    );
    createProjectCheckpoint(outputPath, 'after_design_bible');
    if (!(await maybePause('game_dna', 'design_bible', 'Review Game DNA and design bible'))) {
      db?.close();
      return { success: false, projectSlug: slug, outputPath, jobId: emitJobId ?? '', errors: ['Cancelled at review gate'], warnings, phases };
    }

    let project = db.projects.findBySlug(slug);
    if (project) {
      db.projects.updateStatus(project.id, 'generating');
    } else {
      const now = new Date().toISOString();
      project = db.projects.create({
        id: generateId('proj'),
        slug,
        title: gameDna.identity.title,
        description: options.prompt,
        profile: options.profile,
        mode: options.mode,
        seed: options.seed,
        outputPath: outputPath.replace(/\\/g, '/'),
        createdAt: now,
        updatedAt: now,
        status: 'generating',
      });
    }

    // project.json — a portable record inside the generated project directory itself,
    // distinct from the SQLite `projects` table (which lives in .metroforge/metroforge.db
    // and may not travel with the project, e.g. after a fresh clone of GeneratedGames/).
    // This is what lets `metroforge generate <slug>` reliably recover the original prompt.
    // Preserve the original createdAt across regenerations rather than resetting it.
    const projectJsonPath = join(outputPath, 'project.json');
    let projectCreatedAt = new Date().toISOString();
    if (existsSync(projectJsonPath)) {
      try {
        projectCreatedAt = ProjectMetadataSchema.parse(
          JSON.parse(readFileSync(projectJsonPath, 'utf-8')),
        ).createdAt;
      } catch {
        // corrupt or pre-existing-without-this-file project — treat as freshly created
      }
    }
    writeFileSync(
      projectJsonPath,
      JSON.stringify(
        ProjectMetadataSchema.parse({
          projectId: project.id,
          slug,
          prompt: options.prompt,
          profile: options.profile,
          mode: options.mode,
          seed: options.seed,
          createdAt: projectCreatedAt,
          lastGeneratedAt: new Date().toISOString(),
          gameDnaVersion: gameDna.version,
          generatorVersion: PRODUCT.generatorVersion,
          archetype: gameDna.archetype,
        }),
        null,
        2,
      ),
    );

    job = db.jobs.create(project.id, options.profile, options.mode, options.seed);
    emitJobId = job.id;
    stageIdByPhase = new Map(job.stages.map((s) => [s.phase, s.id]));
    for (const update of pendingDbUpdates) {
      writeStageStatus(update.phase, update.status, update.message);
    }
    pendingDbUpdates.length = 0;

    report('world_topology', 'RUNNING');
    const defaults = PROFILE_DEFAULTS[options.profile];
    const abilityIds = gameDna.abilities.filter((a) => a.enabled).map((a) => a.id);
    const topDownWorld = isTopDownArchetype(gameDna.archetype)
      ? generateTopDownWorld({
          seed: options.seed,
          profile: options.profile,
          tileSize: gameDna.technical.tileSize,
        })
      : null;
    const roomCount = topDownWorld ? topDownWorld.roomIds.length : resolveRoomCount(options.profile, options.seed);
    const { worldGraph, progressionGraph, roomIds } = topDownWorld
      ? topDownWorld
      : generateWorldTopology({
          seed: options.seed,
          roomCount,
          biomeCount: defaults.biomes,
          abilities: abilityIds,
          bossCount: defaults.bosses,
          profile: options.profile,
        });
    writeFileSync(join(outputPath, 'world_graph.json'), JSON.stringify(worldGraph, null, 2));
    writeFileSync(join(outputPath, 'progression_graph.json'), JSON.stringify(progressionGraph, null, 2));
    emit({
      type: 'WorldGraphUpdated',
      roomCount: worldGraph.nodes.filter((n) => n.type === 'room').length,
      edgeCount: worldGraph.edges.length,
      biomeCount: defaults.biomes,
    });
    const { connected, unreachableRoomIds } = validateWorldConnectivity(worldGraph);
    if (!connected) {
      warnings.push(`Disconnected rooms in generated world: ${unreachableRoomIds.join(', ')}`);
    }
    const worldArtifacts = assertPhaseArtifacts(outputPath, ['world_graph.json', 'progression_graph.json']);
    report(
      'world_topology',
      phaseCompleteStatus(worldArtifacts, connected),
      !worldArtifacts.ok
        ? `missing artifacts: ${worldArtifacts.missing.join(', ')}`
        : connected
          ? `${roomIds.length} rooms, ${defaults.biomes} biomes`
          : `${unreachableRoomIds.length} room(s) disconnected from start`,
    );

    report('progression_graph', 'RUNNING');
    // Start with zero abilities unlocked so this actually simulates a player progressing
    // through the critical path — abilities get added as their ability-node is reached
    // (see validateReachability), proving the gates are satisfiable in sequence rather than
    // just assuming everything is already unlocked.
    const { reachable, unreachableNodes } = validateReachability(progressionGraph, new Set());
    if (!reachable) {
      warnings.push(`Unreachable nodes without abilities pre-granted: ${unreachableNodes.join(', ')}`);
    }
    // Also prove the *real* room graph realizes that abstract chain correctly — the abstract
    // check above only proves the ability order is sound in principle; this proves the actual
    // generated rooms/edges deliver on it (every room reachable via progressive ability pickup).
    const { reachable: worldReachable, unreachableRoomIds: worldUnreachableRoomIds } =
      validateWorldReachability(worldGraph, new Set());
    if (!worldReachable) {
      warnings.push(
        `Rooms unreachable via progressive ability pickup: ${worldUnreachableRoomIds.join(', ')}`,
      );
    }
    const progressionProof = buildProgressionProof(worldGraph, progressionGraph);
    writeFileSync(join(outputPath, 'progression_proof.json'), JSON.stringify(progressionProof, null, 2));
    if (!progressionProof.passed) {
      warnings.push(
        `Progression proof failed: start=${progressionProof.startReachable} boss=${progressionProof.bossReachable} selfLocks=${progressionProof.selfLocks.length} unknown=${progressionProof.unknownAbilities.join(',') || 'none'}`,
      );
    }
    if (errors.some((e) => e.includes('Unknown required abilities') || e.includes('missing required registered'))) {
      report('progression_graph', 'FAILED', errors[errors.length - 1]);
    } else {
      const proofArtifacts = assertPhaseArtifacts(outputPath, ['progression_proof.json']);
      const progressionOk = reachable && worldReachable && progressionProof.passed && proofArtifacts.ok;
      report(
        'progression_graph',
        progressionOk ? 'PASSED' : 'FAILED',
        progressionOk
          ? `${progressionProof.trace.length} proof steps, boss ${progressionProof.bossRoomId}`
          : !reachable
            ? 'Abstract ability chain unsolvable'
            : !worldReachable
              ? `${worldUnreachableRoomIds.length} room(s) unreachable via ability pickup`
              : !proofArtifacts.ok
                ? `missing artifacts: ${proofArtifacts.missing.join(', ')}`
                : 'Progression proof failed',
      );
    }
    createProjectCheckpoint(outputPath, 'after_world_progression');
    if (!(await maybePause('world_layout', 'progression_graph', 'Review world layout and progression'))) {
      db.projects.updateStatus(project.id, 'cancelled');
      db.jobs.updateJobStatus(job.id, 'cancelled', 'progression_graph');
      db.close();
      return { success: false, projectSlug: slug, outputPath, jobId: job.id, errors: ['Cancelled at review gate'], warnings, phases };
    }

    report('enemy_families', 'RUNNING');
    const bossRoomId = roomIds[roomIds.length - 1]!;
    const gameContent = generateGameContent(gameDna, options.profile, options.seed, bossRoomId, roomIds);
    report('enemy_families', 'PASSED', `${gameContent.enemies.length} enemies`);
    report('bosses', 'PASSED', `${gameContent.bosses.length} bosses`);
    if (!(await maybePause('bosses', 'bosses', 'Review boss encounters before asset generation'))) {
      db.projects.updateStatus(project.id, 'cancelled');
      db.jobs.updateJobStatus(job.id, 'cancelled', 'bosses');
      db.close();
      return { success: false, projectSlug: slug, outputPath, jobId: job.id, errors: ['Cancelled at review gate'], warnings, phases };
    }
    report('quests', 'PASSED', `${gameContent.quests.length} quests`);
    report('npcs', 'PASSED', `${gameContent.npcs.length} NPCs`);

    report('audio', 'RUNNING');
    const audioFiles = synthesizeAllSfx();
    const musicResult = generateMusicFromAudioBible(designBible.audio, options.seed);
    warnings.push(...(await enhanceMusicWithStableAudio(musicResult, designBible.audio, options.seed)));
    for (const [id, buffer] of musicResult.audio) {
      audioFiles.set(id, buffer);
    }
    const musicDir = join(outputPath, 'music');
    mkdirSync(musicDir, { recursive: true });
    writeFileSync(
      join(musicDir, 'tracker_patterns.json'),
      JSON.stringify(Object.fromEntries(musicResult.patterns), null, 2),
    );
    for (const [biomeId, mod] of musicResult.trackerInterchange) {
      writeFileSync(join(musicDir, `${biomeId}.tracker-interchange.json`), JSON.stringify(mod, null, 2));
    }
    mkdirSync(join(outputPath, 'audio', 'midi'), { recursive: true });
    for (const [biomeId, mid] of musicResult.midi) {
      writeFileSync(join(outputPath, 'audio', 'midi', `${biomeId}.mid`), mid);
    }

    const voiceResult = await synthesizeDialogueVoices(gameContent, options.profile);
    for (const [id, buffer] of voiceResult.voiceFiles) {
      audioFiles.set(id, buffer);
    }
    if (voiceResult.warnings.length > 0) {
      warnings.push(...voiceResult.warnings);
    }

    report(
      'audio',
      'PASSED',
      `${audioFiles.size} audio files (${musicResult.midi.size} MIDI, ${musicResult.trackerInterchange.size} tracker-interchange JSON${
        voiceResult.synthesizedCount > 0 ? `, ${voiceResult.synthesizedCount} dialogue voice lines` : ''
      })`,
    );

    report('environment_assets', 'RUNNING');
    if (isMassVisualProfile(options.profile)) {
      try {
        assertMassVisualGenerationAllowed(options.profile);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        report('environment_assets', 'FAILED', msg);
        db.projects.updateStatus(project.id, 'validation_failed');
        db.jobs.updateJobStatus(job.id, 'validation_failed', 'environment_assets');
        db.close();
        return {
          success: false,
          projectSlug: slug,
          outputPath,
          jobId: job.id,
          errors,
          warnings,
          phases,
          projectStatus: 'validation_failed',
        };
      }
    }
    const assetPipeline = new AssetPipeline();
    const assetResult = await assetPipeline.generate({
      gameDna,
      profile: options.profile,
      seed: options.seed,
      outputDir: outputPath,
      bosses: gameContent.bosses.map((b) => ({
        id: b.id,
        name: b.name,
        lore: b.lore,
        visualPrompt: b.visualPrompt,
        isFinal: b.id === 'boss_final',
        attacks: b.phases[0]?.attacks ?? [],
      })),
      npcs: gameContent.npcs.map((n) => ({
        id: n.id,
        name: n.name,
        role: n.role,
      })),
      artBible: designBible.art,
      styleBible,
      characterVisualDna,
      visualDNA,
      biomeVisualDNAs,
      environmentKits,
      comfyuiUrl: process.env.COMFYUI_BASE_URL,
      diffusersPython: process.env.DIFFUSERS_PYTHON,
      diffusersModelId: process.env.DIFFUSERS_MODEL_ID,
      nvidiaApiKey: process.env.NVIDIA_API_KEY,
      nvidiaApiBaseUrl: process.env.NVIDIA_API_BASE_URL,
      nvidiaImageModel: options.nvidiaImageModel ?? process.env.NVIDIA_IMAGE_MODEL,
      nvidiaVisionModel: process.env.NVIDIA_VISION_MODEL,
      huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN,
      huggingfaceImageModel: process.env.HF_IMAGE_MODEL,
      automatic1111Url: process.env.AUTOMATIC1111_BASE_URL,
      stabilityApiKey: process.env.STABILITY_API_KEY,
      deepaiApiKey: process.env.DEEPAI_API_KEY,
      replicateApiToken: process.env.REPLICATE_API_TOKEN,
      ollamaBaseUrl: config.ollamaBaseUrl,
      resume: options.resume,
      mode: options.mode,
      hardwareProfile,
      signal: options.signal,
      providerEnabled: options.providerEnabled,
      onTaskStarted: (task, message) => {
        emit({ type: 'TaskStarted', phase: 'environment_assets', task, message });
      },
      onTaskProgress: (task, current, total, message) => {
        emit({ type: 'TaskProgress', phase: 'environment_assets', task, current, total, message });
      },
      onArtifact: (asset, assetType) => {
        emit({
          type: 'ArtifactGenerated',
          artifactId: asset.id,
          path: asset.path,
          assetType,
          provider: asset.provider,
          modelId: asset.modelId,
          fallbackGenerated: asset.fallbackGenerated,
          critiquePassed: asset.critiquePassed,
          critiqueScore: asset.critiqueScore,
        });
        if (asset.critiquePassed) {
          emit({
            type: 'ArtifactValidated',
            artifactId: asset.id,
            path: asset.path,
            passed: true,
            score: asset.critiqueScore,
          });
        } else {
          emit({
            type: 'ArtifactRejected',
            artifactId: asset.id,
            path: asset.path,
            reason: 'Asset critique failed',
          });
        }
        if (db && job) {
          db.artifacts.create({
            jobId: job.id,
            type: assetType,
            path: asset.path,
            provider: asset.provider,
            model: asset.modelId,
            promptHash: asset.promptHash,
            seed: options.seed,
            validationState: asset.critiquePassed ? 'passed' : 'failed',
            fallbackGenerated: asset.fallbackGenerated,
            metadata: {
              id: asset.id,
              critiqueScore: asset.critiqueScore,
              maturity: asset.maturity,
              productionReady: asset.productionReady,
              sourceType: asset.sourceType,
              fallbackDepth: asset.fallbackDepth,
              fallbackReason: asset.fallbackReason,
              selectedProvider: asset.selectedProvider,
              selectedModel: asset.selectedModel,
              requestedCapability: asset.requestedCapability,
              productionAllowed: asset.productionAllowed,
              parentArtifactIds: asset.parentArtifactIds,
              compiler: asset.compiler,
              godotResourcePath: asset.godotResourcePath ?? `res://${asset.path.replace(/\\/g, '/')}`,
              repairCount: asset.repairCount ?? 0,
              transformation: asset.transformation,
            },
          });
        }
      },
    });
    warnings.push(...assetResult.warnings);
    if (assetResult.fakeAnimationDetected) {
      warnings.push(
        'ANIMATION GENERATION did not produce production-ready posed frames. Derived bob/slide sheets must not be treated as ready.',
      );
    }
    const textureFiles = new Map(assetResult.assets.map((a) => [a.path, a.buffer]));
    const assetMetadata = assetResult.assets.map((a) => ({
      id: a.id,
      path: a.path,
      type: 'texture' as const,
      provider: a.provider,
      modelId: a.modelId,
      fallbackGenerated: a.fallbackGenerated,
      critiquePassed: a.critiquePassed,
      critiqueScore: a.critiqueScore,
      maturity: a.maturity,
      productionReady: a.productionReady,
      sourceType: a.sourceType,
      fallbackDepth: a.fallbackDepth,
      fallbackReason: a.fallbackReason,
      selectedProvider: a.selectedProvider ?? a.provider,
      selectedModel: a.selectedModel,
      requestedCapability: a.requestedCapability ?? 'IMAGE_GENERATION',
      productionAllowed: a.productionAllowed,
      sourcePath: a.sourcePath,
      promptHash: a.promptHash,
      parentArtifactIds: a.parentArtifactIds,
      compiler: a.compiler,
      godotResourcePath: a.godotResourcePath ?? `res://${a.path.replace(/\\/g, '/')}`,
      repairCount: a.repairCount ?? 0,
      transformation: a.transformation,
      sourceLicense: a.sourceLicense,
      derivedLicense: a.derivedLicense,
      commercialUse: undefined as 'allowed' | 'restricted' | 'unknown' | undefined,
    }));
    for (const meta of assetMetadata) {
      Object.assign(meta, licenseFieldsForArtifact(meta, assetMetadata));
      const parentId = meta.parentArtifactIds?.[0];
      if (!parentId) continue;
      const parent = assetMetadata.find((candidate) => candidate.id === parentId);
      if (!parent) continue;
      const inherited = inheritDerivativeLicense({
        parent,
        child: meta,
        transformation: String(meta.transformation ?? meta.compiler ?? 'derived'),
        siblings: assetMetadata,
      });
      meta.sourceLicense = inherited.sourceLicense;
      meta.derivedLicense = inherited.derivedLicense;
      meta.commercialUse = inherited.commercialUse;
      meta.transformation = inherited.transformation;
    }
    const assetPassCount = assetResult.assets.filter((a) => a.critiquePassed).length;
    const placeholderCount = assetResult.assets.filter(
      (a) => a.fallbackGenerated || a.maturity === 'PLACEHOLDER' || a.maturity === 'BLOCKOUT',
    ).length;
    const assetsDegraded = assetResult.degraded || placeholderCount > 0;
    if (assetsDegraded) {
      warnings.push(
        `environment_assets DEGRADED: ${placeholderCount}/${assetResult.assets.length} assets are procedural placeholders` +
          (assetResult.fallbackReason ? ` (${assetResult.fallbackReason})` : ''),
      );
    }
    report(
      'environment_assets',
      assetsDegraded ? 'DEGRADED' : 'PASSED',
      assetsDegraded
        ? `DEGRADED — ${assetResult.assets.length} assets (${assetPassCount} critique pass, ${placeholderCount} placeholder/blockout; not production-ready)`
        : `${assetResult.assets.length} assets (${assetPassCount} passed critique)`,
    );
    if (!(await maybePause('biome_art', 'environment_assets', 'Review biome art and player concept'))) {
      db.projects.updateStatus(project.id, 'cancelled');
      db.jobs.updateJobStatus(job.id, 'cancelled', 'environment_assets');
      db.close();
      return { success: false, projectSlug: slug, outputPath, jobId: job.id, errors: ['Cancelled at review gate'], warnings, phases };
    }

    report('project_assembly', 'RUNNING');
    createProjectCheckpoint(outputPath, 'before_assembly');
    const assemblyResult = this.assembler.assemble({
      outputDir: outputPath,
      gameDna,
      worldGraph,
      progressionGraph,
      roomIds,
      gameContent,
      audioFiles,
      textureFiles,
      assetMetadata,
      overworld: topDownWorld?.overworld,
      styleBible,
    });

    if (!assemblyResult.success) {
      errors.push(...assemblyResult.errors);
      report('project_assembly', 'FAILED');
      emit({ type: 'GenerationFailed', reason: assemblyResult.errors.join('; '), phase: 'project_assembly' });
      db.projects.updateStatus(project.id, 'failed');
      db.close();
      return { success: false, projectSlug: slug, outputPath, jobId: job.id, errors, warnings, phases };
    }
    report('project_assembly', 'PASSED');
    for (const roomId of roomIds) {
      emit({ type: 'RoomGenerated', roomId });
    }

    try {
      const coverage = buildAssetCoverageReport(loadProjectContext(outputPath));
      writeFileSync(join(outputPath, 'asset_coverage.json'), JSON.stringify(coverage, null, 2));
    } catch {
      warnings.push('asset_coverage.json could not be written');
    }

    try {
      const embedder = new OllamaEmbeddingProvider({
        baseUrl: config.ollamaBaseUrl ?? 'http://127.0.0.1:11434',
      });
      if (await embedder.checkHealth()) {
        await buildProjectMemoryIndex(outputPath, embedder, embedder.model);
      }
    } catch {
      warnings.push('project_memory.json could not be built (Ollama embeddings unavailable)');
    }

    if (!(await maybePause('final_qa', 'project_assembly', 'Review assembled project before final QA'))) {
      db.projects.updateStatus(project.id, 'cancelled');
      db.jobs.updateJobStatus(job.id, 'cancelled', 'project_assembly');
      db.close();
      return { success: false, projectSlug: slug, outputPath, jobId: job.id, errors: ['Cancelled at review gate'], warnings, phases };
    }

    report('static_validation', 'RUNNING');
    emit({ type: 'QAStarted', gate: 'static_validation' });
    const toolRegistry = new ToolRegistry();
    const tools = await toolRegistry.detectAll({
      godotPath: config.godotExecutable,
      ollamaUrl: config.ollamaBaseUrl,
    });
    const resolvedGodot = resolveGodotExecutableCanonical({
      preference: config.godotExecutable,
      projectOverride: readProjectGodotOverride(outputPath),
      envPath: process.env.GODOT_EXECUTABLE,
    });
    const detectedGodot = tools.find((t) => t.id === 'godot')?.path ?? null;
    const godotCandidate = resolvedGodot.path ?? detectedGodot;
    const godotPath =
      godotCandidate && existsSync(godotCandidate) ? godotCandidate : null;

    const pushGate = (target: QAReport, gate: QAGateResult) => {
      target.results.push(gate);
      const entry = {
        id: generateId('val'),
        projectId: project!.id,
        gate: gate.gate,
        passed: gate.passed,
        message: gate.message,
        details: gate.details,
        timestamp: new Date().toISOString(),
      };
      target.validationResults.push(entry);
      db!.validationResults.create({
        projectId: project!.id,
        gate: gate.gate,
        passed: gate.passed,
        message: gate.message,
        details: gate.details,
      });
    };

    db.validationResults.deleteByProject(project.id);

    // Runtime validation (§42 of the audit) is now a mandatory part of normal generation
    // whenever Godot is available — previously it only ran via a separate, easy-to-forget
    // `metroforge validate --runtime` invocation, so every automatic `create`/`generate` run
    // was only ever proven to *parse*, never to actually *play*. When Godot genuinely isn't
    // installed, generation still proceeds (it always could, for local-only text generation),
    // but the skip is recorded as an explicit SKIPPED gate with reason GODOT_NOT_AVAILABLE
    // rather than silently treating the project as fully validated.
    const runGodotGates = (target: QAReport): void => {
      if (options.skipRuntimeValidation) {
        pushGate(target, {
          gate: 'godot_imports',
          passed: true,
          state: 'SKIPPED',
          message: 'IMPORT_VALIDATION_SKIPPED: --skip-runtime-validation',
        });
        pushGate(target, {
          gate: 'godot_runtime',
          passed: true,
          state: 'SKIPPED',
          message: 'RUNTIME_VALIDATION_SKIPPED: --skip-runtime-validation',
        });
        pushGate(target, {
          gate: 'godot_playtest',
          passed: true,
          state: 'SKIPPED',
          message: 'PLAYTEST_SKIPPED: --skip-runtime-validation',
        });
        pushGate(target, {
          gate: 'gameplay_screenshot_qa',
          passed: true,
          state: 'SKIPPED',
          message: 'SCREENSHOT_QA_SKIPPED: --skip-runtime-validation',
        });
        return;
      }

      if (!godotPath) {
        pushGate(target, {
          gate: 'godot_imports',
          passed: true,
          state: 'SKIPPED',
          message: 'NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE',
        });
        pushGate(target, {
          gate: 'godot_runtime',
          passed: true,
          state: 'SKIPPED',
          message: 'NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE',
        });
        pushGate(target, {
          gate: 'godot_playtest',
          passed: true,
          state: 'SKIPPED',
          message: 'NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE',
        });
        pushGate(target, {
          gate: 'gameplay_screenshot_qa',
          passed: options.profile !== 'RELEASE_CANDIDATE',
          state: options.profile === 'RELEASE_CANDIDATE' ? 'FAIL' : 'SKIPPED',
          message:
            options.profile === 'RELEASE_CANDIDATE'
              ? 'RELEASE_CANDIDATE requires gameplay screenshot evidence — Godot not available'
              : 'NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE',
        });
        return;
      }

      const headlessGate = this.qa.validateGodotHeadless(godotPath, outputPath);
      pushGate(target, headlessGate);

      if (!headlessGate.passed) {
        pushGate(target, {
          gate: 'godot_runtime',
          passed: true,
          state: 'SKIPPED',
          message: 'RUNTIME_VALIDATION_SKIPPED: godot_imports failed, runtime smoke test not attempted',
        });
        pushGate(target, {
          gate: 'godot_playtest',
          passed: true,
          state: 'SKIPPED',
          message: 'PLAYTEST_SKIPPED: godot_imports failed',
        });
        pushGate(target, {
          gate: 'gameplay_screenshot_qa',
          passed: options.profile !== 'RELEASE_CANDIDATE',
          state: options.profile === 'RELEASE_CANDIDATE' ? 'FAIL' : 'SKIPPED',
          message:
            options.profile === 'RELEASE_CANDIDATE'
              ? 'RELEASE_CANDIDATE requires gameplay screenshot evidence — godot_imports failed'
              : 'SCREENSHOT_QA_SKIPPED: godot_imports failed',
        });
        return;
      }

      emit({ type: 'RuntimeValidationStarted' });
      const runtimeGate = this.qa.validateGodotRuntime(godotPath, outputPath);
      pushGate(target, runtimeGate);
      emit({
        type: 'RuntimeValidationCompleted',
        passed: runtimeGate.passed,
        message: runtimeGate.message,
      });
      pushGate(target, this.qa.validateGameplayScreenshot(outputPath, {
        required: options.profile === 'RELEASE_CANDIDATE',
        godotPath,
        headlessOutput: String(runtimeGate.details?.output ?? ''),
      }));

      if (runtimeGate.passed) {
        const playtestGate = this.qa.validateGodotPlaytest(godotPath, outputPath);
        pushGate(target, playtestGate);
      } else {
        pushGate(target, {
          gate: 'godot_playtest',
          passed: true,
          state: 'SKIPPED',
          message: 'PLAYTEST_SKIPPED: runtime smoke test failed',
        });
      }
    };

    let qaReport = this.qa.validateProject(outputPath, project.id);
    runGodotGates(qaReport);
    qaReport.passed = qaReport.results.every((r) => r.passed);

    // Bounded repair loop (max 3 attempts) — each attempt re-runs the *full* gate set
    // (static + Godot) so a fix for one gate is verified against everything, not just
    // re-checked in isolation. Stops early if a deterministic-repair pass makes no changes,
    // since retrying an unchanged project would just reproduce the same failure forever.
    const MAX_REPAIR_ATTEMPTS = 3;
    const repairAttempts: {
      attempt: number;
      failedGates: string[];
      actions: string[];
      passedAfter: boolean;
    }[] = [];

    if (!qaReport.passed) {
      report('automated_repair', 'RUNNING');
      createProjectCheckpoint(outputPath, 'before_repair');
      let attempt = 0;
      while (!qaReport.passed && attempt < MAX_REPAIR_ATTEMPTS) {
        attempt++;
        const failedGates = qaReport.results.filter((r) => !r.passed).map((r) => r.gate);
        emit({ type: 'RepairStarted', attempt, failedGates });
        const repairResult = this.repair.repair(outputPath, qaReport);
        if (repairResult.repaired) warnings.push(...repairResult.actions);

        qaReport = this.qa.validateProject(outputPath, project.id);
        runGodotGates(qaReport);
        qaReport.passed = qaReport.results.every((r) => r.passed);

        repairAttempts.push({
          attempt,
          failedGates,
          actions: repairResult.actions,
          passedAfter: qaReport.passed,
        });

        emit({
          type: 'RepairCompleted',
          attempt,
          passed: qaReport.passed,
          actions: repairResult.actions,
        });

        if (!repairResult.repaired) break;
      }
      report(
        'automated_repair',
        qaReport.passed ? 'PASSED' : 'FAILED',
        repairAttempts
          .map((a) => `#${a.attempt} [${a.failedGates.join(',')}] -> ${a.passedAfter ? 'passed' : 'still failing'}`)
          .join('; '),
      );
    } else {
      // Completed jobs must not leave this stage unexplained-PENDING — SKIPPED with a reason
      // is meaningfully different from "never ran," and a clean job never invokes repair at all.
      report('automated_repair', 'SKIPPED', 'No repair needed — all QA gates passed on first validation');
    }

    const staticGateResults = qaReport.results.filter(
      (r) =>
        r.gate !== 'godot_imports' &&
        r.gate !== 'godot_runtime' &&
        r.gate !== 'godot_playtest' &&
        r.gate !== 'gameplay_screenshot_qa',
    );
    const staticPassed = staticGateResults.every((r) => r.passed);
    const importGate = qaReport.results.find((r) => r.gate === 'godot_imports');
    const runtimeGateResult = qaReport.results.find((r) => r.gate === 'godot_runtime');
    const validationLevel = deriveValidationLevel({
      staticPassed,
      importGate,
      runtimeGate: runtimeGateResult,
      godotAvailable: Boolean(godotPath),
      skipRuntimeValidation: options.skipRuntimeValidation,
    });

    writeFileSync(
      join(outputPath, 'validation_report.json'),
      JSON.stringify(
        {
          passed: qaReport.passed,
          validationLevel,
          results: qaReport.results,
          repairAttempts,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    // `qaReport.passed` treats SKIPPED Godot gates as non-blocking; `validationLevel` is the
    // authoritative product outcome — do not claim RUNTIME_VALIDATED / complete when Godot was
    // never available or runtime hard-failed.
    const validationPassed =
      validationLevel === 'RUNTIME_VALIDATED' ||
      (validationLevel === 'IMPORT_VALIDATED' && Boolean(options.skipRuntimeValidation));

    if (isProductionQualityProfile(gameDna.profile) && godotPath && validationPassed) {
      try {
        const qualityReport = runQualityPass({
          projectPath: outputPath,
          godotPath,
          apply: true,
          recapture: !options.skipRuntimeValidation,
          playtest: false,
        });
        writeFileSync(
          join(outputPath, 'data', 'quality', 'quality_report.json'),
          JSON.stringify(qualityReport, null, 2),
        );
        if (qualityReport.rolledBack) {
          warnings.push(`QualityDirector rolled back: ${qualityReport.rollbackReason ?? 'score regression'}`);
        }
      } catch (err) {
        warnings.push(`QualityDirector skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    report(
      'final_qa',
      validationPassed ? 'PASSED' : validationLevel === 'NEEDS_RUNTIME_VALIDATION' ? 'SKIPPED' : 'WARN',
      `${validationLevel}: ${qaReport.results.filter((r) => r.passed).length}/${qaReport.results.length} gates passed`,
    );

    if (!godotPath) {
      report('static_validation', 'SKIPPED', 'NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE');
      warnings.push('NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE — Godot binary not detected, static validation only');
    } else if (options.skipRuntimeValidation) {
      report('static_validation', importGate?.passed ? 'PASSED' : 'WARN');
      warnings.push('RUNTIME_VALIDATION_SKIPPED: --skip-runtime-validation');
    } else {
      report('static_validation', importGate?.passed ? 'PASSED' : 'WARN');
    }
    if (validationLevel === 'NEEDS_RUNTIME_VALIDATION') {
      warnings.push('NEEDS_RUNTIME_VALIDATION: install Godot and re-run validate or regenerate to reach RUNTIME_VALIDATED');
    }
    if (runtimeGateResult?.state === 'FAIL') {
      errors.push(`RUNTIME_VALIDATION_FAILED: ${runtimeGateResult.message}`);
    } else if (runtimeGateResult?.state === 'UNKNOWN') {
      warnings.push(`Runtime validation result UNKNOWN: ${runtimeGateResult.message}`);
    }

    let exportPath: string | undefined;
    report('export', 'RUNNING');
    createProjectCheckpoint(outputPath, 'before_export');
    if (options.skipExport) {
      report('export', 'SKIPPED', 'EXPORT_SKIPPED: skipExport');
    } else {
      try {
        const exportResult = exportProject({
          projectPath: outputPath,
          zip: false,
          requireValidation: false,
          requireCommercialSafe: options.mode === 'COMMERCIAL_SAFE',
        });
        warnings.push(...exportResult.warnings);
        if (!exportResult.success) {
          warnings.push(...exportResult.errors);
          report('export', 'WARN', exportResult.errors[0] ?? 'Export failed');
        } else {
          exportPath = exportResult.archivePath;
          report(
            'export',
            'PASSED',
            exportResult.archivePath ?? exportResult.manifestPath ?? 'staged',
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Export failed: ${msg}`);
        report('export', 'WARN', msg);
      }
    }

    // A project whose files were all assembled but that never passed QA/runtime validation is
    // not the same outcome as a genuinely complete one — most importantly, a hard runtime
    // failure (real gameplay code broken, not just a soft-fail/skip) must never be silently
    // reported as COMPLETE.
    const finalStatus = validationPassed ? 'complete' : 'validation_failed';

    if (options.profile === 'VISUAL_VERTICAL_SLICE') {
      const review = writeVisualSliceReviewRequired(outputPath, {
        fakeAnimationDetected: assetResult.fakeAnimationDetected === true,
        notes: 'Technical QA is not aesthetic approval. Use Approve Visual Direction / Reject in Generation Studio.',
        technicalQa: {
          passed: validationPassed === true,
          issues: errors,
          checks: {
            runtimeValidated: validationPassed === true,
            fakeAnimation: assetResult.fakeAnimationDetected !== true,
          },
        },
      });
      const evidence = collectVisualSliceEvidence(outputPath);
      writeVisualSliceReports({
        projectPath: outputPath,
        slug,
        styleBible,
        characterDna: characterVisualDna,
        providerModels: {
          nvidiaImage: String(options.nvidiaImageModel ?? process.env.NVIDIA_IMAGE_MODEL ?? 'black-forest-labs/flux.1-dev'),
          kontext: 'black-forest-labs/flux.1-kontext-dev',
        },
        spriteQa: { fakeAnimationDetected: assetResult.fakeAnimationDetected === true },
        tilesetQa: { compiler: 'TileCompiler autotile' },
        roomQa: { roomCount: gameDna.world.roomCount, biomeCount: 1 },
        fakeAnimation: assetResult.fakeAnimationDetected === true,
        screenshots: evidence.length > 0 ? evidence : [
          'qa/screenshot_gameplay.png',
          'reports/visual-slice-contact-sheet.png',
        ],
        review,
      });
      const farFp = fingerprintFile(join(outputPath, 'assets', 'backgrounds', 'biome_0', 'far.png'));
      const midFp = fingerprintFile(join(outputPath, 'assets', 'backgrounds', 'biome_0', 'mid.png'));
      const nearFp = fingerprintFile(join(outputPath, 'assets', 'backgrounds', 'biome_0', 'near.png'));
      const scoreSlice = () =>
        scoreVisualQuality({
          projectPath: outputPath,
          playerVisible: existsSync(join(outputPath, 'assets', 'characters', 'player.png')),
          enemyVisible: existsSync(join(outputPath, 'assets', 'enemies')) || existsSync(join(outputPath, 'assets', 'enemies', 'enemy_0.png')),
          terrainTextureExists: existsSync(join(outputPath, 'assets', 'tilesets', 'biome_0', 'source.png')),
          uiTextureExists: existsSync(join(outputPath, 'assets', 'ui', 'hud_frame.png')),
          parallaxFingerprints: { far: farFp, mid: midFp, near: nearFp },
          propCount: assetResult.assets.filter((a) => a.path.includes('/props/')).length,
          placeholderRatio:
            assetResult.assets.length > 0
              ? assetResult.assets.filter((a) => a.maturity === 'PLACEHOLDER' || a.fallbackGenerated).length /
                assetResult.assets.length
              : 1,
          wallpaperCapture: false,
          functionalQuality: validationPassed ? 90 : 40,
        });
      let visualQa = scoreSlice();
      const repairLog: string[] = [];
      for (let round = 0; round < VISUAL_REPAIR_BUDGET.maxSliceRepairRounds; round++) {
        if (visualQa.verdict !== 'AUTOMATED_VISUAL_FAIL') break;
        const planned = planVisualRepairs(visualQa, round);
        if (planned.length === 0) break;
        const applied = applyVisualRepairs(outputPath, planned);
        repairLog.push(...applied.filter((r) => r.applied).map((r) => `${r.defect}: ${r.detail}`));
        if (!applied.some((r) => r.applied)) break;
        visualQa = scoreSlice();
      }
      mkdirSync(join(outputPath, 'reports'), { recursive: true });
      writeFileSync(
        join(outputPath, 'reports', 'visual-composition-telemetry.json'),
        JSON.stringify(
          {
            slug,
            repairPasses: repairLog.length,
            gates: visualQa.gates,
            scores: {
              functionalQuality: visualQa.scores.functionalQuality,
              assetIntegrity: visualQa.scores.assetIntegrity,
              visualCohesion: visualQa.scores.visualCohesion,
              roomComposition: visualQa.scores.roomComposition,
              gameplayReadability: visualQa.scores.gameplayReadability,
              presentationQuality: visualQa.scores.presentationQuality,
              overall: visualQa.scores.overall,
            },
            violations: visualQa.gates.violations,
            showcaseReady: visualQa.gates.showcaseReady,
          },
          null,
          2,
        ),
      );
      writeVgf2VisualSliceReport({
        projectPath: outputPath,
        slug,
        seed: options.seed,
        profile: options.profile,
        archetype: gameDna.archetype,
        providerSummary: {
          nvidiaImage: String(options.nvidiaImageModel ?? process.env.NVIDIA_IMAGE_MODEL ?? 'black-forest-labs/flux.1-dev'),
          selectedImage: String(assetResult.selectedProvider ?? 'procedural'),
        },
        visualDNA,
        biomeName: biomeVisualDNAs[0]?.displayName ?? 'biome_0',
        maturity: {
          production: assetResult.assets.filter((a) => a.productionReady).length,
          placeholder: assetResult.assets.filter((a) => a.maturity === 'PLACEHOLDER').length,
          rejected: assetResult.assets.filter((a) => a.maturity === 'REJECTED').length,
          unknownLicense: 0,
        },
        scores: visualQa.scores,
        defects: visualQa.defects,
        repairs: repairLog,
        verdict: visualQa.verdict,
        screenshots: evidence,
        hardFailReasons: visualQa.hardFailReasons,
      });
      try {
        const projectJson = ProjectMetadataSchema.parse(JSON.parse(readFileSync(projectJsonPath, 'utf-8')));
        writeFileSync(
          projectJsonPath,
          JSON.stringify(
            {
              ...projectJson,
              visualSliceApproved: false,
              visualReviewStatus: 'VISUAL_SLICE_REVIEW_REQUIRED',
            },
            null,
            2,
          ),
        );
      } catch {
        warnings.push('Could not stamp visualReviewStatus onto project.json');
      }
      warnings.push('VISUAL SLICE READY FOR HUMAN REVIEW — not FULL GAME READY');
    }

    db.projects.updateStatus(project.id, finalStatus);
    db.jobs.updateJobStatus(job.id, finalStatus, 'export');
    db.close();

    this.logger.info('Generation complete', { slug, outputPath, jobId: job.id, status: finalStatus });

    emit({
      type: 'GenerationCompleted',
      success: true,
      validationPassed,
      validationLevel,
    });

    return {
      success: true,
      projectSlug: slug,
      outputPath,
      jobId: job.id,
      errors,
      warnings,
      phases,
      validationPassed,
      validationLevel,
      projectStatus: finalStatus,
      repairAttempts,
      exportPath,
    };
    } catch (err) {
      if (err instanceof GenerationCancelledError) {
        return finalizeCancellation(err.message);
      }
      throw err;
    }
  }
}
