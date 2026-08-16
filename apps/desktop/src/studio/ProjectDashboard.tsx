import { useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { NavId } from './nav.js';
import {
  AssetProductionGatePanel,
  type AssetProductionGateView,
} from './AssetProductionGatePanel.js';
import { AllowPlaceholdersControl } from './AllowPlaceholdersControl.js';
import { ProjectReadinessSummary } from './ProjectReadinessSummary.js';
import { Badge, Button, DataTable, EmptyState, Panel } from './ui/index.js';

type PlaytestRouteSummary = {
  reachable: boolean;
  startRoomId: string;
  victoryRoomId: string;
  victoryBossId: string;
  transitionCount: number;
  personaId?: string;
  personaDisplayName?: string;
};

type PlaytestTelemetryRecord = {
  personaId: string;
  elapsedMs: number;
  transitionsPlanned: number;
  transitionsCompleted: number;
  pickupsCollected: number;
  attacksPerformed: number;
  abilitiesAfterRun: string[];
  roomsVisited: string[];
  victoryBossId: string;
  bossFightMs: number;
  avgTransitionMs: number;
  inputSimulationUsed: boolean;
  victoryState: boolean;
  gameComplete: boolean;
  balanceHints: string[];
  balanceSummary?: string[];
};

type DashboardData = {
  title?: string;
  profile?: string;
  seed?: number;
  roomCount?: number;
  assetCount?: number;
  enemyCount?: number;
  bossCount?: number;
  questCount?: number;
  overallProgress?: number;
  validationReport?: { passed?: boolean; validationLevel?: string };
  dependencyAssetCount?: number;
  godotResourceCount?: number;
  godotScannedFiles?: number;
  completion?: {
    productionReady: boolean;
    victoryPathReady: boolean;
    validationPassed: boolean;
    validationLevel?: string;
    finalBossId: string;
    finalQuestId?: string;
    completionScore: number;
    blockers: string[];
    warnings: string[];
    checklist: Array<{ id: string; label: string; passed: boolean; detail?: string }>;
    assetProductionGate?: AssetProductionGateView;
  };
  assetCoverage?: {
    coveragePercent: number;
    totalPresent: number;
    totalExpected: number;
    missing: string[];
  };
  recentEvents?: Array<{ type: string; timestamp: string }>;
  playtestRoute?: PlaytestRouteSummary;
  playtestTelemetry?: PlaytestTelemetryRecord;
  projectMemory?: {
    chunkCount: number;
    provider: string;
    model: string;
    createdAt: string;
  };
  projectPath?: string;
};

function formatPlaytestHint(hint: string): string {
  return hint.replace(/_/g, ' ');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function logTone(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('fail') || t.includes('error')) return 'log-fail';
  if (t.includes('warn')) return 'log-warn';
  if (t.includes('pass') || t.includes('success') || t.includes('complete')) return 'log-pass';
  return '';
}

const QUICK_LAUNCH: Array<{ id: NavId; label: string; shortcut?: string }> = [
  { id: 'Studio', label: 'Generation Studio', shortcut: 'Ctrl+3' },
  { id: 'World', label: 'World Editor' },
  { id: 'Rooms', label: 'Room Editor' },
  { id: 'Assets', label: 'Asset Gallery', shortcut: 'Ctrl+5' },
  { id: 'QA', label: 'QA' },
  { id: 'Routing', label: 'Routing Inspector' },
];

export function ProjectDashboard() {
  const { selectedPath, hasActiveProject, navigate, openRoom, projects, setSelectedPath } = useStudio();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [godotError, setGodotError] = useState<string | null>(null);
  const [acceptResult, setAcceptResult] = useState<string | null>(null);
  const [remapResult, setRemapResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Array<{ id: string; label: string; timestamp: string }>>([]);
  const [hardware, setHardware] = useState<string | null>(null);
  const [providerStats, setProviderStats] = useState<{ healthy: number; total: number } | null>(null);
  const [modelCount, setModelCount] = useState<number | null>(null);

  const jump = (id: NavId) => navigate(id);

  const refreshDashboard = async (path = selectedPath) => {
    if (!path || !window.metroforge?.getProjectDashboard) {
      setDashboard(null);
      return;
    }
    setLoading(true);
    try {
      setDashboard((await window.metroforge.getProjectDashboard(path)) as DashboardData);
      if (window.metroforge.listProjectCheckpoints) {
        setCheckpoints(await window.metroforge.listProjectCheckpoints(path));
      } else {
        setCheckpoints([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshDashboard(selectedPath);
  }, [selectedPath]);

  useEffect(() => {
    if (!window.metroforge?.getHardwareProfile) {
      setHardware(null);
      return;
    }
    window.metroforge
      .getHardwareProfile()
      .then((hw) => {
        if (!hw) {
          setHardware(null);
          return;
        }
        setHardware(
          `${hw.profile}${hw.vramMb ? ` · ${Math.round(hw.vramMb / 1024)} GB VRAM` : ` · ${Math.round(hw.totalRamMb / 1024)} GB RAM`}`,
        );
      })
      .catch(() => setHardware(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadEnv = async () => {
      try {
        const [list, models] = await Promise.all([
          window.metroforge?.listProviders?.(),
          window.metroforge?.listModels?.(),
        ]);
        if (cancelled) return;
        if (list) {
          setProviderStats({
            healthy: list.filter((p) => p.health === 'healthy' && p.enabled).length,
            total: list.length,
          });
        }
        if (models) setModelCount(models.length);
      } catch {
        if (!cancelled) {
          setProviderStats(null);
          setModelCount(null);
        }
      }
    };
    void loadEnv();
    return () => {
      cancelled = true;
    };
  }, []);

  const progress = dashboard?.overallProgress ?? 0;
  const qaLabel =
    dashboard?.validationReport?.validationLevel ??
    (dashboard?.validationReport?.passed ? 'PASS' : null);
  const envHealthy =
    (providerStats?.healthy ?? 0) > 0 &&
    (dashboard?.validationReport?.passed !== false || qaLabel == null);

  return (
    <section className="workspace-screen dashboard-screen">
      <ScreenHeader
        eyebrow="Create"
        title="Dashboard"
        description="Timeline, environment, recent projects, and live project telemetry."
        actions={
          <div className="row">
            <ProjectSelect />
            <Button disabled={!hasActiveProject || loading} onClick={() => void refreshDashboard()}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button onClick={() => jump('Models')}>Open catalog</Button>
          </div>
        }
      />
      <NoProjectHint />

      {hasActiveProject && !dashboard && loading && <p className="hint">Loading dashboard…</p>}
      {hasActiveProject && !dashboard && !loading && (
        <EmptyState
          className="dashboard-empty-error"
          title="Dashboard unavailable"
          description="getProjectDashboard returned no data for this project. Environment widgets below still use live provider/model IPC when available."
          actions={
            <>
              <Button variant="primary" onClick={() => void refreshDashboard()}>
                Try again
              </Button>
              <Button onClick={() => jump('Studio')}>Generation Studio</Button>
              <Button onClick={() => jump('QA')}>Open QA</Button>
              <Button onClick={() => jump('Providers')}>Providers</Button>
            </>
          }
        />
      )}

      {hasActiveProject && !dashboard && !loading && (
        <div className="dashboard-layout-concept dashboard-fallback-env">
          <Panel level={1} title="Environment (live)">
            <div className="dashboard-env-stats">
              <div>
                <span>Providers</span>
                <strong>{providerStats ? `${providerStats.healthy}/${providerStats.total}` : '—'}</strong>
              </div>
              <div>
                <span>Models</span>
                <strong>{modelCount ?? '—'}</strong>
              </div>
              <div>
                <span>Hardware</span>
                <strong>{hardware ?? 'unavailable'}</strong>
              </div>
            </div>
          </Panel>
          <Panel level={1} title="Quick Launch">
            <div className="quick-launch">
              {QUICK_LAUNCH.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="quick-launch-item"
                  onClick={() => jump(item.id)}
                >
                  <span>{item.label}</span>
                  {item.shortcut ? <kbd>{item.shortcut}</kbd> : <span className="quick-launch-hint">—</span>}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {dashboard && (
        <div className="dashboard-layout-concept">
          <div className="dashboard-main-col">
            <div className="dashboard-kpi-row">
              <Panel level={2} className="dashboard-kpi" title="Timeline">
                <h3 style={{ textTransform: 'none', letterSpacing: 0, fontSize: '1rem', marginBottom: '0.2rem' }}>
                  {dashboard.title ?? 'Untitled project'}
                </h3>
                <p className="hint">
                  {dashboard.profile ?? '—'} · seed {dashboard.seed ?? '—'}
                </p>
                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={{ width: `${progress}%` }} />
                </div>
                <p>
                  {progress}% ·{' '}
                  {dashboard.completion?.productionReady
                    ? 'Production ready'
                    : loading
                      ? 'Refreshing'
                      : 'Idle'}
                </p>
              </Panel>

              <Panel level={1} className="dashboard-kpi" title="Environment">
                <div className="dashboard-env-status">
                  <span className={envHealthy ? 'status-dot ok' : 'status-dot error'} aria-hidden="true" />
                  <span>
                    Overall Status:{' '}
                    <strong style={{ color: envHealthy ? 'var(--success)' : 'var(--warning)' }}>
                      {envHealthy ? 'Healthy' : 'Attention'}
                    </strong>
                  </span>
                </div>
                <div className="dashboard-env-stats">
                  <div>
                    <span>Providers</span>
                    <strong>
                      {providerStats ? `${providerStats.healthy}/${providerStats.total}` : '—'}
                    </strong>
                  </div>
                  <div>
                    <span>Models</span>
                    <strong>{modelCount ?? '—'}</strong>
                  </div>
                  <div>
                    <span>QA</span>
                    <strong>{qaLabel ?? (dashboard.completion?.validationPassed ? 'PASS' : '—')}</strong>
                  </div>
                </div>
                <p className="hint" style={{ marginTop: '0.4rem' }}>
                  {hardware ?? 'Hardware unavailable'}
                </p>
              </Panel>

              <Panel level={1} className="dashboard-kpi" title="Checkpoints">
                {checkpoints.length > 0 ? (
                  <ul className="checkpoint-list">
                    {checkpoints.slice(0, 4).map((cp) => (
                      <li key={cp.id}>
                        <strong>{cp.label || cp.id}</strong>
                        <span className="hint"> · {new Date(cp.timestamp).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">No checkpoints synced for this project.</p>
                )}
              </Panel>
            </div>

            <ProjectReadinessSummary
              completion={dashboard.completion}
              title="Project readiness"
              compact
              loading={loading}
              onNavigate={jump}
              onRefresh={() => void refreshDashboard()}
            />

            <div className="dashboard-mid-row">
              <Panel
                level={1}
                title="Recent Projects"
                actions={
                  <Button size="sm" onClick={() => jump('Projects')}>
                    Open Projects
                  </Button>
                }
              >
                {projects.length > 0 ? (
                  <DataTable columns={['Name', 'Profile', 'Status']}>
                    {projects.slice(0, 8).map((p) => (
                      <tr key={p.path} className={p.path === selectedPath ? 'row-selected' : undefined}>
                        <td>
                          <button
                            type="button"
                            className="status-link"
                            onClick={() => {
                              setSelectedPath(p.path);
                            }}
                          >
                            {p.title ?? p.slug}
                          </button>
                        </td>
                        <td>{p.profile ?? '—'}</td>
                        <td>
                          <Badge tone={p.path === selectedPath ? 'success' : 'muted'}>
                            {p.path === selectedPath ? 'Active' : 'Library'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                ) : (
                  <EmptyState title="No projects" description="Commission a game to populate the library." />
                )}
              </Panel>

              <Panel level={1} title="Quick Launch">
                <div className="quick-launch">
                  {QUICK_LAUNCH.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="quick-launch-item"
                      onClick={() => jump(item.id)}
                    >
                      <span>{item.label}</span>
                      {item.shortcut ? <kbd>{item.shortcut}</kbd> : <span className="quick-launch-hint">—</span>}
                    </button>
                  ))}
                </div>
                <div className="quick-launch-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      setGodotError(null);
                      if (!selectedPath) return;
                      const r = await window.metroforge!.playInGodot!(selectedPath);
                      if (!r.success) setGodotError(r.message);
                    }}
                  >
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setAcceptResult(null);
                      if (!selectedPath || !window.metroforge?.runProjectAcceptance) return;
                      const r = await window.metroforge.runProjectAcceptance(selectedPath);
                      setAcceptResult(r.formatted);
                      await refreshDashboard(selectedPath);
                    }}
                  >
                    Acceptance
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setRemapResult(null);
                      setGodotError(null);
                      if (!selectedPath || !window.metroforge?.remapProjectAbilities) return;
                      const r = await window.metroforge.remapProjectAbilities(selectedPath);
                      if (!r.success) {
                        setGodotError(r.errors.join('; ') || 'Remap failed');
                        return;
                      }
                      const parts = [
                        r.changed ? 'Updated project abilities / refs' : 'No ability changes',
                        `${r.abilityCount} abilities`,
                      ];
                      if (r.remapped.length) {
                        parts.push(`remapped: ${r.remapped.map((x) => `${x.from}→${x.to}`).join(', ')}`);
                      }
                      if (r.removed.length) {
                        parts.push(`removed: ${r.removed.join(', ')}`);
                      }
                      if (r.referenceFilesUpdated?.length) {
                        parts.push(`refs: ${r.referenceFilesUpdated.join(', ')}`);
                      }
                      setRemapResult(parts.join(' · '));
                      await refreshDashboard(selectedPath);
                    }}
                  >
                    Remap
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setGodotError(null);
                      if (selectedPath) await window.metroforge?.revealProjectFolder?.(selectedPath);
                    }}
                  >
                    Folder
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setGodotError(null);
                      if (!selectedPath) return;
                      const r = await window.metroforge!.openInGodot!(selectedPath);
                      if (!r.success) setGodotError(r.message);
                    }}
                  >
                    Godot
                  </Button>
                </div>
              </Panel>
            </div>

            <Panel level={1} title="Completion checklist">
              {dashboard.completion ? (
                <>
                  <ul className="check-list">
                    {dashboard.completion.checklist.map((item) => (
                      <li key={item.id} className={item.passed ? 'check-pass' : 'check-warn'}>
                        {item.label}
                        {item.detail ? ` — ${item.detail}` : ''}
                      </li>
                    ))}
                  </ul>
                  {dashboard.completion.blockers.length > 0 && (
                    <ul className="check-list">
                      {dashboard.completion.blockers.map((blocker) => (
                        <li key={blocker} className="check-warn">
                          {blocker}
                        </li>
                      ))}
                    </ul>
                  )}
                  <AssetProductionGatePanel gate={dashboard.completion.assetProductionGate} />
                  <div style={{ marginTop: '0.65rem' }}>
                    <AllowPlaceholdersControl onChanged={() => void refreshDashboard()} />
                  </div>
                  {dashboard.completion.warnings.length > 0 && (
                    <ul className="check-list" style={{ marginTop: '0.5rem' }}>
                      {dashboard.completion.warnings.map((warning) => (
                        <li key={warning} className="hint">
                          {warning}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="hint">No checklist available</p>
              )}
            </Panel>

            <Panel level={1} title="Playtest">
              {dashboard.playtestRoute || dashboard.playtestTelemetry ? (
                <>
                  {dashboard.playtestRoute && (
                    <ul className="stat-list">
                      <li>
                        Route: {dashboard.playtestRoute.reachable ? 'reachable' : 'unreachable'} ·{' '}
                        {dashboard.playtestRoute.transitionCount} transitions
                      </li>
                      <li>
                        <button
                          type="button"
                          className="status-link"
                          onClick={() => openRoom(dashboard.playtestRoute!.startRoomId)}
                        >
                          {dashboard.playtestRoute.startRoomId}
                        </button>
                        {' → '}
                        <button
                          type="button"
                          className="status-link"
                          onClick={() => openRoom(dashboard.playtestRoute!.victoryRoomId)}
                        >
                          {dashboard.playtestRoute.victoryRoomId}
                        </button>
                      </li>
                      {dashboard.playtestRoute.personaDisplayName && (
                        <li>
                          Persona: {dashboard.playtestRoute.personaDisplayName}
                          {dashboard.playtestRoute.personaId ? ` (${dashboard.playtestRoute.personaId})` : ''}
                        </li>
                      )}
                    </ul>
                  )}
                  {dashboard.playtestTelemetry ? (
                    <>
                      <p
                        className={
                          dashboard.playtestTelemetry.victoryState && dashboard.playtestTelemetry.gameComplete
                            ? 'check-pass'
                            : 'check-warn'
                        }
                      >
                        {dashboard.playtestTelemetry.victoryState && dashboard.playtestTelemetry.gameComplete
                          ? 'Last run: victory'
                          : 'Last run: incomplete'}
                        {' · '}
                        {formatDuration(dashboard.playtestTelemetry.elapsedMs)}
                      </p>
                      <ul className="stat-list">
                        <li>
                          Transitions: {dashboard.playtestTelemetry.transitionsCompleted}/
                          {dashboard.playtestTelemetry.transitionsPlanned}
                        </li>
                        <li>
                          Pickups: {dashboard.playtestTelemetry.pickupsCollected} · Attacks:{' '}
                          {dashboard.playtestTelemetry.attacksPerformed}
                        </li>
                        {dashboard.playtestTelemetry.roomsVisited.length > 0 && (
                          <li>
                            Rooms visited:{' '}
                            {dashboard.playtestTelemetry.roomsVisited.slice(0, 8).map((roomId) => (
                              <button key={roomId} type="button" className="tab" onClick={() => openRoom(roomId)}>
                                {roomId}
                              </button>
                            ))}
                          </li>
                        )}
                      </ul>
                      {(dashboard.playtestTelemetry.balanceSummary?.length ??
                        dashboard.playtestTelemetry.balanceHints.length) > 0 && (
                        <ul className="check-list">
                          {(
                            dashboard.playtestTelemetry.balanceSummary ?? dashboard.playtestTelemetry.balanceHints
                          ).map((hint) => (
                            <li key={hint} className="check-warn">
                              {formatPlaytestHint(hint)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="hint">No telemetry yet — run acceptance to record a playtest run</p>
                  )}
                </>
              ) : (
                <p className="hint">Playtest route unavailable — regenerate project to enable the bot</p>
              )}
            </Panel>
          </div>

          <div className="dashboard-side-col">
            <Panel level={1} title="World snapshot">
              <ul className="stat-list">
                <li>{dashboard.roomCount ?? '—'} rooms</li>
                <li>{dashboard.enemyCount ?? '—'} enemies</li>
                <li>{dashboard.bossCount ?? '—'} bosses</li>
                <li>{dashboard.questCount ?? '—'} quests</li>
                <li>{dashboard.assetCount ?? '—'} artifacts</li>
                {dashboard.assetCoverage && (
                  <li>
                    Coverage {dashboard.assetCoverage.coveragePercent}% (
                    {dashboard.assetCoverage.totalPresent}/{dashboard.assetCoverage.totalExpected})
                  </li>
                )}
                {dashboard.completion && (
                  <li>
                    <Badge tone={dashboard.completion.productionReady ? 'success' : 'warning'}>
                      {dashboard.completion.productionReady ? 'Production ready' : 'Not ready'} ·{' '}
                      {dashboard.completion.completionScore}%
                    </Badge>
                  </li>
                )}
              </ul>
            </Panel>

            <Panel level={1} title="Project path">
              <ul className="stat-list">
                <li>
                  <span className="mono">{dashboard.projectPath ?? selectedPath ?? '—'}</span>
                </li>
                <li>
                  Memory:{' '}
                  {dashboard.projectMemory
                    ? `${dashboard.projectMemory.chunkCount} chunks · ${dashboard.projectMemory.provider}`
                    : 'Not indexed'}
                </li>
                <li>
                  Godot resources:{' '}
                  {dashboard.godotResourceCount != null
                    ? `${dashboard.godotResourceCount} (${dashboard.godotScannedFiles} scanned)`
                    : '—'}
                </li>
              </ul>
            </Panel>

            <Panel
              level={1}
              title="System Log"
              actions={
                <Button size="sm" onClick={() => jump('Providers')}>
                  Open Providers
                </Button>
              }
            >
              {godotError && <p className="result error">{godotError}</p>}
              {remapResult && <p className="hint">{remapResult}</p>}
              {acceptResult ? (
                <pre className="system-log" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {acceptResult}
                </pre>
              ) : (
                <ul className="system-log">
                  {(dashboard.recentEvents ?? [])
                    .slice()
                    .reverse()
                    .slice(0, 12)
                    .map((e, i) => (
                      <li key={`log-${e.timestamp}-${i}`} className={logTone(e.type)}>
                        {new Date(e.timestamp).toLocaleTimeString()} {e.type}
                      </li>
                    ))}
                  {(dashboard.recentEvents?.length ?? 0) === 0 && (
                    <li className="hint">No system messages yet.</li>
                  )}
                </ul>
              )}
            </Panel>

            <Panel level={1} className="dashboard-recent" title="Recent activity">
              {dashboard.recentEvents && dashboard.recentEvents.length > 0 ? (
                <DataTable columns={['Time', 'Event', '']}>
                  {dashboard.recentEvents
                    .slice()
                    .reverse()
                    .slice(0, 12)
                    .map((e, i) => (
                      <tr key={`${e.timestamp}-${e.type}-${i}`}>
                        <td className="mono">{new Date(e.timestamp).toLocaleTimeString()}</td>
                        <td>{e.type}</td>
                        <td>
                          <button type="button" className="tab" onClick={() => jump('Studio')}>
                            Open Studio
                          </button>
                        </td>
                      </tr>
                    ))}
                </DataTable>
              ) : (
                <p className="hint">No recent generation events for this project.</p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </section>
  );
}
