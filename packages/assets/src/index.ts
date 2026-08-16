export { encodePng, decodePngRgba, generateProceduralSprite, generateTilesetSource, generateWalkCycleSheet, generateHurtFlashSheet, generateAttackSheet, generateVfxTexture, knockoutVfxBackground } from './png.js';
export {
  generateParallaxStrip,
  punchParallaxAlpha,
  farPlateLooksLikeOutdoorLandscape,
  PARALLAX_LAYER_PROMPTS,
  PARALLAX_STRIP_SIZE,
} from './parallax-strip.js';
export type { ParallaxLayerName } from './parallax-strip.js';
export type { SpriteSpec, VfxSpec } from './png.js';
export { PixelArtProcessor } from './pixel-art-processor.js';
export type { PixelArtOptions, PixelArtResult } from './pixel-art-processor.js';
export { ComfyUIProvider } from './providers/comfyui.js';
export type { ComfyUIConfig } from './providers/comfyui.js';
export { DiffusersProvider } from './providers/diffusers.js';
export type { DiffusersConfig } from './providers/diffusers.js';
export { NvidiaImageProvider } from './providers/nvidia-image.js';
export { Automatic1111Provider } from './providers/automatic1111.js';
export { HuggingFaceImageProvider } from './providers/huggingface-image.js';
export { KenneyProvider, KENNEY_CATALOG } from './providers/kenney.js';
export { OpenGameArtProvider } from './providers/opengameart.js';
export { StabilityProvider } from './providers/stability.js';
export { DeepAIProvider } from './providers/deepai.js';
export { ReplicateProvider } from './providers/replicate.js';
export {
  AssetFoundry,
  createAssetFoundry,
  registerFoundryImageProviders,
  foundryBootstrapFromEnv,
  classifyAssetLicense,
  licensePasses,
  compileForRequest,
  runFoundryQA,
  emptyManifest,
  upsertManifestAsset,
  assertProductionComplete,
  AssetFoundryCache,
  buildFoundryPrompt,
  godotDestinationFor,
  NVIDIA_MODEL_CATALOG,
  scoreProvider,
  imageModeFlags,
  ProviderUnavailableError,
  AuthenticationError,
  RateLimitError,
  LicenseRejectedError,
  QARejectedError,
  AssetMissingError,
} from './foundry/index.js';
export type { FoundryImageBootstrapOptions, AssetFoundryResult, FoundryManifest } from './foundry/index.js';
export type { NvidiaImageConfig, NvidiaImageHealthDetails, NvidiaImageHealthStatus } from './providers/nvidia-image.js';
export {
  NvidiaInvalidImagePayloadError,
  NVIDIA_MIN_DECODED_IMAGE_BYTES,
  assertValidNvidiaImageBytes,
} from './providers/nvidia-image.js';
export type {
  ImageGenRequest,
  ImageGenResult,
  ImageGenerator,
  ImageConditioning,
  ImageConditioningMode,
  ImageProviderHealthStatus,
  ImageProviderHealthReport,
} from './types/image-gen.js';
export { healthReportIsSelectable, resolveImageProviderHealth } from './types/image-gen.js';
export {
  defaultConditioningStrength,
  resolveConditioningStrength,
  conditioningPayload,
} from './image-conditioning.js';
export { ImageProviderRegistry, explainImageProviderRouting, statusToLegacyHealth } from './image-router.js';
export type {
  ImageProviderRegistration,
  ImageRoutingContext,
  ImageSelectionResult,
  ImageRoutingExplanation,
} from './image-router.js';
export { VLMCritic, runDeterministicAssetChecks } from './vlm-critic.js';
export type { AssetCritiqueRequest, VLMCriticConfig, DeterministicAssetChecks } from './vlm-critic.js';
export { createVisionCritic } from './vision-critic-factory.js';
export type { VisionCritic, VisionCriticFactoryConfig } from './vision-critic-factory.js';
export { NvidiaVisionCritic } from './providers/nvidia-vision-critic.js';
export { critiqueAnimationSheet, critiqueTilesetSheet } from './animation-critic.js';
export type { AnimationKind, AnimationCritiqueOptions } from './animation-critic.js';
export { critiqueGameplayScreenshot, critiqueScreenshotDiversity } from './scene-critic.js';
export type { GameplayScreenshotCritique } from './scene-critic.js';
export { TileCompiler, TILE_ATLAS, tileRoleAt } from './tile-compiler.js';
export type { CompiledTileset, TileRole } from './tile-compiler.js';
export { REQUIRED_TILE_ROLES, buildTileTerrainMetadata, missingRequiredTileRoles } from './tile-roles.js';
export { buildPlayerAnimationManifest, poseNamesFromManifest } from './animation-manifest.js';
export type { AnimationManifest, AnimationStateSpec } from './animation-manifest.js';
export { critiqueAnimationIdentity, assembleContactSheet } from './sprite-qa.js';
export { nvidiaModelForImageTask, NVIDIA_FLUX_KONTEXT, NVIDIA_FLUX_DEV } from './image-task.js';
export { AssetPipeline, derivedSourceRelPath, compiledSpriteFrameSize, VFX_TEXTURES } from './asset-pipeline.js';
export type { AssetPipelineOptions, AssetPipelineResult, GeneratedAsset, CompiledSpriteKind } from './asset-pipeline.js';
export { sanitizeImagePromptText } from './sanitize-image-prompt.js';
