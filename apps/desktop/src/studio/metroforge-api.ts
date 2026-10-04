import type { ExternalVisualPackId } from '@metroforge/godot';
import type { ModelEntry, ScoutReport } from '@metroforge/schemas';
import type { PlacementSaveSnapshot } from '@metroforge/generation';

export type LivePlacementInspection = {
  projectPath: string;
  sessionStartedAt: string;
  nodePath: string;
  instanceId: string;
  source: PlacementSaveSnapshot;
  position: { x: number; y: number };
};

export type StudioProject = {
  engine?: 'godot' | 'unity' | 'unreal';
  slug: string;
  path: string;
  title?: string;
  profile?: string;
  /** Game archetype from game_dna / project.json when available. */
  archetype?: string;
};

export type HardwareSnapshot = {
  profile: string;
  totalRamMb: number;
  vramMb?: number;
  starterPack: string[];
  gpuModel?: string;
  gpuVendor?: string;
  cudaAvailable?: boolean;
  cpuCores?: number;
};

export type CatalogModel = ModelEntry & {
  routable?: boolean;
  providerEnabled?: boolean;
  liveListed?: boolean | null;
  downloadable?: boolean;
  catalogEligible?: boolean;
  providerAvailable?: boolean;
  runtimeEligible?: boolean;
  hardwareCompatible?: boolean;
  providerHealth?: string;
};

export type GodotResolveInfo = {
  path: string | null;
  source: string;
  sourceLabel: string;
  version: string | null;
};

export type ConcurrencyLane = {
  active: number;
  max: number;
  /** @deprecated Prefer max â€” kept for older IPC payloads. */
  limit?: number;
};

export type ConcurrencyStatus = {
  llm?: ConcurrencyLane;
  image?: ConcurrencyLane;
  audio?: ConcurrencyLane;
  cpu?: ConcurrencyLane;
};

export type GenerationPhaseState = {
  phase: string;
  status: string;
  message?: string;
};

export type AssetListItem = {
  imagePlan?: GeneratedAssetRef['imagePlan'];
  propAsset?: { image: string; layout: Record<string, unknown> };
  propAssetError?: string;
  id: string;
  path: string;
  category: string;
  provider?: string;
  fallbackGenerated?: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  maturity?: string;
  productionReady?: boolean;
  sourceType?: string;
  dataUrl?: string;
  isAnimation?: boolean;
  frameCount?: number;
  prompt?: string;
  manual?: boolean;
  seed?: number;
};

/** Canonical IPC â†’ renderer shape for generateAsset (single or variant). No buffer. */
export type GeneratedAssetRef = {
  id?: string;
  path: string;
  provider?: string;
  modelId?: string;
  imagePlan?: { profile: string; width: number; height: number; sourceWidth: number; sourceHeight: number; transparent: boolean };
  executionMetadata?: { actualDevice?: string; computeBackend?: string };
  fallbackGenerated?: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  maturity?: string;
  productionReady?: boolean;
  sourceType?: string;
};

export type GenerateAssetVariantResult = {
  success: boolean;
  asset?: GeneratedAssetRef;
  errors?: string[];
  warnings?: string[];
};

export type GenerateAssetResponse = {
  success: boolean;
  asset?: GeneratedAssetRef;
  errors?: string[];
  warnings?: string[];
  variants?: GenerateAssetVariantResult[];
};

export type DesktopConfig = {
  appName: string;
  generatedGamesDir: string;
  defaultMode: string;
  defaultProfile: string;
  godotExecutable: string | null;
  unityEditor: string | null;
  godotResolve?: GodotResolveInfo;
  ollamaBaseUrl: string;
  repoRoot: string;
  nvidiaImageModel: string;
  concurrency?: { llm: number; image: number; audio: number; cpu: number };
  appPreferences?: Record<string, string>;
  envKeys: {
    nvidiaApiKey: boolean;
    geminiApiKey: boolean;
    groqApiKey: boolean;
    openrouterApiKey: boolean;
    huggingfaceApiKey: boolean;
    comfyuiUrl: boolean;
    diffusersPython: boolean;
    automatic1111Url: boolean;
    stabilityApiKey: boolean;
    deepaiApiKey: boolean;
    replicateApiToken: boolean;
  };
  imageProviders: {
    id: string;
    local: boolean;
    priority: number;
    healthy: boolean;
    health?: string;
    status?: string;
    reason?: string;
    userEnabled?: boolean;
    nearbyModels?: string[];
    suggestedModelIds?: string[];
  }[];
};

export type ProjectPreview = {
  engine?: 'godot' | 'unity' | 'unreal' | null;
  title?: string;
  profile?: string;
  error?: string;
  assetPreviews?: Array<{
    id: string;
    path: string;
    provider?: string;
    fallbackGenerated?: boolean;
    critiqueScore?: number;
    dataUrl: string;
  }>;
  worldGraph?: WorldGraphPreview;
  visualDNA?: {
    styleFingerprint?: string;
    renderingStyle?: string;
    artStyle?: { id?: string; label?: string };
    palette?: { global?: string[] };
  } | null;
  visualReview?: { status?: string; notes?: string } | null;
  visualQa?: {
    verdict?: string;
    scores?: Record<string, number>;
    defects?: string[];
  } | null;
};

export type WorldGraphPreview = {
  nodes?: Array<{ id: string; label?: string; metadata?: Record<string, unknown> }>;
  edges?: Array<{ from: string; to: string; requirements?: string[] }>;
};

export type ModelRoutingExplanation = {
  capability: string;
  requirements: string[];
  selected?: { modelId: string; provider: string; score: number; workflow?: string };
  candidates: Array<{ modelId: string; provider: string; score: number; reasons: string[] }>;
  rejected: Array<{ modelId: string; provider: string; reasons: string[] }>;
  fallbacks: Array<{ modelId: string; provider: string }>;
  license?: string;
  hardware?: { profile: string; ramMb: number; vramMb?: number; note?: string };
  degradedFallback?: boolean;
};

export type OverworldMapPreview = {
  archetype?: string;
  error?: string;
  regions?: Array<{ id: string; name: string; rect: { x: number; y: number; w: number; h: number } }>;
  nodes?: Array<{ id: string; x: number; y: number; kind: string; dungeonId?: string }>;
  edges?: Array<{ from: string; to: string; requirements?: string[] }>;
};

export type DungeonGraphPreview = {
  error?: string;
  dungeonId?: string;
  rooms?: Array<{
    id: string;
    layout?: unknown;
    kind: 'room' | 'puzzle' | 'key' | 'locked' | 'treasure' | 'mini_boss' | 'boss' | 'item';
  }>;
  keys?: string[];
  doors?: Array<{ from: string; to: string; keyId?: string }>;
  criticalPath?: string[];
  dungeonItem?: string;
  miniBossId?: string;
  bossId?: string;
};

export type RoomCollisionPreview = {
  error?: string;
  roomId?: string;
  tileSize?: number;
  widthTiles?: number;
  heightTiles?: number;
  source?: 'godot_scene';
  rects?: Array<{ path?: string; x: number; y: number; w: number; h: number; points?: Array<{x: number; y: number}> }>;
};

export type CredentialStatus = {
  encryptionAvailable: boolean;
  error: string | null;
  entries: Array<{ id: string; configured: boolean; source: 'saved' | 'environment' | 'none' }>;
};

export type MetroforgeBridge = {
  getCredentialStatus: () => Promise<CredentialStatus>;
  saveCredential: (id: string, value: string) => Promise<CredentialStatus>;
  removeCredential: (id: string) => Promise<CredentialStatus>;
  getVersion: () => Promise<string>;
  getConfig: () => Promise<DesktopConfig>;
  resolveGodot: (projectPath?: string | null) => Promise<GodotResolveInfo>;
  setAppSettings: (
    settings: Record<string, string>,
  ) => Promise<{ success: boolean; saved: Record<string, string> }>;
  runDoctor: () => Promise<{ name: string; status: string; message: string }[]>;
  listProviders: () => Promise<
    {
      id: string;
      name: string;
      local: boolean;
      enabled: boolean;
      health: string;
      priority: number;
    }[]
  >;
  listModels: (filter?: { capability?: string; installed?: boolean }) => Promise<CatalogModel[]>;
  downloadModel: (modelId: string, provider?: string) => Promise<{
    success: boolean;
    targetPath?: string;
    adapter?: string;
    message?: string;
    error?: string;
  }>;
  getHardwareProfile: () => Promise<HardwareSnapshot>;
  scoutModels: (opts?: { benchmark?: boolean }) => Promise<ScoutReport>;
  explainModelRouting: (capability: string) => Promise<ModelRoutingExplanation>;
  getOverworldMap: (projectPath: string) => Promise<OverworldMapPreview>;
  getDungeonGraph: (projectPath: string, dungeonId?: string) => Promise<DungeonGraphPreview>;
  readEditableLoot: (projectPath: string) => Promise<{ tables: Record<string, unknown>[]; items: Record<string, unknown>[]; sources: Record<string, unknown>[]; revision: string; runtimeSupported: boolean }>;
  saveEditableLoot: (projectPath: string, table: unknown, revision: string) => Promise<{ revision: string; backup: string; restartRequired: true; runtimeSynchronized: boolean; runtimeSupported: boolean }>;
  createEditableLoot: (projectPath: string, table: unknown, revision: string) => Promise<{ revision: string; backup: string; restartRequired: true; runtimeSynchronized: boolean; runtimeSupported: boolean }>;
  saveEditableLootSource: (projectPath: string, sourceId: string, tableId: string | null, revision: string) => Promise<{ revision: string; backup: string; restartRequired: true; runtimeSynchronized: boolean; runtimeSupported: boolean }>;
  readBiomeBackground: (projectPath: string, biomeId: string) => Promise<import('@metroforge/generation').BiomeBackgroundSnapshot>;
  saveBiomeBackground: (projectPath: string, biomeId: string, value: { assetId: string | null; opacity: number; anchorY: number }, revision: string) => Promise<import('@metroforge/generation').BiomeBackgroundSnapshot>;
  undoBiomeBackground: (projectPath: string, biomeId: string, revision: string) => Promise<import('@metroforge/generation').BiomeBackgroundSnapshot>;
  readEditableTerrain: (projectPath: string, asset: string) => Promise<{ settings: import('@metroforge/engines').TerrainPresentation; image: {width: number; height: number}; revision: string; restartRequired: true }>;
  saveEditableTerrain: (projectPath: string, asset: string, settings: unknown, revision: string) => Promise<{ settings: import('@metroforge/engines').TerrainPresentation; image: {width: number; height: number}; revision: string; restartRequired: true; backup: string; runtimeSynchronized: boolean }>;
  readEditableItems: (projectPath: string) => Promise<{ items: Record<string, unknown>[]; revision: string; runtimeSupported: boolean }>;
  saveEditableItem: (projectPath: string, item: unknown, revision: string) => Promise<{ revision: string; backup: string; restartRequired: true; runtimeSynchronized: boolean; runtimeSupported: boolean }>;
  readUnityRoomEdit: (projectPath: string, roomId: string) => Promise<{ objects: import('@metroforge/engines').EditableObject[]; farBackground?: string; enemyTiming?: import('@metroforge/engines').UnityEnemyTiming; backgroundFraming: import('@metroforge/engines').UnityBackgroundFraming; fingerprints: string[] }>;
  saveUnityRoomEdit: (projectPath: string, roomId: string, objects: import('@metroforge/engines').EditableObject[], fingerprints: string[], backgroundFraming?: import('@metroforge/engines').UnityBackgroundFraming, enemyTiming?: import('@metroforge/engines').UnityEnemyTiming) => Promise<{ fingerprints: string[]; backup: string; restartRequired: true }>;
  getRoomCollision: (projectPath: string, roomId: string) => Promise<RoomCollisionPreview>;
  listProjects: () => Promise<StudioProject[]>;
  getProjectPreview: (projectPath: string) => Promise<ProjectPreview>;
  getProjectDashboard: (projectPath: string) => Promise<Record<string, unknown>>;
  openInGodot: (projectPath: string) => Promise<{ success: boolean; message: string }>;
  playProject: (projectPath: string) => Promise<{ success: boolean; message: string }>;
  playInGodot: (projectPath: string) => Promise<{ success: boolean; message: string }>;
  stopPlaytest: (projectPath: string) => Promise<{ success: boolean; message: string }>;
  getPlaytestSession: (projectPath: string) => Promise<{
    projectPath: string;
    pid: number;
    running: boolean;
    startedAt: string;
    pauseSupported: boolean;
    pauseReason: string;
    bridgePort?: number;
    embedSupported?: boolean;
    embedReason?: string;
    liveEdit?: { live: string[]; requiresRestart: string[] };
  } | null>;
  playtestCommand: (
    projectPath: string,
    cmd: string,
    payload?: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string; result?: Record<string, unknown> }>;
  inspectLivePlacement: (
    projectPath: string,
    target: { nodePath: string; instanceId: string; sessionStartedAt: string },
  ) => Promise<LivePlacementInspection>;
  saveLivePlacement: (
    projectPath: string,
    inspection: LivePlacementInspection,
    position: { x: number; y: number },
  ) => Promise<PlacementSaveSnapshot>;
  scaffoldManualProject: (opts: {
    title: string;
    prompt?: string;
    archetype?: string;
    profile?: string;
    mode?: string;
    seed?: number;
  }) => Promise<{
    success: boolean;
    projectPath: string;
    slug: string;
    errors: string[];
    warnings: string[];
  }>;
  getStoryContent: (projectPath: string) => Promise<{
    narrative: {
      premise: string;
      protagonist: string;
      antagonist?: string;
      centralConflict: string;
    };
    quests: Array<{
      id: string;
      name: string;
      description: string;
      prerequisites?: string[];
      objectives: Array<{ id?: string; type: string; target: string; count?: number; description: string }>;
      rewards?: Array<{ type: string; id: string; amount?: number }>;
      dialogueStartId?: string;
      dialogueCompleteId?: string;
    }>;
    dialogues: Array<{
      id: string;
      lines: Array<{
        speaker?: string;
        text: string;
        choices?: Array<{ id?: string; text: string; nextDialogueId?: string; end?: boolean }>;
      }>;
    }>;
    npcs: Array<{ id: string; name?: string; dialogueId?: string; roomId?: string }>;
    rooms: Array<{ id: string; npcs?: string[] }>;
  }>;
  updateQuest: (
    projectPath: string,
    quest: unknown,
  ) => Promise<{ success: boolean; quests?: unknown[]; errors: string[] }>;
  updateDialogue: (
    projectPath: string,
    dialogue: unknown,
  ) => Promise<{ success: boolean; dialogues?: unknown[]; errors: string[] }>;
  updateNarrative: (
    projectPath: string,
    patch: { premise?: string; protagonist?: string; antagonist?: string; centralConflict?: string },
  ) => Promise<{ success: boolean; narrative?: unknown; errors: string[] }>;
  proposeStoryRewrite: (
    projectPath: string,
    request: { kind: 'narrative' | 'quest' | 'dialogue'; id?: string; draft: string },
  ) => Promise<{
    success: boolean;
    proposal?: string;
    scope?: { kind: string; id?: string };
    errors: string[];
    source?: string;
  }>;
  undoRoomEdit: (
    projectPath: string,
  ) => Promise<{ success?: boolean; error?: string; errors?: string[]; message?: string }>;
  redoRoomEdit: (
    projectPath: string,
  ) => Promise<{ success?: boolean; error?: string; errors?: string[]; message?: string }>;
  refreshProjectTemplate: (projectPath: string, opts?: { dryRun?: boolean; expectedPlanDigest?: string }) => Promise<{
    success: boolean;
    copied: string[];
    removed: string[];
    errors: string[];
    dryRun?: boolean;
    planDigest?: string;
    templateName?: string;
    backupPath?: string;
    validationInvalidated?: boolean;
  }>;
  generateGame: (opts: {
    title?: string;
    prompt: string;
    profile: string;
    mode: string;
    seed: number;
    generationControl?: string;
    externalVisualPack?: ExternalVisualPackId;
    targetEngine?: 'unity';
    archetype?: string;
  }) => Promise<{
    success: boolean;
    cancelled?: boolean;
    validationPassed?: boolean;
    validationLevel?: string;
    projectSlug: string;
    outputPath: string;
    errors: string[];
    warnings: string[];
    phases: GenerationPhaseState[];
    exportPath?: string;
  }>;
  getGenerationState: (projectPath: string) => Promise<{
    projectPath: string;
    phases: GenerationPhaseState[];
    events: Array<Record<string, unknown>>;
    overallProgress: number;
    validationReport?: Record<string, unknown>;
    worldGraph?: unknown;
  }>;
  listAssets: (projectPath: string) => Promise<AssetListItem[]>;
  getAssetPreview: (projectPath: string, relPath: string) => Promise<{ dataUrl?: string }>;
  getAssetUsages: (
    projectPath: string,
    assetId: string,
  ) => Promise<{ usedIn?: Array<{ type: string; id: string; detail?: string }> }>;
  getTilesetPreview: (
    projectPath: string,
    biomeId: string,
  ) => Promise<{ dataUrl?: string; cells?: unknown; atlasSize?: number; tileSize?: number; roles?: Record<string,[number,number]> }>;
  getAudioPreview: (projectPath: string, relPath: string) => Promise<{ dataUrl?: string }>;
  generateAsset: (request: {
    projectPath: string;
    description: string;
    assetType: string;
    generationMode?: string;
    variants?: number;
    assetId?: string;
    operation?: 'create' | 'replace';
    seed?: number;
  }) => Promise<GenerateAssetResponse>;
  listRooms: (projectPath: string) => Promise<Array<Record<string, unknown> & { id: string }>>;
  importGameSetAssets: (projectPath: string) => Promise<{ success: boolean; added?: number; skipped?: number; excludedQa?: number; error?: string }>;
  updateRoom: (
    projectPath: string,
    patch: Record<string, unknown>,
  ) => Promise<{ success?: boolean; error?: string; errors?: string[]; message?: string }>;
  regenerateRoom: (
    projectPath: string,
    roomId: string,
    scope?: string,
  ) => Promise<{ success?: boolean; error?: string; message?: string }>;
  getWorldGraph: (projectPath: string) => Promise<WorldGraphPreview | null>;
  updateWorldGraph: (
    projectPath: string,
    command: unknown,
  ) => Promise<{ success?: boolean; error?: string; message?: string; worldGraph?: WorldGraphPreview }>;
  undoWorldEdit: (
    projectPath: string,
  ) => Promise<{ success?: boolean; error?: string; worldGraph?: WorldGraphPreview }>;
  redoWorldEdit: (
    projectPath: string,
  ) => Promise<{ success?: boolean; error?: string; message?: string; worldGraph?: WorldGraphPreview }>;
  getEditHistory: (projectPath: string) => Promise<{ canUndo: boolean; canRedo?: boolean }>;
  listGenerationQueue: () => Promise<
    Array<{ id: string; type: string; status: string; label: string; createdAt: string; error?: string }>
  >;
  cancelGenerationJob: (jobId: string) => Promise<{ cancelled: boolean }>;
  revealProjectFolder: (projectPath: string) => Promise<unknown>;
  onGenerationEvent: (callback: (event: Record<string, unknown>) => void) => () => void;
  onGenerationProgress: (
    callback: (data: { phase: string; status: string; message?: string }) => void,
  ) => () => void;
  onGenerationReviewPaused: (callback: (ctx: unknown) => void) => () => void;
  approveGenerationReview: (projectPath: string, approved: boolean) => Promise<unknown>;
  getVisualSliceReview: (projectPath: string) => Promise<{
    project: { status?: string; notes?: string; fakeAnimationDetected?: boolean } | null;
    global: { visualSliceApproved: boolean; status: string };
  }>;
  decideVisualSliceReview: (
    projectPath: string,
    decision: 'approve' | 'reject',
    notes?: string,
  ) => Promise<{ status: string }>;
  getGenerationReviewState: (projectPath: string) => Promise<unknown>;
  getPreviewReadiness: (projectPath: string) => Promise<{ ready?: boolean }>;
  getConcurrencyStatus: () => Promise<ConcurrencyStatus>;
  getAssetHistory: (
    projectPath: string,
    assetId: string,
  ) => Promise<Array<{ version: number; timestamp: string; prompt?: string; provider?: string; backupPath?: string }>>;
  restoreAssetVersion: (
    projectPath: string,
    assetId: string,
    version: number,
  ) => Promise<{ success?: boolean; error?: string }>;
  executeAiCommand: (
    projectPath: string,
    input: string,
    selectedRoomId?: string,
  ) => Promise<{ success: boolean; summary?: string; error?: string }>;
  transcribeSpeech: (wavBase64: string) => Promise<{ success: boolean; text?: string; error?: string }>;
  getEditStatus: (projectPath: string) => Promise<{ state: string }>;
  getValidationResults: (projectPath: string) => Promise<
    Array<{
      id: string;
      gate: string;
      passed: boolean;
      message: string;
      timestamp: string;
      details?: unknown;
    }>
  >;
  createProjectCheckpoint: (projectPath: string, label: string) => Promise<unknown>;
  listProjectCheckpoints: (
    projectPath: string,
  ) => Promise<Array<{ id: string; label: string; timestamp: string }>>;
  restoreProjectCheckpoint: (
    projectPath: string,
    checkpointId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  getAssetVersionPreview: (projectPath: string, backupRelPath: string) => Promise<{ dataUrl?: string }>;
  exportProject: (
    projectPath: string,
    opts?: { force?: boolean; zip?: boolean; commercialSafe?: boolean; requireProductionAssets?: boolean },
  ) => Promise<{
    success: boolean;
    archivePath?: string;
    manifestPath?: string;
    manifest?: Record<string, unknown>;
    errors?: string[];
    warnings?: string[];
  }>;
  runProjectAcceptance: (
    projectPath: string,
    opts?: { skipRuntime?: boolean },
  ) => Promise<{ report: { accepted: boolean; blockers: string[] }; formatted: string }>;
  getProjectAllowPlaceholders: (
    projectPath: string,
  ) => Promise<{ success: boolean; allowPlaceholders: boolean; errors: string[] }>;
  setProjectAllowPlaceholders: (
    projectPath: string,
    allowPlaceholders: boolean,
  ) => Promise<{ success: boolean; allowPlaceholders: boolean; errors: string[] }>;
  remapProjectAbilities: (
    projectPath: string,
    opts?: { dryRun?: boolean },
  ) => Promise<{
    success: boolean;
    abilityCount: number;
    remapped: Array<{ from: string; to: string }>;
    removed: string[];
    warnings: string[];
    dryRun: boolean;
    changed: boolean;
    errors: string[];
    referenceFilesUpdated?: string[];
    referenceRemaps?: Array<{ from: string; to: string; path: string }>;
  }>;
  backfillAssetMaturity: (
    projectPath: string,
    opts?: { dryRun?: boolean },
  ) => Promise<{
    success: boolean;
    artifactCount: number;
    updatedCount: number;
    skippedCount: number;
    dryRun: boolean;
    errors: string[];
  }>;
};

declare global {
  interface Window {
    metroforge?: MetroforgeBridge;
  }
}

export {};
