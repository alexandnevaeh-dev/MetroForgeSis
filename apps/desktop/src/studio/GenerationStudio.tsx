import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatActivityMessage, phaseLabel, GENERATION_PHASES } from './format.js';
import { WorldMapPreview } from './WorldMapPreview.js';
import { GenerationQueuePanel } from './GenerationQueuePanel.js';
import { ConcurrencyMeters } from './ConcurrencyMeters.js';
import type { ActivityFilter, GenerationPhaseState } from './types.js';
import type { WorldGraphPreview } from './metroforge-api.js';
import { useStudio } from './StudioContext.js';
import { GENERATION_MODES, GENERATION_PROFILES } from './generation-options.js';
import { NoProjectHint } from './NoProjectHint.js';

type GenerationEvent = {
  type: string;
  timestamp: string;
  category?: string;
  message?: string;
  task?: string;
  phase?: string;
  status?: string;
  projectPath?: string;
  path?: string;
  artifactId?: string;
  assetType?: string;
  provider?: string;
  fallbackGenerated?: boolean;
  critiquePassed?: boolean;
  current?: number;
  total?: number;
  roomCount?: number;
  roomId?: string;
  validationPassed?: boolean;
  reason?: string;
  profile?: string;
  seed?: number;
  modelId?: string;
  gate?: string;
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: 'status-pending',
  RUNNING: 'status-running',
  PASSED: 'status-passed',
  FAILED: 'status-failed',
  SKIPPED: 'status-skipped',
  WARN: 'status-warn',
  DEGRADED: 'status-degraded',
  REPAIRING: 'status-repairing',
  CANCELLED: 'status-failed',
};

const COMPLETED_PHASE_STATUSES = new Set([
  'PASSED',
  'FAILED',
  'SKIPPED',
  'WARN',
  'DEGRADED',
  'CANCELLED',
]);

function phaseStatusLabel(status: string): string {
  if (status === 'DEGRADED') return 'DEGRADED (completed with warning)';
  if (status === 'WARN') return 'WARN (completed with warning)';
  return status;
}

export function GenerationStudio() {
  const { projects, selectedPath, setSelectedPath, refreshProjects, openRoom, openAsset, navigate } = useStudio();
  const [prompt, setPrompt] = useState('');
  const [profile, setProfile] = useState('TINY_TEST');
  const [mode, setMode] = useState('LOCAL_ONLY');
  const [seed, setSeed] = useState('42');
  const [generating, setGenerating] = useState(false);
  const [phases, setPhases] = useState<GenerationPhaseState[]>([]);
  const [events, setEvents] = useState<GenerationEvent[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [previewArtifact, setPreviewArtifact] = useState<GenerationEvent | null>(null);
  const [worldGraph, setWorldGraph] = useState<WorldGraphPreview | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('ALL');
  const [validationReport, setValidationReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationControl, setGenerationControl] = useState('autonomous');
  const [reviewPaused, setReviewPaused] = useState<{
    milestone: string;
    phase: string;
    message?: string;
    projectPath: string;
  } | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [godotError, setGodotError] = useState<string | null>(null);
  const [archetype, setArchetype] = useState('SIDE_VIEW_METROIDVANIA');
  const [previewMode, setPreviewMode] = useState<'artifact' | 'world'>('world');
  const [previewRoomId, setPreviewRoomId] = useState('');
  const [activityQuery, setActivityQuery] = useState('');

  const refreshState = useCallback(async (projectPath: string) => {
    if (!window.metroforge?.getGenerationState) return;
    const state = await window.metroforge.getGenerationState(projectPath);
    const nextEvents = (state.events ?? []) as GenerationEvent[];
    setPhases(state.phases ?? []);
    setEvents(nextEvents);
    setOverallProgress(state.overallProgress ?? 0);
    setValidationReport(state.validationReport ?? null);
    if (state.worldGraph) setWorldGraph(state.worldGraph as WorldGraphPreview);

    const lastArtifact = [...nextEvents].reverse().find((event) => event.type === 'ArtifactGenerated');
    if (lastArtifact) setPreviewArtifact(lastArtifact);
    const lastRoom = [...nextEvents].reverse().find((event) => event.roomId);
    if (lastRoom?.roomId) setPreviewRoomId(lastRoom.roomId);

    const running = (state.phases ?? []).some((phase) => phase.status === 'RUNNING' || phase.status === 'REPAIRING');
    setGenerating(running);

    const review = (await window.metroforge.getGenerationReviewState?.(projectPath)) as {
      pending?: { milestone: string; phase: string; message?: string; projectPath: string } | null;
    } | undefined;
    if (review?.pending) {
      setReviewPaused({
        milestone: review.pending.milestone,
        phase: review.pending.phase,
        message: review.pending.message,
        projectPath: review.pending.projectPath || projectPath,
      });
      setGenerating(true);
      const ready = await window.metroforge.getPreviewReadiness?.(projectPath);
      setPreviewReady(ready?.ready ?? false);
    } else {
      setReviewPaused(null);
      setPreviewReady(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPath) void refreshState(selectedPath);
  }, [selectedPath, refreshState]);

  useEffect(() => {
    const unsub = window.metroforge?.onGenerationReviewPaused?.((ctx) => {
      const c = ctx as { milestone: string; phase: string; message?: string; projectPath: string };
      setReviewPaused(c);
      setGenerating(true);
      if (c.projectPath) {
        window.metroforge?.getPreviewReadiness?.(c.projectPath).then((r) => setPreviewReady(r?.ready ?? false));
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const unsub = window.metroforge?.onGenerationProgress?.((data) => {
      setPhases((prev) => {
        const idx = prev.findIndex((p) => p.phase === data.phase);
        const entry = { phase: data.phase, status: data.status, message: data.message };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [...prev, entry];
      });
      if (data.status === 'RUNNING' || data.status === 'REPAIRING') setGenerating(true);
      if (data.message) setCurrentTask(data.message);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const unsub = window.metroforge?.onGenerationEvent?.((raw) => {
      const event = raw as GenerationEvent;
      setEvents((prev) => [...prev.slice(-499), event]);
      if (event.type === 'TaskStarted' || event.type === 'TaskProgress') {
        setCurrentTask(event.message ?? event.task ?? null);
      }
      if (event.type === 'ArtifactGenerated') {
        setPreviewArtifact(event);
        setPreviewMode('artifact');
      }
      if (event.type === 'WorldGraphUpdated' && event.projectPath) {
        window.metroforge?.getWorldGraph(event.projectPath).then((g) => setWorldGraph(g));
        setPreviewMode('world');
      }
      if (event.type === 'PhaseStarted' || event.type === 'PhaseCompleted') {
        setPhases((prev) => {
          const phase = event.phase ?? '';
          const idx = prev.findIndex((p) => p.phase === phase);
          const entry = {
            phase,
            status: event.status ?? 'RUNNING',
            message: event.message,
          };
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = entry;
            return next;
          }
          return [...prev, entry];
        });
      }
      if (event.type === 'GenerationCompleted' && event.projectPath) {
        refreshState(event.projectPath);
        setGenerating(false);
      }
    });
    return () => unsub?.();
  }, [refreshState]);

  const filteredActivity = useMemo(() => {
    const byCategory = activityFilter === 'ALL' ? events : events.filter((e) => e.category === activityFilter);
    const q = activityQuery.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((event) => formatActivityMessage(event).toLowerCase().includes(q));
  }, [events, activityFilter, activityQuery]);

  const activateEvent = (event: GenerationEvent) => {
    if (event.roomId) {
      openRoom(event.roomId);
      return;
    }
    if (event.artifactId) {
      openAsset(String(event.artifactId));
      return;
    }
    if (event.type?.includes('QA') || event.type?.includes('Validation') || event.type?.includes('Repair')) {
      navigate('QA');
    }
  };

  const handleGenerate = async () => {
    if (!window.metroforge?.generateGame || !prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setPhases([]);
    setEvents([]);
    setPreviewArtifact(null);
    setCurrentTask('Starting generation…');

    const result = await window.metroforge.generateGame({
      prompt,
      profile,
      mode,
      seed: Number(seed) || 42,
      generationControl,
      archetype,
    });

    if (result.outputPath) {
      await refreshProjects();
      setSelectedPath(result.outputPath);
      await refreshState(result.outputPath);
    }
    if (!result.success) {
      setError(result.errors?.join('; ') ?? 'Generation failed');
    }
    setGenerating(false);
    setReviewPaused(null);
  };

  const handleReviewDecision = async (approved: boolean) => {
    if (!reviewPaused?.projectPath || !window.metroforge?.approveGenerationReview) return;
    await window.metroforge.approveGenerationReview(reviewPaused.projectPath, approved);
    if (!approved) {
      setGenerating(false);
      setError('Generation cancelled at review gate');
    }
    setReviewPaused(null);
  };

  const handlePartialPreview = async () => {
    if (!reviewPaused?.projectPath) return;
    setGodotError(null);
    const result = await window.metroforge?.playInGodot?.(reviewPaused.projectPath);
    if (result && !result.success) setGodotError(result.message);
  };

  const phaseRows = GENERATION_PHASES.map((phase) => {
    const state = phases.find((p) => p.phase === phase);
    return { phase, status: state?.status ?? 'PENDING', message: state?.message };
  });

  const roomsGenerated = events.filter((e) => e.type === 'RoomGenerated').length;
  const lastQa = [...events].reverse().find((e) => e.type?.startsWith('QA') || e.type?.includes('Validation') || e.type?.includes('Repair'));
  const lastModel = [...events].reverse().find((e) => e.modelId || e.provider);
  const runningPhase = phases.find((p) => p.status === 'RUNNING');
  const liveProgress = useMemo(() => {
    const total = GENERATION_PHASES.length;
    const completed = GENERATION_PHASES.filter((phase) => {
      const status = phases.find((p) => p.phase === phase)?.status;
      return status != null && COMPLETED_PHASE_STATUSES.has(status);
    }).length;
    const running = phases.some((p) => p.status === 'RUNNING' || p.status === 'REPAIRING') ? 0.45 : 0;
    const derived = Math.min(100, Math.round(((completed + running) / total) * 100));
    return Math.max(overallProgress, derived);
  }, [phases, overallProgress]);

  const degradedPhases = phases.filter((p) => p.status === 'DEGRADED' || p.status === 'WARN');

  return (
    <section className="studio-layout">
      <header className="studio-header screen-header">
        <div>
          <p className="screen-eyebrow">Create</p>
          <h2>Generation Studio</h2>
          <p className="hint">Live pipeline events only — progress, artifacts, and QA update as the backend emits them.</p>
        </div>
      </header>
      <NoProjectHint />

      <div className="studio-generate-bar row panel-l2">
        <input
          className="studio-prompt"
          placeholder="Describe the world you want to forge…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={generating}
        />
        <select value={archetype} onChange={(e) => setArchetype(e.target.value)} disabled={generating}>
          <option value="SIDE_VIEW_METROIDVANIA">Side-view</option>
          <option value="TOP_DOWN_ACTION_ADVENTURE">Top-down</option>
        </select>
        <select value={profile} onChange={(e) => setProfile(e.target.value)} disabled={generating}>
          {GENERATION_PROFILES.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={generating}>
          {GENERATION_MODES.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select
          value={generationControl}
          onChange={(e) => setGenerationControl(e.target.value)}
          disabled={generating}
          title="Interactive mode pauses at review milestones"
        >
          <option value="autonomous">Autonomous</option>
          <option value="interactive">Interactive Review</option>
        </select>
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          style={{ width: '5rem' }}
          disabled={generating}
        />
        <button className="primary" onClick={handleGenerate} disabled={generating || !prompt.trim()}>
          {generating ? 'Generating…' : 'Generate Game'}
        </button>
      </div>

      {error && <p className="result error">{error}</p>}
      {godotError && <p className="result error">{godotError}</p>}

      {reviewPaused && (
        <div className="review-gate panel-l3">
          <h3>Review Gate: {reviewPaused.milestone}</h3>
          <p className="hint">{reviewPaused.message ?? reviewPaused.phase}</p>
          {previewReady && (
            <button type="button" onClick={handlePartialPreview}>
              Play Partial Preview in Godot
            </button>
          )}
          <div className="row">
            <button type="button" className="primary" onClick={() => handleReviewDecision(true)}>
              Approve &amp; Continue
            </button>
            <button type="button" onClick={() => handleReviewDecision(false)}>
              Cancel Generation
            </button>
          </div>
        </div>
      )}

      <div className="studio-workspace">
        <aside className="studio-phases panel-l1">
          <h3>Timeline</h3>
          <div className="progress-meta">
            <span>{liveProgress}%</span>
            <span>{runningPhase ? phaseLabel(runningPhase.phase) : generating ? 'Running' : 'Idle'}</span>
          </div>
          <div className="progress-bar-wrap" aria-label="Overall generation progress">
            <div className="progress-bar" style={{ width: `${liveProgress}%` }} />
          </div>
          {degradedPhases.length > 0 && (
            <div className="phase-degraded-banner">
              <p className="check-warn">
                {degradedPhases.length} phase{degradedPhases.length === 1 ? '' : 's'} completed with warning
                (DEGRADED/WARN) — not a hard failure.
              </p>
              <ul className="check-list">
                {degradedPhases.map((phase) => (
                  <li key={phase.phase} className="check-warn">
                    {phaseLabel(phase.phase)}: {phase.message ?? phase.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="phase-tree">
            {phaseRows.map(({ phase, status, message }) => (
              <li key={phase} className={`phase-tree-item ${STATUS_CLASS[status] ?? ''}`}>
                <span className="phase-name">{phaseLabel(phase)}</span>
                <span className="phase-status">{phaseStatusLabel(status)}</span>
                {message && <span className="phase-msg">{message}</span>}
              </li>
            ))}
          </ul>
        </aside>

        <div className="studio-preview panel-l1">
          <div className="editor-toolbar">
            <h3>Live preview</h3>
            <button
              type="button"
              className={previewMode === 'world' ? 'tab active' : 'tab'}
              onClick={() => setPreviewMode('world')}
            >
              World
            </button>
            <button
              type="button"
              className={previewMode === 'artifact' ? 'tab active' : 'tab'}
              onClick={() => setPreviewMode('artifact')}
            >
              Artifact
            </button>
          </div>
          {currentTask && <p className="current-task">{currentTask}</p>}
          {previewMode === 'artifact' && previewArtifact?.type === 'ArtifactGenerated' && (
            <LiveArtifactPreview
              event={previewArtifact}
              projectPath={selectedPath}
              onOpen={() => previewArtifact.artifactId && openAsset(previewArtifact.artifactId)}
            />
          )}
          {(previewMode === 'world' || !previewArtifact) && worldGraph && (
            <>
              <WorldMapPreview
                worldGraph={worldGraph}
                view={archetype === 'TOP_DOWN_ACTION_ADVENTURE' ? 'spatial' : 'progression'}
                selectedId={previewRoomId}
                onSelect={setPreviewRoomId}
                onActivate={openRoom}
              />
              {previewRoomId && (
                <div className="row" style={{ marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => openRoom(previewRoomId)}>
                    Open {previewRoomId} in Room Editor
                  </button>
                </div>
              )}
            </>
          )}
          {!previewArtifact && !worldGraph && (
            <p className="hint">Artifacts and world graph appear here as they are produced.</p>
          )}
        </div>

        <aside className="studio-details panel-l1">
          <h3>Task inspector</h3>
          <dl className="settings-dl">
            <dt>Current task</dt>
            <dd>{currentTask ?? 'Idle'}</dd>
            <dt>Phase</dt>
            <dd>{runningPhase ? phaseLabel(runningPhase.phase) : '—'}</dd>
            <dt>Model / provider</dt>
            <dd>
              {lastModel?.modelId ?? lastModel?.provider ?? previewArtifact?.provider ?? 'emitted on task/artifact events'}
            </dd>
            <dt>Rooms generated</dt>
            <dd>{roomsGenerated}</dd>
            <dt>Last QA / repair / Godot</dt>
            <dd>
              {lastQa ? `${lastQa.type}${lastQa.message ? ` — ${lastQa.message}` : ''}` : '—'}
              {lastQa && (
                <button type="button" className="tab" onClick={() => navigate('QA')}>
                  Open QA
                </button>
              )}
            </dd>
            <dt>Fallback</dt>
            <dd>{previewArtifact?.fallbackGenerated ? 'procedural fallback used' : '—'}</dd>
            <dt>Workers</dt>
            <dd>
              <ConcurrencyMeters compact />
            </dd>
          </dl>
          <h3>Project</h3>
          <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)}>
            <option value="">— select —</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.path}>
                {p.title ?? p.slug}
              </option>
            ))}
          </select>
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="primary"
              disabled={!selectedPath}
              onClick={async () => {
                setGodotError(null);
                if (!selectedPath || !window.metroforge?.playInGodot) return;
                const r = await window.metroforge.playInGodot(selectedPath);
                if (!r.success) setGodotError(r.message);
              }}
            >
              Play
            </button>
            <button
              type="button"
              disabled={!selectedPath}
              onClick={async () => {
                setGodotError(null);
                if (!selectedPath || !window.metroforge?.openInGodot) return;
                const r = await window.metroforge.openInGodot(selectedPath);
                if (!r.success) setGodotError(r.message);
              }}
            >
              Open in Godot
            </button>
          </div>
        </aside>

        <footer className="studio-footer panel-l1">
          <div className="studio-tabs row">
            <h3>Activity</h3>
            {(['ALL', 'AI', 'ASSETS', 'WORLD', 'GODOT', 'QA', 'ERROR'] as ActivityFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={activityFilter === f ? 'tab active' : 'tab'}
                onClick={() => setActivityFilter(f)}
              >
                {f}
              </button>
            ))}
            <input
              value={activityQuery}
              onChange={(e) => setActivityQuery(e.target.value)}
              placeholder="Search activity…"
              aria-label="Search activity"
            />
            {selectedPath && (
              <button type="button" onClick={() => void refreshState(selectedPath)}>
                Reload events
              </button>
            )}
          </div>
          {filteredActivity.length === 0 ? (
            <div className="empty-state">
              <p>
                {events.length === 0
                  ? 'Activity appears here as the pipeline emits events.'
                  : 'No events match this filter or search.'}
              </p>
              {events.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActivityFilter('ALL');
                    setActivityQuery('');
                  }}
                >
                  Clear activity filters
                </button>
              )}
            </div>
          ) : (
          <ul className="activity-feed">
            {filteredActivity
              .slice()
              .reverse()
              .slice(0, 80)
              .map((event, i) => (
                <li key={`${event.timestamp}-${i}`}>
                  <button
                    type="button"
                    className="activity-row"
                    onClick={() => activateEvent(event)}
                  >
                    {formatActivityMessage(event)}
                  </button>
                </li>
              ))}
          </ul>
          )}
          {validationReport && (
            <div className="qa-panel">
              <h4>QA — {String(validationReport.validationLevel ?? 'unknown')}</h4>
              <ul>
                {(validationReport.results as Array<{ gate: string; passed: boolean; message: string }> | undefined)?.map(
                  (r) => (
                    <li key={r.gate} className={r.passed ? 'check-pass' : 'check-warn'}>
                      {r.gate}: {r.passed ? 'PASS' : 'FAIL'} — {r.message}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
          <GenerationQueuePanel />
        </footer>
      </div>
    </section>
  );
}

function LiveArtifactPreview({
  event,
  projectPath,
  onOpen,
}: {
  event: GenerationEvent;
  projectPath: string;
  onOpen?: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectPath || !event.path || !window.metroforge?.getAssetPreview) return;
    window.metroforge.getAssetPreview(projectPath, event.path).then((r) => {
      if (r.dataUrl) setDataUrl(r.dataUrl);
    });
  }, [event.path, projectPath]);

  return (
    <figure className="live-artifact-preview">
      {dataUrl ? (
        <img src={dataUrl} alt={event.artifactId} />
      ) : (
        <p className="hint">Loading {event.path}…</p>
      )}
      <figcaption>
        <strong>{event.artifactId}</strong>
        <span>{event.assetType}</span>
        <span>{event.provider}</span>
        {event.fallbackGenerated && <span className="tag">fallback</span>}
        {event.critiquePassed === false && <span className="tag">qa failed</span>}
        {onOpen && (
          <button type="button" className="tab" onClick={onOpen}>
            Open in gallery
          </button>
        )}
      </figcaption>
    </figure>
  );
}
