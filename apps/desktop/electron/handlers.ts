import { ipcMain, shell } from 'electron';
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath, basename } from 'node:path';
import { getVersionString } from '@metroforge/core';
import { loadConfig, resolveGeneratedGamesPath, isPathWithinRoot, type GameArchetype, parseProviderEnabledMap, isProviderEnabledSettingKey, isProviderUserEnabled } from '@metroforge/shared';
import {
  GenerationPipeline,
  computeOverallProgress,
  generateManualAsset,
  loadProjectContext,
  buildDependencyGraph,
  findAssetUsages,
  analyzeProjectCompletion,
  buildAssetCoverageReport,
  runProjectAcceptance,
  formatAcceptanceReport,
  applyWorldEditAndRecompile,
  applyRoomEditAndRecompile,
  regenerateRoom,
  parseProjectCommand,
  parseProjectCommandWithLlm,
  queryProjectMemory,
  readReviewState,
  listAssetHistory,
  restoreAssetVersion,
  assessPreviewReadiness,
  createProjectCheckpoint,
  listProjectCheckpoints,
  restoreProjectCheckpoint,
  getProjectAllowPlaceholders,
  setProjectAllowPlaceholders,
  backfillProjectAssetMaturity,
  remapProjectAbilities,
  type GenerationEvent,
  type WorldEditCommand,
  type GenerationControlMode,
} from '@metroforge/generation';
import {
  bootstrapProviders,
  listProviderStatus,
  ProviderHealthMonitor,
  fetchLiveModelIdsByProvider,
  reconcileCatalogEntries,
  rankModelsForCapability,
  explainModelRouting,
  HardwareProfiler,
  OllamaEmbeddingProvider,
  WhisperAsrProvider,
  resolveWhisperModelPath,
  ModelCatalogService,
  ModelDownloadManager,
} from '@metroforge/ai';
import { createDatabase, APP_SETTING_KEYS } from '@metroforge/database';
import { WorldGraphSchema } from '@metroforge/schemas';
import type { TopDownOverworld, TopDownPoi } from '@metroforge/procedural';
import {
  ToolRegistry,
  launchGodotEditor,
  launchGodotGame,
  exportProject,
  refreshProjectTemplate,
} from '@metroforge/tools';
import {
  ComfyUIProvider,
  DiffusersProvider,
  NvidiaImageProvider,
  ImageProviderRegistry,
  explainImageProviderRouting,
  resolveImageProviderHealth,
  statusToLegacyHealth,
  createVisionCritic,
} from '@metroforge/assets';
import type { GenerationMode, GenerationProfile } from '@metroforge/shared';
import { generationEventStore } from './generation-bus.js';
import { GenerationQueue, type QueueJob } from './generation-queue.js';
import {
  recordWorldEdit,
  popWorldUndo,
  canUndoWorld,
  canRedoWorld,
  listWorldEditHistory,
} from './edit-history-store.js';
import { GodotProjectAssembler } from '@metroforge/godot';
import { ConcurrencyPool } from './concurrency-pool.js';
import {
  waitForGenerationReview,
  resolveGenerationReview,
  getPendingReview,
} from './generation-review.js';
import {
  markProjectDirty,
  markProjectCompiling,
  markProjectClean,
  getProjectEditStatus,
} from './edit-dirty-store.js';
import type { WebContents } from 'electron';

const generationQueue = new GenerationQueue();
const workerPool = new ConcurrencyPool();

async function withDatabase<T>(dataDir: string, fn: (db: Awaited<ReturnType<typeof createDatabase>>) => Promise<T>): Promise<T> {
  const db = await createDatabase(dataDir);
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function loadAppPreferences(dataDir: string): Promise<Record<string, string>> {
  return withDatabase(dataDir, async (db) => {
    const entries = db.settings.list('app.');
    return Object.fromEntries(entries.map((e) => [e.key, e.value]));
  });
}

async function applyStoredConcurrency(dataDir: string): Promise<void> {
  const prefs = await loadAppPreferences(dataDir);
  workerPool.updateLimits({
    llm: parsePositiveInt(prefs[APP_SETTING_KEYS.concurrencyLlm], 2),
    image: parsePositiveInt(prefs[APP_SETTING_KEYS.concurrencyImage], 1),
    audio: parsePositiveInt(prefs[APP_SETTING_KEYS.concurrencyAudio], 1),
    cpu: parsePositiveInt(prefs[APP_SETTING_KEYS.concurrencyCpu], 2),
  });
}

interface ActiveGenerationRun {
  phases: { phase: string; status: string; message?: string }[];
  resolve: (value: unknown) => void;
  sender: WebContents;
}

const activeGenerations = new Map<string, ActiveGenerationRun>();
function safeProjectRelativePath(projectPath: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) {
    throw new Error('Invalid project-relative path');
  }
  const root = resolvePath(projectPath);
  const full = resolvePath(root, normalized);
  if (!isPathWithinRoot(root, full)) {
    throw new Error('Asset path escapes project directory');
  }
  return full;
}

async function probeImageProviders(
  mode: GenerationMode = 'HYBRID_FREE',
  providerEnabled?: Record<string, boolean>,
  nvidiaImageModel?: string | null,
  hardwareProfile?: string,
) {
  const registry = new ImageProviderRegistry();
  const disabled: Array<{
    id: string;
    local: boolean;
    priority: number;
    healthy: boolean;
    health: string;
    status: string;
    reason: string;
    userEnabled: boolean;
  }> = [];

  const allow = (id: string) => isProviderUserEnabled(providerEnabled, id);

  const comfyuiUrl = process.env.COMFYUI_BASE_URL;
  if (comfyuiUrl) {
    if (allow('comfyui')) {
      registry.register({
        provider: new ComfyUIProvider({ baseUrl: comfyuiUrl }),
        local: true,
        priority: 90,
      });
    } else {
      disabled.push({
        id: 'comfyui',
        local: true,
        priority: 90,
        healthy: false,
        health: 'disabled',
        status: 'DISABLED',
        reason: 'Disabled in Settings',
        userEnabled: false,
      });
    }
  }
  if (process.env.NVIDIA_API_KEY) {
    if (allow('nvidia-image')) {
      registry.register({
        provider: new NvidiaImageProvider({
          apiKey: process.env.NVIDIA_API_KEY,
          baseUrl: process.env.NVIDIA_API_BASE_URL,
          modelId: nvidiaImageModel?.trim() || process.env.NVIDIA_IMAGE_MODEL,
          pythonPath: process.env.DIFFUSERS_PYTHON,
        }),
        local: false,
        priority: 88,
      });
    } else {
      disabled.push({
        id: 'nvidia-image',
        local: false,
        priority: 88,
        healthy: false,
        health: 'disabled',
        status: 'DISABLED',
        reason: 'Disabled in Settings',
        userEnabled: false,
      });
    }
  }
  if (allow('diffusers')) {
    registry.register({
      provider: new DiffusersProvider({
        pythonPath: process.env.DIFFUSERS_PYTHON,
        modelId: process.env.DIFFUSERS_MODEL_ID,
      }),
      local: true,
      priority: 85,
    });
  } else {
    disabled.push({
      id: 'diffusers',
      local: true,
      priority: 85,
      healthy: false,
      health: 'disabled',
      status: 'DISABLED',
      reason: 'Disabled in Settings',
      userEnabled: false,
    });
  }

  const providers: Array<{
    id: string;
    local: boolean;
    priority: number;
    healthy: boolean;
    health: string;
    status: string;
    reason: string;
    userEnabled: boolean;
    nearbyModels?: string[];
    suggestedModelIds?: string[];
    safeDiagnostic?: string;
  }> = [...disabled];
  for (const candidate of registry.getCandidates({ mode, hardwareProfile })) {
    const report = await resolveImageProviderHealth(candidate.provider);
    const selectable = report.status === 'HEALTHY' || report.status === 'DEGRADED';
    providers.push({
      id: candidate.provider.id,
      local: candidate.local,
      priority: candidate.priority,
      healthy: selectable,
      health: statusToLegacyHealth(report.status),
      status: report.status,
      reason: report.reason,
      userEnabled: true,
      nearbyModels: report.nearbyModels,
      suggestedModelIds: report.suggestedModelIds,
      safeDiagnostic: report.safeDiagnostic,
    });
  }
  // Preserve registration priority in listing; routing order already applied via getCandidates.
  providers.sort((a, b) => b.priority - a.priority);
  return { providers, registry };
}

async function textBootstrapConfig(
  dataDir: string,
  mode: GenerationMode,
  ollamaBaseUrl: string,
): Promise<Parameters<typeof bootstrapProviders>[0]> {
  const prefs = await loadAppPreferences(dataDir);
  return {
    mode,
    ollamaBaseUrl,
    geminiApiKey: process.env.GEMINI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    nvidiaApiKey: process.env.NVIDIA_API_KEY,
    nvidiaApiBaseUrl: process.env.NVIDIA_API_BASE_URL,
    providerEnabled: parseProviderEnabledMap(prefs),
  };
}

/** Gallery taxonomy — kept identical to apps/desktop/src/studio/types.ts's categorizeAssetPath
 *  so the renderer's own re-classification (a defensive fallback for when it can't reach this
 *  handler's category, per docs/CURSOR_BACKEND_REQUIREMENTS.md #6) always agrees with the
 *  backend-assigned category instead of silently overriding it. */
function categorizeAssetPath(path: string): string {
  const p = path.toLowerCase().replace(/\\/g, '/');
  if (p.includes('/characters/player') || p.includes('/player/')) return 'Player';
  if (p.includes('/npc') || p.includes('/characters/npc')) return 'NPC';
  if (p.includes('/enemies/') || p.includes('/enemy_')) return 'Enemy';
  if (p.includes('/bosses/') || p.includes('/boss_')) return 'Boss';
  if (p.includes('/tilesets/') || p.includes('/tiles/')) return 'Tileset';
  if (p.includes('/background') || p.includes('/parallax')) return 'Background';
  if (p.includes('/weapons/') || p.includes('weapon')) return 'Weapon';
  if (p.includes('/items/')) return 'Item';
  if (p.includes('/icons/')) return 'Icon';
  if (p.includes('/vfx/') || p.includes('/fx/')) return 'VFX';
  if (p.includes('/ui/')) return 'UI';
  if (p.includes('/voice/') || p.includes('/speech/')) return 'Voice';
  if (p.includes('/music/') || p.endsWith('.mid')) return 'Music';
  if (p.includes('/audio/') || p.includes('/sfx/') || p.endsWith('.wav')) return 'SFX';
  if (p.includes('_walk') || p.includes('_attack') || p.includes('_hurt') || p.includes('/anim')) {
    return 'Animation';
  }
  if (p.includes('/props/') || p.includes('/prop')) return 'Prop';
  return 'Prop';
}

function readManifestAssets(projectPath: string) {
  try {
    const manifest = JSON.parse(readFileSync(join(projectPath, 'generation_manifest.json'), 'utf-8')) as {
      artifacts?: Array<Record<string, unknown>>;
    };
    return manifest.artifacts ?? [];
  } catch {
    return [];
  }
}

function loadAssetThumbnail(projectPath: string, relPath: string): string | undefined {
  try {
    const full = safeProjectRelativePath(projectPath, relPath);
    if (!existsSync(full) || !relPath.endsWith('.png')) return undefined;
    return `data:image/png;base64,${readFileSync(full).toString('base64')}`;
  } catch {
    return undefined;
  }
}

function readTopDownOverworld(projectPath: string): TopDownOverworld | null {
  try {
    const raw = readFileSync(join(projectPath, 'data', 'world', 'overworld.json'), 'utf-8');
    return JSON.parse(raw) as TopDownOverworld;
  } catch {
    return null;
  }
}

function readWorldGraphEdgesFrom(
  projectPath: string,
  fromId: string,
): Array<{ from: string; to: string; requirements: string[] }> {
  try {
    const raw = JSON.parse(readFileSync(join(projectPath, 'world_graph.json'), 'utf-8')) as {
      edges?: Array<{ from: string; to: string; requirements?: string[] }>;
    };
    return (raw.edges ?? [])
      .filter((e) => e.from === fromId)
      .map((e) => ({ from: e.from, to: e.to, requirements: e.requirements ?? [] }));
  } catch {
    return [];
  }
}

/** 'dungeon_000_r2' -> 'dungeon_000' — the dungeon-level id groups multiple per-room area ids
 *  produced by generateTopDownWorld (packages/procedural/src/topdown/world.ts). */
function dungeonIdFromAreaId(areaId: string): string {
  return areaId.replace(/_r\d+$/, '');
}

function assertProjectPath(projectPath: string, repoRoot: string): void {
  if (!existsSync(join(projectPath, 'project.godot'))) {
    throw new Error('Invalid project path');
  }
  const config = loadConfig();
  const base = resolveGeneratedGamesPath(config, repoRoot);
  if (!isPathWithinRoot(resolvePath(base), resolvePath(projectPath))) {
    throw new Error('Project path outside generated games directory');
  }
}

export function registerIpcHandlers(cwd: string): void {
  const config = loadConfig();
  const dataDir = config.dataDir || join(cwd, '.metroforge');
  void applyStoredConcurrency(dataDir);

  generationQueue.setExecutor(async (job) => {
    if (job.type === 'generate_game') {
      const active = activeGenerations.get(job.id);
      if (!active) return;
      const payload = job.payload as {
        prompt: string;
        profile: GenerationProfile;
        mode: GenerationMode;
        seed: number;
        generationControl?: GenerationControlMode;
        archetype?: GameArchetype;
      };
      try {
        const prefs = await loadAppPreferences(dataDir);
        const hw = new HardwareProfiler().profile();
        const pipeline = new GenerationPipeline();
        const result = await pipeline.run({
          ...payload,
          cwd,
          providerEnabled: parseProviderEnabledMap(prefs),
          nvidiaImageModel:
            prefs[APP_SETTING_KEYS.nvidiaImageModel]?.trim() || process.env.NVIDIA_IMAGE_MODEL,
          hardwareProfile: hw.profile,
          signal: job.abortSignal,
          generationControl: payload.generationControl ?? 'autonomous',
          waitForReview: async (ctx) => {
            active.sender.send('generation-review-paused', ctx);
            return waitForGenerationReview(ctx);
          },
          onPhase: (phase, status, message) => {
            active.phases.push({ phase, status, message });
            active.sender.send('generation-progress', { phase, status, message });
          },
          onEvent: (genEvent: GenerationEvent) => {
            if (genEvent.projectPath) generationEventStore.append(genEvent.projectPath, genEvent);
            active.sender.send('generation-event', genEvent);
          },
        });
        active.resolve({ ...result, phases: active.phases });
      } catch (err) {
        active.resolve({
          success: false,
          projectSlug: '',
          outputPath: '',
          errors: [err instanceof Error ? err.message : String(err)],
          warnings: [],
          phases: active.phases,
        });
      } finally {
        activeGenerations.delete(job.id);
      }
      return;
    }

    if (job.type === 'regenerate_room') {
      const { projectPath, roomId, scope } = job.payload as {
        projectPath: string;
        roomId: string;
        scope?: 'full' | 'geometry' | 'encounter';
      };
      markProjectCompiling(projectPath, `Regenerating ${roomId}`);
      const result = regenerateRoom(projectPath, roomId, scope ?? 'full');
      markProjectClean(projectPath);
      if (result.success) job.payload = { ...job.payload, result };
      else throw new Error(result.errors.join('; '));
      return;
    }

    if (job.type === 'generate_asset') {
      const request = job.payload as unknown as Parameters<typeof generateManualAsset>[0];
      const result = await workerPool.run('image', () => generateManualAsset(request));
      if (!result.success) throw new Error(result.errors.join('; '));
      job.payload = { ...job.payload, result };
    }
  });

  ipcMain.handle('get-version', () => getVersionString());

  ipcMain.handle('get-config', async () => {
    const config = loadConfig();
    const dataDir = config.dataDir || join(cwd, '.metroforge');
    const prefs = await loadAppPreferences(dataDir);
    const providerEnabled = parseProviderEnabledMap(prefs);
    const nvidiaImageModel =
      prefs[APP_SETTING_KEYS.nvidiaImageModel]?.trim() ||
      process.env.NVIDIA_IMAGE_MODEL ||
      'black-forest-labs/flux.1-dev';
    const hwConfig = new HardwareProfiler().profile();
    const { providers: imageProviders } = await probeImageProviders(
      config.defaultMode,
      providerEnabled,
      nvidiaImageModel,
      hwConfig.profile,
    );
    const visionCritic = createVisionCritic({
      ollamaBaseUrl: config.ollamaBaseUrl,
      nvidiaApiKey: process.env.NVIDIA_API_KEY,
      nvidiaApiBaseUrl: process.env.NVIDIA_API_BASE_URL,
    });
    const visionCriticAvailable = await visionCritic.isAvailable();
    const defaultMode = prefs[APP_SETTING_KEYS.defaultMode] ?? config.defaultMode;
    const defaultProfile = prefs[APP_SETTING_KEYS.defaultProfile] ?? config.defaultProfile;
    const godotExecutable = prefs[APP_SETTING_KEYS.godotExecutable] ?? config.godotExecutable ?? null;
    return {
      appName: config.appName,
      generatedGamesDir: resolveGeneratedGamesPath(config, cwd),
      defaultMode,
      defaultProfile,
      godotExecutable,
      ollamaBaseUrl: config.ollamaBaseUrl,
      repoRoot: cwd,
      nvidiaImageModel,
      concurrency: workerPool.getLimits(),
      appPreferences: prefs,
      envKeys: {
        nvidiaApiKey: Boolean(process.env.NVIDIA_API_KEY),
        geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
        groqApiKey: Boolean(process.env.GROQ_API_KEY),
        openrouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
        huggingfaceApiKey: Boolean(process.env.HUGGINGFACE_API_KEY),
        comfyuiUrl: Boolean(process.env.COMFYUI_BASE_URL),
        diffusersPython: Boolean(process.env.DIFFUSERS_PYTHON ?? process.env.DIFFUSERS_MODEL_ID),
      },
      imageProviders,
      visionCritic: {
        backend: visionCritic.backendId(),
        available: visionCriticAvailable,
      },
    };
  });

  ipcMain.handle('get-app-settings', async () => {
    const config = loadConfig();
    const dataDir = config.dataDir || join(cwd, '.metroforge');
    return loadAppPreferences(dataDir);
  });

  ipcMain.handle(
    'set-app-settings',
    async (_event, settings: Record<string, string>) => {
      const config = loadConfig();
      const dataDir = config.dataDir || join(cwd, '.metroforge');
      const allowed = new Set(Object.values(APP_SETTING_KEYS));
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(settings)) {
        if (
          allowed.has(key as (typeof APP_SETTING_KEYS)[keyof typeof APP_SETTING_KEYS]) ||
          isProviderEnabledSettingKey(key)
        ) {
          filtered[key] = String(value);
        }
      }
      await withDatabase(dataDir, async (db) => {
        db.settings.setMany(filtered);
      });
      await applyStoredConcurrency(dataDir);
      return { success: true, saved: filtered };
    },
  );

  ipcMain.handle('run-doctor', async () => {
    const config = loadConfig();
    const registry = new ToolRegistry();
    const tools = await registry.detectAll({
      godotPath: config.godotExecutable,
      ollamaUrl: config.ollamaBaseUrl,
    });
    const toolResults = tools.map((t) => ({
      name: t.name,
      status: t.status,
      message: t.message,
    }));

    const { registry: textRegistry } = await bootstrapProviders(
      await textBootstrapConfig(dataDir, 'HYBRID_FREE', config.ollamaBaseUrl),
    );
    const prefs = await loadAppPreferences(dataDir);
    const hwDoctor = new HardwareProfiler().profile();
    const { providers: imageProviders } = await probeImageProviders(
      config.defaultMode,
      parseProviderEnabledMap(prefs),
      prefs[APP_SETTING_KEYS.nvidiaImageModel],
      hwDoctor.profile,
    );
    const visionCritic = createVisionCritic({
      ollamaBaseUrl: config.ollamaBaseUrl,
      nvidiaApiKey: process.env.NVIDIA_API_KEY,
      nvidiaApiBaseUrl: process.env.NVIDIA_API_BASE_URL,
    });
    const visionAvailable = await visionCritic.isAvailable();
    const monitor = new ProviderHealthMonitor();
    const snapshots = await monitor.snapshotAll({
      textRegistry,
      imageProviders: imageProviders.map((p) => ({
        id: p.id,
        local: p.local,
        healthy: p.healthy,
        health: p.health,
        status: p.status,
        reason: p.reason,
      })),
      extra: [
        {
          id: visionCritic.backendId(),
          category: 'vision',
          health: visionAvailable ? 'healthy' : 'unavailable',
          local: visionCritic.backendId().includes('ollama'),
          message: visionAvailable ? 'Vision critic reachable' : 'Vision critic unavailable',
        },
      ],
    });

    const healthToStatus = (health: string): string => {
      if (health === 'healthy' || health === 'HEALTHY') return 'OK';
      if (health === 'degraded' || health === 'DEGRADED') return 'WARN';
      return 'FAIL';
    };

    const providerResults = snapshots.map((s) => ({
      name: `provider:${s.category}/${s.id}`,
      status: healthToStatus(s.health),
      message: s.message ?? `Health: ${s.health}${s.local ? ' (local)' : ''}`,
    }));

    // Surface richer NVIDIA image reasons beyond boolean healthy/unavailable.
    for (const p of imageProviders) {
      if (p.id === 'nvidia-image' || p.status !== 'HEALTHY') {
        providerResults.push({
          name: `provider:image/${p.id}:detail`,
          status: healthToStatus(p.status),
          message: p.reason,
        });
      }
    }
    return [...toolResults, ...providerResults];
  });

  ipcMain.handle('list-providers', async () => {
    const config = loadConfig();
    const dataDir = config.dataDir || join(cwd, '.metroforge');
    const { registry } = await bootstrapProviders(
      await textBootstrapConfig(dataDir, 'HYBRID_FREE', config.ollamaBaseUrl),
    );
    return listProviderStatus(registry);
  });

  ipcMain.handle('list-models', async (_event, filter?: { capability?: string; installed?: boolean }) => {
    const config = loadConfig();
    const dataDir = config.dataDir || join(cwd, '.metroforge');
    const { catalog, models, registry } = await bootstrapProviders(
      await textBootstrapConfig(dataDir, 'HYBRID_FREE', config.ollamaBaseUrl),
    );
    const liveIds = await fetchLiveModelIdsByProvider(registry);
    const providerIds = new Set(registry.listEnabled().map((p) => p.id));
    let entries = reconcileCatalogEntries(catalog, models, liveIds, providerIds);
    if (filter?.capability) {
      entries = entries.filter((m) =>
        m.capabilities.includes(filter.capability as import('@metroforge/schemas').ModelCapability),
      );
    }
    if (filter?.installed) entries = entries.filter((m) => m.installed);
    const downloadManager = new ModelDownloadManager(join(cwd, 'models'));
    return entries.map((entry) => ({
      ...entry,
      installed: entry.installed || downloadManager.isInstalled(entry),
      downloadable: downloadManager.planDownload(entry).adapter !== null,
    }));
  });

  ipcMain.handle('download-model', async (_event, modelId: string) => {
    if (typeof modelId !== 'string' || !modelId.trim()) {
      return { success: false, error: 'Model id is required' };
    }

    const catalog = new ModelCatalogService(join(cwd, '.metroforge'));
    const model = catalog.get(modelId);
    if (!model) {
      return { success: false, error: `Model not found: ${modelId}` };
    }

    const modelsDir = join(cwd, 'models');
    const downloadManager = new ModelDownloadManager(modelsDir);
    const plan = downloadManager.planDownload(model);
    if (!plan.adapter) {
      return { success: false, error: `No download adapter for ${modelId}` };
    }

    try {
      await downloadManager.download(model, { modelId, approved: true });
      catalog.markInstalled(modelId, plan.targetPath);
      catalog.save();
      return {
        success: true,
        targetPath: plan.targetPath,
        adapter: plan.adapter,
        message: `Installed ${modelId}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle('get-hardware-profile', async () => {
    const { getStarterPack } = await import('@metroforge/ai');
    const hw = new HardwareProfiler().profile();
    return { ...hw, starterPack: getStarterPack(hw) };
  });

  ipcMain.handle('scout-models', async (_event, opts?: { benchmark?: boolean }) => {
    const config = loadConfig();
    const { ModelScout } = await import('@metroforge/ai');
    const scout = new ModelScout(join(cwd, '.metroforge'));
    return scout.refresh({
      sources: ['ollama', 'local'],
      runBenchmarks: opts?.benchmark,
      ollamaBaseUrl: config.ollamaBaseUrl,
    });
  });

  ipcMain.handle('rank-models', async (_event, capability: string) => {
    const config = loadConfig();
    const dataDir = config.dataDir || join(cwd, '.metroforge');
    const { catalog, models, registry } = await bootstrapProviders(
      await textBootstrapConfig(dataDir, 'HYBRID_FREE', config.ollamaBaseUrl),
    );
    const liveIds = await fetchLiveModelIdsByProvider(registry);
    const providerIds = new Set(registry.listEnabled().map((p) => p.id));
    const entries = reconcileCatalogEntries(catalog, models, liveIds, providerIds);
    const hw = new HardwareProfiler().profile();
    return rankModelsForCapability(
      entries,
      capability as import('@metroforge/schemas').ModelCapability,
      hw,
      { preferInstalled: true },
    );
  });

  ipcMain.handle('explain-model-routing', async (_event, capability: string) => {
    const config = loadConfig();
    const dataDir = config.dataDir || join(cwd, '.metroforge');
    const prefs = await loadAppPreferences(dataDir);
    const providerEnabled = parseProviderEnabledMap(prefs);
    const { catalog, models, registry } = await bootstrapProviders(
      await textBootstrapConfig(dataDir, 'HYBRID_FREE', config.ollamaBaseUrl),
    );
    const liveIds = await fetchLiveModelIdsByProvider(registry);
    const providerIds = new Set(registry.listEnabled().map((p) => p.id));
    const entries = reconcileCatalogEntries(catalog, models, liveIds, providerIds);
    const hw = new HardwareProfiler().profile();
    const textTrace = explainModelRouting(
      entries,
      capability as import('@metroforge/schemas').ModelCapability,
      hw,
      { preferInstalled: true },
    );

    // IMAGE_GENERATION (and siblings) are routed via ImageProviderRegistry, not text
    // GenerationRouter — reconcile live image providers + catalog image models so the
    // Routing Inspector does not show an empty candidate list.
    const imageCapabilities = new Set([
      'IMAGE_GENERATION',
      'CONCEPT_ART',
      'CHARACTER_CONCEPT',
      'ENVIRONMENT',
      'BACKGROUND',
      'TILE_SOURCE',
      'VFX_TEXTURE',
      'UI_ART',
      'ITEM_ICON',
      'PIXEL_ART_PROCESS',
      'TEXTURE_GENERATION',
    ]);
    if (!imageCapabilities.has(capability)) {
      return textTrace;
    }

    const { providers: imageProviders, registry: imageRegistry } = await probeImageProviders(
      config.defaultMode,
      providerEnabled,
      prefs[APP_SETTING_KEYS.nvidiaImageModel],
      hw.profile,
    );
    const imageTrace = await explainImageProviderRouting(imageRegistry, {
      mode: config.defaultMode,
      hardware: { profile: hw.profile, ramMb: hw.totalRamMb, vramMb: hw.vramMb },
    });

    // Map catalog image models onto live image-provider health (comfyui/diffusers/nvidia-image).
    const providerHealth = new Map(imageProviders.map((p) => [p.id, p]));
    const catalogProviderAlias: Record<string, string[]> = {
      comfyui: ['comfyui'],
      diffusers: ['diffusers'],
      nvidia: ['nvidia-image', 'nvidia'],
    };
    const catalogImageEntries = entries.filter((e) => e.capabilities.includes(capability as never));
    const catalogCandidates: typeof textTrace.candidates = [];
    const catalogRejected: typeof textTrace.rejected = [];
    for (const entry of catalogImageEntries) {
      const aliases = catalogProviderAlias[entry.provider] ?? [entry.provider];
      const live = aliases.map((id) => providerHealth.get(id)).find(Boolean);
      const reasons: string[] = [
        `capability: ${capability}`,
        entry.local ? 'local catalog model' : 'remote catalog model (local VRAM N/A)',
        `license: ${entry.license}`,
      ];
      if (!live) {
        catalogRejected.push({
          modelId: entry.id,
          provider: entry.provider,
          reasons: [...reasons, 'image provider not registered or not configured'],
        });
        continue;
      }
      reasons.push(`provider health: ${live.status} — ${live.reason}`);
      if (live.healthy) {
        catalogCandidates.push({
          modelId: entry.id,
          provider: entry.provider,
          score: entry.priority + (live.status === 'HEALTHY' ? 10 : 0),
          reasons,
        });
      } else {
        catalogRejected.push({
          modelId: entry.id,
          provider: entry.provider,
          reasons,
        });
      }
    }

    const mergedCandidates = [
      ...imageTrace.candidates,
      ...catalogCandidates,
      ...textTrace.candidates,
    ].sort((a, b) => b.score - a.score);
    const mergedRejected = [
      ...imageTrace.rejected,
      ...catalogRejected,
      ...textTrace.rejected,
    ];

    // Surface expected image backends even when env is missing so Inspector is never empty/misleading.
    const seenProviderIds = new Set(
      [...mergedCandidates, ...mergedRejected].map((entry) => entry.provider),
    );
    const expectedImageProviders: Array<{
      id: string;
      local: boolean;
      configured: boolean;
      hint: string;
    }> = [
      {
        id: 'comfyui',
        local: true,
        configured: Boolean(process.env.COMFYUI_BASE_URL),
        hint: 'Set COMFYUI_BASE_URL to register ComfyUI',
      },
      {
        id: 'nvidia-image',
        local: false,
        configured: Boolean(process.env.NVIDIA_API_KEY),
        hint: 'Set NVIDIA_API_KEY to register NVIDIA NIM image',
      },
      {
        id: 'diffusers',
        local: true,
        configured: true,
        hint: 'Diffusers local worker (may still be unhealthy)',
      },
    ];
    for (const expected of expectedImageProviders) {
      if (seenProviderIds.has(expected.id)) continue;
      if (expected.configured) continue;
      mergedRejected.push({
        modelId: expected.id,
        provider: expected.id,
        reasons: [
          `capability: ${capability}`,
          expected.local ? 'local runtime' : 'remote/hosted (local VRAM N/A)',
          `not configured — ${expected.hint}`,
          'health: UNAVAILABLE — provider not registered',
        ],
      });
      seenProviderIds.add(expected.id);
    }

    if (imageTrace.degradedFallback) {
      mergedRejected.push({
        modelId: 'procedural',
        provider: 'procedural',
        reasons: [
          'not a scored ImageProviderRegistry candidate',
          'AssetPipeline last-resort PLACEHOLDER path',
          'environment_assets reports DEGRADED (completed with warning), not SUCCESS',
          'local VRAM N/A',
        ],
      });
    }

    const top = mergedCandidates[0];

    return {
      capability,
      requirements: [
        ...new Set([
          ...imageTrace.requirements,
          ...textTrace.requirements,
          'image providers OR catalog IMAGE models',
          'remote image providers: local VRAM filter N/A',
        ]),
      ],
      selected: top
        ? {
            modelId: top.modelId,
            provider: top.provider,
            score: top.score,
            workflow: imageTrace.selected?.workflow ?? 'image-provider',
          }
        : undefined,
      candidates: mergedCandidates,
      rejected: mergedRejected,
      fallbacks: mergedCandidates.slice(1, 4).map((c) => ({ modelId: c.modelId, provider: c.provider })),
      license: textTrace.license,
      hardware: {
        profile: hw.profile,
        ramMb: hw.totalRamMb,
        vramMb: hw.vramMb,
        note: imageTrace.degradedFallback
          ? 'No healthy image provider — procedural PLACEHOLDER fallback would be DEGRADED, not SUCCESS'
          : 'Remote image providers are not filtered by local VRAM',
      },
      degradedFallback: imageTrace.degradedFallback,
    };
  });

  ipcMain.handle('get-project-preview', async (_event, projectPath: string) => {
    if (!existsSync(join(projectPath, 'project.godot'))) {
      return { error: 'Not a Godot project (project.godot missing)' };
    }

    let title = projectPath.split(/[/\\]/).pop() ?? projectPath;
    let profile: string | undefined;
    try {
      const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8')) as {
        identity?: { title?: string };
        profile?: string;
      };
      title = dna.identity?.title ?? title;
      profile = dna.profile;
    } catch {
      /* optional */
    }

    let manifest: { artifacts?: Array<Record<string, unknown>> } = { artifacts: [] };
    try {
      manifest = JSON.parse(readFileSync(join(projectPath, 'generation_manifest.json'), 'utf-8'));
    } catch {
      /* optional */
    }

    let worldGraph: {
      nodes?: Array<{ id: string; label?: string; metadata?: Record<string, unknown> }>;
      edges?: Array<{ from: string; to: string; requirements?: string[] }>;
    } | null = null;
    try {
      worldGraph = JSON.parse(readFileSync(join(projectPath, 'world_graph.json'), 'utf-8'));
    } catch {
      /* optional */
    }

    const textureArtifacts = (manifest.artifacts ?? []).filter(
      (artifact) =>
        artifact.type === 'texture' &&
        typeof artifact.path === 'string' &&
        artifact.path.endsWith('.png'),
    );

    const assetPreviews: Array<{
      id: string;
      path: string;
      provider?: string;
      fallbackGenerated?: boolean;
      critiqueScore?: number;
      dataUrl: string;
    }> = [];

    for (const artifact of textureArtifacts.slice(0, 32)) {
      try {
        const relPath = String(artifact.path);
        const full = safeProjectRelativePath(projectPath, relPath);
        if (!existsSync(full)) continue;
        assetPreviews.push({
          id: String(artifact.id ?? relPath),
          path: relPath,
          provider: artifact.provider as string | undefined,
          fallbackGenerated: artifact.fallbackGenerated as boolean | undefined,
          critiqueScore: artifact.critiqueScore as number | undefined,
          dataUrl: `data:image/png;base64,${readFileSync(full).toString('base64')}`,
        });
      } catch {
        /* skip unreadable asset */
      }
    }

    return { title, profile, manifest, worldGraph, assetPreviews };
  });

  ipcMain.handle('list-projects', () => {
    const config = loadConfig();
    const base = resolveGeneratedGamesPath(config, cwd);
    if (!existsSync(base)) return [];

    return readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const projectPath = join(base, d.name);
        const meta: Record<string, unknown> = { slug: d.name, path: projectPath };
        try {
          const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8'));
          meta.title = dna.identity?.title;
          meta.profile = dna.profile;
          if (typeof dna.archetype === 'string') meta.archetype = dna.archetype;
        } catch {
          meta.title = d.name;
        }
        if (!meta.archetype) {
          try {
            const projectJson = JSON.parse(readFileSync(join(projectPath, 'project.json'), 'utf-8')) as {
              archetype?: string;
            };
            if (typeof projectJson.archetype === 'string') meta.archetype = projectJson.archetype;
          } catch {
            /* optional */
          }
        }
        return meta;
      });
  });

  ipcMain.handle('open-in-godot', async (_event, projectPath: string) => {
    const config = loadConfig();
    return launchGodotEditor(projectPath, { godotPath: config.godotExecutable });
  });

  ipcMain.handle('play-in-godot', async (_event, projectPath: string) => {
    const config = loadConfig();
    return launchGodotGame(projectPath, { godotPath: config.godotExecutable });
  });

  ipcMain.handle(
    'generate-game',
    async (
      event,
      opts: {
        prompt: string;
        profile: GenerationProfile;
        mode: GenerationMode;
        seed: number;
        generationControl?: GenerationControlMode;
        archetype?: GameArchetype;
      },
    ) =>
      new Promise((resolve) => {
        const job = generationQueue.enqueue({
          type: 'generate_game',
          label: `Generate: ${opts.prompt.slice(0, 40)}`,
          payload: opts,
        });
        activeGenerations.set(job.id, {
          phases: [],
          resolve,
          sender: event.sender,
        });
      }),
  );

  ipcMain.handle('get-generation-state', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    const events = generationEventStore.read(projectPath);
    let phases = events
      .filter((e) => e.type === 'PhaseStarted' || e.type === 'PhaseCompleted')
      .map((e) => ({
        phase: 'phase' in e ? e.phase : '',
        status: 'status' in e ? e.status : 'PENDING',
        message: 'message' in e ? e.message : undefined,
      }));

    if (phases.length === 0) {
      try {
        const report = JSON.parse(readFileSync(join(projectPath, 'validation_report.json'), 'utf-8'));
        phases = [{ phase: 'final_qa', status: report.passed ? 'PASSED' : 'FAILED', message: undefined }];
      } catch {
        /* no report yet */
      }
    }

    let validationReport: Record<string, unknown> | undefined;
    try {
      validationReport = JSON.parse(readFileSync(join(projectPath, 'validation_report.json'), 'utf-8'));
    } catch {
      /* optional */
    }

    let worldGraph = null;
    try {
      worldGraph = JSON.parse(readFileSync(join(projectPath, 'world_graph.json'), 'utf-8'));
    } catch {
      /* optional */
    }

    return {
      projectPath,
      phases,
      events,
      overallProgress: computeOverallProgress(phases),
      validationReport,
      worldGraph,
    };
  });

  ipcMain.handle('get-generation-events', async (_event, projectPath: string, category?: string) => {
    assertProjectPath(projectPath, cwd);
    const events = generationEventStore.read(projectPath);
    return generationEventStore.filter(events, (category as import('@metroforge/generation').GenerationEventCategory) ?? 'ALL');
  });

  ipcMain.handle('list-assets', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    const artifacts = readManifestAssets(projectPath);
    const results = artifacts.map((artifact) => {
      const path = String(artifact.path ?? '');
      const isAnimation = path.includes('_walk') || path.includes('_attack') || path.includes('_hurt');
      const meta =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      return {
        id: String(artifact.id ?? path),
        path,
        category: categorizeAssetPath(path),
        provider: artifact.provider as string | undefined,
        modelId: artifact.modelId as string | undefined,
        fallbackGenerated: artifact.fallbackGenerated as boolean | undefined,
        critiquePassed: artifact.critiquePassed as boolean | undefined,
        critiqueScore: artifact.critiqueScore as number | undefined,
        maturity: (artifact.maturity as string | undefined) ?? (meta.maturity as string | undefined),
        productionReady:
          (artifact.productionReady as boolean | undefined) ??
          (meta.productionReady as boolean | undefined),
        sourceType:
          (artifact.sourceType as string | undefined) ?? (meta.sourceType as string | undefined),
        manual: artifact.manual as boolean | undefined,
        prompt: artifact.prompt as string | undefined,
        seed: artifact.seed as number | undefined,
        dataUrl: loadAssetThumbnail(projectPath, path),
        isAnimation,
        frameCount: isAnimation ? (path.includes('boss') ? 3 : 4) : undefined,
      };
    });

    const scanAudioDir = (subdir: string, category: string) => {
      const dir = join(projectPath, subdir);
      if (!existsSync(dir)) return;
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.wav')) continue;
        const relPath = `${subdir}/${file}`.replace(/\\/g, '/');
        if (results.some((r) => r.path === relPath)) continue;
        results.push({
          id: file.replace(/\.wav$/, ''),
          path: relPath,
          category,
          provider: undefined,
          modelId: undefined,
          fallbackGenerated: undefined,
          critiquePassed: undefined,
          critiqueScore: undefined,
          maturity: undefined,
          productionReady: undefined,
          sourceType: undefined,
          manual: undefined,
          prompt: undefined,
          seed: undefined,
          dataUrl: undefined,
          isAnimation: false,
          frameCount: undefined,
        });
      }
    };
    scanAudioDir('audio/sfx', 'SFX');
    scanAudioDir('audio/music', 'Music');

    return results;
  });

  ipcMain.handle('get-asset-preview', async (_event, projectPath: string, relPath: string) => {
    assertProjectPath(projectPath, cwd);
    return { dataUrl: loadAssetThumbnail(projectPath, relPath) };
  });

  ipcMain.handle(
    'generate-asset',
    async (
      _event,
      request: {
        projectPath: string;
        description: string;
        assetType: string;
        assetId?: string;
        seed?: number;
        generationMode?: GenerationMode;
        variants?: number;
      },
    ) => {
      assertProjectPath(request.projectPath, cwd);
      const prefs = await loadAppPreferences(dataDir);
      const hw = new HardwareProfiler().profile();
      const nvidiaImageModel =
        prefs[APP_SETTING_KEYS.nvidiaImageModel]?.trim() || process.env.NVIDIA_IMAGE_MODEL;
      const variantCount = Math.min(Math.max(request.variants ?? 1, 1), 4);
      const runOne = () =>
        workerPool.run('image', () =>
          generateManualAsset({
            projectPath: request.projectPath,
            description: request.description,
            assetType: request.assetType as import('@metroforge/generation').ManualAssetType,
            assetId: request.assetId,
            seed: request.seed,
            generationMode: request.generationMode,
            nvidiaImageModel,
            hardwareProfile: hw.profile,
          }),
        );
      if (variantCount === 1) {
        return runOne();
      }
      const variants = [];
      for (let i = 0; i < variantCount; i++) {
        const result = await workerPool.run('image', () =>
          generateManualAsset({
            projectPath: request.projectPath,
            description: request.description,
            assetType: request.assetType as import('@metroforge/generation').ManualAssetType,
            assetId: `${request.assetId ?? 'variant'}_${i + 1}`,
            seed: (request.seed ?? Date.now()) + i * 997,
            generationMode: request.generationMode,
            nvidiaImageModel,
            hardwareProfile: hw.profile,
          }),
        );
        variants.push(result);
      }
      return { success: variants.every((v) => v.success), variants };
    },
  );

  ipcMain.handle(
    'approve-generation-review',
    async (_event, projectPath: string, approved: boolean) => {
      assertProjectPath(projectPath, cwd);
      const ctx = resolveGenerationReview(projectPath, approved);
      return { resolved: Boolean(ctx), context: ctx };
    },
  );

  ipcMain.handle('get-generation-review-state', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    return {
      pending: getPendingReview(projectPath),
      persisted: readReviewState(projectPath),
    };
  });

  ipcMain.handle('get-preview-readiness', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    const project = loadProjectContext(projectPath);
    return assessPreviewReadiness(project);
  });

  ipcMain.handle('get-concurrency-status', async () => workerPool.getStatus());

  ipcMain.handle('get-asset-history', async (_event, projectPath: string, assetId: string) => {
    assertProjectPath(projectPath, cwd);
    return listAssetHistory(projectPath, assetId);
  });

  ipcMain.handle(
    'restore-asset-version',
    async (_event, projectPath: string, assetId: string, version: number) => {
      assertProjectPath(projectPath, cwd);
      return restoreAssetVersion(projectPath, assetId, version);
    },
  );

  ipcMain.handle('transcribe-speech', async (_event, wavBase64: string) => {
    if (typeof wavBase64 !== 'string' || wavBase64.length === 0) {
      return { success: false, error: 'No audio payload provided' };
    }

    const modelPath = resolveWhisperModelPath();
    if (!modelPath) {
      return {
        success: false,
        error: 'Whisper model not found — install ggml-base.en.bin under models/speech/whisper-base/ or set WHISPER_MODEL_PATH',
      };
    }

    const provider = new WhisperAsrProvider({ modelPath });
    if (!(await provider.checkHealth())) {
      return {
        success: false,
        error: 'Whisper CLI unavailable — install whisper.cpp (whisper-cli) or set WHISPER_BINARY',
      };
    }

    try {
      const audio = Buffer.from(wavBase64, 'base64');
      const result = await provider.transcribe({ audio, format: 'wav' });
      if (!result.text.trim()) {
        return { success: false, error: 'No speech detected' };
      }
      return { success: true, text: result.text.trim() };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(
    'execute-ai-command',
    async (_event, projectPath: string, input: string, selectedRoomId?: string) => {
      assertProjectPath(projectPath, cwd);
      const project = loadProjectContext(projectPath);
      const ctx = { roomIds: project.roomIds, selectedRoomId };
      let parsed = parseProjectCommand(input, ctx);

      if (!parsed) {
        const config = loadConfig();
        let ragContext = '';
        try {
          const embedder = new OllamaEmbeddingProvider({
            baseUrl: config.ollamaBaseUrl ?? 'http://127.0.0.1:11434',
          });
          if (await embedder.checkHealth()) {
            ragContext = await queryProjectMemory(projectPath, input, embedder, 5);
          }
        } catch {
          // RAG is optional — fall back to room-id context only.
        }
        const { generationRouter } = await bootstrapProviders(
          await textBootstrapConfig(dataDir, 'LOCAL_ONLY', config.ollamaBaseUrl),
        );
        parsed = await parseProjectCommandWithLlm(
          input,
          { ...ctx, projectPath, ragContext },
          {
            async generateText(req) {
              const result = await generationRouter.generate({
                capability: 'JSON_GENERATION',
                task: 'studio_command',
                prompt: req.prompt,
                systemPrompt: req.systemPrompt,
                jsonMode: req.jsonMode,
                mode: req.mode ?? 'LOCAL_ONLY',
              });
              return { text: result.result };
            },
          },
        );
      }

      if (!parsed) {
        return {
          success: false,
          error: 'Could not parse command — try "connect room_a to room_b" or "add treasure room"',
        };
      }

      markProjectDirty(projectPath, parsed.summary);

      switch (parsed.kind) {
        case 'world_edit': {
          markProjectCompiling(projectPath, parsed.summary);
          recordWorldEdit(projectPath, parsed.command, project.worldGraph);
          const result = applyWorldEditAndRecompile(projectPath, parsed.command);
          if (result.success) markProjectClean(projectPath);
          return {
            success: result.success,
            summary: parsed.summary,
            result,
            error: result.errors.join('; ') || undefined,
          };
        }
        case 'room_edit': {
          markProjectCompiling(projectPath, parsed.summary);
          const result = applyRoomEditAndRecompile(projectPath, parsed.patch);
          if (result.success) markProjectClean(projectPath);
          return {
            success: result.success,
            summary: parsed.summary,
            result,
            error: result.errors.join('; ') || undefined,
          };
        }
        case 'generate_asset': {
          const result = await workerPool.run('image', () =>
            generateManualAsset({
              projectPath,
              description: parsed.request.description,
              assetType: parsed.request.assetType,
            }),
          );
          return { success: result.success, summary: parsed.summary, result, error: result.errors.join('; ') || undefined };
        }
        case 'regenerate_room': {
          const result = regenerateRoom(projectPath, parsed.roomId, parsed.scope);
          return { success: result.success, summary: parsed.summary, result, error: result.errors.join('; ') || undefined };
        }
        default:
          return { success: false, error: 'Unsupported command' };
      }
    },
  );

  ipcMain.handle('get-project-dashboard', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    const project = loadProjectContext(projectPath);
    const events = generationEventStore.read(projectPath, 100);
    const graph = buildDependencyGraph(project);
    const completion = analyzeProjectCompletion(project);
    const assetCoverage = buildAssetCoverageReport(project);
    return {
      title: project.gameDna.identity.title,
      profile: project.gameDna.profile,
      seed: project.gameDna.seed,
      roomCount: project.roomIds.length,
      assetCount: project.manifest.artifacts?.length ?? 0,
      enemyCount: project.gameContent.enemies.length,
      bossCount: project.gameContent.bosses.length,
      questCount: project.gameContent.quests.length,
      validationReport: project.validationReport,
      overallProgress: computeOverallProgress(
        events
          .filter((e) => e.type === 'PhaseCompleted')
          .map((e) => ({
            phase: 'phase' in e ? e.phase : '',
            status: 'status' in e ? e.status : 'PENDING',
          })),
      ),
      recentEvents: events.slice(-20),
      dependencyAssetCount: graph.assets.size,
      godotResourceCount: graph.godotResourceCount,
      godotScannedFiles: graph.godotScannedFiles,
      completion,
      assetCoverage,
      playtestRoute: project.playtestRoute,
      playtestTelemetry: project.playtestTelemetry,
      projectMemory: project.projectMemory,
      projectPath,
    };
  });

  ipcMain.handle('list-rooms', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    const project = loadProjectContext(projectPath);
    return project.roomIds.map((id) => ({
      id,
      ...(project.roomsData[id] ?? {}),
    }));
  });

  ipcMain.handle('get-room', async (_event, projectPath: string, roomId: string) => {
    assertProjectPath(projectPath, cwd);
    const project = loadProjectContext(projectPath);
    return project.roomsData[roomId] ?? null;
  });

  ipcMain.handle(
    'update-room',
    async (
      _event,
      projectPath: string,
      patch: {
        roomId: string;
        hasEnemy?: boolean;
        width?: number;
        height?: number;
        archetype?: string;
        tileCells?: Array<{ x: number; y: number; col: number; row: number }>;
      },
    ) => {
      assertProjectPath(projectPath, cwd);
      markProjectDirty(projectPath, `Edit room ${patch.roomId}`);
      markProjectCompiling(projectPath, 'Recompiling room');
      const result = applyRoomEditAndRecompile(projectPath, patch);
      if (result.success) markProjectClean(projectPath);
      return result;
    },
  );

  ipcMain.handle(
    'regenerate-room',
    async (_event, projectPath: string, roomId: string, scope?: 'full' | 'geometry' | 'encounter') => {
      assertProjectPath(projectPath, cwd);
      return regenerateRoom(projectPath, roomId, scope ?? 'full');
    },
  );

  ipcMain.handle('get-asset-usages', async (_event, projectPath: string, assetId: string) => {
    assertProjectPath(projectPath, cwd);
    const project = loadProjectContext(projectPath);
    const graph = buildDependencyGraph(project);
    return findAssetUsages(graph, assetId);
  });

  ipcMain.handle('get-tileset-preview', async (_event, projectPath: string, biomeId: string) => {
    assertProjectPath(projectPath, cwd);
    const project = loadProjectContext(projectPath);
    const biomeIndex = biomeId.replace('biome_', '');
    const relPath = `assets/tilesets/biome_${biomeIndex}/source.png`;
    const tileSize = project.gameDna.technical.tileSize;
    return {
      path: relPath,
      tileSize,
      atlasSize: 128,
      dataUrl: loadAssetThumbnail(projectPath, relPath),
    };
  });

  ipcMain.handle('get-audio-preview', async (_event, projectPath: string, relPath: string) => {
    assertProjectPath(projectPath, cwd);
    const full = safeProjectRelativePath(projectPath, relPath);
    if (!existsSync(full)) return { error: 'Audio file not found' };
    const buf = readFileSync(full);
    const ext = relPath.endsWith('.wav') ? 'wav' : 'mpeg';
    return {
      dataUrl: `data:audio/${ext};base64,${buf.toString('base64')}`,
      duration: null,
      path: relPath,
    };
  });

  ipcMain.handle('list-generation-queue', () => generationQueue.list());

  ipcMain.handle(
    'enqueue-generation',
    async (
      _event,
      job: { type: QueueJob['type']; label: string; payload: Record<string, unknown> },
    ) => {
      return generationQueue.enqueue(job);
    },
  );

  ipcMain.handle('cancel-generation-job', async (_event, jobId: string) => ({
    cancelled: generationQueue.cancel(jobId),
  }));

  ipcMain.handle('get-world-graph', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    const raw = JSON.parse(readFileSync(join(projectPath, 'world_graph.json'), 'utf-8'));
    return WorldGraphSchema.parse(raw);
  });

  ipcMain.handle('get-overworld-map', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    const overworld = readTopDownOverworld(projectPath);
    if (!overworld) return { error: 'No top-down overworld data for this project' };

    const overworldArea = overworld.areas.find((a) => a.kind === 'overworld');
    const worldGraphByEdgeFrom = readWorldGraphEdgesFrom(projectPath, 'overworld');

    const nodes = (overworldArea?.pois ?? []).map((poi: TopDownPoi) => ({
      id: poi.id,
      x: poi.x,
      y: poi.y,
      kind: poi.kind,
      dungeonId:
        poi.kind === 'dungeon_entrance' && typeof poi.metadata.targetAreaId === 'string'
          ? dungeonIdFromAreaId(String(poi.metadata.targetAreaId))
          : undefined,
    }));

    const edges = (overworldArea?.pois ?? [])
      .filter((poi: TopDownPoi) => poi.kind === 'dungeon_entrance')
      .map((poi: TopDownPoi) => {
        const targetAreaId = String(poi.metadata.targetAreaId ?? '');
        const matchingEdge = worldGraphByEdgeFrom.find((e) => e.to === targetAreaId);
        return { from: poi.id, to: targetAreaId, requirements: matchingEdge?.requirements ?? [] };
      });

    return {
      archetype: 'TOP_DOWN_ACTION_ADVENTURE' as const,
      regions: overworldArea
        ? [
            {
              id: overworldArea.id,
              name: overworldArea.name,
              rect: { x: 0, y: 0, w: overworldArea.widthTiles * overworldArea.tileSize, h: overworldArea.heightTiles * overworldArea.tileSize },
            },
          ]
        : [],
      nodes,
      edges,
    };
  });

  ipcMain.handle('get-dungeon-graph', async (_event, projectPath: string, dungeonId?: string) => {
    assertProjectPath(projectPath, cwd);
    const overworld = readTopDownOverworld(projectPath);
    if (!overworld) return { error: 'No top-down dungeon data for this project' };

    const dungeonAreas = overworld.areas.filter((a) => a.kind === 'dungeon');
    const resolvedDungeonId = dungeonId ?? dungeonIdFromAreaId(dungeonAreas[0]?.id ?? '');
    const areas = dungeonAreas
      .filter((a) => dungeonIdFromAreaId(a.id) === resolvedDungeonId)
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    if (areas.length === 0) return { error: `No dungeon found: ${resolvedDungeonId ?? '(none)'}` };

    const keys = new Set<string>();
    const doors: Array<{ from: string; to: string; keyId?: string }> = [];
    let miniBossId: string | undefined;
    let bossId: string | undefined;

    const rooms = areas.map((area) => {
      let kind: 'room' | 'puzzle' | 'key' | 'locked' | 'treasure' | 'mini_boss' | 'boss' | 'item' = 'room';
      for (const poi of area.pois) {
        if (poi.kind === 'boss') {
          kind = 'boss';
          bossId = typeof poi.metadata.bossId === 'string' ? poi.metadata.bossId : bossId;
        } else if (poi.kind === 'switch' && kind === 'room') {
          kind = 'puzzle';
        } else if (poi.kind === 'chest' && kind === 'room') {
          kind = 'treasure';
        } else if (poi.kind === 'locked_door') {
          if (kind === 'room') kind = 'locked';
          if (typeof poi.metadata.keyId === 'string') keys.add(poi.metadata.keyId);
          doors.push({
            from: area.id,
            to: String(poi.metadata.targetAreaId ?? ''),
            keyId: typeof poi.metadata.keyId === 'string' ? poi.metadata.keyId : undefined,
          });
        } else if (poi.kind === 'dungeon_entrance' && typeof poi.metadata.targetAreaId === 'string') {
          doors.push({ from: area.id, to: poi.metadata.targetAreaId });
        }
      }
      return { id: area.id, kind };
    });

    return {
      dungeonId: resolvedDungeonId,
      rooms,
      keys: Array.from(keys),
      doors,
      criticalPath: areas.map((a) => a.id),
      dungeonItem: overworld.dungeonItemsById?.[resolvedDungeonId ?? ''] ?? overworld.dungeonItemId,
      miniBossId,
      bossId,
    };
  });

  ipcMain.handle('get-room-collision', async (_event, projectPath: string, roomId: string) => {
    assertProjectPath(projectPath, cwd);
    const overworld = readTopDownOverworld(projectPath);
    const area = overworld?.areas.find((a) => a.id === roomId);
    if (!area) return { error: `No collision data for room: ${roomId}` };
    return {
      roomId,
      tileSize: area.tileSize,
      widthTiles: area.widthTiles,
      heightTiles: area.heightTiles,
      rects: area.collisionRects,
    };
  });

  ipcMain.handle(
    'update-world-graph',
    async (_event, projectPath: string, command: WorldEditCommand) => {
      assertProjectPath(projectPath, cwd);
      try {
        markProjectDirty(projectPath, 'World graph edit');
        markProjectCompiling(projectPath, 'Recompiling rooms');
        const current = WorldGraphSchema.parse(
          JSON.parse(readFileSync(join(projectPath, 'world_graph.json'), 'utf-8')),
        );
        recordWorldEdit(projectPath, command, current);
        const result = applyWorldEditAndRecompile(projectPath, command);
        if (!result.success) {
          return { success: false, error: result.errors.join('; ') };
        }
        markProjectClean(projectPath);
        return {
          success: true,
          worldGraph: result.worldGraph,
          recompiledRooms: result.recompiledRooms,
          message: result.message,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle('undo-world-edit', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    const previous = popWorldUndo(projectPath);
    if (!previous) return { success: false, error: 'Nothing to undo' };
    writeFileSync(join(projectPath, 'world_graph.json'), JSON.stringify(previous, null, 2));
    const project = loadProjectContext(projectPath);
    const assembler = new GodotProjectAssembler();
    const recompile = assembler.recompileRooms({
      outputDir: projectPath,
      gameDna: project.gameDna,
      worldGraph: previous,
      gameContent: project.gameContent,
      roomIds: project.roomIds,
      targetRoomIds: project.roomIds,
    });
    return {
      success: recompile.errors.length === 0,
      worldGraph: previous,
      recompiledRooms: recompile.recompiled,
      errors: recompile.errors,
    };
  });

  ipcMain.handle('get-edit-history', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    return {
      canUndo: canUndoWorld(projectPath),
      canRedo: canRedoWorld(projectPath),
      history: listWorldEditHistory(projectPath),
    };
  });

  ipcMain.handle('get-edit-status', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    return getProjectEditStatus(projectPath);
  });

  ipcMain.handle('get-validation-results', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    const slug = basename(projectPath);
    const config = loadConfig();
    const dataDir = config.dataDir || join(cwd, '.metroforge');
    const db = await createDatabase(dataDir);
    try {
      const proj = db.projects.findBySlug(slug);
      if (!proj) return [];
      return db.validationResults.listByProject(proj.id).map((r: { id: string; gate: string; passed: boolean; message: string; timestamp: string; detailsJson: string }) => ({
        id: r.id,
        gate: r.gate,
        passed: r.passed,
        message: r.message,
        timestamp: r.timestamp,
        details: JSON.parse(r.detailsJson),
      }));
    } finally {
      db.close();
    }
  });

  ipcMain.handle('create-project-checkpoint', async (_event, projectPath: string, label: string) => {
    assertProjectPath(projectPath, cwd);
    return createProjectCheckpoint(projectPath, label);
  });

  ipcMain.handle('list-project-checkpoints', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    return listProjectCheckpoints(projectPath);
  });

  ipcMain.handle('restore-project-checkpoint', async (_event, projectPath: string, checkpointId: string) => {
    assertProjectPath(projectPath, cwd);
    return restoreProjectCheckpoint(projectPath, checkpointId);
  });

  ipcMain.handle(
    'get-asset-version-preview',
    async (_event, projectPath: string, backupRelPath: string) => {
      assertProjectPath(projectPath, cwd);
      return { dataUrl: loadAssetThumbnail(projectPath, backupRelPath) };
    },
  );

  ipcMain.handle(
    'run-project-acceptance',
    async (_event, projectPath: string, opts?: { skipRuntime?: boolean }) => {
      assertProjectPath(projectPath, cwd);
      const slug = basename(projectPath);
      const project = loadProjectContext(projectPath);
      const completion = analyzeProjectCompletion(project);
      const config = loadConfig();
      const tools = await new ToolRegistry().detectAll({ godotPath: config.godotExecutable });
      const godotPath = config.godotExecutable ?? tools.find((t) => t.id === 'godot')?.path ?? null;
      const report = await runProjectAcceptance({
        slug,
        projectPath,
        godotPath,
        skipRuntime: opts?.skipRuntime,
        completion,
      });
      return { report, formatted: formatAcceptanceReport(report) };
    },
  );

  ipcMain.handle(
    'refresh-project-template',
    async (_event, projectPath: string) => {
      assertProjectPath(projectPath, cwd);
      return refreshProjectTemplate(projectPath);
    },
  );

  ipcMain.handle(
    'export-project',
    async (_event, projectPath: string, opts?: { force?: boolean; zip?: boolean; commercialSafe?: boolean }) => {
      assertProjectPath(projectPath, cwd);
      return exportProject({
        projectPath,
        zip: opts?.zip !== false,
        requireValidation: !opts?.force,
        requireCommercialSafe: opts?.commercialSafe,
      });
    },
  );

  ipcMain.handle('get-project-allow-placeholders', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    return getProjectAllowPlaceholders(projectPath);
  });

  ipcMain.handle(
    'set-project-allow-placeholders',
    async (_event, projectPath: string, allowPlaceholders: boolean) => {
      assertProjectPath(projectPath, cwd);
      return setProjectAllowPlaceholders(projectPath, allowPlaceholders === true);
    },
  );

  ipcMain.handle(
    'backfill-asset-maturity',
    async (_event, projectPath: string, opts?: { dryRun?: boolean }) => {
      assertProjectPath(projectPath, cwd);
      return backfillProjectAssetMaturity(projectPath, { dryRun: opts?.dryRun === true });
    },
  );

  ipcMain.handle(
    'remap-project-abilities',
    async (_event, projectPath: string, opts?: { dryRun?: boolean }) => {
      assertProjectPath(projectPath, cwd);
      return remapProjectAbilities(projectPath, { dryRun: opts?.dryRun === true });
    },
  );

  ipcMain.handle('reveal-project-folder', async (_event, projectPath: string) => {
    assertProjectPath(projectPath, cwd);
    shell.showItemInFolder(join(projectPath, 'project.godot'));
    return { success: true };
  });
}