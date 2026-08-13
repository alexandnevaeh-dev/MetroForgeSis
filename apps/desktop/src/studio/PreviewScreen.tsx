import { useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { WorldMapPreview } from './WorldMapPreview.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { ProjectPreview } from './metroforge-api.js';

export function PreviewScreen() {
  const { selectedPath, hasActiveProject, navigate, openRoom, openAsset } = useStudio();
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <section>
      <ScreenHeader
        eyebrow="World"
        title="Game Preview"
        description="Inspect canonical world topology and generated textures for the active project."
        actions={
          <div className="row">
            <ProjectSelect />
            <button type="button" onClick={() => navigate('World')}>
              World Editor
            </button>
            <button type="button" onClick={() => navigate('Assets')}>
              Asset Gallery
            </button>
          </div>
        }
      />
      <NoProjectHint />
      {hasActiveProject && (
        <>
      {loading && <p className="hint">Loading preview…</p>}
      {error && <p className="result error">{error}</p>}
      {preview && !preview.error && (
        <>
          <h3>{preview.title}</h3>
          {preview.profile && <p className="hint">Profile: {preview.profile}</p>}
          <WorldMapPreview worldGraph={preview.worldGraph} onActivate={openRoom} />
          <h3 style={{ marginTop: '1.5rem' }}>Generated Assets</h3>
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
                    {asset.fallbackGenerated && <span className="tag">procedural</span>}
                    {typeof asset.critiqueScore === 'number' && <span>critique: {asset.critiqueScore}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="hint">No texture assets found in generation_manifest.json.</p>
          )}
        </>
      )}
        </>
      )}
    </section>
  );
}
