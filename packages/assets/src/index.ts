export { encodePng, decodePngRgba, generateProceduralSprite, generateTilesetSource, generateWalkCycleSheet, generateHurtFlashSheet, generateAttackSheet, generateVfxTexture, knockoutVfxBackground } from './png.js';
export type { SpriteSpec, VfxSpec } from './png.js';
export { PixelArtProcessor } from './pixel-art-processor.js';
export type { PixelArtOptions, PixelArtResult } from './pixel-art-processor.js';
export { ComfyUIProvider } from './providers/comfyui.js';
export type { ComfyUIConfig } from './providers/comfyui.js';
export { DiffusersProvider } from './providers/diffusers.js';
export type { DiffusersConfig } from './providers/diffusers.js';
export { NvidiaImageProvider } from './providers/nvidia-image.js';
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
export { critiqueGameplayScreenshot } from './scene-critic.js';
export type { GameplayScreenshotCritique } from './scene-critic.js';
export { AssetPipeline, derivedSourceRelPath, compiledSpriteFrameSize, VFX_TEXTURES } from './asset-pipeline.js';
export type { AssetPipelineOptions, AssetPipelineResult, GeneratedAsset, CompiledSpriteKind } from './asset-pipeline.js';
export { sanitizeImagePromptText } from './sanitize-image-prompt.js';
