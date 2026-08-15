export * from './types.js';
export {
  ProviderRegistry,
  ModelRegistry,
  CapabilityRouter,
  FallbackManager,
} from './registry.js';
export { OllamaProvider } from './providers/ollama.js';
export type { OllamaConfig } from './providers/ollama.js';
export {
  OllamaEmbeddingProvider,
  createDeterministicEmbedder,
} from './providers/ollama-embeddings.js';
export type { OllamaEmbeddingConfig } from './providers/ollama-embeddings.js';
export { PiperTtsProvider } from './providers/piper-tts.js';
export type { PiperTtsConfig } from './providers/piper-tts.js';
export {
  WhisperAsrProvider,
  resolveWhisperModelPath,
} from './providers/whisper-asr.js';
export type { WhisperAsrConfig } from './providers/whisper-asr.js';
export {
  cosineSimilarity,
  rankMemoryChunks,
  formatMemoryContext,
} from './project-memory.js';
export type { ProjectMemoryChunk, ProjectMemoryIndex } from './project-memory.js';
export { GeminiProvider } from './providers/gemini.js';
export { GroqProvider } from './providers/groq.js';
export { OpenRouterProvider } from './providers/openrouter.js';
export { HuggingFaceProvider } from './providers/huggingface.js';
export { NvidiaProvider, NvidiaProviderError } from './providers/nvidia.js';
export type { NvidiaErrorCode, NvidiaHealthDetails, NvidiaProviderConfig } from './providers/nvidia.js';
export {
  reconcileModelCatalog,
  reconcileCatalogEntries,
  fetchLiveModelIdsByProvider,
} from './catalog-reconciliation.js';
export type { ReconciledCatalogEntry } from './catalog-reconciliation.js';
export { bootstrapProviders, listProviderStatus } from './bootstrap.js';
export { ProviderHealthMonitor } from './provider-health-monitor.js';
export type { ProviderHealthSnapshot, ImageProviderHealthInput } from './provider-health-monitor.js';
export type { ProviderBootstrapConfig, ProviderBootstrapResult } from './bootstrap.js';
export {
  generateGameDNA,
  createDeterministicGameDNA,
} from './generators/game-dna.js';
export type { GameDNAInput, GameDNATextSource } from './generators/game-dna.js';
export { HardwareProfiler, getStarterPack } from './hardware-profiler.js';
export { ModelCatalogService, rankModelsForCapability, explainModelRouting } from './model-catalog.js';
export type {
  RankedModel,
  RoutableModelEntry,
  ModelRoutingExplanation,
  ModelRoutingCandidate,
  ModelRoutingRejection,
} from './model-catalog.js';
export { ModelScout } from './model-scout.js';
export type { ScoutOptions } from './model-scout.js';
export { ModelBenchmarkService } from './model-benchmark.js';
export type { BenchmarkResult } from './model-benchmark.js';
export { GenerationRouter, createGenerationRouter, CAPABILITY_TO_AI_CAPABILITY } from './generation-router.js';
export type { GenerationRequest, GenerationResponse } from './generation-router.js';
export {
  buildTextRoutingContext,
  modeRegistersHostedProviders,
  modeRoutingFlags,
  DEFAULT_LOW_VRAM_BUDGET_MB,
} from './mode-routing.js';
export { LicenseRouter } from './license-router.js';
export type { LicenseStatus, LicenseClassification, LicenseSubject } from './license-router.js';
export { auditExportLicense, buildAttributionsMarkdown } from './export-license-audit.js';
export type { ExportLicenseAudit, ExportLicenseArtifactAudit } from './export-license-audit.js';
export {
  PROVIDER_LICENSE_DEFAULTS,
  COMPILER_PROVIDERS,
  resolveArtifactLicense,
  licenseFieldsForProvider,
  licenseFieldsForArtifact,
  repairManifestArtifactLicenses,
} from './provider-license-metadata.js';
export type { ManifestArtifactLicenseInput } from './provider-license-metadata.js';
export {
  ModelDownloadManager,
  OllamaDownloadAdapter,
  HuggingFaceDownloadAdapter,
  DiffusersDownloadAdapter,
  InvalidModelIdentifierError,
  assertSafeModelIdentifier,
} from './model-download-manager.js';
export {
  SpeechModelDownloadAdapter,
  SPEECH_MODEL_BUNDLES,
  isSpeechModelInstalled,
  assertAllowedSpeechModelUrl,
} from './speech-model-download.js';
export type { DownloadRequest, DownloadProgress, DownloadAdapter } from './model-download-manager.js';
export {
  ProviderPluginRegistry,
  LEGACY_CAPABILITY_MAP,
} from './provider-plugin.js';
export type {
  ProviderPlugin,
  ImageGenerationProvider,
  VisionAnalysisProvider,
  AudioGenerationProvider,
  BackgroundRemovalProvider,
  SegmentationProvider,
  EmbeddingProvider,
  SpeechGenerationProvider,
  SpeechGenerationRequest,
  SpeechGenerationResponse,
  SpeechRecognitionProvider,
  SpeechRecognitionRequest,
  SpeechRecognitionResponse,
  ImageGenerationProfile,
} from './provider-plugin.js';
