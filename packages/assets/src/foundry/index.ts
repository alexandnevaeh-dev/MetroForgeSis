export { KenneyProvider, KENNEY_CATALOG } from '../providers/kenney.js';
export { OpenGameArtProvider, OPENGAMEART_CATALOG } from '../providers/opengameart.js';
export { Automatic1111Provider } from '../providers/automatic1111.js';
export { HuggingFaceImageProvider } from '../providers/huggingface-image.js';
export { StabilityProvider } from '../providers/stability.js';
export { DeepAIProvider } from '../providers/deepai.js';
export { ReplicateProvider } from '../providers/replicate.js';
export {
  AssetFoundry,
  createAssetFoundry,
} from './foundry.js';
export type { AssetFoundryResult, AssetFoundryOptions } from './foundry.js';
export {
  registerFoundryImageProviders,
  foundryBootstrapFromEnv,
} from './register.js';
export type { FoundryImageBootstrapOptions, DisabledImageProvider } from './register.js';
export { classifyAssetLicense, licensePasses } from './license.js';
export { compileForRequest, SpriteCompiler, TilesetCompiler, PixelArtCompiler } from './compilers.js';
export { runFoundryQA } from './qa.js';
export {
  emptyManifest,
  upsertManifestAsset,
  assertProductionComplete,
  summarizeManifest,
} from './manifest.js';
export type { FoundryManifest, FoundryCompletionMode } from './manifest.js';
export { AssetFoundryCache, cacheKeyFor, FOUNDRY_COMPILER_VERSION } from './cache.js';
export { buildFoundryPrompt, shouldTryRetrieval } from './prompts.js';
export { godotDestinationFor } from './godot-adapter.js';
export { NVIDIA_MODEL_CATALOG } from './nvidia-catalog.js';
export { scoreProvider } from './scoring.js';
export { imageModeFlags, generationModeToFoundryRouting } from './mode-flags.js';
export {
  ProviderUnavailableError,
  AuthenticationError,
  RateLimitError,
  QuotaExceededError,
  UnsupportedCapabilityError,
  LicenseRejectedError,
  GenerationFailedError,
  CompilationFailedError,
  QARejectedError,
  AssetMissingError,
} from './errors.js';
