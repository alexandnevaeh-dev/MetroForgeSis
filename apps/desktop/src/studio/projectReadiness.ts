import type { AssetProductionGateView } from './AssetProductionGatePanel.js';
import type { NavId } from './nav.js';

export type ReadinessStatus = 'READY' | 'ATTENTION' | 'BLOCKED';

export type ReadinessCompletion = {
  productionReady?: boolean;
  completionScore?: number;
  blockers?: string[];
  warnings?: string[];
  checklist?: Array<{ id: string; label: string; passed: boolean; detail?: string }>;
  assetProductionGate?: AssetProductionGateView;
  validationPassed?: boolean;
  validationLevel?: string;
};

export type ReadinessGateRow = {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
  navigateTo?: NavId;
};

export type ProjectReadinessSummaryModel = {
  status: ReadinessStatus;
  completionScore: number | null;
  blockerCount: number;
  warningCount: number;
  checklistPassed: number;
  checklistTotal: number;
  gateRows: ReadinessGateRow[];
  productionReady: boolean;
};

export function deriveProjectReadiness(
  completion: ReadinessCompletion | null | undefined,
): ProjectReadinessSummaryModel {
  if (!completion) {
    return {
      status: 'BLOCKED',
      completionScore: null,
      blockerCount: 0,
      warningCount: 0,
      checklistPassed: 0,
      checklistTotal: 0,
      gateRows: [
        {
          id: 'completion-missing',
          label: 'Completion data',
          status: 'fail',
          detail: 'No completion payload from getProjectDashboard',
          navigateTo: 'Dashboard',
        },
      ],
      productionReady: false,
    };
  }

  const blockers = completion.blockers ?? [];
  const warnings = completion.warnings ?? [];
  const checklist = completion.checklist ?? [];
  const gate = completion.assetProductionGate;
  const gateBlocked = gate && !gate.passed ? gate.blockedAssets.length : 0;
  const checklistPassed = checklist.filter((c) => c.passed).length;
  const checklistTotal = checklist.length;
  const score =
    typeof completion.completionScore === 'number' && Number.isFinite(completion.completionScore)
      ? completion.completionScore
      : null;

  const gateRows: ReadinessGateRow[] = [];

  if (completion.validationPassed === false) {
    gateRows.push({
      id: 'validation',
      label: 'Validation',
      status: 'fail',
      detail: completion.validationLevel
        ? `Failed · ${completion.validationLevel}`
        : 'Validation did not pass',
      navigateTo: 'QA',
    });
  } else if (completion.validationPassed === true) {
    gateRows.push({
      id: 'validation',
      label: 'Validation',
      status: 'pass',
      detail: completion.validationLevel ?? 'Passed',
      navigateTo: 'QA',
    });
  }

  for (const item of checklist) {
    gateRows.push({
      id: `check-${item.id}`,
      label: item.label,
      status: item.passed ? 'pass' : 'fail',
      detail: item.detail,
      navigateTo: item.id.includes('asset') || item.id.includes('maturity') ? 'Assets' : 'QA',
    });
  }

  if (gate) {
    gateRows.push({
      id: 'asset-production-gate',
      label: 'Asset production gate',
      status: gate.passed ? 'pass' : 'fail',
      detail: gate.passed
        ? 'Visual assets cleared for production'
        : `${gate.blockedAssets.length} blocked asset(s)`,
      navigateTo: 'Assets',
    });
  }

  for (const warning of warnings) {
    gateRows.push({
      id: `warn-${warning.slice(0, 48)}`,
      label: 'Warning',
      status: 'warn',
      detail: warning,
      navigateTo: 'QA',
    });
  }

  const hasHardBlock =
    completion.productionReady !== true || blockers.length > 0 || gateBlocked > 0;
  let status: ReadinessStatus;
  if (hasHardBlock) status = 'BLOCKED';
  else if (warnings.length > 0) status = 'ATTENTION';
  else status = 'READY';

  return {
    status,
    completionScore: score,
    blockerCount: blockers.length + gateBlocked,
    warningCount: warnings.length,
    checklistPassed,
    checklistTotal,
    gateRows,
    productionReady: completion.productionReady === true,
  };
}

export function readinessTone(
  status: ReadinessStatus,
): 'success' | 'warning' | 'danger' {
  if (status === 'READY') return 'success';
  if (status === 'ATTENTION') return 'warning';
  return 'danger';
}
