export {
  encodePng,
  decodePngRgba,
  generateProceduralSprite,
  generateTilesetSource,
  generateWalkCycleSheet,
  generateRunCycleSheet,
  generateHurtFlashSheet,
  generateAttackSheet,
  generateVfxTexture,
  knockoutVfxBackground,
  computeFrameQualityMetrics,
  countLowerBodyBlobs,
  hasMultiLegSmear,
  generateProgressionSheet,
  generateDeathSheet,
  generatePoseStill,
  extractSheetFramePng,
  compileBossCombatSheets,
  POSE_TRANSFORMS,
} from './png.js';
export type { ProgressionSheetOptions, AttackArcKind, PoseTransformSpec } from './png.js';
export {
  PLAYER_ANIMATION_SPEC,
  PLAYER_ANIMATION_NAMES,
  buildAnimationMetadataSidecar,
  attackTimingToSync,
  attackEventsFromTiming,
} from './player-animation-spec.js';
export type {
  PlayerAnimationDefinition,
  PlayerAnimationGenerationMode,
  AttackSyncMetadata,
  AttackTiming,
  AnimationEvent,
  AnimationEventId,
  AnimationMetadataSidecar,
  AnimationClipSidecarEntry,
} from './player-animation-spec.js';
export { BOSS_ANIMATION_SPEC, buildBossAnimationSidecar } from './boss-animation-spec.js';
export {
  createAssetGenerationGateway,
  classifyFailure,
  isFallbackEligible,
  LegacyAssetGenerationGateway,
  FoundryAssetGenerationGateway,
  CompositeAssetGenerationGateway,
} from './gateway/index.js';
export type {
  AssetGenerationBackend,
  AssetGenerationBackendId,
  AssetGenerationRequest,
  AssetGenerationOutcome,
  AssetGenerationSuccess,
  AssetGenerationFailure,
  AssetGenerationFailureClass,
  AssetGenerationLicense,
  AssetGenerationDiagnostics,
  AssetGenerationGateway,
} from './gateway/index.js';
export {
  generateParallaxStrip,
  punchParallaxAlpha,
  farPlateLooksLikeOutdoorLandscape,
  PARALLAX_LAYER_PROMPTS,
  PARALLAX_STRIP_SIZE,
} from './parallax-strip.js';
export type { ParallaxLayerName } from './parallax-strip.js';
export type { SpriteSpec, VfxSpec, FrameQualityMetrics } from './png.js';
export {
  generateTopDownPlayerSheet,
  topDownPlayerFrameCount,
  TOP_DOWN_FACINGS,
} from './topdown-player-sprites.js';
export type { TopDownAction, TopDownFacing } from './topdown-player-sprites.js';
export { canopyEnvironment, canopyTerrainV2, CANOPY_PROP_KINDS } from './topdown-canopy-environment.js';
export { decorateCanopyWorld } from './canopy-room-decoration.js';
export { shouldUseCanopyEnvironment } from './canopy-environment-selection.js';
export { generateStormglassPlayerSheet, stormglassFrameCount } from './sideview-stormglass-player.js';
export type { StormglassAction } from './sideview-stormglass-player.js';
export { generateStormglassTileset, STORMGLASS_ATLAS_HEIGHT, STORMGLASS_ATLAS_WIDTH, STORMGLASS_TILE_SIZE } from './sideview-stormglass-tileset.js';
export { generateStormglassBackground } from './sideview-stormglass-backgrounds.js';
export type { StormglassBackgroundLayer } from './sideview-stormglass-backgrounds.js';
export {
  generateStormglassEnemySheet,
  generateStormglassNpcSheet,
  generateStormglassGuardianSheet,
  generateStormglassProp,
  stormglassEnemyFrameCount,
  stormglassNpcFrameCount,
  stormglassGuardianFrameCount,
} from './sideview-stormglass-cast.js';
export type {
  StormglassEnemyAction,
  StormglassNpcAction,
  StormglassGuardianAction,
} from './sideview-stormglass-cast.js';
export {
  generateTopDownWoodlandTileset,
  WOODLAND_ATLAS_COLUMNS,
  WOODLAND_ATLAS_ROWS,
  WOODLAND_TILE_SIZE,
} from './topdown-woodland-tileset.js';
export {
  PixelArtProcessor,
  fitOpaqueIntoFrame,
  opaquePixelBounds,
  pickActorSubjectBounds,
  addSilhouetteOutline,
  SILHOUETTE_ACCENT_CYAN,
} from './pixel-art-processor.js';
export type { PixelArtOptions, PixelArtResult, OpaqueBounds } from './pixel-art-processor.js';
export { ComfyUIProvider } from './providers/comfyui.js';
export type { ComfyUIConfig } from './providers/comfyui.js';
export { validateComfyUIWorkflowContract } from './providers/comfyui-workflow-contract.js';
export type {
  ComfyUIWorkflowContract,
  ComfyUIWorkflowValidation,
} from './providers/comfyui-workflow-contract.js';
export { DiffusersProvider } from './providers/diffusers.js';
export type {
  DiffusersConfig,
  PromptBudgetResult,
  PromptSideBudget,
  SegmentForegroundResult,
} from './providers/diffusers.js';
export {
  APPLE_NATIVE_MPS_PROFILE,
  createAppleNativeMpsProvider,
  appleNativeMpsRegistration,
} from './providers/apple-native-mps-profile.js';
export {
  APPLE_NATIVE_MPS_PROFILE_V2,
  CURATED_STYLE_V2,
  CURATED_NEGATIVE_PROMPT_V2,
  CURATED_NEGATIVE_PROMPT_V2_NO_SCENERY,
  CURATED_NEGATIVE_PROMPT_V2_NO_DUPLICATE,
  APPLE_NATIVE_MPS_V2_SUBJECTS,
  createAppleNativeMpsProviderV2,
  curatedArtDirectionV2,
  createForegroundIsolationProvider,
} from './providers/apple-native-mps-profile.js';
export {
  DreamOProvider,
  LocalVisualFleetProvider,
  PulidProvider,
  QwenImageEditProvider,
} from './providers/local-visual-fleet.js';
export type { LocalVisualFleetConfig } from './providers/local-visual-fleet.js';
export { NvidiaImageProvider } from './providers/nvidia-image.js';
export { LocalSpriteWorkerProvider } from './providers/local-sprite-worker.js';
export { LocalSpriteWorkerImageAdapter } from './providers/local-sprite-worker-adapter.js';
export type {
  LocalAssetEngineCapabilities,
  LocalCharacterSheetRequest,
  LocalCharacterSheetResult,
  LocalAssetEngineError,
} from './providers/local-sprite-worker.js';
export {
  buildLocalCharacterSheetManifest,
  ManifestValidationError,
} from './local-asset-manifest.js';
export type { LocalAssetManifest } from './local-asset-manifest.js';
export { NvidiaImageEditProvider } from './providers/nvidia-image-edit.js';
export { Automatic1111Provider } from './providers/automatic1111.js';
export { HuggingFaceImageProvider } from './providers/huggingface-image.js';
export { PollinationsImageProvider } from './providers/pollinations-image.js';
export type { PollinationsImageConfig } from './providers/pollinations-image.js';
export { ensurePngBuffer, isPngBuffer, isJpegBuffer } from './image-format.js';
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
export type {
  FoundryImageBootstrapOptions,
  AssetFoundryResult,
  FoundryManifest,
} from './foundry/index.js';
export type {
  NvidiaImageConfig,
  NvidiaImageHealthDetails,
  NvidiaImageHealthStatus,
} from './providers/nvidia-image.js';
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
export type {
  ImageEditRequest,
  ImageEditResult,
  ImageEditPurpose,
  AssetReference,
  GeneratedImage,
  EditGenerationProvenance,
  ImageEditor,
} from './types/image-edit.js';
export {
  defaultConditioningStrength,
  resolveConditioningStrength,
  conditioningPayload,
} from './image-conditioning.js';
export {
  ImageProviderRegistry,
  explainImageProviderRouting,
  statusToLegacyHealth,
} from './image-router.js';
export type {
  ImageProviderRegistration,
  ImageRoutingContext,
  ImageSelectionResult,
  ImageRoutingExplanation,
} from './image-router.js';
export {
  evaluateVramFit,
  usableVramMb,
  effectiveVramBudgetMb,
  LOCAL_GPU_IMAGE_ESTIMATED_VRAM_MB,
  LOCAL_IMAGE_EDIT_ESTIMATED_VRAM_MB,
} from './foundry/vram.js';
export type { ImageHardwareSnapshot, VramFitResult } from './foundry/vram.js';
export {
  ASSET_QUALITY_PROFILES,
  resolveAssetQualityProfile,
  qualityProfileForGenerationMode,
} from './foundry/quality-profiles.js';
export { VLMCritic, runDeterministicAssetChecks } from './vlm-critic.js';
export type {
  AssetCritiqueRequest,
  VLMCriticConfig,
  DeterministicAssetChecks,
} from './vlm-critic.js';
export { HttpRemoteVisualWorkerClient } from './execution/http-worker-client.js';
export {
  sha256Bytes,
  sourceImageFromPath,
  RemoteWorkerError,
  ProviderGpuOomError,
  DEFAULT_REMOTE_WORKER_TIMEOUTS,
} from './execution/remote-worker.js';
export type {
  ExecutionTarget,
  ExecutionTargetType,
  RemoteSourceImage,
  RemoteVisualRequest,
  RemoteVisualResult,
  RemoteVisualWorkerClient,
  RemoteModelState,
  RemoteWorkerTimeouts,
  GpuOomDetail,
  CostTier,
} from './execution/remote-worker.js';
export { RunPodExecutionBackend } from './execution/runpod.js';
export type {
  RunPodConfig,
  RunPodDoctorReport,
  RunPodReadiness,
  RunPodDeploymentMode,
} from './execution/runpod.js';
export {
  HuggingFaceSpaceExecutionBackend,
  DEFAULT_HF_SPACE_TIMEOUTS,
  HF_QWEN_DETERMINISTIC_INFER,
  serializeHfGalleryInput,
  buildHfInferPayload,
  createHfSessionHash,
  promptSha256,
  wrapHfTransportError,
  HfTransportError,
  HfStageError,
} from './execution/huggingface-space.js';
export type {
  HuggingFaceSpaceConfig,
  HuggingFaceSpaceDoctorReport,
  HfSpaceApiSchema,
  HfSpaceProviderState,
  HfSpaceReadiness,
  HfSpaceErrorCode,
  HfSpaceTimeouts,
  HfGradioFileData,
  HfGalleryImageEntry,
  HfSpaceApiInput,
  HfNetworkStage,
} from './execution/huggingface-space.js';
export { LightningExecutionBackend } from './execution/lightning.js';
export type {
  LightningConfig,
  LightningDoctorReport,
  LightningReadiness,
} from './execution/lightning.js';
export { kaggleNotebookDoctor, colabNotebookDoctor } from './execution/dev-profiles.js';
export type {
  KaggleNotebookConfig,
  KaggleNotebookReport,
  ColabNotebookConfig,
  ColabNotebookReport,
} from './execution/dev-profiles.js';
export { selectFreeExecutionRoute } from './execution/free-routing.js';
export type { FreeRoutableBackend, FreeRoutingDecision } from './execution/free-routing.js';
export { createVisionCritic } from './vision-critic-factory.js';
export { referenceStatusForRegistration } from './identity/reference-capabilities.js';
export type {
  ReferenceReadiness,
  ReferenceProviderStatus,
} from './identity/reference-capabilities.js';
export type { VisionCritic, VisionCriticFactoryConfig } from './vision-critic-factory.js';
export { NvidiaVisionCritic } from './providers/nvidia-vision-critic.js';
export {
  validateHostedImageRequest,
  hostedRequestBody,
  hostedEditRequestBody,
  encodeNvidiaReferenceImage,
  buildNimImageEditMultipart,
  extractNimEditImageBytes,
  parseNvidiaErrorBody,
  classifyNvidiaHttpFailure,
} from './providers/nvidia-image-contract.js';
export type {
  NvidiaImageEndpointFamily,
  NvidiaImageErrorCategory,
  NvidiaProviderDiagnostic,
  NormalizedNvidiaImageRequest,
  NormalizedNvidiaEditRequest,
} from './providers/nvidia-image-contract.js';
export {
  resolveNvidiaDeploymentConfig,
  resolveCapabilityDeployment,
  probeNvidiaNimHealth,
  remoteNimRequirements,
  classifyNimErrorFromMessage,
  resolveNimApiKey,
  evaluateNimEditPreflightGate,
  normalizeNimBaseUrl,
  buildNimEndpoint,
} from './providers/nvidia-nim.js';
export type {
  NvidiaDeploymentConfig,
  NvidiaCapabilityDeployment,
  NvidiaNimHealthReport,
  NvidiaNimLifecycleState,
  NvidiaCombinedDoctorReport,
  NvidiaNimEditPreflightGate,
} from './providers/nvidia-nim.js';
export {
  resolveNvidiaConfig,
  buildNvidiaProvenance,
  toNvidiaPersistedAssetRecord,
  hashNvidiaPrompt,
  catalogSummary,
  nvidiaModelsForCapability,
  assertNoSecretLeak,
} from './providers/nvidia-foundation.js';
export type {
  NvidiaResolvedConfig,
  NvidiaDoctorReport,
  NvidiaDoctorReadiness,
  NvidiaAssetProvenance,
  NvidiaPersistedAssetRecord,
  NvidiaCapabilityId,
  TextGenerationCapabilityRequest,
  VisionAnalyzeRequest,
  VideoGenerationRequest,
  ThreeDGenerationRequest,
} from './providers/nvidia-foundation.js';
export { NvidiaHttpClient } from './providers/nvidia-http.js';
export type {
  NvidiaHttpClientOptions,
  NvidiaHttpRequestOptions,
  NvidiaHttpResponse,
  NvidiaMultipartFilePart,
} from './providers/nvidia-http.js';
export {
  NvidiaCapabilityAdapter,
  NvidiaProvider,
  NvidiaStructuredError,
  classifyNvidiaErrorCode,
  nvidiaErrorFromHttpStatus,
} from './providers/nvidia-provider.js';
export type {
  NvidiaFoundationErrorCode,
  NvidiaStructuredErrorInfo,
} from './providers/nvidia-provider.js';
export {
  nvidiaEnabledModels,
  nvidiaModelById,
  nvidiaSelectModelForImageTask,
} from './foundry/nvidia-catalog.js';
export type {
  NvidiaModelDescriptor,
  NvidiaDeploymentType,
  NvidiaModelStatus,
} from './foundry/nvidia-catalog.js';
export { nvidiaSupportsReference, nvidiaSupportsEditing } from './image-task.js';
export {
  registerInitialAssetVersion,
  createEditAssetVersion,
  getAssetHistory,
  acceptAssetVersion,
  rejectAssetVersion,
  revertToAssetVersion,
  preserveSourceAsset,
  loadAssetVersionIndex,
  hashInstruction,
} from './asset-versioning.js';
export type {
  AssetVersionRecord,
  EditOperationRecord,
  AssetVersionIndex,
  AssetVersionStatus,
  AssetOperationType,
} from './asset-versioning.js';
export { critiqueAnimationSheet, critiqueTilesetSheet } from './animation-critic.js';
export type { AnimationKind, AnimationCritiqueOptions } from './animation-critic.js';
export { critiqueGameplayScreenshot, critiqueScreenshotDiversity } from './scene-critic.js';
export type { GameplayScreenshotCritique } from './scene-critic.js';
export {
  evaluateSpriteDimensions,
  classifySpriteKind,
  SPRITE_SIZE_CLASSES,
  expectedGridSize,
  validateTechnicalPng,
} from './asset-normalizer.js';
export type {
  SpriteSizeClass,
  NormalizationViolation,
  TechnicalImageValidation,
} from './asset-normalizer.js';
export { TileCompiler, TILE_ATLAS, tileRoleAt, softenCompiledAtlasSeams } from './tile-compiler.js';
export type { CompiledTileset, TileRole } from './tile-compiler.js';
export { pickTerrainVariant, variantAtlasForCell, TERRAIN_VARIANT_ROLES } from './tile-variants.js';
export { generateUiPanel, generateUiIcon, UI_FOUNDRY_ASSETS } from './ui-foundry.js';
export {
  generatePropSprite,
  WORLD_INTERACTABLE_ASSETS,
  interactablePalette,
  actorPalette,
  npcActorPalette,
  environmentDecorationPalette,
} from './prop-art.js';
export {
  wrapIdentityProvider,
  capabilitiesFromRegistration,
  selectAnimationTier,
  NVIDIA_KONTEXT_CUSTOM_REFERENCE_SUPPORTED,
  IdentityProviderUnavailableError,
} from './identity/provider.js';
export type {
  IdentityPreservingImageProvider,
  IdentityGenerationRequest,
  PoseGenerationRequest,
} from './identity/provider.js';
export { writeCharacterIdentityPack, identityPackDir } from './identity/pack.js';
export {
  REQUIRED_TILE_ROLES,
  buildTileTerrainMetadata,
  missingRequiredTileRoles,
} from './tile-roles.js';
export { buildPlayerAnimationManifest, poseNamesFromManifest } from './animation-manifest.js';
export type { AnimationManifest, AnimationStateSpec } from './animation-manifest.js';
export { critiqueAnimationIdentity, assembleContactSheet } from './sprite-qa.js';
export { nvidiaModelForImageTask, NVIDIA_FLUX_KONTEXT, NVIDIA_FLUX_DEV } from './image-task.js';
export {
  AssetPipeline,
  derivedSourceRelPath,
  compiledSpriteFrameSize,
  VFX_TEXTURES,
  proceduralProductionIntent,
  inferAssetTypeFromPath,
} from './asset-pipeline.js';
export type {
  AssetPipelineOptions,
  AssetPipelineResult,
  GeneratedAsset,
  CompiledSpriteKind,
} from './asset-pipeline.js';
export * from './pipeline-v2/index.js';
export { sanitizeImagePromptText } from './sanitize-image-prompt.js';
export {
  shouldUseFoundryCourierKit,
  shouldUseSporeScoutKit,
  resolveAuthoredSideViewKit,
  AUTHORED_COURIER_PROVIDER,
  AUTHORED_COURIER_LICENSE,
  loadAuthoredCourierPng,
  loadAuthoredMasonryPng,
  loadAuthoredBiomePng,
  loadAuthoredCastPng,
  loadAuthoredFoundryTileset,
  loadAuthoredSporePng,
  loadAuthoredSporeTileset,
  loadAuthoredKitActorPng,
  loadAuthoredKitTileset,
  authoredKitBiomeStem,
  sporeBiomeStem,
} from './authored-kit.js';
export type { AuthoredSideViewKitId } from './authored-kit.js';
export {
  planAssetReplacements,
  buildReplacementPrompt,
  runVisualEnhancementPass,
  VisualProviderCircuitBreaker,
  classifyVisualFailure,
  isRetryableWithinProvider,
  isTerminalForProvider,
  DEFAULT_VISUAL_PROVIDER_EXECUTION_POLICY,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './visual-enhancement/index.js';
export type {
  VisualAssetFamily,
  ReplacementStrategy,
  ReplacementPriority,
  AssetReplacementPlan,
  AssetOrigin,
  AssetReplacementOutcome,
  AssetValidationResult,
  VisualEnhancementSummary,
  PlannerBaselineAsset,
  PlanReplacementsInput,
  PromptBuilderContext,
  RunVisualEnhancementInput,
  VisualFailureCategory,
  VisualProviderExecutionPolicy,
  CircuitState,
  CircuitBreakerConfig,
  VisualProviderCandidate,
  ProviderAttemptRecord,
  ProviderRunReport,
} from './visual-enhancement/index.js';
export {
  REFERENCE_LIBRARY_DIR,
  VisualReferenceLibraryError,
  loadVisualReferenceLibrary,
  resolveVisualReferenceTemplate,
  templatesForRole,
  resolveSubjectTemplate,
  buildTemplatePrompt,
  checkTemplateTokenBudget,
  resolveConditioning,
  hexToRgb,
  archetypeForTemplate,
  roleForArchetype,
  templateFillAccent,
  templateTilesetStyle,
  templateBackgroundPalette,
  templatePropFillAccent,
} from './visual-templates/index.js';
export type {
  TemplateSelector,
  TokenBudgetResult,
  PromptBudgetChecker,
  ConditioningCapableRegistration,
  ConditioningResolution,
} from './visual-templates/index.js';
export {canopyActor,canopyEffect,canopyIcon,canopyPickup,buildCanopyActorFamily,canopyEffectMetadata,CANOPY_ACTION_FRAMES,CANOPY_EFFECT_IDS} from './topdown-canopy-art.js';
