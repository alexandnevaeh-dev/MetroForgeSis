export { assertPhaseArtifacts, phaseCompleteStatus } from './phase-contract.js';
export type { PhaseArtifactCheck } from './phase-contract.js';
export { GenerationPipeline } from './pipeline.js';
export type { GenerateOptions, GenerateResult } from './pipeline.js';
export * from './events.js';
export * from './progress.js';
export * from './world-edit.js';
export { generateManualAsset } from './manual-asset.js';
export type { ManualAssetRequest, ManualAssetResult, ManualAssetType } from './manual-asset.js';
export { loadProjectContext } from './project-loader.js';
export type {
  LoadedProject,
  PlaytestRouteSummary,
  PlaytestTelemetryRecord,
  ProjectMemorySummary,
} from './project-loader.js';
export { buildDependencyGraph, findAssetUsages } from './dependency-graph.js';
export {
  lineageFromArtifact,
  defaultCharacterLineageEdges,
  descendantsOf,
  markDescendantsDirty,
} from './artifact-lineage.js';
export type { ArtifactLineage, LineageEdge } from './artifact-lineage.js';
export { inheritDerivativeLicense } from './derivative-license.js';
export { scanGodotResourceGraph, assetPathToResPath } from './godot-resource-graph.js';
export type { GodotResourceGraph, GodotResourceReference } from './godot-resource-graph.js';
export { EditHistory } from './edit-history.js';
export {
  applyWorldEditAndRecompile,
  applyRoomEditAndRecompile,
  regenerateRoom,
} from './project-edit-service.js';
export * from './interactive-generation.js';
export { parseProjectCommand } from './ai-commands.js';
export type { ProjectCommand, CommandContext } from './ai-commands.js';
export { recordAssetVersion, listAssetHistory, restoreAssetVersion } from './asset-history.js';
export type { AssetVersionRecord } from './asset-history.js';
export { assessPreviewReadiness } from './preview-readiness.js';
export type { PreviewReadiness } from './preview-readiness.js';
export {
  createProjectCheckpoint,
  listProjectCheckpoints,
  restoreProjectCheckpoint,
  deleteProjectCheckpoint,
} from './project-checkpoint.js';
export type { ProjectCheckpoint } from './project-checkpoint.js';
export { analyzeProjectCompletion, evaluateAssetProductionGate } from './project-completion.js';
export type {
  ProjectCompletionStatus,
  CompletionChecklistItem,
  AssetProductionGateResult,
} from './project-completion.js';
export {
  backfillArtifactMaturityFields,
  backfillManifestMaturity,
  backfillProjectAssetMaturity,
  artifactNeedsMaturityBackfill,
} from './backfill-asset-maturity.js';
export type {
  BackfillAssetMaturityResult,
  GenerationManifestFile,
  ManifestArtifact,
} from './backfill-asset-maturity.js';
export { remapProjectAbilities, remapGameDnaAbilities, remapProjectAbilityReferences } from './remap-project-abilities.js';
export type {
  RemapProjectAbilitiesResult,
  RemapGameDnaResult,
} from './remap-project-abilities.js';
export {
  readProjectMeta,
  getProjectAllowPlaceholders,
  setProjectAllowPlaceholders,
} from './project-meta.js';
export type { ProjectMetaResult } from './project-meta.js';
export { buildAssetCoverageReport } from './asset-coverage.js';
export type { AssetCoverageReport, AssetCoverageEntry } from './asset-coverage.js';
export { runProjectAcceptance, formatAcceptanceReport } from './run-acceptance.js';
export { runQualityPass } from '@metroforge/qa';
export type { AcceptanceReport, RunProjectAcceptanceOptions } from './run-acceptance.js';
export {
  GenerationCancelledError,
  mergeAbortSignal,
  throwIfCancelled,
} from '@metroforge/shared';
export { parseProjectCommandWithLlm } from './ai-commands-llm.js';
export type { LlmCommandSource, LlmCommandContext } from './ai-commands-llm.js';
export { writeVisualSliceReviewRequired, applyVisualReviewDecision, visualReviewPath } from './visual-review.js';
export { writeVisualSliceReports, collectVisualSliceEvidence } from './visual-slice-report.js';
export {
  buildProjectMemoryIndex,
  loadProjectMemoryIndex,
  queryProjectMemory,
  queryProjectMemoryWithIndex,
  PROJECT_MEMORY_FILENAME,
} from './project-memory-service.js';
export {
  synthesizeDialogueVoices,
  resolvePiperModelPath,
  voiceFileKey,
  voiceResPath,
} from './dialogue-voice.js';
export type { DialogueVoiceResult, SynthesizeDialogueVoicesOptions } from './dialogue-voice.js';
