import { useCallback, useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import { openProjectInGodot, playProjectInGodot } from './godot-actions.js';
import {
  AssetProductionGatePanel,
  type AssetProductionGateView,
} from './AssetProductionGatePanel.js';
import { AllowPlaceholdersControl } from './AllowPlaceholdersControl.js';
import { Badge, Button, EmptyState, Panel } from './ui/index.js';

type Completion = {
  productionReady?: boolean;
  completionScore?: number;
  blockers?: string[];
  warnings?: string[];
  assetProductionGate?: AssetProductionGateView;
};

type PreflightStatus = 'READY' | 'WARNING' | 'BLOCKING';

function preflightStatus(completion: Completion | null): PreflightStatus {
  if (!completion) return 'BLOCKING';
  if (completion.productionReady === true) {
    return (completion.warnings?.length ?? 0) > 0 ? 'WARNING' : 'READY';
  }
  return 'BLOCKING';
}

function preflightTone(status: PreflightStatus): 'success' | 'warning' | 'danger' {
  if (status === 'READY') return 'success';
  if (status === 'WARNING') return 'warning';
  return 'danger';
}

export function ExportScreen() {
  const { selectedPath, hasActiveProject, navigate } = useStudio();
  const [force, setForce] = useState(true);
  const [zip, setZip] = useState(true);
  const [commercialSafe, setCommercialSafe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [godotError, setGodotError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [imageHealthSummary, setImageHealthSummary] = useState<string | null>(null);

  const refreshCompletion = useCallback(
    async (path = selectedPath) => {
      if (!path || !window.metroforge?.getProjectDashboard) {
        setCompletion(null);
        return;
      }
      const dash = await window.metroforge.getProjectDashboard(path);
      const data = dash as { completion?: Completion };
      setCompletion(data.completion ?? null);
    },
    [selectedPath],
  );

  const refreshImageHealth = useCallback(async () => {
    if (!window.metroforge?.getConfig) {
      setImageHealthSummary(null);
      return;
    }
    try {
      const cfg = await window.metroforge.getConfig();
      const providers = cfg.imageProviders ?? [];
      if (providers.length === 0) {
        setImageHealthSummary('Image providers: none probed (configure ComfyUI / NVIDIA / Diffusers)');
        return;
      }
      const parts = providers.map((p) => {
        const status = p.status ?? (p.healthy ? 'HEALTHY' : 'UNAVAILABLE');
        return `${p.id}=${status}`;
      });
      setImageHealthSummary(`Image provider health: ${parts.join(' · ')}`);
    } catch {
      setImageHealthSummary(null);
    }
  }, []);

  useEffect(() => {
    void refreshCompletion(selectedPath);
  }, [selectedPath, refreshCompletion]);

  useEffect(() => {
    void refreshImageHealth();
  }, [refreshImageHealth]);

  const runExport = async () => {
    if (!selectedPath || !window.metroforge?.exportProject) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await window.metroforge.exportProject(selectedPath, { force, zip, commercialSafe });
    setBusy(false);
    if (!result.success) {
      setError(result.errors?.join('; ') ?? 'Export failed');
      return;
    }
    setMessage(result.archivePath ? `Exported to ${result.archivePath}` : 'Export completed');
  };

  const runBackfill = async () => {
    if (!selectedPath || !window.metroforge?.backfillAssetMaturity) return;
    setBackfillBusy(true);
    setBackfillMessage(null);
    try {
      const result = await window.metroforge.backfillAssetMaturity(selectedPath);
      if (!result.success) {
        setBackfillMessage(result.errors?.join('; ') ?? 'Backfill failed');
        return;
      }
      setBackfillMessage(
        `Backfill maturity: updated ${result.updatedCount} / ${result.artifactCount} artifacts` +
          (result.skippedCount ? ` (${result.skippedCount} already complete)` : ''),
      );
      await refreshCompletion(selectedPath);
    } catch (err) {
      setBackfillMessage(String(err));
    } finally {
      setBackfillBusy(false);
    }
  };

  const blockers = completion?.blockers ?? [];
  const warnings = completion?.warnings ?? [];
  const readiness = typeof completion?.completionScore === 'number' ? completion.completionScore : null;
  const status = preflightStatus(completion);
  const gateBlocking =
    completion?.assetProductionGate && !completion.assetProductionGate.passed
      ? completion.assetProductionGate.blockedAssets.length
      : 0;

  return (
    <section className="export-screen">
      <ScreenHeader
        eyebrow="Ship"
        title="Export"
        description="Packages a generated Godot project using the existing exportProject contract. No simulated archives."
        actions={<ProjectSelect />}
      />
      <NoProjectHint />

      {hasActiveProject && (
        <>
          <div className="export-preflight-layout">
            <Panel
              level={1}
              className="export-preflight-center"
              title="Preflight"
              actions={<Badge tone={preflightTone(status)}>{status}</Badge>}
            >
              {!completion ? (
                <EmptyState
                  title="Preflight unavailable"
                  description="Completion data from getProjectDashboard is not loaded yet."
                  actions={
                    <Button onClick={() => void refreshCompletion()}>Refresh preflight</Button>
                  }
                />
              ) : (
                <>
                  <div className="export-readiness-row">
                    <div className="progress-bar-wrap" aria-label="Export readiness">
                      <div
                        className="progress-bar"
                        style={{ width: `${Math.max(0, Math.min(100, readiness ?? 0))}%` }}
                      />
                    </div>
                    <span className="export-readiness-pct">
                      {readiness != null ? `${readiness}%` : '—'} readiness
                    </span>
                  </div>
                  <p className={status === 'READY' ? 'check-pass' : 'check-warn'}>
                    {status === 'READY'
                      ? 'Production ready'
                      : status === 'WARNING'
                        ? 'Production ready with warnings'
                        : 'Not production ready'}
                    {gateBlocking > 0 ? ` · ${gateBlocking} asset gate blocker(s)` : ''}
                  </p>
                  {imageHealthSummary && <p className="hint">{imageHealthSummary}</p>}

                  <h3 className="mf-panel-title" style={{ marginTop: '0.65rem' }}>
                    Blockers
                  </h3>
                  {blockers.length === 0 && gateBlocking === 0 ? (
                    <p className="hint">No completion blockers reported.</p>
                  ) : (
                    <ul className="check-list">
                      {blockers.map((blocker) => (
                        <li key={blocker} className="check-warn">
                          <Badge tone="danger">BLOCKING</Badge> {blocker}
                        </li>
                      ))}
                    </ul>
                  )}
                  <AssetProductionGatePanel gate={completion.assetProductionGate} />

                  {warnings.length > 0 && (
                    <>
                      <h3 className="mf-panel-title" style={{ marginTop: '0.65rem' }}>
                        Warnings
                      </h3>
                      <ul className="check-list">
                        {warnings.map((warning) => (
                          <li key={warning} className="check-warn">
                            <Badge tone="warning">WARNING</Badge> {warning}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  <div style={{ marginTop: '0.75rem' }}>
                    <h4 className="mf-panel-title">Prototype gate</h4>
                    <AllowPlaceholdersControl onChanged={() => void refreshCompletion()} />
                  </div>
                  <div className="row" style={{ marginTop: '0.5rem' }}>
                    <Button disabled={backfillBusy} onClick={() => void runBackfill()}>
                      {backfillBusy ? 'Backfilling…' : 'Backfill maturity'}
                    </Button>
                    <Button onClick={() => navigate('QA')}>Open QA</Button>
                    <Button onClick={() => navigate('Dashboard')}>Dashboard</Button>
                    <Button onClick={() => navigate('Providers')}>Image providers</Button>
                    <Button onClick={() => navigate('Settings')}>Settings</Button>
                  </div>
                  {backfillMessage && <p className="hint">{backfillMessage}</p>}
                </>
              )}
            </Panel>

            <Panel level={1} className="form-stack" title="Export actions">
              <label className="check-inline">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                Force export even if QA is incomplete
              </label>
              <label className="check-inline">
                <input type="checkbox" checked={zip} onChange={(e) => setZip(e.target.checked)} />
                Create zip archive
              </label>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={commercialSafe}
                  onChange={(e) => setCommercialSafe(e.target.checked)}
                />
                Commercial-safe license filter
              </label>
              <p className="hint">
                Commercial-safe asks the exporter to drop assets whose licenses are not cleared for sale. Force
                bypasses incomplete QA gates.
              </p>
              <div className="row">
                <Button variant="primary" disabled={!selectedPath || busy} onClick={runExport}>
                  {busy ? 'Exporting…' : 'Export package'}
                </Button>
                <Button
                  disabled={!selectedPath}
                  onClick={() => selectedPath && window.metroforge?.revealProjectFolder?.(selectedPath)}
                >
                  Reveal project folder
                </Button>
                <Button
                  disabled={!selectedPath}
                  onClick={async () => {
                    setGodotError(null);
                    if (selectedPath) setGodotError(await playProjectInGodot(selectedPath));
                  }}
                >
                  Play (F5)
                </Button>
                <Button
                  disabled={!selectedPath}
                  onClick={async () => {
                    setGodotError(null);
                    if (selectedPath) setGodotError(await openProjectInGodot(selectedPath));
                  }}
                >
                  Open in Godot
                </Button>
              </div>
              {message && <p className="result success">{message}</p>}
              {error && <p className="result error">{error}</p>}
              {godotError && <p className="result error">{godotError}</p>}
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}
