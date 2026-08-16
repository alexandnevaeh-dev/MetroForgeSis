import { useCallback, useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import { openProjectInGodot, playProjectInGodot } from './godot-actions.js';
import { AssetProductionGatePanel } from './AssetProductionGatePanel.js';
import { AllowPlaceholdersControl } from './AllowPlaceholdersControl.js';
import { ProjectReadinessSummary } from './ProjectReadinessSummary.js';
import type { ReadinessCompletion } from './projectReadiness.js';
import { deriveProjectReadiness } from './projectReadiness.js';
import { Badge, Button, EmptyState, Panel } from './ui/index.js';

type ExportResultView = {
  success: boolean;
  archivePath?: string;
  manifestPath?: string;
  manifest?: Record<string, unknown>;
  errors?: string[];
  warnings?: string[];
};

type CommercialSafeView = {
  included: number;
  excluded: number;
  unknown: number;
  commercialSafe: boolean | null;
};

function summarizeCommercialSafe(manifest: Record<string, unknown> | undefined): CommercialSafeView | null {
  if (!manifest) return null;
  const license = manifest.licenseSummary as
    | {
        commercialSafe?: boolean;
        artifactClassifications?: Array<{ status?: string }>;
        blockedArtifactCount?: number;
      }
    | undefined;
  if (!license) return null;
  const classifications = license.artifactClassifications ?? [];
  if (classifications.length === 0) {
    return {
      included: 0,
      excluded: typeof license.blockedArtifactCount === 'number' ? license.blockedArtifactCount : 0,
      unknown: 0,
      commercialSafe: typeof license.commercialSafe === 'boolean' ? license.commercialSafe : null,
    };
  }
  let included = 0;
  let excluded = 0;
  let unknown = 0;
  for (const row of classifications) {
    const status = String(row.status ?? '').toUpperCase();
    if (status === 'COMMERCIAL_SAFE') included += 1;
    else if (status === 'UNKNOWN' || status === '') unknown += 1;
    else excluded += 1;
  }
  return {
    included,
    excluded,
    unknown,
    commercialSafe: typeof license.commercialSafe === 'boolean' ? license.commercialSafe : null,
  };
}

export function ExportScreen() {
  const { selectedPath, hasActiveProject, navigate } = useStudio();
  const [force, setForce] = useState(false);
  const [zip, setZip] = useState(true);
  const [commercialSafe, setCommercialSafe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [godotError, setGodotError] = useState<string | null>(null);
  const [godotLabel, setGodotLabel] = useState<string | null>(null);
  const [completion, setCompletion] = useState<ReadinessCompletion | null>(null);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const refreshCompletion = useCallback(
    async (path = selectedPath) => {
      if (!path || !window.metroforge?.getProjectDashboard) {
        setCompletion(null);
        return;
      }
      setLoading(true);
      try {
        const dash = await window.metroforge.getProjectDashboard(path);
        const data = dash as { completion?: ReadinessCompletion };
        setCompletion(data.completion ?? null);
      } finally {
        setLoading(false);
      }
    },
    [selectedPath],
  );

  const refreshGodot = useCallback(async () => {
    if (!window.metroforge?.resolveGodot) {
      setGodotLabel(null);
      return;
    }
    try {
      const resolved = await window.metroforge.resolveGodot(selectedPath);
      if (!resolved.path) {
        setGodotLabel('Godot: not found');
        return;
      }
      setGodotLabel(
        `Godot: ${resolved.version ?? '—'} · ${resolved.sourceLabel}${resolved.path ? ` · ${resolved.path}` : ''}`,
      );
    } catch {
      setGodotLabel(null);
    }
  }, [selectedPath]);

  useEffect(() => {
    void refreshCompletion(selectedPath);
  }, [selectedPath, refreshCompletion]);

  useEffect(() => {
    void refreshGodot();
  }, [refreshGodot]);

  const readiness = deriveProjectReadiness(completion);
  const commercialPreview = summarizeCommercialSafe(exportResult?.manifest);

  const runExport = async () => {
    if (!selectedPath || !window.metroforge?.exportProject) return;
    if (readiness.status === 'BLOCKED' && !force) {
      setError('Export blocked by preflight. Enable force export only if you intentionally bypass gates.');
      return;
    }
    setBusy(true);
    setError(null);
    setExportResult(null);
    const result = await window.metroforge.exportProject(selectedPath, { force, zip, commercialSafe });
    setBusy(false);
    setExportResult(result);
    if (!result.success) {
      setError(result.errors?.join('; ') ?? 'Export failed');
    }
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

  return (
    <section className="workspace-screen export-screen">
      <ScreenHeader
        eyebrow="Ship"
        title="Export"
        description="Release pipeline — real preflight from project completion, QA gates, and asset production. Packages ZIP / Godot project only."
        actions={<ProjectSelect />}
      />
      <NoProjectHint />

      {hasActiveProject && (
        <div className="export-preflight-layout">
          <div className="export-preflight-center form-stack">
            <ProjectReadinessSummary
              completion={completion}
              title="Export preflight"
              loading={loading}
              onNavigate={navigate}
              onRefresh={() => void refreshCompletion()}
            />

            {completion?.assetProductionGate ? (
              <Panel level={1} title="Asset production gate">
                <AssetProductionGatePanel gate={completion.assetProductionGate} />
                <div style={{ marginTop: '0.75rem' }}>
                  <AllowPlaceholdersControl onChanged={() => void refreshCompletion()} />
                </div>
                <div className="row" style={{ marginTop: '0.5rem' }}>
                  <Button disabled={backfillBusy} onClick={() => void runBackfill()}>
                    {backfillBusy ? 'Backfilling…' : 'Backfill maturity'}
                  </Button>
                  <Button onClick={() => navigate('QA')}>Open QA</Button>
                  <Button onClick={() => navigate('Dashboard')}>Dashboard</Button>
                </div>
                {backfillMessage && <p className="hint">{backfillMessage}</p>}
              </Panel>
            ) : null}
          </div>

          <div className="form-stack">
            <Panel level={1} title="Build configuration">
              <p className="hint">
                Real package options only — ZIP archive and Godot project folder. No platform executable builders.
              </p>
              <label className="check-inline">
                <input type="checkbox" checked={zip} onChange={(e) => setZip(e.target.checked)} />
                Create ZIP archive
              </label>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={commercialSafe}
                  onChange={(e) => setCommercialSafe(e.target.checked)}
                />
                Require commercial-safe licenses
              </label>
              <label className="check-inline">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                Force export (bypass incomplete QA)
              </label>
              {force && (
                <p className="result error" role="alert">
                  Force export is on — incomplete validation / production gates will be bypassed. Use only for
                  prototypes.
                </p>
              )}
              {godotLabel && <p className="hint mono">{godotLabel}</p>}
              <div className="row">
                <Button
                  variant="primary"
                  disabled={!selectedPath || busy || (readiness.status === 'BLOCKED' && !force)}
                  onClick={() => void runExport()}
                >
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
              {error && <p className="result error">{error}</p>}
              {godotError && <p className="result error">{godotError}</p>}
            </Panel>

            <Panel level={1} title="Commercial-safe report">
              {!exportResult ? (
                <EmptyState
                  title="No export yet"
                  description="Run export to see included / excluded / unknown license classifications from the real license audit."
                />
              ) : commercialPreview ? (
                <div className="export-commercial-grid">
                  <Badge tone="success">Included {commercialPreview.included}</Badge>
                  <Badge tone="danger">Excluded {commercialPreview.excluded}</Badge>
                  <Badge tone="warning">Unknown {commercialPreview.unknown}</Badge>
                  <Badge tone={commercialPreview.commercialSafe ? 'success' : 'danger'}>
                    {commercialPreview.commercialSafe == null
                      ? 'Commercial-safe —'
                      : commercialPreview.commercialSafe
                        ? 'Commercial-safe YES'
                        : 'Commercial-safe NO'}
                  </Badge>
                </div>
              ) : (
                <p className="hint">Manifest had no license summary.</p>
              )}
            </Panel>

            {exportResult?.success && (
              <Panel level={1} title="Artifacts">
                <ul className="check-list">
                  {exportResult.archivePath && (
                    <li className="check-pass">
                      <Badge tone="success">ZIP</Badge> {exportResult.archivePath}
                    </li>
                  )}
                  {exportResult.manifestPath && (
                    <li className="check-pass">
                      <Badge tone="success">Manifest</Badge> {exportResult.manifestPath}
                    </li>
                  )}
                  {!exportResult.archivePath && !exportResult.manifestPath && (
                    <li className="hint">Export succeeded — open the project Exports folder for packages.</li>
                  )}
                </ul>
                {(exportResult.warnings?.length ?? 0) > 0 && (
                  <ul className="check-list">
                    {exportResult.warnings!.map((w) => (
                      <li key={w} className="check-warn">
                        <Badge tone="warning">WARN</Badge> {w}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
