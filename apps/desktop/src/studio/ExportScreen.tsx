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

type Completion = {
  productionReady?: boolean;
  completionScore?: number;
  blockers?: string[];
  warnings?: string[];
  assetProductionGate?: AssetProductionGateView;
};

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

  const refreshCompletion = useCallback(async (path = selectedPath) => {
    if (!path || !window.metroforge?.getProjectDashboard) {
      setCompletion(null);
      return;
    }
    const dash = await window.metroforge.getProjectDashboard(path);
    const data = dash as { completion?: Completion };
    setCompletion(data.completion ?? null);
  }, [selectedPath]);

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
  const ready = completion?.productionReady === true;

  return (
    <section>
      <ScreenHeader
        eyebrow="Ship"
        title="Export"
        description="Packages a generated Godot project using the existing exportProject contract. No simulated archives."
        actions={<ProjectSelect />}
      />
      <NoProjectHint />

      {hasActiveProject && (
        <>
      {completion && (
        <div className="panel" style={{ marginBottom: '0.85rem' }}>
          <h3>Preflight</h3>
          <p className={ready ? 'check-pass' : 'check-warn'}>
            {ready ? 'Production ready' : 'Not production ready'}
            {typeof completion.completionScore === 'number' ? ` · ${completion.completionScore}%` : ''}
          </p>
          {imageHealthSummary && <p className="hint">{imageHealthSummary}</p>}
          {blockers.length > 0 && (
            <ul className="check-list">
              {blockers.map((blocker) => (
                <li key={blocker} className="check-warn">
                  {blocker}
                </li>
              ))}
            </ul>
          )}
          <AssetProductionGatePanel gate={completion.assetProductionGate} />
          <div style={{ marginTop: '0.75rem' }}>
            <h4>Prototype gate</h4>
            <AllowPlaceholdersControl onChanged={() => void refreshCompletion()} />
          </div>
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <button type="button" disabled={backfillBusy} onClick={() => void runBackfill()}>
              {backfillBusy ? 'Backfilling…' : 'Backfill maturity'}
            </button>
            <button type="button" onClick={() => navigate('QA')}>
              Open QA
            </button>
            <button type="button" onClick={() => navigate('Dashboard')}>
              Dashboard
            </button>
            <button type="button" onClick={() => navigate('Providers')}>
              Image providers
            </button>
            <button type="button" onClick={() => navigate('Settings')}>
              Settings
            </button>
          </div>
          {backfillMessage && <p className="hint">{backfillMessage}</p>}
          {completion.warnings && completion.warnings.length > 0 && (
            <ul className="check-list" style={{ marginTop: '0.5rem' }}>
              {completion.warnings.map((warning) => (
                <li key={warning} className="hint">
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="panel form-stack">
        <label className="check-inline">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Force export even if QA is incomplete
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={zip} onChange={(e) => setZip(e.target.checked)} />
          Create zip archive
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={commercialSafe} onChange={(e) => setCommercialSafe(e.target.checked)} />
          Commercial-safe license filter
        </label>
        <p className="hint">
          Commercial-safe asks the exporter to drop assets whose licenses are not cleared for sale. Force bypasses
          incomplete QA gates.
        </p>
        <div className="row">
          <button type="button" className="primary" disabled={!selectedPath || busy} onClick={runExport}>
            {busy ? 'Exporting…' : 'Export package'}
          </button>
          <button
            type="button"
            disabled={!selectedPath}
            onClick={() => selectedPath && window.metroforge?.revealProjectFolder?.(selectedPath)}
          >
            Reveal project folder
          </button>
          <button
            type="button"
            disabled={!selectedPath}
            onClick={async () => {
              setGodotError(null);
              if (selectedPath) setGodotError(await playProjectInGodot(selectedPath));
            }}
          >
            Play (F5)
          </button>
          <button
            type="button"
            disabled={!selectedPath}
            onClick={async () => {
              setGodotError(null);
              if (selectedPath) setGodotError(await openProjectInGodot(selectedPath));
            }}
          >
            Open in Godot
          </button>
        </div>
        {message && <p className="result success">{message}</p>}
        {error && <p className="result error">{error}</p>}
        {godotError && <p className="result error">{godotError}</p>}
      </div>
        </>
      )}
    </section>
  );
}
