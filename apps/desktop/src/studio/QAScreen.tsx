import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { NavId } from './nav.js';
import { doctorCategory } from './aiOpsShared.js';
import { ProjectReadinessSummary } from './ProjectReadinessSummary.js';
import type { ReadinessCompletion } from './projectReadiness.js';
import {
  AiOpsWorkbench,
  Badge,
  Button,
  EmptyState,
  HealthDot,
  Input,
  Panel,
  Tabs,
} from './ui/index.js';

type DoctorCheck = { name: string; status: string; message: string };
type ValidationRow = {
  id: string;
  gate: string;
  passed: boolean;
  message: string;
  timestamp: string;
};
type Checkpoint = { id: string; label: string; timestamp: string };

function gateDestination(gate: string): NavId | null {
  const g = gate.toLowerCase();
  if (g.includes('asset') || g.includes('coverage') || g.includes('sprite') || g.includes('tileset')) {
    return 'Assets';
  }
  if (g.includes('room') || g.includes('world') || g.includes('reach') || g.includes('graph') || g.includes('dungeon')) {
    return 'World';
  }
  if (g.includes('godot') || g.includes('runtime') || g.includes('playtest')) return 'Dashboard';
  if (g.includes('export') || g.includes('license') || g.includes('commercial')) return 'Export';
  if (g.includes('model') || g.includes('provider') || g.includes('routing')) return 'Routing';
  return null;
}

function doctorTone(status: string): 'success' | 'warning' | 'danger' | 'muted' {
  const s = status.toLowerCase();
  if (s === 'ok' || s === 'pass' || s === 'passed') return 'success';
  if (s === 'warn' || s === 'warning' || s === 'degraded') return 'warning';
  if (s === 'fail' || s === 'failed' || s === 'error') return 'danger';
  return 'muted';
}

function isDoctorOk(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'ok' || s === 'pass' || s === 'passed';
}

function DoctorRow({ check }: { check: DoctorCheck }) {
  const [open, setOpen] = useState(false);
  const tone = doctorTone(check.status);
  return (
    <li className={['qa-doctor-row', tone === 'success' ? 'check-pass' : 'check-warn'].join(' ')}>
      <button type="button" className="qa-doctor-row-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <HealthDot
          status={tone === 'success' ? 'healthy' : tone === 'warning' ? 'degraded' : 'unavailable'}
        />
        <span className="qa-doctor-name mono">{check.name}</span>
        <Badge tone={tone}>{check.status}</Badge>
      </button>
      <p className="hint qa-doctor-summary">{check.message}</p>
      {open ? (
        <div className="qa-doctor-detail panel-l2">
          <dl className="settings-dl">
            <dt>Component</dt>
            <dd className="mono">{check.name}</dd>
            <dt>Status</dt>
            <dd>{check.status}</dd>
            <dt>Message</dt>
            <dd>{check.message}</dd>
          </dl>
        </div>
      ) : null}
    </li>
  );
}

function GateRow({
  row,
  onNavigate,
}: {
  row: ValidationRow;
  onNavigate: (dest: NavId) => void;
}) {
  const [open, setOpen] = useState(false);
  const dest = gateDestination(row.gate);
  const failLines = row.message
    .split(/[;\n•]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <li className={row.passed ? 'qa-gate-row check-pass' : 'qa-gate-row check-warn'}>
      <button type="button" className="qa-gate-row-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Badge tone={row.passed ? 'success' : 'danger'}>{row.passed ? 'PASS' : 'FAIL'}</Badge>
        <span className="qa-gate-name">{row.gate}</span>
        <span className="hint mono">{new Date(row.timestamp).toLocaleString()}</span>
      </button>
      <p className="hint">{failLines[0] ?? row.message}</p>
      {open ? (
        <div className="qa-gate-detail panel-l2">
          <ul className="qa-gate-checks">
            {failLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {dest ? (
            <Button size="sm" variant="ghost" onClick={() => onNavigate(dest)}>
              Open {dest}
            </Button>
          ) : null}
        </div>
      ) : (
        dest && (
          <Button size="sm" variant="ghost" onClick={() => onNavigate(dest)}>
            Open {dest}
          </Button>
        )
      )}
    </li>
  );
}

export function QAScreen() {
  const { selectedPath, hasActiveProject, navigate } = useStudio();
  const [checks, setChecks] = useState<DoctorCheck[]>([]);
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [checkpointLabel, setCheckpointLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [acceptResult, setAcceptResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [skipRuntime, setSkipRuntime] = useState(false);
  const [gateFilter, setGateFilter] = useState<'all' | 'failed' | 'passed'>('all');
  const [completion, setCompletion] = useState<ReadinessCompletion | null>(null);

  const loadDoctor = async () => {
    if (!window.metroforge?.runDoctor) {
      setError('Desktop bridge unavailable');
      return;
    }
    try {
      setChecks(await window.metroforge.runDoctor());
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const loadGates = async () => {
    if (!selectedPath || !window.metroforge?.getValidationResults) {
      setRows([]);
      return;
    }
    const list = await window.metroforge.getValidationResults(selectedPath);
    setRows(Array.isArray(list) ? list : []);
  };

  const loadCheckpoints = async () => {
    if (!selectedPath || !window.metroforge?.listProjectCheckpoints) {
      setCheckpoints([]);
      return;
    }
    setCheckpoints(await window.metroforge.listProjectCheckpoints(selectedPath));
  };

  const loadCompletion = async () => {
    if (!selectedPath || !window.metroforge?.getProjectDashboard) {
      setCompletion(null);
      return;
    }
    try {
      const dash = (await window.metroforge.getProjectDashboard(selectedPath)) as {
        completion?: ReadinessCompletion;
      };
      setCompletion(dash.completion ?? null);
    } catch {
      setCompletion(null);
    }
  };

  useEffect(() => {
    void loadDoctor();
  }, []);

  useEffect(() => {
    void loadGates();
    void loadCheckpoints();
    void loadCompletion();
  }, [selectedPath]);

  const visibleRows = useMemo(() => {
    if (gateFilter === 'failed') return rows.filter((row) => !row.passed);
    if (gateFilter === 'passed') return rows.filter((row) => row.passed);
    return rows;
  }, [rows, gateFilter]);

  const failedCount = rows.filter((row) => !row.passed).length;
  const doctorOk = checks.filter((c) => isDoctorOk(c.status)).length;
  const doctorWarn = checks.length - doctorOk;
  const envHealthy = checks.length > 0 && doctorWarn === 0;
  const readyPct = checks.length ? Math.round((doctorOk / checks.length) * 100) : 0;

  const groupedDoctor = useMemo(() => {
    const map = new Map<string, DoctorCheck[]>();
    for (const check of checks) {
      const cat = doctorCategory(check.name);
      const list = map.get(cat) ?? [];
      list.push(check);
      map.set(cat, list);
    }
    return [...map.entries()];
  }, [checks]);

  const runAcceptance = async () => {
    if (!selectedPath || !window.metroforge?.runProjectAcceptance) return;
    setBusy(true);
    setAcceptResult(null);
    try {
      const result = await window.metroforge.runProjectAcceptance(selectedPath, { skipRuntime });
      setAcceptResult(result.formatted);
      await loadGates();
    } finally {
      setBusy(false);
    }
  };

  const saveCheckpoint = async () => {
    if (!selectedPath || !window.metroforge?.createProjectCheckpoint) return;
    await window.metroforge.createProjectCheckpoint(selectedPath, checkpointLabel || 'QA snapshot');
    setCheckpointLabel('');
    await loadCheckpoints();
  };

  const restoreCheckpoint = async (id: string) => {
    if (!selectedPath || !window.metroforge?.restoreProjectCheckpoint) return;
    const result = await window.metroforge.restoreProjectCheckpoint(selectedPath, id);
    if (!result.success) setError(result.error ?? 'Restore failed');
    else {
      setError(null);
      await loadGates();
    }
  };

  return (
    <section className="workspace-screen qa-screen">
      <ScreenHeader
        eyebrow="AI / Validation"
        title="QA"
        description="Environment health, generated-project validation, acceptance tests and project checkpoints."
        compact
        actions={
          <div className="row">
            <ProjectSelect />
            <Button onClick={() => void loadDoctor()}>Refresh Doctor</Button>
            <Button
              variant="primary"
              disabled={!selectedPath || busy}
              onClick={() => void runAcceptance()}
            >
              {busy ? 'Running…' : 'Run Acceptance'}
            </Button>
          </div>
        }
      />
      <NoProjectHint />
      {error && <p className="result error">{error}</p>}
      {hasActiveProject && (
        <ProjectReadinessSummary
          completion={completion}
          title="Project readiness"
          compact
          onNavigate={navigate}
          onRefresh={() => void loadCompletion()}
        />
      )}

      <AiOpsWorkbench variant="qa">
        <div className="qa-layout-3">
          <Panel
            level={1}
            className="qa-env-col"
            title="Environment"
            actions={
              <Badge tone={doctorWarn > 0 ? 'warning' : checks.length ? 'success' : 'muted'}>
                {checks.length ? `${doctorOk}/${checks.length} ready` : '—'}
              </Badge>
            }
          >
            <div className="dashboard-env-status">
              <span
                className={envHealthy ? 'status-dot ok' : checks.length ? 'status-dot error' : 'status-dot'}
                aria-hidden="true"
              />
              <span>
                Overall:{' '}
                <strong
                  style={{
                    color: envHealthy
                      ? 'var(--success)'
                      : checks.length
                        ? 'var(--warning)'
                        : 'var(--text-muted)',
                  }}
                >
                  {checks.length === 0 ? 'Unknown' : envHealthy ? 'Healthy' : 'Attention'}
                </strong>
              </span>
            </div>
            <div className="qa-ready-meter" aria-label={`Environment ${readyPct}% ready`}>
              <div className="qa-ready-meter-fill" style={{ width: `${readyPct}%` }} />
            </div>
            <div className="dashboard-env-stats qa-env-stats">
              <div>
                <span>OK</span>
                <strong className="mono">{doctorOk || '—'}</strong>
              </div>
              <div>
                <span>Not OK</span>
                <strong className="mono">{doctorWarn || '—'}</strong>
              </div>
              <div>
                <span>Gates fail</span>
                <strong className="mono">{hasActiveProject ? failedCount : '—'}</strong>
              </div>
            </div>
            {checks.length === 0 ? (
              <EmptyState title="No doctor results" description="runDoctor has not returned checks yet." />
            ) : (
              <div className="qa-doctor-groups">
                {groupedDoctor.map(([category, list]) => (
                  <div key={category} className="qa-doctor-group">
                    <h3 className="type-label mf-panel-title">{category}</h3>
                    <ul className="qa-doctor-list">
                      {list.map((check) => (
                        <DoctorRow key={check.name} check={check} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            level={1}
            className="qa-gates-col"
            title="Project validation"
            actions={
              hasActiveProject ? (
                <Badge tone={failedCount > 0 ? 'danger' : rows.length ? 'success' : 'muted'}>
                  {rows.length} stored · {failedCount} failing
                </Badge>
              ) : (
                <Badge tone="muted">No project</Badge>
              )
            }
          >
            {hasActiveProject ? (
              <>
                <Tabs
                  items={[
                    { id: 'all', label: 'all' },
                    { id: 'failed', label: 'failed' },
                    { id: 'passed', label: 'passed' },
                  ]}
                  value={gateFilter}
                  onChange={(id) => setGateFilter(id as typeof gateFilter)}
                />
                {visibleRows.length === 0 ? (
                  <EmptyState
                    title="No gates for filter"
                    description="No stored validation rows for this filter. Run project acceptance to refresh."
                  />
                ) : (
                  <ul className="qa-gate-list">
                    {visibleRows.map((row) => (
                      <GateRow key={row.id} row={row} onNavigate={navigate} />
                    ))}
                  </ul>
                )}
                <label
                  className={['check-inline', 'qa-skip-runtime', skipRuntime ? 'qa-skip-runtime-warn' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={skipRuntime}
                    onChange={(e) => setSkipRuntime(e.target.checked)}
                  />
                  Skip Godot runtime during acceptance
                  {skipRuntime ? <Badge tone="warning">BYPASS</Badge> : null}
                </label>
                <div className="row" style={{ marginTop: '0.55rem' }}>
                  <Button variant="primary" disabled={!selectedPath || busy} onClick={() => void runAcceptance()}>
                    {busy ? 'Running acceptance…' : 'Run project acceptance'}
                  </Button>
                  <Button onClick={() => navigate('Export')}>Export</Button>
                  <Button onClick={() => navigate('Routing')}>Routing</Button>
                </div>
                {acceptResult && (
                  <pre className="panel-l2 qa-accept-result" style={{ marginTop: '0.55rem', whiteSpace: 'pre-wrap' }}>
                    {acceptResult}
                  </pre>
                )}
              </>
            ) : (
              <EmptyState
                title="Select a project"
                description="Validation gates and acceptance require an active project."
              />
            )}
          </Panel>

          <Panel
            level={1}
            className="qa-checkpoints-col"
            title="Checkpoints"
            actions={<Badge tone="muted">{hasActiveProject ? checkpoints.length : '—'}</Badge>}
          >
            {!hasActiveProject ? (
              <EmptyState title="No project" description="Checkpoints require an active project." />
            ) : (
              <>
                <p className="hint">Snapshots from createProjectCheckpoint for this project.</p>
                <div className="row">
                  <Input
                    value={checkpointLabel}
                    onChange={(e) => setCheckpointLabel(e.target.value)}
                    placeholder="Checkpoint label"
                    aria-label="Checkpoint label"
                  />
                  <Button disabled={!selectedPath} onClick={() => void saveCheckpoint()}>
                    Save
                  </Button>
                </div>
                {checkpoints.length === 0 ? (
                  <EmptyState title="No checkpoints" description="Save a QA snapshot to restore later." />
                ) : (
                  <ul className="checkpoint-list qa-checkpoint-list">
                    {checkpoints.map((c) => (
                      <li key={c.id}>
                        <div className="qa-checkpoint-meta">
                          <strong>{c.label}</strong>
                          <span className="hint mono">{new Date(c.timestamp).toLocaleString()}</span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => void restoreCheckpoint(c.id)}>
                          Restore
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Panel>
        </div>
      </AiOpsWorkbench>
    </section>
  );
}
