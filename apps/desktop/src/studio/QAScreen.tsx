import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { NavId } from './nav.js';
import { Badge, Button, EmptyState, Input, Panel, Tabs } from './ui/index.js';

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

function doctorRowClass(status: string): string {
  const tone = doctorTone(status);
  if (tone === 'success') return 'check-pass';
  if (tone === 'danger') return 'check-warn';
  if (tone === 'warning') return 'check-warn';
  return 'hint';
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

  useEffect(() => {
    void loadDoctor();
  }, []);

  useEffect(() => {
    void loadGates();
    void loadCheckpoints();
  }, [selectedPath]);

  const visibleRows = useMemo(() => {
    if (gateFilter === 'failed') return rows.filter((row) => !row.passed);
    if (gateFilter === 'passed') return rows.filter((row) => row.passed);
    return rows;
  }, [rows, gateFilter]);

  const failedCount = rows.filter((row) => !row.passed).length;
  const doctorOk = checks.filter((c) => {
    const s = c.status.toLowerCase();
    return s === 'ok' || s === 'pass' || s === 'passed';
  }).length;
  const doctorWarn = checks.length - doctorOk;
  const envHealthy = checks.length > 0 && doctorWarn === 0;

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
    <section className="qa-screen">
      <ScreenHeader
        eyebrow="AI"
        title="QA"
        description="Environment doctor plus stored validation gates for the active project. Acceptance runs the real project QA contract."
        actions={
          <div className="row">
            <ProjectSelect />
            <Button onClick={() => void loadDoctor()}>Refresh doctor</Button>
          </div>
        }
      />
      <NoProjectHint />
      {error && <p className="result error">{error}</p>}

      <div className="qa-layout">
        <div className="qa-env-col">
          <Panel
            level={1}
            title="Environment"
            actions={
              <Badge tone={doctorWarn > 0 ? 'warning' : checks.length ? 'success' : 'muted'}>
                {checks.length} checks
                {doctorWarn > 0 ? ` · ${doctorWarn} not OK` : checks.length ? ' · all OK' : ''}
              </Badge>
            }
          >
            <div className="dashboard-env-status">
              <span className={envHealthy ? 'status-dot ok' : checks.length ? 'status-dot error' : 'status-dot'} aria-hidden="true" />
              <span>
                Overall Status:{' '}
                <strong style={{ color: envHealthy ? 'var(--success)' : checks.length ? 'var(--warning)' : 'var(--text-muted)' }}>
                  {checks.length === 0 ? 'Unknown' : envHealthy ? 'Healthy' : 'Attention'}
                </strong>
              </span>
            </div>
            <div className="dashboard-env-stats qa-env-stats">
              <div>
                <span>OK</span>
                <strong>{doctorOk || '—'}</strong>
              </div>
              <div>
                <span>Not OK</span>
                <strong>{doctorWarn || '—'}</strong>
              </div>
              <div>
                <span>Gates fail</span>
                <strong>{hasActiveProject ? failedCount : '—'}</strong>
              </div>
            </div>
            <h3 className="mf-panel-title" style={{ marginTop: '0.55rem' }}>
              Health log
            </h3>
            {checks.length === 0 ? (
              <EmptyState title="No doctor results" description="runDoctor has not returned checks yet." />
            ) : (
              <ul className="check-list">
                {checks.map((check) => (
                  <li key={check.name} className={doctorRowClass(check.status)}>
                    <Badge tone={doctorTone(check.status)}>{check.status}</Badge> {check.name}: {check.message}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {hasActiveProject && (
            <Panel
              level={1}
              title="Checkpoints"
              actions={<Badge tone="muted">{checkpoints.length}</Badge>}
            >
              <p className="hint">Snapshots from createProjectCheckpoint for this project.</p>
              <div className="row">
                <Input
                  value={checkpointLabel}
                  onChange={(e) => setCheckpointLabel(e.target.value)}
                  placeholder="Checkpoint label"
                />
                <Button disabled={!selectedPath} onClick={() => void saveCheckpoint()}>
                  Save
                </Button>
              </div>
              {checkpoints.length === 0 ? (
                <EmptyState title="No checkpoints" description="Save a QA snapshot to restore later." />
              ) : (
                <ul className="checkpoint-list">
                  {checkpoints.map((c) => (
                    <li key={c.id}>
                      <Button size="sm" variant="ghost" onClick={() => void restoreCheckpoint(c.id)}>
                        {c.label} · {new Date(c.timestamp).toLocaleString()}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <div className="qa-gates-col">
          {hasActiveProject ? (
            <Panel
              level={1}
              title="Project gates"
              actions={
                <Badge tone={failedCount > 0 ? 'danger' : rows.length ? 'success' : 'muted'}>
                  {rows.length} stored · {failedCount} failing
                </Badge>
              }
            >
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
                <ul className="check-list">
                  {visibleRows.map((row) => {
                    const dest = gateDestination(row.gate);
                    return (
                      <li key={row.id} className={row.passed ? 'check-pass' : 'check-warn'}>
                        <Badge tone={row.passed ? 'success' : 'danger'}>{row.passed ? 'PASS' : 'FAIL'}</Badge>{' '}
                        {row.gate}: {row.message}
                        <span className="hint">{new Date(row.timestamp).toLocaleString()}</span>
                        {dest && (
                          <Button size="sm" variant="ghost" onClick={() => navigate(dest)}>
                            Open {dest}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <label className="check-inline" style={{ marginTop: '0.75rem' }}>
                <input type="checkbox" checked={skipRuntime} onChange={(e) => setSkipRuntime(e.target.checked)} />
                Skip Godot runtime during acceptance
              </label>
              <div className="row" style={{ marginTop: '0.75rem' }}>
                <Button variant="primary" disabled={!selectedPath || busy} onClick={runAcceptance}>
                  {busy ? 'Running acceptance…' : 'Run project acceptance'}
                </Button>
                <Button onClick={() => navigate('Export')}>Export</Button>
                <Button onClick={() => navigate('Routing')}>Routing</Button>
              </div>
              {acceptResult && (
                <pre className="panel-l2" style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>
                  {acceptResult}
                </pre>
              )}
            </Panel>
          ) : (
            <Panel level={1} title="Project gates">
              <EmptyState
                title="Select a project"
                description="Validation gates and acceptance require an active project."
              />
            </Panel>
          )}
        </div>
      </div>
    </section>
  );
}
