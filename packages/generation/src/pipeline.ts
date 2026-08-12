import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import type { GenerationMode, GenerationProfile } from '@metroforge/shared';
import {
  createLogger,
  generateId,
  loadConfig,
  PRODUCT,
  PROFILE_DEFAULTS,
  resolveGeneratedGamesPath,
  slugify,
  type StageStatus,
} from '@metroforge/shared';
import { createDatabase, type MetroForgeDatabase } from '@metroforge/database';
import { bootstrapProviders } from '@metroforge/ai';
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
  generateMusicFromAudioBible,
  enhanceMusicWithStableAudio,
} from '@metroforge/procedural';
import { AssetPipeline } from '@metroforge/assets';
import { GodotProjectAssembler } from '@metroforge/godot';
import { ToolRegistry } from '@metroforge/tools';
import { QAValidator, RepairEngineer } from '@metroforge/qa';

export interface GenerateOptions {
  prompt: string;
  profile: GenerationProfile;
  mode: GenerationMode;
  seed: number;
  slug?: string;
  cwd?: string;
  /** Skip the AI/network-dependent Game DNA phase if a checkpoint already exists on disk. */
  resume?: boolean;
  onPhase?: (phase: string, status: string, message?: string) => void;
}

export interface GenerateResult {
  success: boolean;
  projectSlug: string;
  outputPath: string;
  jobId: string;
  errors: string[];
  warnings: string[];
  phases: { phase: string; status: string; message?: string }[];
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

    const report = (phase: string, status: string, message?: string) => {
      phases.push({ phase, status, message });
      options.onPhase?.(phase, status, message);

      const stageId = stageIdByPhase.get(phase);
      if (!db || !stageId) return;
      const dbStatus: StageStatus | null =
        status === 'RUNNING'
          ? 'RUNNING'
          : status === 'PASSED' || status === 'WARN'
            ? 'PASSED'
            : status === 'SKIPPED'
              ? 'SKIPPED'
              : status === 'FAILED'
                ? 'FAILED'
                : null;
      if (dbStatus) db.jobs.updateStageStatus(stageId, dbStatus, status === 'FAILED' ? (message ?? 'Failed') : null);
    };

    const slug = options.slug ?? (slugify(options.prompt.slice(0, 60)) || 'untitled-game');
    const outputBase = resolveGeneratedGamesPath(config, cwd);
    const outputPath = join(outputBase, slug);
    mkdirSync(outputPath, { recursive: true });

    const dataDir = config.dataDir || join(cwd, '.metroforge');
    mkdirSync(dataDir, { recursive: true });
    db = await createDatabase(dataDir);

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
        { prompt: options.prompt, profile: options.profile, seed: options.seed },
        textSource,
      );
      gameDna = result.dna;
      dnaSource = result.source;
      report('game_dna', 'PASSED', `Source: ${dnaSource}`);
      writeFileSync(gameDnaCheckpointPath, JSON.stringify(gameDna, null, 2));
    }

    report('design_bible', 'RUNNING');
    const designBible = generateDesignBible(gameDna, options.profile, options.seed);
    writeFileSync(
      join(outputPath, 'design_bible.json'),
      JSON.stringify(designBible, null, 2),
    );
    report('design_bible', 'PASSED', `${designBible.art.palette.length} palette colors, ${designBible.audio.biomeThemes.length} biome themes`);

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
        }),
        null,
        2,
      ),
    );

    job = db.jobs.create(project.id, options.profile, options.mode, options.seed);
    stageIdByPhase = new Map(job.stages.map((s) => [s.phase, s.id]));

    report('world_topology', 'RUNNING');
    const defaults = PROFILE_DEFAULTS[options.profile];
    const abilityIds = gameDna.abilities.filter((a) => a.enabled).map((a) => a.id);
    const roomCount = resolveRoomCount(options.profile, options.seed);
    const { worldGraph, progressionGraph, roomIds } = generateWorldTopology({
      seed: options.seed,
      roomCount,
      biomeCount: defaults.biomes,
      abilities: abilityIds,
      bossCount: defaults.bosses,
      profile: options.profile,
    });
    const { connected, unreachableRoomIds } = validateWorldConnectivity(worldGraph);
    if (!connected) {
      warnings.push(`Disconnected rooms in generated world: ${unreachableRoomIds.join(', ')}`);
    }
    report(
      'world_topology',
      connected ? 'PASSED' : 'FAILED',
      connected
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
    const progressionOk = reachable && worldReachable;
    report(
      'progression_graph',
      progressionOk ? 'PASSED' : 'FAILED',
      progressionOk
        ? undefined
        : !reachable
          ? 'Abstract ability chain unsolvable'
          : `${worldUnreachableRoomIds.length} room(s) unreachable via ability pickup`,
    );

    report('enemy_families', 'RUNNING');
    const bossRoomId = roomIds[roomIds.length - 1]!;
    const gameContent = generateGameContent(gameDna, options.profile, options.seed, bossRoomId);
    report('enemy_families', 'PASSED', `${gameContent.enemies.length} enemies`);
    report('bosses', 'PASSED', `${gameContent.bosses.length} bosses`);
    report('quests', 'PASSED', `${gameContent.quests.length} quests`);

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
    for (const [biomeId, mod] of musicResult.furnace) {
      writeFileSync(join(musicDir, `${biomeId}.fur.json`), JSON.stringify(mod, null, 2));
    }
    mkdirSync(join(outputPath, 'audio', 'midi'), { recursive: true });
    for (const [biomeId, mid] of musicResult.midi) {
      writeFileSync(join(outputPath, 'audio', 'midi', `${biomeId}.mid`), mid);
    }
    report(
      'audio',
      'PASSED',
      `${audioFiles.size} audio files (${musicResult.midi.size} MIDI, ${musicResult.furnace.size} Furnace)`,
    );

    report('environment_assets', 'RUNNING');
    const assetPipeline = new AssetPipeline();
    const assetResult = await assetPipeline.generate({
      gameDna,
      profile: options.profile,
      seed: options.seed,
      outputDir: outputPath,
      artBible: designBible.art,
      comfyuiUrl: process.env.COMFYUI_BASE_URL,
      diffusersPython: process.env.DIFFUSERS_PYTHON,
      diffusersModelId: process.env.DIFFUSERS_MODEL_ID,
      ollamaBaseUrl: config.ollamaBaseUrl,
      resume: options.resume,
      mode: options.mode,
    });
    warnings.push(...assetResult.warnings);
    const textureFiles = new Map(assetResult.assets.map((a) => [a.path, a.buffer]));
    const assetMetadata = assetResult.assets.map((a) => ({
      id: a.id,
      path: a.path,
      type: 'texture' as const,
      provider: a.provider,
      fallbackGenerated: a.fallbackGenerated,
      critiquePassed: a.critiquePassed,
      critiqueScore: a.critiqueScore,
    }));
    const assetPassCount = assetResult.assets.filter((a) => a.critiquePassed).length;
    report(
      'environment_assets',
      'PASSED',
      `${assetResult.assets.length} assets (${assetPassCount} passed critique)`,
    );

    report('project_assembly', 'RUNNING');
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
    });

    if (!assemblyResult.success) {
      errors.push(...assemblyResult.errors);
      report('project_assembly', 'FAILED');
      db.projects.updateStatus(project.id, 'failed');
      db.close();
      return { success: false, projectSlug: slug, outputPath, jobId: job.id, errors, warnings, phases };
    }
    report('project_assembly', 'PASSED');

    report('static_validation', 'RUNNING');
    let qaReport = this.qa.validateProject(outputPath, project.id);
    const toolRegistry = new ToolRegistry();
    const tools = await toolRegistry.detectAll({
      godotPath: config.godotExecutable,
      ollamaUrl: config.ollamaBaseUrl,
    });
    const godotTool = tools.find((t) => t.id === 'godot');
    const godotPath = config.godotExecutable ?? godotTool?.path ?? null;

    if (godotPath) {
      const godotGate = this.qa.validateGodotHeadless(godotPath, outputPath);
      qaReport.results.push(godotGate);
      qaReport.validationResults.push({
        id: generateId('val'),
        projectId: project.id,
        gate: godotGate.gate,
        passed: godotGate.passed,
        message: godotGate.message,
        details: godotGate.details,
        timestamp: new Date().toISOString(),
      });
      qaReport.passed = qaReport.results.every((r) => r.passed);
    }

    if (!qaReport.passed) {
      report('automated_repair', 'RUNNING');
      const repairResult = this.repair.repair(outputPath, qaReport);
      if (repairResult.repaired) {
        warnings.push(...repairResult.actions);
        qaReport = this.qa.validateProject(outputPath, project.id);
      }
      report('automated_repair', repairResult.repaired ? 'PASSED' : 'SKIPPED');
    }

    writeFileSync(
      join(outputPath, 'validation_report.json'),
      JSON.stringify(
        {
          passed: qaReport.passed,
          results: qaReport.results,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    report(
      'final_qa',
      qaReport.passed ? 'PASSED' : 'WARN',
      `${qaReport.results.filter((r) => r.passed).length}/${qaReport.results.length} gates passed`,
    );

    if (godotPath) {
      report('static_validation', qaReport.results.find((r) => r.gate === 'godot_imports')?.passed ? 'PASSED' : 'WARN');
    } else {
      report('static_validation', 'SKIPPED', 'Godot not detected');
      warnings.push('Godot not detected for headless validation');
    }

    db.projects.updateStatus(project.id, 'complete');
    db.jobs.updateJobStatus(job.id, 'complete', 'export');
    db.close();

    this.logger.info('Generation complete', { slug, outputPath, jobId: job.id });

    return {
      success: true,
      projectSlug: slug,
      outputPath,
      jobId: job.id,
      errors,
      warnings,
      phases,
    };
  }
}
