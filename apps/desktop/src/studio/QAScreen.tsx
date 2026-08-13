import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { NavId } from './nav.js';

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
  const doctorWarn = checks.filter((c) => c.status.toLowerCase() !== 'ok' && c.status.toLowerCase() !== 'pass').length;

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
    <section>
      <ScreenHeader
        eyebrow="AI"
        title="QA"
        description="Environment doctor plus stored validation gates for the active project. Acceptance runs the real project QA contract."
        actions={
          <div className="row">
            <ProjectSelect />
            <button type="button" onClick={() => void loadDoctor()}>
              Refresh doctor
            </button>
          </div>
        }
      />
      <NoProjectHint />
      {error && <p className="result error">{error}</p>}

      <div className="qa-layout">
        <div className="panel">
          <h3>Environment</h3>
          <p className="hint">
            {checks.length} checks
            {doctorWarn > 0 ? ` · ${doctorWarn} not OK` : ' · all OK'}
          </p>
          <ul className="check-list">
            {checks.map((check) => (
              <li key={check.name} className={`check-${check.status.toLowerCase()}`}>
                [{check.status}] {check.name}: {check.message}
              </li>
            ))}
          </ul>
        </div>

        {hasActiveProject && (
          <>
        <div className="panel">
          <h3>Project gates</h3>
          <p className="hint">
            {rows.length} stored · {failedCount} failing
          </p>
          <div className="row">
            {(['all', 'failed', 'passed'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={gateFilter === id ? 'tab active' : 'tab'}
                onClick={() => setGateFilter(id)}
              >
                {id}
              </button>
            ))}
          </div>
          {visibleRows.length === 0 ? (
            <p className="hint">No stored validation rows for this filter.</p>
          ) : (
            <ul className="check-list">
              {visibleRows.map((row) => {
                const dest = gateDestination(row.gate);
                return (
                  <li key={row.id} className={row.passed ? 'check-pass' : 'check-warn'}>
                    [{row.passed ? 'PASS' : 'FAIL'}] {row.gate}: {row.message}
                    <span className="hint">{new Date(row.timestamp).toLocaleString()}</span>
                    {dest && (
                      <button type="button" className="tab" onClick={() => navigate(dest)}>
                        Open {dest}
                      </button>
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
            <button type="button" className="primary" disabled={!selectedPath || busy} onClick={runAcceptance}>
              {busy ? 'Running acceptance…' : 'Run project acceptance'}
            </button>
            <button type="button" onClick={() => navigate('Export')}>
              Export
            </button>
          </div>
          {acceptResult && (
            <pre className="panel" style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>
              {acceptResult}
            </pre>
          )}
        </div>

        <div className="panel">
          <h3>Checkpoints</h3>
          <p className="hint">Snapshots from createProjectCheckpoint for this project.</p>
          <div className="row">
            <input
              value={checkpointLabel}
              onChange={(e) => setCheckpointLabel(e.target.value)}
              placeholder="Checkpoint label"
            />
            <button type="button" disabled={!selectedPath} onClick={() => void saveCheckpoint()}>
              Save
            </button>
          </div>
          {checkpoints.length === 0 ? (
            <p className="hint">No checkpoints yet.</p>
          ) : (
            <ul className="checkpoint-list">
              {checkpoints.map((c) => (
                <li key={c.id}>
                  <button type="button" className="tab" onClick={() => void restoreCheckpoint(c.id)}>
                    {c.label} · {new Date(c.timestamp).toLocaleString()}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
          </>
        )}
      </div>
    </section>
  );
}
