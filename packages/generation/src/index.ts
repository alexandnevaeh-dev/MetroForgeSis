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
export {
  getStoryContent,
  updateQuest,
  updateDialogue,
  updateNarrative,
  buildStoryRewritePrompt,
  fallbackStoryProposal,
} from './story-edit.js';
export type {
  StoryContent,
  StoryProposeKind,
  StoryProposeRequest,
  StoryProposeResult,
} from './story-edit.js';
export {
  scaffoldManualProject,
  uniqueProjectDir,
} from './scaffold-manual-project.js';
export type {
  ScaffoldManualProjectOptions,
  ScaffoldManualProjectResult,
} from './scaffold-manual-project.js';
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
  descendantRelPaths,
} from './artifact-lineage.js';
export type { ArtifactLineage, LineageEdge } from './artifact-lineage.js';
export { visualExecutionGraph } from './visual-graph.js';
export { inheritDerivativeLicense } from './derivative-license.js';
export { scanGodotResourceGraph, assetPathToResPath } from './godot-resource-graph.js';
export type { GodotResourceGraph, GodotResourceReference } from './godot-resource-graph.js';
export { EditHistory } from './edit-history.js';
export {
  applyWorldEditAndRecompile,
  applyRoomEditAndRecompile,
  regenerateRoom,
  snapshotRoomRecord,
  restoreRoomRecord,
} from './project-edit-service.js';
export type { RoomEditPatch, ProjectEditResult } from './project-edit-service.js';
export { inspectPlacementForSave, saveAuthoredPlacement } from './live-placement-save.js';
export type { AuthoredPlacementIdentity, PlacementSaveSnapshot } from './live-placement-save.js';
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
export { writeVgf2VisualSliceReport } from './vgf2-report.js';
export { rescoreVisualSlice } from './rescan.js';
export type { RescoreVisualSliceResult } from './rescan.js';
export { reclassifyProjectAssetMaturity, RECLASSIFY_PREDICATE_VERSION } from './reclassify-asset-maturity.js';
export type {
  ReclassifyOptions,
  ReclassifyProjectAssetMaturityResult,
  ReclassifiedArtifactChange,
} from './reclassify-asset-maturity.js';
export {
  computeVisualEvidenceHash,
  buildCandidateVisualReviewPack,
  writeCandidateVisualReviewPack,
} from './candidate-review-pack.js';
export type { CandidateReviewPack } from './candidate-review-pack.js';
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
export * from './asset-qa.js';
export * from './asset-qa-command.js';
export { readEditableItems, saveEditableItem } from './item-edit-service.js';
export { readEditableLoot, saveEditableLoot, createEditableLoot } from './loot-edit-service.js';
