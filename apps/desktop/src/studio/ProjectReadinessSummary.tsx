import { Badge, Button, EmptyState, Panel } from './ui/index.js';
import {
  deriveProjectReadiness,
  readinessTone,
  type ReadinessCompletion,
  type ProjectReadinessSummaryModel,
} from './projectReadiness.js';
import type { NavId } from './nav.js';

export type { ReadinessCompletion, ProjectReadinessSummaryModel };

export function ProjectReadinessSummary({
  completion,
  title = 'Project readiness',
  onNavigate,
  onRefresh,
  loading = false,
  compact = false,
}: {
  completion: ReadinessCompletion | null | undefined;
  title?: string;
  onNavigate: (id: NavId) => void;
  onRefresh?: () => void;
  loading?: boolean;
  compact?: boolean;
}) {
  const model = deriveProjectReadiness(completion);

  return (
    <Panel
      level={1}
      className={compact ? 'readiness-summary readiness-summary-compact' : 'readiness-summary'}
      title={title}
      actions={
        <>
          <Badge tone={readinessTone(model.status)}>{model.status}</Badge>
          {onRefresh ? (
            <Button variant="ghost" onClick={onRefresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          ) : null}
        </>
      }
    >
      {!completion && !loading ? (
        <EmptyState
          title="Readiness unavailable"
          description="Completion data from getProjectDashboard is not loaded yet."
          actions={onRefresh ? <Button onClick={onRefresh}>Refresh</Button> : undefined}
        />
      ) : (
        <>
          <div className="export-readiness-row">
            {model.completionScore != null ? (
              <>
                <div className="progress-bar-wrap" aria-label="Completion score">
                  <div
                    className="progress-bar"
                    style={{ width: `${Math.max(0, Math.min(100, model.completionScore))}%` }}
                  />
                </div>
                <span className="export-readiness-pct">{model.completionScore}% score</span>
              </>
            ) : (
              <span className="export-readiness-pct">
                {model.checklistTotal > 0
                  ? `${model.checklistPassed}/${model.checklistTotal} checks · ${model.blockerCount} blocker(s) · ${model.warningCount} warning(s)`
                  : `${model.blockerCount} blocker(s) · ${model.warningCount} warning(s)`}
              </span>
            )}
          </div>
          <p className={model.status === 'READY' ? 'check-pass' : 'check-warn'}>
            {model.status === 'READY'
              ? 'Production ready'
              : model.status === 'ATTENTION'
                ? 'Production ready with attention items'
                : 'Not production ready'}
          </p>
          {model.gateRows.length === 0 ? (
            <p className="hint">No gate rows reported.</p>
          ) : (
            <ul className="check-list readiness-gate-list">
              {model.gateRows.map((row) => (
                <li key={row.id} className={row.status === 'pass' ? 'check-pass' : 'check-warn'}>
                  <Badge
                    tone={row.status === 'pass' ? 'success' : row.status === 'warn' ? 'warning' : 'danger'}
                  >
                    {row.status === 'pass' ? 'PASS' : row.status === 'warn' ? 'ATTENTION' : 'BLOCKED'}
                  </Badge>{' '}
                  <strong>{row.label}</strong>
                  {row.detail ? <span className="hint"> — {row.detail}</span> : null}
                  {row.navigateTo ? (
                    <>
                      {' '}
                      <Button variant="ghost" onClick={() => onNavigate(row.navigateTo!)}>
                        Open {row.navigateTo}
                      </Button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
