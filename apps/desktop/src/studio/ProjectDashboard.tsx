import { useEffect, useState } from 'react';
import type { StudioProject } from './types';

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

export function ProjectDashboard() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [godotError, setGodotError] = useState<string | null>(null);
  const [acceptResult, setAcceptResult] = useState<string | null>(null);

  useEffect(() => {
    window.metroforge?.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedPath((p) => p || list[0]!.path);
    });
  }, []);

  useEffect(() => {
    if (!selectedPath || !window.metroforge?.getProjectDashboard) return;
    window.metroforge.getProjectDashboard(selectedPath).then(setDashboard);
  }, [selectedPath]);

  return (
    <section>
      <h2>Project Dashboard</h2>
      <label>
        Project
        <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)}>
          {projects.map((p) => (
            <option key={p.slug} value={p.path}>
              {p.title ?? p.slug}
            </option>
          ))}
        </select>
      </label>

      {dashboard && (
        <div className="dashboard-grid">
          <div className="panel dashboard-stat">
            <h3>{dashboard.title}</h3>
            <p className="hint">
              {dashboard.profile} · seed {dashboard.seed}
            </p>
            <div className="progress-bar-wrap">
              <div className="progress-bar" style={{ width: `${dashboard.overallProgress ?? 0}%` }} />
            </div>
            <p>{dashboard.overallProgress ?? 0}% generation progress</p>
          </div>

          <div className="panel dashboard-stat">
            <h4>World</h4>
            <ul className="stat-list">
              <li>{dashboard.roomCount} rooms</li>
              <li>{dashboard.enemyCount} enemies</li>
              <li>{dashboard.bossCount} bosses</li>
              <li>{dashboard.questCount} quests</li>
            </ul>
          </div>

          <div className="panel dashboard-stat">
            <h4>Completion</h4>
            {dashboard.completion ? (
              <>
                <p className={dashboard.completion.productionReady ? 'check-pass' : 'check-warn'}>
                  {dashboard.completion.productionReady ? 'Production ready' : 'Not production ready'}{' '}
                  · {dashboard.completion.completionScore}%
                </p>
                <ul className="stat-list">
                  <li>Victory path: {dashboard.completion.victoryPathReady ? 'ready' : 'incomplete'}</li>
                  <li>Final boss: {dashboard.completion.finalBossId}</li>
                  {dashboard.completion.finalQuestId && (
                    <li>Victory quest: {dashboard.completion.finalQuestId}</li>
                  )}
                </ul>
                <ul className="check-list">
                  {dashboard.completion.checklist.map((item) => (
                    <li key={item.id} className={item.passed ? 'check-pass' : 'check-warn'}>
                      {item.label}
                      {item.detail ? ` — ${item.detail}` : ''}
                    </li>
                  ))}
                </ul>
                {dashboard.completion.blockers.length > 0 && (
                  <p className="result error">{dashboard.completion.blockers.join('; ')}</p>
                )}
                {dashboard.completion.warnings.length > 0 && (
                  <p className="hint">{dashboard.completion.warnings.join('; ')}</p>
                )}
              </>
            ) : (
              <p className="hint">Completion analysis unavailable</p>
            )}
          </div>

          <div className="panel dashboard-stat">
            <h4>Assets & QA</h4>
            <ul className="stat-list">
              <li>{dashboard.assetCount} manifest artifacts</li>
              {dashboard.assetCoverage && (
                <li>
                  Asset coverage: {dashboard.assetCoverage.coveragePercent}% (
                  {dashboard.assetCoverage.totalPresent}/{dashboard.assetCoverage.totalExpected})
                </li>
              )}
              <li>{dashboard.dependencyAssetCount} dependency tracked</li>
              {dashboard.godotResourceCount != null && (
                <li>{dashboard.godotResourceCount} Godot resources indexed ({dashboard.godotScannedFiles} files scanned)</li>
              )}
              <li>
                Validation:{' '}
                {dashboard.validationReport?.validationLevel ??
                  (dashboard.validationReport?.passed ? 'PASS' : 'unknown')}
              </li>
            </ul>
          </div>

          <div className="panel dashboard-stat">
            <h4>Project Memory (RAG)</h4>
            {dashboard.projectMemory ? (
              <>
                <p className="check-pass">{dashboard.projectMemory.chunkCount} indexed chunks</p>
                <ul className="stat-list">
                  <li>
                    Provider: {dashboard.projectMemory.provider || 'unknown'}
                    {dashboard.projectMemory.model ? ` · ${dashboard.projectMemory.model}` : ''}
                  </li>
                  {dashboard.projectMemory.createdAt && (
                    <li>Indexed: {new Date(dashboard.projectMemory.createdAt).toLocaleString()}</li>
                  )}
                </ul>
                <p className="hint">AI commands in this project use these chunks for context retrieval.</p>
              </>
            ) : (
              <p className="hint">
                No project memory index — regenerate with Ollama embeddings available, or run a generation
                that completes assembly.
              </p>
            )}
          </div>

          <div className="panel dashboard-stat">
            <h4>Playtest</h4>
            {dashboard.playtestRoute || dashboard.playtestTelemetry ? (
              <>
                {dashboard.playtestRoute && (
                  <ul className="stat-list">
                    <li>
                      Route: {dashboard.playtestRoute.reachable ? 'reachable' : 'unreachable'} ·{' '}
                      {dashboard.playtestRoute.transitionCount} transitions
                    </li>
                    <li>
                      {dashboard.playtestRoute.startRoomId} → {dashboard.playtestRoute.victoryRoomId}
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
                        {dashboard.playtestTelemetry.avgTransitionMs > 0 &&
                          ` · avg ${formatDuration(dashboard.playtestTelemetry.avgTransitionMs)}`}
                      </li>
                      <li>
                        Pickups: {dashboard.playtestTelemetry.pickupsCollected} · Attacks:{' '}
                        {dashboard.playtestTelemetry.attacksPerformed}
                      </li>
                      {dashboard.playtestTelemetry.bossFightMs > 0 && (
                        <li>Boss fight: {formatDuration(dashboard.playtestTelemetry.bossFightMs)}</li>
                      )}
                      {dashboard.playtestTelemetry.abilitiesAfterRun.length > 0 && (
                        <li>Abilities: {dashboard.playtestTelemetry.abilitiesAfterRun.join(', ')}</li>
                      )}
                      {dashboard.playtestTelemetry.roomsVisited.length > 0 && (
                        <li>Rooms visited: {dashboard.playtestTelemetry.roomsVisited.length}</li>
                      )}
                    </ul>
                    {(dashboard.playtestTelemetry.balanceSummary?.length ??
                      dashboard.playtestTelemetry.balanceHints.length) > 0 && (
                      <ul className="check-list">
                        {(dashboard.playtestTelemetry.balanceSummary ?? dashboard.playtestTelemetry.balanceHints).map(
                          (hint) => (
                            <li key={hint} className="check-warn">
                              {formatPlaytestHint(hint)}
                            </li>
                          ),
                        )}
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
          </div>

          <div className="panel dashboard-actions row">
            <button
              type="button"
              className="primary"
              onClick={async () => {
                setGodotError(null);
                if (!selectedPath) return;
                const r = await window.metroforge!.playInGodot!(selectedPath);
                if (!r.success) setGodotError(r.message);
              }}
            >
              Preview Game
            </button>
            <button
              type="button"
              onClick={async () => {
                setAcceptResult(null);
                if (!selectedPath || !window.metroforge?.runProjectAcceptance) return;
                const r = await window.metroforge.runProjectAcceptance(selectedPath);
                setAcceptResult(r.formatted);
                if (window.metroforge?.getProjectDashboard) {
                  window.metroforge.getProjectDashboard(selectedPath).then(setDashboard);
                }
              }}
            >
              Run Acceptance
            </button>
            <button
              type="button"
              onClick={async () => {
                setGodotError(null);
                if (selectedPath) await window.metroforge?.revealProjectFolder?.(selectedPath);
              }}
            >
              Open Folder
            </button>
            <button
              type="button"
              onClick={async () => {
                setGodotError(null);
                if (!selectedPath) return;
                const r = await window.metroforge!.openInGodot!(selectedPath);
                if (!r.success) setGodotError(r.message);
              }}
            >
              Open in Godot
            </button>
          </div>
        </div>
      )}

      {godotError && <p className="result error">{godotError}</p>}
      {acceptResult && (
        <pre className="panel" style={{ marginTop: '1rem', whiteSpace: 'pre-wrap' }}>
          {acceptResult}
        </pre>
      )}

      {dashboard?.recentEvents && dashboard.recentEvents.length > 0 && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <h4>Recent Activity</h4>
          <ul className="activity-feed">
            {dashboard.recentEvents
              .slice()
              .reverse()
              .map((e, i) => (
                <li key={i}>
                  {new Date(e.timestamp).toLocaleTimeString()} — {e.type}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
