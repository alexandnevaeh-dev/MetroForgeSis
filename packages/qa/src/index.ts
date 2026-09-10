export { QAValidator, RepairEngineer, gateState, validateWorldSceneArchetypeIntegrity } from './validator.js';
export type { QAGateResult, QAReport, QAGateState } from './validator.js';
export { deriveValidationLevel } from './validation-level.js';
export type { ValidationLevel } from './validation-level.js';
export { parseSmokeTestOutput, smokeTestPassed } from './smoke-output.js';
export type { ParsedSmokeOutput, SmokeCheckResult } from './smoke-output.js';
export {
  captureGameplayScreenshots,
  needsWindowedCaptureFallback,
  headlessTextureNull,
} from './gameplay-capture.js';
export type { GameplayCaptureStrategy, GameplayCaptureTelemetry } from './gameplay-capture.js';
export { parsePlaytestOutput, parsePlaytestTelemetry, playtestPassed, summarizePlaytestBalance } from './playtest-output.js';
export type { ParsedPlaytestOutput, PlaytestCheckResult, PlaytestTelemetry } from './playtest-output.js';
export { buildAcceptanceReport, formatAcceptanceReport } from './acceptance-report.js';
export type { AcceptanceReport } from './acceptance-report.js';
export { runProjectAcceptance } from './run-acceptance.js';
export type { RunProjectAcceptanceOptions } from './run-acceptance.js';
export { runQualityPass } from './quality-pass.js';
export type { QualityPassOptions } from './quality-types.js';
export { QualityDirector } from './quality-director.js';
export { scoreVisualQuality, fingerprintFile, mapDefectToRepair, VISUAL_QUALITY_GATES, VISUAL_REPAIR_BUDGET } from './visual-quality.js';
export type { VisualQaInputs, VisualQaResult } from './visual-quality.js';
export { planVisualRepairs, applyVisualRepairs } from './visual-repair.js';
export { classifyAssetTier, certifyVisualAssets, writeAssetFoundryReport, readAssetFoundryReport, DEFAULT_VISUAL_CERTIFICATION_POLICY } from './asset-foundry-quality.js';
export type { AssetQualityRecord, AssetFoundryQualityReport, VisualCertificationPolicy } from './asset-foundry-quality.js';
export { buildAssetProvenanceReport, classifyAssetProvenance, writeAssetProvenanceReport } from './asset-provenance-report.js';
export type { AssetProvenanceCategory, AssetProvenanceInput, AssetProvenanceRecord, AssetProvenanceReport } from './asset-provenance-report.js';
export { buildProductionAssetFamilies, productionSliceReady } from './production-family.js';
export type { FamilyAssetInput } from './production-family.js';
export type { VisualRepairRecord } from './visual-repair.js';
export { evaluateTerrainProject, evaluateParallaxProject } from './visual-gates.js';
export {
  aggregateIndependentGates,
  evaluateCharacterScale,
  evaluateProjectPresentation,
  loadPublishedRooms,
  detectDebugHud,
  DEFAULT_CHARACTER_SCALE,
} from './presentation-gates.js';
export type { IndependentQualityGates, CharacterScaleProfile } from './presentation-gates.js';
export { QualityRepairEngine } from './quality-repair-engine.js';
export type {
  QualityReport,
  QualityPlan,
  QualityIssue,
  RepairAction,
  QualityCategory,
  QualityScorecard,
} from './quality-types.js';
