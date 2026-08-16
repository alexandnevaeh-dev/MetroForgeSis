import { useEffect, useState } from 'react';
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
  const { selectedPath, hasActiveProject, navigate, openRoom, openAsset } = useStudio();
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [godotError, setGodotError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState('');

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

  const selectedAsset = preview?.assetPreviews?.find((a) => a.id === selectedAssetId);

  return (
    <section className="workspace-screen preview-screen">
      <ScreenHeader
        compact
        eyebrow="World"
        title="Game Preview"
        description="Launch Godot · inspect real world topology and generated textures — not a fake playable window."
        actions={
          <div className="row preview-header-actions">
            <ProjectSelect />
            <Button
              variant="primary"
              disabled={!selectedPath || launching}
              onClick={async () => {
                setGodotError(null);
                if (!selectedPath || !window.metroforge?.playInGodot) return;
                setLaunching(true);
                try {
                  const r = await window.metroforge.playInGodot(selectedPath);
                  if (!r.success) setGodotError(r.message);
                } finally {
                  setLaunching(false);
                }
              }}
            >
              {launching ? 'Launching…' : 'Play in Godot'}
            </Button>
            <Button
              disabled={!selectedPath}
              onClick={async () => {
                setGodotError(null);
                if (!selectedPath || !window.metroforge?.openInGodot) return;
                const r = await window.metroforge.openInGodot(selectedPath);
                if (!r.success) setGodotError(r.message);
              }}
            >
              Open in Godot
            </Button>
            <Button onClick={() => navigate('World')}>World Editor</Button>
            <Button onClick={() => navigate('Assets')}>Asset Gallery</Button>
          </div>
        }
      />
      <NoProjectHint />

      {hasActiveProject && (
        <div className="preview-layout-p3">
          {godotError && <p className="result error">{godotError}</p>}

          {loading && (
            <EmptyState title="Loading preview…" description="Fetching world graph and asset previews." />
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
                        {preview.worldGraph?.nodes?.length ?? 0} rooms ·{' '}
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
                      actions={<Button onClick={() => navigate('Assets')}>Open Asset Gallery</Button>}
                    />
                  )}
                </section>
              </div>

              <aside className="panel editor-inspector preview-inspector">
                <InspectorSection title="Project">
                  <dl className="settings-dl">
                    <dt>Title</dt>
                    <dd>{preview.title ?? '—'}</dd>
                    <dt>Profile</dt>
                    <dd>{preview.profile ?? '—'}</dd>
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
                          {selectedAsset.fallbackGenerated ? 'procedural fallback' : 'provider / manifest'}
                        </dd>
                        {typeof selectedAsset.critiqueScore === 'number' && (
                          <>
                            <dt>Critique</dt>
                            <dd>{selectedAsset.critiqueScore}</dd>
                          </>
                        )}
                      </dl>
                      <div className="row" style={{ marginTop: '0.45rem', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <Button variant="primary" size="sm" onClick={() => openAsset(selectedAsset.id)}>
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
