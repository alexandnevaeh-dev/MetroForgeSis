import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import type { GenerationMode, GenerationProfile, GameArchetype, TargetEngine } from '@metroforge/shared';
import {
  createLogger,
  generateId,
  loadConfig,
  getResourceRoot,
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
  applyVisualSliceIdentityDefaults,
  GenerationCancelledError,
  throwIfCancelled,
  isNonProductionMaturity,
  DEFAULT_TARGET_ENGINE,
  engineOutputSlug,
} from '@metroforge/shared';
import { remapGameDnaAbilities } from './remap-project-abilities.js';
import { createDatabase, type MetroForgeDatabase } from '@metroforge/database';
import { bootstrapProviders, licenseFieldsForArtifact, OllamaEmbeddingProvider, HardwareProfiler } from '@metroforge/ai';
import { generateGameDNA, type GameDNATextSource } from '@metroforge/ai';
import { GameDNASchema, ProjectMetadataSchema, VisualConstitutionSchema, type GenerationJob } from '@metroforge/schemas';
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
  generateFullMetroidvaniaWorld,
  validateWorldDesign,
  evaluateFullWorldApplicability,
  generateWorldDesignReport,
  MIN_FULL_WORLD_ZONES,
} from '@metroforge/procedural';
import { AssetPipeline, loadVisualReferenceLibrary, shouldUseFoundryCourierKit } from '@metroforge/assets';
import { GodotProjectAssembler, loadExternalVisualPack } from '@metroforge/godot';
import { UnityProjectAssembler } from '@metroforge/unity';
import { UnrealProjectAssembler } from '@metroforge/unreal';
import { assertEngineOutputIsolation, EngineOutputCollisionError, writeEngineManifest } from '@metroforge/engines';
import type { ExternalVisualPackId } from '@metroforge/godot';
import { ToolRegistry, exportProject, resolveGodotExecutableCanonical, readProjectGodotOverride } from '@metroforge/tools';
import { QAValidator, RepairEngineer, deriveValidationLevel, runQualityPass, runModernMetroidvaniaGate, modernGateToQAGateResult, scoreVisualQuality, fingerprintFile, planVisualRepairs, applyVisualRepairs, VISUAL_REPAIR_BUDGET, certifyVisualAssets, writeAssetFoundryReport, classifyAssetTier, buildAssetProvenanceReport, writeAssetProvenanceReport, buildProductionAssetFamilies, productionSliceReady, gateState, validateWorldSceneArchetypeIntegrity, type QAReport, type QAGateResult } from '@metroforge/qa';
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
  /** procedural-only (default when absent): guaranteed procedural baseline, never calls NVIDIA
   *  NIM. nvidia-enhanced: always attempts the post-baseline NIM enhancement pass for the P0
   *  visual-asset slice. auto: attempts only when NIM health-checks as reachable first. See
   *  packages/assets/src/visual-enhancement/. */
  visualMode?: 'procedural-only' | 'nvidia-enhanced' | 'auto';
  /** Select an isolated, manifest-driven test pack; omitted preserves procedural visuals. */
  externalVisualPack?: ExternalVisualPackId;
  seed: number;
  slug?: string;
  cwd?: string;
  archetype?: GameArchetype;
  /** Generation target. Default godot — existing callers stay on the Godot assembler. */
  targetEngine?: TargetEngine;
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
  /** AssetFoundry production-integration migration seam — default 'legacy' (unchanged behavior).
   *  Only the player key-art category currently honors 'foundry'/'foundry-with-legacy-fallback';
   *  see AssetPipeline.generateSprite's gateway parameter. */
  assetGenerationBackend?: import('@metroforge/assets').AssetGenerationBackend;
  /** Registers the free, keyless Pollinations provider as a routing candidate for this run. */
  enablePollinations?: boolean;
  /** Fourteenth-session visual reference/template library
   *  (docs/asset-pipeline/reference-library/templates/library.json). Off by default — unchanged
   *  behavior for every existing caller. When true, categories with a matching template (see
   *  packages/assets/src/visual-templates/) use the library's prompt/palette instead of the
   *  generic index-rotation fallback, and a provenance report is written under
   *  <outputDir>/reports/visual-template-provenance.json. Loading failure (missing/invalid
   *  manifest) throws rather than silently disabling the feature, matching externalVisualPack's
   *  "no manufactured fallback" convention. */
  useVisualReferenceLibrary?: boolean;
  /** Test-only topology override. IMPORTANT: this is NOT the gate for reaching
   *  generateFullMetroidvaniaWorld — every profile whose own PROFILE_DEFAULTS.biomes is already
   *  >= MIN_FULL_WORLD_ZONES (SMALL, MEDIUM, LARGE, RELEASE_CANDIDATE — every profile except
   *  TINY_TEST and VISUAL_VERTICAL_SLICE) reaches the full-world generator on a completely normal
   *  `create` run, with no override involved (see generation-e2e.test.ts's *-normal-path tests).
   *  This field exists only so a caller (packages/procedural/src/world-design.ts's
   *  FULL_WORLD_TEST_CONFIG in particular) can exercise that same real end-to-end path at a
   *  *cheaper* room/zone count than a real profile would otherwise force — e.g. a LARGE-shaped
   *  4-zone/40-room CI smoke run instead of paying for 150-300 real rooms — without adding a new
   *  GenerationProfile value or touching any profile-keyed gate
   *  (assertMassVisualGenerationAllowed/isMassVisualProfile read `profile` alone, never
   *  roomCount/biomeCount, so this cannot bypass MASS/visual-approval gating). Never set by the
   *  CLI or Studio — topology-only, no effect on asset/enemy/boss/NPC budgets, which stay whatever
   *  the profile says. Absent ⇒ unchanged existing behavior (profile-derived
   *  roomCount/biomeCount, exactly as before this field existed). To exercise a specific ability
   *  roster (e.g. to guarantee ground_slam is present so a breakable wall actually gets placed),
   *  pick a `profile` whose deterministic pickRegisteredAbilities() output already includes it
   *  (packages/shared/src/registered-abilities.ts) rather than overriding abilities here — LOCAL_ONLY
   *  DNA generation without an LLM already resolves to that function, profile-keyed and seed-independent. */
  worldOverride?: { roomCount?: number; biomeCount?: number };
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
    options = applyVisualSliceIdentityDefaults(options);
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

    const requestedEngine = options.targetEngine ?? DEFAULT_TARGET_ENGINE;
    const baseSlug = options.slug ?? (slugify(options.prompt.slice(0, 60)) || 'untitled-game');
    const slug = engineOutputSlug(baseSlug, requestedEngine);
    const outputBase = resolveGeneratedGamesPath(config, cwd);
    // Defense-in-depth on top of the CLI-layer check (apps/cli/src/commands/create.ts) — this
    // is the actual filesystem-writing entry point, and GenerationPipeline.run() is a public
    // API any future caller (a test, a future HTTP endpoint) could invoke directly without
    // going through the CLI's own validation first.
    const outputPath = resolveProjectPathSafe(outputBase, slug);
    try {
      assertEngineOutputIsolation(outputPath, requestedEngine);
    } catch (err) {
      if (err instanceof EngineOutputCollisionError) {
        return {
          success: false,
          projectSlug: slug,
          outputPath,
          jobId: '',
          errors: [err.message],
          warnings,
          phases,
        };
      }
      throw err;
    }
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
    const hardware = new HardwareProfiler().profile();
    const hardwareProfile = options.hardwareProfile ?? hardware.profile;

    report('intake', 'PASSED');

    const gameDnaCheckpointPath = join(outputPath, 'game_dna.json');
    let gameDna;
    let dnaSource = 'deterministic';

    let checkpointMatchesRequestedProfile = false;
    if (options.resume && existsSync(gameDnaCheckpointPath)) {
      const checkpoint = GameDNASchema.parse(JSON.parse(readFileSync(gameDnaCheckpointPath, 'utf-8')));
      checkpointMatchesRequestedProfile = checkpoint.profile === options.profile;
      if (!checkpointMatchesRequestedProfile) {
        warnings.push(
          `Ignored game_dna.json checkpoint profile "${checkpoint.profile}" because requested profile is "${options.profile}"`,
        );
      }
    }

    if (options.resume && existsSync(gameDnaCheckpointPath) && checkpointMatchesRequestedProfile) {
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
          engine: requestedEngine,
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
    const roomCount = topDownWorld
      ? topDownWorld.roomIds.length
      : (options.worldOverride?.roomCount ?? resolveRoomCount(options.profile, options.seed));
    const biomeCount = options.worldOverride?.biomeCount ?? defaults.biomes;
    // FULL_WORLD_TEST_CONFIG-style callers (worldOverride.biomeCount >= MIN_FULL_WORLD_ZONES) get
    // the richer full-world generator (zones/shortcuts/breakable walls/teaching rooms/tease
    // metadata — see packages/procedural/src/world-design.ts) instead of the plain topology, so a
    // real end-to-end run through this override actually exercises world_design_metroidvania
    // rather than producing a wider-but-still-plain world that gate would just skip or fail
    // trivially on "no tease/no combat gate."
    const { worldGraph, progressionGraph, roomIds } = topDownWorld
      ? topDownWorld
      : biomeCount >= MIN_FULL_WORLD_ZONES
        ? generateFullMetroidvaniaWorld({
            seed: options.seed,
            roomCount,
            biomeCount,
            abilities: abilityIds,
            bossCount: defaults.bosses,
            profile: options.profile,
          })
        : generateWorldTopology({
            seed: options.seed,
            roomCount,
            biomeCount,
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
      biomeCount,
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
          ? `${roomIds.length} rooms, ${biomeCount} biomes`
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
    // A combat/key-item gate (world-design.ts's generateFullMetroidvaniaWorld) grants its token
    // through the same grantsAbilities field a movement ability uses (see that module's own
    // comment on why — it mirrors the topdown dungeon-item convention already in this codebase),
    // so tell buildProgressionProof about every such non-ability token up front the same way
    // validateWorldDesign does below, or a perfectly real combat gate would be misreported as an
    // "unknown ability" here.
    const nonAbilityGrantedTokens = new Set<string>();
    for (const node of worldGraph.nodes) {
      const grants = node.metadata?.grantsAbilities;
      if (Array.isArray(grants)) for (const g of grants) if (typeof g === 'string' && !isRegisteredAbilityId(g)) nonAbilityGrantedTokens.add(g);
    }
    const progressionProof = buildProgressionProof(worldGraph, progressionGraph, undefined, nonAbilityGrantedTokens);
    writeFileSync(join(outputPath, 'progression_proof.json'), JSON.stringify(progressionProof, null, 2));

    // World-design report (Game Hook / Progression Sequence / Zone Breakdown / ASCII layout graph
    // — see packages/procedural/src/world-design.ts) generated from these exact same in-memory
    // worldGraph/progressionGraph/gameDna objects, not re-read from disk or independently
    // narrated, so it cannot disagree with what actually got built. Written for every side-view
    // generation (not just full 4+ zone worlds) — evaluateFullWorldApplicability/validateWorldDesign
    // inside generateWorldDesignReport's "VALIDATION SUMMARY" section says plainly when the
    // four-zone checks don't apply, rather than the report silently not existing for a slice.
    if (!isTopDownArchetype(gameDna.archetype)) {
      try {
        const roomExtentsForDesign = worldGraph.nodes
          .filter((n) => n.type === 'room' || n.type === 'zone')
          .map((n) => ({ id: n.id, width: 800, height: 600 }));
        const applicability = evaluateFullWorldApplicability(worldGraph);
        const design = applicability.applicable
          ? validateWorldDesign({ worldGraph, progressionGraph, roomExtents: roomExtentsForDesign })
          : undefined;
        const worldDesignReport = generateWorldDesignReport(
          {
            title: gameDna.identity.title,
            tagline: gameDna.identity.tagline,
            tone: gameDna.identity.tone,
            visualStyle: gameDna.identity.visualStyle,
          },
          worldGraph,
          progressionGraph,
          design,
        );
        writeFileSync(join(outputPath, 'world_design_report.txt'), worldDesignReport);
      } catch (err) {
        warnings.push(`world_design_report generation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
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
        assertMassVisualGenerationAllowed(options.profile, slug);
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
    const visualReferenceLibrary = options.useVisualReferenceLibrary
      ? loadVisualReferenceLibrary(cwd)
      : undefined;
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
      pollinationsBaseUrl: process.env.POLLINATIONS_BASE_URL,
      pollinationsModel: process.env.POLLINATIONS_IMAGE_MODEL,
      pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
      enablePollinations: options.enablePollinations ?? process.env.POLLINATIONS_ENABLED === 'true',
      visualReferenceLibrary,
      visualReferenceLibraryRoot: cwd,
      ollamaBaseUrl: config.ollamaBaseUrl,
      resume: options.resume,
      mode: options.mode,
      visualMode: options.visualMode,
      hardwareProfile,
      hardware: {
        profile: hardware.profile,
        ramMb: hardware.totalRamMb,
        vramMb: hardware.vramMb,
        freeVramMb: hardware.freeVramMb,
      },
      signal: options.signal,
      providerEnabled: options.providerEnabled,
      assetGenerationBackend: options.assetGenerationBackend,
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
    // Previously computed and discarded — nothing wrote this out, so a nvidia-enhanced/auto run's
    // per-asset provider attempts/failures/activations were invisible outside the process. This is
    // the "actual enhancement manifest" the visual-production-loop report format requires: which
    // provider/model won or failed each asset, and why.
    if (assetResult.visualEnhancement) {
      const ve = assetResult.visualEnhancement;
      writeFileSync(
        join(outputPath, 'visual_enhancement_report.json'),
        JSON.stringify(ve, null, 2),
      );
      warnings.push(
        `VISUAL ENHANCEMENT (${ve.visualMode}): ${ve.enhanced}/${ve.attempted + ve.skipped} assets enhanced, ` +
          `${ve.fallenBack} fell back to procedural, ${ve.skipped} skipped — see visual_enhancement_report.json`,
      );
      for (const outcome of ve.outcomes) {
        if (outcome.succeeded) {
          warnings.push(
            `  + ${outcome.plan.assetId} (${outcome.plan.family}): ${outcome.provider}/${outcome.model} -> ACTIVE`,
          );
        } else if (outcome.attempted) {
          warnings.push(
            `  - ${outcome.plan.assetId} (${outcome.plan.family}): fell back to procedural (${outcome.reason ?? 'unknown reason'})`,
          );
        }
      }
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
      styleFingerprint: a.styleFingerprint,
      commercialUse: undefined as 'allowed' | 'restricted' | 'unknown' | undefined,
      // AssetFoundry production-integration observability (production standard §11) — which
      // gateway backend was consulted, and Foundry's own QA/license verdict when it was. Absent
      // for every asset produced through the (still-default) legacy path.
      generationBackend: a.generationBackend,
      foundryQaPassed: a.foundryQaPassed,
      foundryQaScore: a.foundryQaScore,
      foundryLicense: a.foundryLicense,
    }));
    if (options.externalVisualPack) {
      const pack = loadExternalVisualPack(getResourceRoot(), options.externalVisualPack);
      for (const asset of pack.assets) {
        const sourcePath = join(getResourceRoot(), 'test-packs', pack.id, asset.source);
        const buffer = readFileSync(sourcePath);
        textureFiles.set(asset.destination, buffer);
        const prior = assetMetadata.findIndex((entry) => entry.path === asset.destination);
        const metadataTemplate = prior >= 0 ? assetMetadata[prior]! : assetMetadata[0];
        if (!metadataTemplate) throw new Error(`External visual pack cannot establish metadata for: ${asset.destination}`);
        const replacement = {
          ...metadataTemplate,
          id: `external_pack_${asset.id}`,
          path: asset.destination,
          provider: `external-test-pack:${pack.id}`,
          fallbackGenerated: false,
          critiquePassed: true,
          critiqueScore: 100,
          maturity: 'QA_REVIEW' as const,
          productionReady: false,
          sourceType: 'compiled' as const,
          sourcePath,
          sourceLicense: pack.sourceLicense,
          derivedLicense: pack.sourceLicense,
          transformation: 'external-visual-pack-copy',
          commercialUse: 'unknown' as const,
        };
        if (prior >= 0) assetMetadata[prior] = replacement;
        else assetMetadata.push(replacement);
      }

      const playerAnimationMetadata = join(getResourceRoot(), 'test-packs', pack.id, 'characters', 'player', 'player_animations.json');
      if (existsSync(playerAnimationMetadata)) {
        textureFiles.set('assets/characters/player_animations.json', readFileSync(playerAnimationMetadata));
      }
      for (const asset of pack.assets.filter((asset) => asset.family === 'character')) {
        const sourceDir = asset.source.substring(0, asset.source.lastIndexOf('/'));
        const sourceStem = asset.source.substring(asset.source.lastIndexOf('/') + 1).replace(/_(walk|attack|hurt|death|idle|talk|gesture)\.png$/, '');
        const destinationDir = asset.destination.substring(0, asset.destination.lastIndexOf('/'));
        const sidecar = join(getResourceRoot(), 'test-packs', pack.id, sourceDir, `${sourceStem}_animations.json`);
        if (existsSync(sidecar)) textureFiles.set(`${destinationDir}/${sourceStem}_animations.json`, readFileSync(sidecar));
      }
      warnings.push(`EXTERNAL_VISUAL_PACK_ACTIVE: ${pack.id} (${pack.assets.length} authored assets)`);
    }
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
    const visualConstitution = VisualConstitutionSchema.parse({
      id: `constitution_${options.seed}`,
      version: `1.${visualDNA.version}`,
      artDirection: visualDNA.artStyle.label,
      renderingStyle: visualDNA.renderingStyle,
      perspective: 'side-view gameplay camera',
      targetResolution: {
        width: visualDNA.resolution.referenceWidth,
        height: visualDNA.resolution.referenceHeight,
      },
      baseSpriteScale: visualDNA.resolution.spriteScale,
      tileSize: visualDNA.resolution.tileSize,
      palette: visualDNA.palette,
      lighting: {
        direction: visualDNA.lighting.direction,
        contrast: visualDNA.lighting.contrast,
        ambient: visualDNA.lighting.ambient,
        emissive: visualDNA.lighting.accent,
      },
      language: {
        characters: visualDNA.characters.silhouette,
        environments: visualDNA.environments.terrainRead,
        enemies: visualDNA.enemies.silhouette,
        bosses: visualDNA.bosses.silhouette,
        props: visualDNA.props.storytellingBias,
        ui: visualDNA.ui.panelStyle,
        vfx: visualDNA.vfx.hit,
      },
      silhouetteRules: [visualDNA.characters.readAtGameScale, visualDNA.enemies.readAtGameScale, visualDNA.bosses.readAtGameScale],
      materialRules: visualDNA.materials.map((material) => `${material.family}: ${material.edgeTreatment}`),
      animationRules: ['preserve character identity across frames', 'align feet and gameplay pivots', 'retain palette roles'],
      forbiddenTraits: visualDNA.forbiddenPatterns,
      consistencyConstraints: visualDNA.promptAnchors,
      provenance: { source: 'generated_visual_dna', seed: options.seed, generatedAt: new Date().toISOString() },
    });
    writeFileSync(join(outputPath, 'visual_constitution.json'), JSON.stringify(visualConstitution, null, 2));
    const foundryAssets = assetMetadata.map((asset) => ({
      id: asset.id,
      path: asset.path,
      tier: classifyAssetTier({
        placeholder: isNonProductionMaturity(asset.maturity),
        maturity: asset.maturity,
        productionReady: asset.productionReady,
        qaPassed: asset.critiquePassed,
      }),
      maturity: asset.maturity,
      placeholder: isNonProductionMaturity(asset.maturity),
      productionReady: asset.productionReady === true,
      constitutionVersion: visualConstitution.version,
      provider: asset.selectedProvider ?? asset.provider,
      model: asset.selectedModel ?? asset.modelId,
      defects: asset.critiquePassed ? [] : ['visual critique failed'],
    }));
    const styleMatches = assetMetadata.filter(
      (asset) => !asset.styleFingerprint || asset.styleFingerprint === visualDNA.styleFingerprint,
    ).length;
    const foundryReport = certifyVisualAssets(
      foundryAssets,
      visualConstitution,
      foundryAssets.length > 0 ? Math.round((styleMatches / foundryAssets.length) * 100) : 0,
    );
    writeAssetFoundryReport(outputPath, foundryReport);
    const productionFamilies = buildProductionAssetFamilies(
      visualConstitution,
      assetMetadata.map((asset) => ({
        id: asset.id,
        path: asset.path,
        fallbackGenerated: asset.fallbackGenerated,
        maturity: asset.maturity,
        productionReady: asset.productionReady,
        critiquePassed: asset.critiquePassed,
        provider: asset.selectedProvider ?? asset.provider,
        modelId: asset.selectedModel ?? asset.modelId,
        technicalValid: asset.critiquePassed,
      })),
      options.seed,
    );
    writeFileSync(
      join(outputPath, 'production-asset-family-report.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        constitutionId: visualConstitution.id,
        constitutionVersion: visualConstitution.version,
        families: productionFamilies,
        productionSlice: productionSliceReady(productionFamilies) ? 'PRODUCTION_READY' : 'REVIEW_REQUIRED',
        projectVisualCertification: foundryReport.certification,
      }, null, 2),
    );
    if (foundryReport.certification === 'VISUAL_DEGRADED') {
      warnings.push(`visual certification DEGRADED: ${foundryReport.hardFailures.join('; ')}`);
    }
    const assetPassCount = assetResult.assets.filter((a) => a.critiquePassed).length;
    const placeholderCount = assetResult.assets.filter((a) => isNonProductionMaturity(a.maturity)).length;
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

    if (requestedEngine !== 'godot' && isTopDownArchetype(gameDna.archetype)) {
      errors.push(
        `${requestedEngine.toUpperCase()}_ARCHETYPE_UNSUPPORTED: first milestone is SIDE_VIEW_METROIDVANIA only. Generate with --engine godot for top-down.`,
      );
      report('project_assembly', 'FAILED');
      db.projects.updateStatus(project.id, 'failed');
      db.close();
      return { success: false, projectSlug: slug, outputPath, jobId: job.id, errors, warnings, phases };
    }

    report('project_assembly', 'RUNNING');
    createProjectCheckpoint(outputPath, 'before_assembly');
    const assemblyInput = {
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
      externalVisualPack: options.externalVisualPack,
      foundryThemed:
        !options.externalVisualPack &&
        shouldUseFoundryCourierKit({ profile: gameDna.profile, gameDna, characterVisualDna }),
    };
    const assemblyResult =
      requestedEngine === 'unity'
        ? new UnityProjectAssembler().assemble(assemblyInput)
        : requestedEngine === 'unreal'
          ? new UnrealProjectAssembler().assemble(assemblyInput)
          : this.assembler.assemble(assemblyInput);
    if (requestedEngine === 'godot' && assemblyResult.success) {
      writeEngineManifest(outputPath, 'godot');
    }

    if (!assemblyResult.success) {
      errors.push(...assemblyResult.errors);
      report('project_assembly', 'FAILED');
      emit({ type: 'GenerationFailed', reason: assemblyResult.errors.join('; '), phase: 'project_assembly' });
      db.projects.updateStatus(project.id, 'failed');
      db.close();
      return { success: false, projectSlug: slug, outputPath, jobId: job.id, errors, warnings, phases };
    }
    report('project_assembly', 'PASSED');
    writeAssetProvenanceReport(
      outputPath,
      buildAssetProvenanceReport(assetMetadata, outputPath),
    );
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
      unityPath: config.unityEditor,
      unrealPath: config.unrealEditor,
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
      if (requestedEngine !== 'godot') {
        pushGate(target, {
          gate: 'godot_imports',
          passed: true,
          state: 'SKIPPED',
          message: `GODOT_GATES_SKIPPED: target engine is ${requestedEngine}`,
        });
        pushGate(target, {
          gate: 'godot_runtime',
          passed: true,
          state: 'SKIPPED',
          message: `GODOT_GATES_SKIPPED: target engine is ${requestedEngine}`,
        });
        pushGate(target, {
          gate: 'godot_playtest',
          passed: true,
          state: 'SKIPPED',
          message: `GODOT_GATES_SKIPPED: target engine is ${requestedEngine}`,
        });
        pushGate(target, {
          gate: 'gameplay_screenshot_qa',
          passed: true,
          state: 'SKIPPED',
          message: `GODOT_GATES_SKIPPED: target engine is ${requestedEngine}`,
        });
        const editorMissing =
          requestedEngine === 'unity'
            ? 'UNITY_EDITOR_NOT_AVAILABLE'
            : 'UNREAL_EDITOR_NOT_AVAILABLE';
        const editorTool = tools.find((t) => t.id === requestedEngine);
        pushGate(target, {
          gate: `${requestedEngine}_compile`,
          passed: true,
          state: 'SKIPPED',
          message: editorTool?.path
            ? `${requestedEngine} editor detected at ${editorTool.path} — compile not run in this generator process (open the project to compile)`
            : `${editorMissing}: project generated; compile/playtest blocked until the editor is installed`,
        });
        pushGate(target, {
          gate: `${requestedEngine}_playtest`,
          passed: true,
          state: 'SKIPPED',
          message: 'PLAYTEST_SKIPPED: editor play session is distinct from generation',
        });
        return;
      }
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

    if (!qaReport.passed && requestedEngine === 'godot') {
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
    } else if (!qaReport.passed) {
      report('automated_repair', 'SKIPPED', `Godot repair engine does not apply to ${requestedEngine} projects`);
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
      godotAvailable: requestedEngine === 'godot' ? Boolean(godotPath) : false,
      skipRuntimeValidation: options.skipRuntimeValidation || requestedEngine !== 'godot',
    });

    // MODERN_METROIDVANIA_GATE — a provider-independent, data-driven presentation-readiness score
    // over the generated visual slice. Deliberately NOT part of `deriveValidationLevel` /
    // RUNTIME_VALIDATED (a game that compiles + launches is not automatically art-ready), never
    // triggers repair, and is advisory for non-RC profiles. It exists so "not visually ready" is
    // a legible, per-dimension result rather than something hidden behind a green runtime check.
    let modernGate: ReturnType<typeof modernGateToQAGateResult> | undefined;
    if (requestedEngine === 'godot') {
    try {
      const gate = runModernMetroidvaniaGate(outputPath, { profile: gameDna.profile });
      modernGate = modernGateToQAGateResult(gate);
      qaReport.results.push(modernGate);
      const failedDims = gate.dimensions
        .filter((d) => d.applicable && !d.passed)
        .map((d) => `${d.dimension} ${d.score}/${d.threshold}`);
      report(
        'modern_metroidvania_gate',
        gate.passed ? 'PASSED' : 'WARN',
        failedDims.length
          ? `${gate.overallScore}/100 — below bar: ${failedDims.join('; ')}`
          : `${gate.overallScore}/100 — all applicable dimensions pass`,
      );
      if (!gate.passed) {
        warnings.push(
          `MODERN_METROIDVANIA_GATE: ${gate.overallScore}/100 — this generated slice is not visually production-ready (below bar: ${failedDims.join('; ')}). Advisory; does not change RUNTIME_VALIDATED.`,
        );
      }
    } catch (err) {
      warnings.push(
        `MODERN_METROIDVANIA_GATE could not run: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    }

    writeFileSync(
      join(outputPath, 'validation_report.json'),
      JSON.stringify(
        {
          passed: qaReport.passed,
          validationLevel,
          results: qaReport.results,
          modernMetroidvaniaGate: modernGate?.details ?? null,
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
    //
    // `--skip-runtime-validation` (runGodotGates above) always pushes `godot_imports` as
    // `state: 'SKIPPED'`, never 'PASS' — Godot is never actually invoked in this mode, so there is
    // nothing for it to pass. deriveValidationLevel's own skip-branch reflects that correctly by
    // returning STATIC_VALIDATED (import genuinely skipped, not validated) rather than
    // IMPORT_VALIDATED (which asserts godot_imports actually passed). Checking for
    // IMPORT_VALIDATED here was therefore checking a level this mode can never produce, making
    // `validationPassed` always false whenever the flag was used — confirmed via generation-e2e.
    // test.ts's TINY_TEST run, which failed its `export` phase assertion for exactly this reason
    // on every profile, seed, and prior code state tried.
    let validationPassed =
      validationLevel === 'RUNTIME_VALIDATED' ||
      (validationLevel === 'STATIC_VALIDATED' &&
        (Boolean(options.skipRuntimeValidation) || requestedEngine !== 'godot'));

    // A top-down project reaching this point with godot_runtime genuinely PASSED but
    // godot_playtest SKIPPED is not a legitimate outcome — every documented SKIPPED reason above
    // (godot unavailable, --skip-runtime-validation, godot_imports/godot_runtime failing) already
    // returns early without ever running godot_runtime successfully first. The one historical way
    // this combination happened for real (RuntimeSmokeTest.gd never printing
    // METROFORGE_RUNTIME_READY, so the gate scored UNKNOWN and playtest never ran even though
    // every check had genuinely passed — docs/debug/TOPDOWN_GENRE_MILESTONE.md) is fixed, but this
    // is the regression check for it: don't let that combination silently ship again.
    if (isTopDownArchetype(gameDna.archetype) && runtimeGateResult?.passed) {
      const playtestResult = qaReport.results.find((r) => r.gate === 'godot_playtest');
      if (playtestResult && gateState(playtestResult) === 'SKIPPED') {
        errors.push(
          `UNEXPECTED_TOPDOWN_PLAYTEST_SKIPPED: godot_playtest was SKIPPED despite godot_runtime passing (${playtestResult.message}) — the top-down playtest gate must stay active`,
        );
        validationPassed = false;
      }
    }

    // QualityDirector/QualityRepairEngine (packages/qa) are entirely side-view-specific — every
    // repair action they can apply (APPLY_TRANSITION_FADE, the World.tscn HUD polish, etc.) reads
    // from or writes files by a hardcoded `templates/godot-metroidvania` path and assumes
    // WorldManager.gd's room-scene architecture, with no archetype check anywhere in either file.
    // Running it against a top-down project actively corrupts it: APPLY_TRANSITION_FADE copies
    // the side-view WorldManager.gd into the project and (via the HUD-polish action) can rewrite
    // scenes/world/World.tscn to reference it instead of OverworldManager.gd — silently replacing
    // the entire top-down runtime with an unbootable side-view scene *after* godot_runtime/
    // godot_playtest already validated the real one, with no gate re-run afterward to catch it.
    // Confirmed directly: a fresh top-down generation showed 168/168 runtime checks and 8/8
    // playtest checks passing, then failed to spawn a player at all once this pass had run.
    // Skipping it here (rather than genre-adapting the whole quality-pass subsystem, well beyond
    // this fix's scope) is the safe fix until top-down gets its own equivalent pass.
    if (isProductionQualityProfile(gameDna.profile) && godotPath && validationPassed && !isTopDownArchetype(gameDna.archetype) && requestedEngine === 'godot') {
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

      // The quality pass just ran and is exactly the kind of step that can rewrite scenes,
      // scripts, or assets after every gate above already validated the pre-pass state (see the
      // comment on the archetype guard just above) — re-run the one gate that would catch its
      // worst failure mode (silently swapping World.tscn for the wrong genre's manager script)
      // against what's actually on disk *now*, and let a regression here override an
      // already-PASSED result rather than letting a stale, pre-pass qaReport ship unchecked.
      const postPassIntegrity = validateWorldSceneArchetypeIntegrity(
        outputPath,
        isTopDownArchetype(gameDna.archetype),
      );
      const preExistingIndex = qaReport.results.findIndex(
        (r) => r.gate === 'world_scene_archetype_integrity',
      );
      if (preExistingIndex >= 0) {
        qaReport.results[preExistingIndex] = postPassIntegrity;
      } else {
        qaReport.results.push(postPassIntegrity);
      }
      if (!postPassIntegrity.passed) {
        errors.push(`POST_QUALITY_PASS_INTEGRITY_FAILED: ${postPassIntegrity.message}`);
        validationPassed = false;
      }
    }

    // Re-written after the quality-pass block (rather than only once, earlier) so a regression
    // that block introduces is reflected in the file actually shipped alongside the project, not
    // only in an in-memory qaReport nothing else re-reads.
    writeFileSync(
      join(outputPath, 'validation_report.json'),
      JSON.stringify(
        {
          passed: qaReport.passed,
          validationLevel,
          results: qaReport.results,
          modernMetroidvaniaGate: modernGate?.details ?? null,
          repairAttempts,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    report(
      'final_qa',
      validationPassed ? 'PASSED' : validationLevel === 'NEEDS_RUNTIME_VALIDATION' ? 'SKIPPED' : 'WARN',
      `${validationLevel}: ${qaReport.results.filter((r) => r.passed).length}/${qaReport.results.length} gates passed`,
    );

    if (requestedEngine !== 'godot') {
      report(
        'static_validation',
        staticPassed ? 'PASSED' : 'WARN',
        `${requestedEngine} static gates only — compile/open/playtest are separate statuses`,
      );
    } else if (!godotPath) {
      report('static_validation', 'SKIPPED', 'NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE');
      warnings.push('NEEDS_RUNTIME_VALIDATION: GODOT_NOT_AVAILABLE — Godot binary not detected, static validation only');
    } else if (options.skipRuntimeValidation) {
      report('static_validation', importGate?.passed ? 'PASSED' : 'WARN');
      warnings.push('RUNTIME_VALIDATION_SKIPPED: --skip-runtime-validation');
    } else {
      report('static_validation', importGate?.passed ? 'PASSED' : 'WARN');
    }
    if (requestedEngine === 'godot' && validationLevel === 'NEEDS_RUNTIME_VALIDATION') {
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
    } else if (requestedEngine !== 'godot') {
      // The project assembler emitted native engine source, not a standalone player.
      // exportProject below is Godot-only and must never receive Unity/Unreal projects.
      const message = `${requestedEngine.toUpperCase()}_NATIVE_BUILD_PENDING: source project assembled; native compile, playtest and standalone packaging still required`;
      warnings.push(message);
      report('export', 'WARN', message);
    } else {
      try {
        const exportResult = exportProject({
          projectPath: outputPath,
          zip: false,
          requireValidation: false,
          requireCommercialSafe: options.mode === 'COMMERCIAL_SAFE',
          packageWindows: Boolean(godotPath) && process.platform === 'win32' && requestedEngine === 'godot',
          packageMacOS: Boolean(godotPath) && process.platform === 'darwin' && requestedEngine === 'godot',
          godotExecutable: godotPath ?? undefined,
        });
        warnings.push(...exportResult.warnings);
        if (!exportResult.success) {
          warnings.push(...exportResult.errors);
          report('export', 'WARN', exportResult.manifest?.packaging.message ?? exportResult.errors[0] ?? 'WINDOWS_PACKAGE_BLOCKED');
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
        roomQa: { roomCount: gameDna.world.roomCount, biomeCount: gameDna.world.biomeCount },
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
              ? assetResult.assets.filter((a) => isNonProductionMaturity(a.maturity)).length /
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
