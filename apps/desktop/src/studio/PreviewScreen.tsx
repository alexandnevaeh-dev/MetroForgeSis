import { useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { WorldMapPreview } from './WorldMapPreview.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { ProjectPreview } from './metroforge-api.js';
import { Badge, Button, EmptyState, Panel } from './ui/index.js';

export function PreviewScreen() {
  const { selectedPath, hasActiveProject, navigate, openRoom, openAsset } = useStudio();
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [godotError, setGodotError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!selectedPath || !window.metroforge?.getProjectPreview) return;
    setLoading(true);
    setError(null);
    window.metroforge
      .getProjectPreview(selectedPath)
      .then((data) => {
        if (data.error) setError(data.error);
        setPreview(data);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [selectedPath]);

  return (
    <section className="preview-screen">
      <ScreenHeader
        eyebrow="World"
        title="Game Preview"
        description="Launch the real generated game in Godot, and inspect canonical world topology and generated textures for the active project."
        actions={
          <div className="row">
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
              Open in Godot Editor
            </Button>
            <Button onClick={() => navigate('World')}>World Editor</Button>
            <Button onClick={() => navigate('Assets')}>Asset Gallery</Button>
          </div>
        }
      />
      <NoProjectHint />

      {hasActiveProject && (
        <div className="preview-layout">
          {godotError && <p className="result error">{godotError}</p>}

          {loading && (
            <EmptyState title="Loading preview…" description="Fetching world graph and asset previews." />
          )}

          {!loading && error && (
            <EmptyState
              title="Preview unavailable"
              description={error}
              actions={
                <Button
                  onClick={() => {
                    if (!selectedPath || !window.metroforge?.getProjectPreview) return;
                    setLoading(true);
                    setError(null);
                    window.metroforge
                      .getProjectPreview(selectedPath)
                      .then((data) => {
                        if (data.error) setError(data.error);
                        setPreview(data);
                      })
                      .catch((err) => setError(String(err)))
                      .finally(() => setLoading(false));
                  }}
                >
                  Retry
                </Button>
              }
            />
          )}

          {!loading && preview && !preview.error && (
            <>
              <Panel
                level={1}
                title="World map"
                actions={
                  <>
                    <Badge tone="muted">{preview.title ?? 'Untitled'}</Badge>
                    {preview.profile ? <Badge tone="info">{preview.profile}</Badge> : null}
                  </>
                }
              >
                <WorldMapPreview worldGraph={preview.worldGraph} onActivate={openRoom} />
              </Panel>

              <Panel
                level={1}
                title="Generated assets"
                actions={
                  <Badge tone="muted">
                    {preview.assetPreviews?.length ?? 0} texture
                    {(preview.assetPreviews?.length ?? 0) === 1 ? '' : 's'}
                  </Badge>
                }
              >
                {preview.assetPreviews && preview.assetPreviews.length > 0 ? (
                  <div className="asset-grid">
                    {preview.assetPreviews.map((asset) => (
                      <figure
                        key={asset.id}
                        className="asset-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => openAsset(asset.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openAsset(asset.id);
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
              </Panel>
            </>
          )}
        </div>
      )}
    </section>
  );
}
