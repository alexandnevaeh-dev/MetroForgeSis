import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatActivityMessage, phaseLabel, GENERATION_PHASES } from './format';
import { WorldMapPreview } from './WorldMapPreview';
import { GenerationQueuePanel } from './GenerationQueuePanel';
import type { ActivityFilter, GenerationPhaseState, StudioProject } from './types';

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
};

const STATUS_CLASS: Record<string, string> = {
  PENDING: 'status-pending',
  RUNNING: 'status-running',
  PASSED: 'status-passed',
  FAILED: 'status-failed',
  SKIPPED: 'status-skipped',
  WARN: 'status-warn',
  REPAIRING: 'status-repairing',
};

export function GenerationStudio() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
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
  const [worldGraph, setWorldGraph] = useState<unknown>(null);
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

  const refreshState = useCallback(async (projectPath: string) => {
    if (!window.metroforge?.getGenerationState) return;
    const state = await window.metroforge.getGenerationState(projectPath);
    setPhases(state.phases ?? []);
    setEvents(state.events ?? []);
    setOverallProgress(state.overallProgress ?? 0);
    setValidationReport(state.validationReport ?? null);
    if (state.worldGraph) setWorldGraph(state.worldGraph);
  }, []);

  useEffect(() => {
    window.metroforge?.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedPath((p) => p || list[0]!.path);
    });
  }, []);

  useEffect(() => {
    if (selectedPath) refreshState(selectedPath);
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
    const unsub = window.metroforge?.onGenerationEvent?.((event) => {
      setEvents((prev) => [...prev.slice(-499), event]);
      if (event.type === 'TaskStarted' || event.type === 'TaskProgress') {
        setCurrentTask(event.message ?? ('task' in event ? event.task : null));
      }
      if (event.type === 'ArtifactGenerated') {
        setPreviewArtifact(event);
      }
      if (event.type === 'WorldGraphUpdated' && event.projectPath) {
        window.metroforge?.getWorldGraph(event.projectPath).then((g) => setWorldGraph(g));
      }
      if (event.type === 'PhaseStarted' || event.type === 'PhaseCompleted') {
        setPhases((prev) => {
          const phase = 'phase' in event ? event.phase : '';
          const idx = prev.findIndex((p) => p.phase === phase);
          const entry = {
            phase,
            status: 'status' in event ? event.status : 'RUNNING',
            message: 'message' in event ? event.message : undefined,
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

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'ALL') return events;
    return events.filter((e) => e.category === activityFilter);
  }, [events, activityFilter]);

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
    });

    if (result.outputPath) {
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

  return (
    <section className="studio-layout">
      <header className="studio-header">
        <h2>Generation Studio</h2>
        <p className="hint">Watch real pipeline phases, tasks, artifacts, and QA as generation runs.</p>
      </header>

      <div className="studio-generate-bar row">
        <input
          className="studio-prompt"
          placeholder="Describe your Metroidvania…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={generating}
        />
        <select value={profile} onChange={(e) => setProfile(e.target.value)} disabled={generating}>
          <option value="TINY_TEST">TINY_TEST</option>
          <option value="SMALL">SMALL</option>
          <option value="MEDIUM">MEDIUM</option>
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={generating}>
          <option value="LOCAL_ONLY">LOCAL_ONLY</option>
          <option value="HYBRID_FREE">HYBRID_FREE</option>
          <option value="FREE_ONLY">FREE_ONLY</option>
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
        <div className="review-gate panel">
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

      <div className="studio-grid">
        <aside className="studio-phases panel">
          <h3>Phases</h3>
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${overallProgress}%` }} />
            <span>{overallProgress}%</span>
          </div>
          <ul className="phase-tree">
            {phaseRows.map(({ phase, status, message }) => (
              <li key={phase} className={`phase-tree-item ${STATUS_CLASS[status] ?? ''}`}>
                <span className="phase-name">{phaseLabel(phase)}</span>
                <span className="phase-status">{status}</span>
                {message && <span className="phase-msg">{message}</span>}
              </li>
            ))}
          </ul>
        </aside>

        <div className="studio-preview panel">
          <h3>Live Preview</h3>
          {currentTask && <p className="current-task">{currentTask}</p>}
          {previewArtifact?.type === 'ArtifactGenerated' && (
            <LiveArtifactPreview event={previewArtifact} projectPath={selectedPath} />
          )}
          {!previewArtifact && worldGraph && (
            <WorldMapPreview worldGraph={worldGraph as Parameters<typeof WorldMapPreview>[0]['worldGraph']} />
          )}
          {!previewArtifact && !worldGraph && (
            <p className="hint">Artifacts and world graph appear here as they are produced.</p>
          )}
        </div>

        <aside className="studio-details panel">
          <h3>Current Task</h3>
          <p>{currentTask ?? 'Idle'}</p>
          <h3>Project</h3>
          <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)}>
            <option value="">— select —</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.path}>
                {p.title ?? p.slug}
              </option>
            ))}
          </select>
          {godotError && <p className="result error">{godotError}</p>}
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
      </div>

      <footer className="studio-footer panel">
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
        </div>
        <ul className="activity-feed">
          {filteredActivity
            .slice()
            .reverse()
            .slice(0, 80)
            .map((event, i) => (
              <li key={`${event.timestamp}-${i}`}>{formatActivityMessage(event)}</li>
            ))}
        </ul>
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
      </footer>
      <GenerationQueuePanel />
    </section>
  );
}

function LiveArtifactPreview({
  event,
  projectPath,
}: {
  event: GenerationEvent;
  projectPath: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectPath || !window.metroforge?.getAssetPreview) return;
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
      </figcaption>
    </figure>
  );
}
