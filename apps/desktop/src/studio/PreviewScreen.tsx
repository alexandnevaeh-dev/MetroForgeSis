import { useEffect, useRef, useState } from 'react';
import { LiveRuntimeInspector } from './LiveRuntimeInspector.js';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { WorldMapPreview } from './WorldMapPreview.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { ProjectPreview } from './metroforge-api.js';
import {
  Badge,
  Button,
  EditorToolbar,
  EditorViewport,
  EditorWorkbench,
  EmptyState,
  InspectorSection,
} from './ui/index.js';

export function PreviewScreen() {
  const { selectedPath } = useStudio();
  return <ProjectPreviewScreen key={selectedPath ?? ''} />;
}

function ProjectPreviewScreen() {
  const { selectedPath, hasActiveProject, navigate, openRoom, openAsset } = useStudio();
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [godotError, setGodotError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [controlling, setControlling] = useState(false);
  const controlPending = useRef(false);
  const controlRevision = useRef(0);

  function beginControl() {
    if (controlPending.current) return false;
    controlPending.current = true;
    controlRevision.current += 1;
    setControlling(true);
    return true;
  }

  function endControl() {
    controlPending.current = false;
    controlRevision.current += 1;
    setControlling(false);
  }
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [playing, setPlaying] = useState(false);
  const [runtimeSessionId, setRuntimeSessionId] = useState('');
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState(
    'Pause/resume uses the authenticated loopback studio bridge when Godot connects.',
  );
  const [embedReason, setEmbedReason] = useState<string | null>(null);
  const [liveEditNote, setLiveEditNote] = useState<string | null>(null);

  const reload = () => {
    if (!selectedPath || !window.metroforge?.getProjectPreview) return;
    setLoading(true);
    setError(null);
    window.metroforge
      .getProjectPreview(selectedPath)
      .then((data) => {
        if (data.error) setError(data.error);
        setPreview(data);
        const first = data.assetPreviews?.[0]?.id ?? '';
        setSelectedAssetId((prev) =>
          prev && data.assetPreviews?.some((a) => a.id === prev) ? prev : first,
        );
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!selectedPath || !window.metroforge?.getProjectPreview) return;
    reload();
  }, [selectedPath]);

  useEffect(() => {
    setPlaying(false);
    setRuntimeSessionId('');
    if (!selectedPath || !window.metroforge?.getPlaytestSession) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      const revision = controlRevision.current;
      let session;
      try {
        session = await window.metroforge?.getPlaytestSession?.(selectedPath);
      } catch (cause) {
        if (cancelled) return;
        if (!controlPending.current && revision === controlRevision.current) {
          setSessionError(`Could not refresh playtest status. Showing the last confirmed state; retrying. ${String(cause)}`);
        }
        timer = window.setTimeout(tick, 1500);
        return;
      }
      if (cancelled) return;
      if (controlPending.current || revision !== controlRevision.current) {
        timer = window.setTimeout(tick, 1500);
        return;
      }
      setSessionError(null);
      setPlaying(Boolean(session?.running));
      setRuntimeSessionId(session?.startedAt ?? '');
      setPauseReason(session?.pauseReason ?? 'Waiting for the runtime bridge.');
      setEmbedReason(session?.embedReason ?? null);
      if (session?.liveEdit) {
        setLiveEditNote(
          `Live: ${session.liveEdit.live.join(', ')}. Restart required: ${session.liveEdit.requiresRestart.join('; ')}.`,
        );
      }
      if (!session?.liveEdit) setLiveEditNote(null);
      setPaused(Boolean(session?.pauseReason?.toLowerCase().includes('is paused')));
      timer = window.setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedPath]);

  const selectedAsset = preview?.assetPreviews?.find((a) => a.id === selectedAssetId);

  return (
    <section className="workspace-screen preview-screen">
      <ScreenHeader
        compact
        eyebrow="Crucible Play"
        title="Playtest"
        description="This launches the real Godot runtime for the selected project. The map below is topology, not a fake in-app game."
        actions={
          <div className="row preview-header-actions">
            <ProjectSelect />
            <Button
              variant="primary"
              disabled={!selectedPath || controlling}
              onClick={async () => {
                setGodotError(null);
                if (!selectedPath || !window.metroforge?.playInGodot) return;
                if (!beginControl()) return;
                setLaunching(true);
                try {
                  const r = await window.metroforge.playInGodot(selectedPath);
                  if (!r.success) setGodotError(r.message);
                  else {
                    setPlaying(true);
                    setRuntimeSessionId('');
                    setPaused(false);
                  }
                } catch (err) {
                  setGodotError(String(err));
                } finally {
                  setLaunching(false);
                  endControl();
                }
              }}
            >
              {launching ? 'Launchingâ€¦' : playing ? 'Restart' : 'Play'}
            </Button>
            <Button
              disabled={!selectedPath || !playing || controlling}
              onClick={async () => {
                if (!selectedPath || !beginControl()) return;
                setGodotError(null);
                try {
                  const r = await window.metroforge?.stopPlaytest?.(selectedPath);
                  if (!r?.success) {
                    setGodotError(r?.message ?? 'Stopping the playtest is unavailable.');
                    return;
                  }
                  setPlaying(false);
                  setRuntimeSessionId('');
                  setPaused(false);
                } catch (err) {
                  setGodotError(String(err));
                } finally {
                  endControl();
                }
              }}
            >
              Stop
            </Button>
            <Button
              disabled={!selectedPath || !playing || controlling}
              title={pauseReason}
              onClick={async () => {
                if (!selectedPath || !window.metroforge?.playtestCommand) return;
                if (!beginControl()) return;
                const cmd = paused ? 'resume' : 'pause';
                setGodotError(null);
                try {
                  const r = await window.metroforge.playtestCommand(selectedPath, cmd);
                  if (!r.ok) setGodotError(r.error ?? 'Bridge command failed');
                  else setPaused(cmd === 'pause');
                } catch (err) {
                  setGodotError(String(err));
                } finally {
                  endControl();
                }
              }}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              disabled={!selectedPath}
              onClick={async () => {
                setGodotError(null);
                if (!selectedPath || !window.metroforge?.openInGodot) return;
                try {
                  const r = await window.metroforge.openInGodot(selectedPath);
                  if (!r.success) setGodotError(r.message);
                } catch (err) {
                  setGodotError(String(err));
                }
              }}
            >
              Open editor
            </Button>
            <Button onClick={() => navigate('World')}>World Editor</Button>
            <Button onClick={() => navigate('Assets')}>Asset Gallery</Button>
          </div>
        }
      />
      <NoProjectHint />

      {hasActiveProject && (
        <div className="preview-layout-p3">
          {godotError && <p className="result error" role="alert">{godotError}</p>}
          {sessionError && <p className="result error" role="alert">{sessionError}</p>}
          {playing && (
            <p className="hint" role="status">
              Godot runs in an external window (not embedded). Use Live objects to inspect and move
              objects during play. Runtime moves last for this session; saved room geometry requires
              restarting the preview.
              {embedReason ? ` Embedding limit: ${embedReason}` : ''}
              {liveEditNote ? ` ${liveEditNote}` : ''}
            </p>
          )}

          {loading && (
            <EmptyState
              title="Loading previewâ€¦"
              description="Fetching world graph and asset previews."
            />
          )}

          {!loading && error && (
            <EmptyState
              title="Preview unavailable"
              description={error}
              actions={<Button onClick={reload}>Retry</Button>}
            />
          )}

          {!loading && preview && !preview.error && (
            <EditorWorkbench variant="preview" className="preview-workspace">
              <div className="preview-main-column">
                <EditorViewport
                  className="preview-world-canvas"
                  toolbar={
                    <EditorToolbar>
                      <span>World topology</span>
                      <Badge tone="muted">{preview.title ?? 'Untitled'}</Badge>
                      {preview.profile ? <Badge tone="info">{preview.profile}</Badge> : null}
                      <span className="status-grow" />
                      <span className="hint">
                        {preview.worldGraph?.nodes?.length ?? 0} rooms Â·{' '}
                        {preview.worldGraph?.edges?.length ?? 0} edges
                      </span>
                    </EditorToolbar>
                  }
                >
                  <WorldMapPreview
                    worldGraph={preview.worldGraph}
                    fitView
                    onActivate={openRoom}
                    emptyTitle="No world graph in preview"
                    emptyDescription="getProjectPreview returned no worldGraph nodes for this project."
                  />
                </EditorViewport>

                <section className="panel preview-asset-panel">
                  <div className="mf-panel-head">
                    <h3 className="mf-panel-title type-panel-title">Generated assets</h3>
                    <Badge tone="muted">
                      {preview.assetPreviews?.length ?? 0} texture
                      {(preview.assetPreviews?.length ?? 0) === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  {preview.assetPreviews && preview.assetPreviews.length > 0 ? (
                    <div className="asset-grid preview-asset-grid">
                      {preview.assetPreviews.map((asset) => (
                        <figure
                          key={asset.id}
                          className={
                            selectedAssetId === asset.id
                              ? 'asset-card dense preview-asset-card active'
                              : 'asset-card dense preview-asset-card'
                          }
                          role="button"
                          tabIndex={0}
                          aria-pressed={selectedAssetId === asset.id}
                          onClick={() => {
                            setSelectedAssetId(asset.id);
                          }}
                          onDoubleClick={() => openAsset(asset.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedAssetId(asset.id);
                              if (event.key === 'Enter') openAsset(asset.id);
                            }
                          }}
                        >
                          <img src={asset.dataUrl} alt={asset.id} />
                          <figcaption>
                            <strong>{asset.id}</strong>
                            <span>{asset.provider ?? 'unknown'}</span>
                            {asset.fallbackGenerated && <Badge tone="warning">procedural</Badge>}
                            {typeof asset.critiqueScore === 'number' && (
                              <span>critique: {asset.critiqueScore}</span>
                            )}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No texture assets"
                      description="No texture assets found in generation_manifest.json."
                      actions={
                        <Button onClick={() => navigate('Assets')}>Open Asset Gallery</Button>
                      }
                    />
                  )}
                </section>
              </div>

              <aside className="panel editor-inspector preview-inspector">
                {playing && selectedPath && runtimeSessionId && (
                  <LiveRuntimeInspector
                    key={`${selectedPath}:${runtimeSessionId}`}
                    projectPath={selectedPath}
                    sessionStartedAt={runtimeSessionId}
                  />
                )}
                <InspectorSection title="Project">
                  <dl className="settings-dl">
                    <dt>Title</dt>
                    <dd>{preview.title ?? 'â€”'}</dd>
                    <dt>Profile</dt>
                    <dd>{preview.profile ?? 'â€”'}</dd>
                    <dt>Rooms</dt>
                    <dd>{preview.worldGraph?.nodes?.length ?? 0}</dd>
                    <dt>Assets</dt>
                    <dd>{preview.assetPreviews?.length ?? 0}</dd>
                  </dl>
                </InspectorSection>
                <InspectorSection title="Selected asset">
                  {selectedAsset ? (
                    <>
                      <div className="preview-asset-thumb">
                        <img src={selectedAsset.dataUrl} alt={selectedAsset.id} />
                      </div>
                      <dl className="settings-dl">
                        <dt>Id</dt>
                        <dd className="mono">{selectedAsset.id}</dd>
                        <dt>Provider</dt>
                        <dd>{selectedAsset.provider ?? 'unknown'}</dd>
                        <dt>Provenance</dt>
                        <dd>
                          {selectedAsset.fallbackGenerated
                            ? 'procedural fallback'
                            : 'provider / manifest'}
                        </dd>
                        {typeof selectedAsset.critiqueScore === 'number' && (
                          <>
                            <dt>Critique</dt>
                            <dd>{selectedAsset.critiqueScore}</dd>
                          </>
                        )}
                      </dl>
                      <div
                        className="row"
                        style={{ marginTop: '0.45rem', flexWrap: 'wrap', gap: '0.35rem' }}
                      >
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => openAsset(selectedAsset.id)}
                        >
                          Open in Gallery
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="hint">Select a texture card to inspect provenance.</p>
                  )}
                </InspectorSection>
                <InspectorSection title="Actions">
                  <div className="row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                    <Button size="sm" onClick={() => navigate('World')}>
                      World Editor
                    </Button>
                    <Button size="sm" onClick={() => navigate('Rooms')}>
                      Room Editor
                    </Button>
                    <Button size="sm" onClick={() => navigate('Assets')}>
                      Asset Gallery
                    </Button>
                  </div>
                </InspectorSection>
              </aside>
            </EditorWorkbench>
          )}
        </div>
      )}
    </section>
  );
}
