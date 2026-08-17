export { QAValidator, RepairEngineer, gateState } from './validator.js';
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
export type { VisualRepairRecord } from './visual-repair.js';
export { evaluateTerrainProject, evaluateParallaxProject } from './visual-gates.js';
export { QualityRepairEngine } from './quality-repair-engine.js';
export type {
  QualityReport,
  QualityPlan,
  QualityIssue,
  RepairAction,
  QualityCategory,
  QualityScorecard,
} from './quality-types.js';
