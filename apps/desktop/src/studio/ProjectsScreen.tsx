import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import { openProjectInGodot, playProjectInGodot } from './godot-actions.js';

export function ProjectsScreen() {
  const { projects, selectedPath, setSelectedPath, navigate, refreshProjects } = useStudio();
  const [error, setError] = useState<string | null>(null);
  const [godotActionError, setGodotActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!window.metroforge?.listProjects) {
      setError('Desktop bridge unavailable');
      return;
    }
    refreshProjects().catch((err) => setError(String(err)));
  }, [refreshProjects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const hay = `${p.title ?? ''} ${p.slug} ${p.profile ?? ''} ${p.path}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, query]);

  return (
    <section>
      <ScreenHeader
        eyebrow="Library"
        title="Projects"
        description="Open, play, refresh runtime templates, or export a generated Godot project."
        actions={
          <button type="button" className="primary" onClick={() => navigate('Create')}>
            New Game
          </button>
        }
      />
      {error && <p className="result error">{error}</p>}
      {godotActionError && <p className="result error">{godotActionError}</p>}
      {projects.length === 0 ? (
        <div className="empty-state panel">
          <p>No generated projects yet.</p>
          <button type="button" className="primary" onClick={() => navigate('Create')}>
            Commission a game
          </button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, slug, profile, path…"
              aria-label="Search projects"
            />
            <p className="hint">
              {filtered.length} of {projects.length}
            </p>
          </div>
          <ul className="project-list">
            {filtered.length === 0 && <li className="hint">No projects match this search.</li>}
            {filtered.map((p) => (
              <li key={p.slug} className={p.path === selectedPath ? 'project-card active' : 'project-card'}>
                <strong>{p.title ?? p.slug}</strong>
                <span>{p.profile ?? 'unknown profile'}</span>
                <code>{p.path}</code>
                <div className="row" style={{ marginTop: '0.5rem' }}>
                  <button
                    className="primary"
                    type="button"
                    onClick={() => {
                      setSelectedPath(p.path);
                      navigate('Dashboard');
                    }}
                  >
                    Open in Studio
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setGodotActionError(null);
                      setGodotActionError(await openProjectInGodot(p.path));
                    }}
                  >
                    Open in Godot
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setGodotActionError(null);
                      setGodotActionError(await playProjectInGodot(p.path));
                    }}
                  >
                    Play (F5)
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setGodotActionError(null);
                      const result = await window.metroforge?.refreshProjectTemplate?.(p.path);
                      if (!result?.success) {
                        setGodotActionError(result?.errors?.join('; ') ?? 'Template refresh failed');
                      } else {
                        window.alert(
                          `Refreshed ${result.copied.length} runtime files` +
                            (result.removed.length > 0 ? `, removed ${result.removed.length} orphans` : ''),
                        );
                      }
                    }}
                  >
                    Refresh Template
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setGodotActionError(null);
                      const result = await window.metroforge?.exportProject?.(p.path, { force: true });
                      if (!result?.success) {
                        setGodotActionError(result?.errors?.join('; ') ?? 'Export failed');
                      } else if (result.archivePath) {
                        window.alert(`Exported to ${result.archivePath}`);
                      }
                    }}
                  >
                    Export Package
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
