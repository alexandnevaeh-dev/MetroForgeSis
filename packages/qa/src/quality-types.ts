/** P7 typed quality director contracts — analysis and repair commands only. */

export const QUALITY_CATEGORIES = [
  'VISUAL_COHERENCE',
  'ROOM_COMPOSITION',
  'DEPTH',
  'LIGHTING',
  'CONTRAST',
  'READABILITY',
  'COMBAT_JUICE',
  'CAMERA',
  'TRANSITIONS',
  'HUD',
  'AUDIO',
  'VFX_INTEGRATION',
  'PACING',
  'REPETITION',
] as const;

export type QualityCategory = (typeof QUALITY_CATEGORIES)[number];

export type QualityTier = 'LOW' | 'MEDIUM' | 'HIGH';

export type QualitySeverity = 'info' | 'warn' | 'error';

export interface QualityIssue {
  id: string;
  category: QualityCategory;
  severity: QualitySeverity;
  title: string;
  evidence: string;
  metric?: string;
  beforeValue?: number | string | boolean;
  target?: number | string | boolean;
}

export type RepairKind =
  | 'INSTALL_RUNTIME_SCRIPTS'
  | 'PATCH_PROJECT_AUTOLOADS'
  | 'WRITE_QUALITY_PROFILE'
  | 'APPLY_LIGHTING_PROFILE'
  | 'APPLY_CAMERA_PROFILE'
  | 'APPLY_COMBAT_FEEDBACK'
  | 'APPLY_AUDIO_BUS_MIX'
  | 'APPLY_TRANSITION_FADE'
  | 'POLISH_HUD'
  | 'INSTALL_READABILITY_OUTLINE'
  | 'AUDIT_VFX_INTEGRATION'
  | 'PLACE_ROOM_DECOR'
  | 'TWEAK_ROOM_PACING'
  | 'SET_CLEAR_COLOR';

export interface RepairAction {
  kind: RepairKind;
  category: QualityCategory;
  reason: string;
  payload: Record<string, unknown>;
}

export interface QualityBudgets {
  maxRegenerationsPerAsset: number;
  maxQualityPassesPerRoom: number;
  maxGlobalRepairCycles: number;
  rollbackMargin: number;
}

export const DEFAULT_QUALITY_BUDGETS: QualityBudgets = {
  maxRegenerationsPerAsset: 0,
  maxQualityPassesPerRoom: 1,
  maxGlobalRepairCycles: 2,
  rollbackMargin: 5,
};

export interface QualitySnapshot {
  criticScore: number;
  lumaStdDev: number;
  uniqueColors: number;
  occupancy: number;
  criticPassed: boolean;
  criticIssues: string[];
  screenshotStrategy?: string;
}

export interface QualityScorecard {
  qualityScore: number;
  technicalScore: number;
  presentationScore: number;
  breakdown: Record<string, number>;
}

export interface QualityProvenanceSummary {
  commercialSafe: boolean;
  placeholderCount: number;
  rejectedDeathSheets: number;
  nvidiaVfxCount: number;
}

export interface QualityPlan {
  projectPath: string;
  createdAt: string;
  tier: QualityTier;
  budgets: QualityBudgets;
  before: QualityScorecard;
  snapshot: QualitySnapshot;
  provenance: QualityProvenanceSummary;
  issues: QualityIssue[];
  actions: RepairAction[];
}

export interface AppliedRepair {
  kind: RepairKind;
  ok: boolean;
  detail: string;
  filesWritten: string[];
}

export interface QualityReport {
  projectPath: string;
  createdAt: string;
  tier: QualityTier;
  qualityScore: number;
  technicalScore: number;
  presentationScore: number;
  before: QualityScorecard;
  after: QualityScorecard;
  snapshotBefore: QualitySnapshot;
  snapshotAfter: QualitySnapshot;
  issues: QualityIssue[];
  actions: RepairAction[];
  applied: AppliedRepair[];
  rolledBack: boolean;
  rollbackReason?: string;
  cycles: number;
  assetsRegenerated: string[];
  commercialSafe: boolean;
  placeholderCount: number;
  criticTargetPreferred: number;
  notes: string[];
}

export interface QualityPassOptions {
  projectPath: string;
  godotPath?: string | null;
  apply?: boolean;
  recapture?: boolean;
  playtest?: boolean;
  budgets?: Partial<QualityBudgets>;
  tier?: QualityTier;
}
