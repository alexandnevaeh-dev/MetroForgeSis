import type { ModelEntry } from '@metroforge/schemas';

export type StudioProject = {
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
  /** @deprecated Prefer max — kept for older IPC payloads. */
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

/** Canonical IPC → renderer shape for generateAsset (single or variant). No buffer. */
export type GeneratedAssetRef = {
  id?: string;
  path: string;
  provider?: string;
  modelId?: string;
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
  rects?: Array<{ x: number; y: number; w: number; h: number }>;
};

export type MetroforgeBridge = {
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
  downloadModel: (modelId: string) => Promise<{
    success: boolean;
    targetPath?: string;
    adapter?: string;
    message?: string;
    error?: string;
  }>;
  getHardwareProfile: () => Promise<HardwareSnapshot>;
  scoutModels: (opts?: { benchmark?: boolean }) => Promise<unknown>;
  explainModelRouting: (capability: string) => Promise<ModelRoutingExplanation>;
  getOverworldMap: (projectPath: string) => Promise<OverworldMapPreview>;
  getDungeonGraph: (projectPath: string, dungeonId?: string) => Promise<DungeonGraphPreview>;
  getRoomCollision: (projectPath: string, roomId: string) => Promise<RoomCollisionPreview>;
  listProjects: () => Promise<StudioProject[]>;
  getProjectPreview: (projectPath: string) => Promise<ProjectPreview>;
  getProjectDashboard: (projectPath: string) => Promise<Record<string, unknown>>;
  openInGodot: (projectPath: string) => Promise<{ success: boolean; message: string }>;
  playInGodot: (projectPath: string) => Promise<{ success: boolean; message: string }>;
  refreshProjectTemplate: (projectPath: string) => Promise<{
    success: boolean;
    copied: string[];
    removed: string[];
    errors: string[];
  }>;
  generateGame: (opts: {
    prompt: string;
    profile: string;
    mode: string;
    seed: number;
    generationControl?: string;
    archetype?: string;
  }) => Promise<{
    success: boolean;
    projectSlug: string;
    outputPath: string;
    errors: string[];
    warnings: string[];
    phases: GenerationPhaseState[];
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
  ) => Promise<{ dataUrl?: string; cells?: unknown; atlasSize?: number; tileSize?: number }>;
  getAudioPreview: (projectPath: string, relPath: string) => Promise<{ dataUrl?: string }>;
  generateAsset: (request: {
    projectPath: string;
    description: string;
    assetType: string;
    generationMode?: string;
    variants?: number;
    assetId?: string;
    seed?: number;
  }) => Promise<GenerateAssetResponse>;
  listRooms: (projectPath: string) => Promise<Array<Record<string, unknown> & { id: string }>>;
  updateRoom: (
    projectPath: string,
    patch: Record<string, unknown>,
  ) => Promise<{ success?: boolean; error?: string; message?: string }>;
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
  getEditHistory: (projectPath: string) => Promise<{ canUndo: boolean }>;
  listGenerationQueue: () => Promise<
    Array<{ id: string; type: string; status: string; label: string; createdAt: string; error?: string }>
  >;
  cancelGenerationJob: (jobId: string) => Promise<unknown>;
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
