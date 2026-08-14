import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import { openProjectInGodot, playProjectInGodot } from './godot-actions.js';
import { Badge, Button, EmptyState, Input, Panel } from './ui/index.js';

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
    <section className="projects-screen">
      <ScreenHeader
        eyebrow="Library"
        title="Projects"
        description="Open, play, refresh runtime templates, or export a generated Godot project."
        actions={
          <Button variant="primary" onClick={() => navigate('Create')}>
            New Game
          </Button>
        }
      />
      {error && <p className="result error">{error}</p>}
      {godotActionError && <p className="result error">{godotActionError}</p>}
      {projects.length === 0 ? (
        <EmptyState
          title="No generated projects yet"
          description="Commission a game to populate the library."
          actions={
            <Button variant="primary" onClick={() => navigate('Create')}>
              Commission a game
            </Button>
          }
        />
      ) : (
        <Panel
          level={1}
          title="Library"
          actions={
            <Badge tone="muted">
              {filtered.length} of {projects.length}
            </Badge>
          }
        >
          <div className="toolbar">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, slug, profile, path…"
              aria-label="Search projects"
            />
          </div>
          <ul className="project-list">
            {filtered.length === 0 && (
              <li>
                <EmptyState title="No matches" description="No projects match this search." />
              </li>
            )}
            {filtered.map((p) => (
              <li key={p.slug} className={p.path === selectedPath ? 'project-card active' : 'project-card'}>
                <div className="project-card-head">
                  <strong>{p.title ?? p.slug}</strong>
                  {p.profile ? <Badge tone="info">{p.profile}</Badge> : <Badge tone="muted">unknown profile</Badge>}
                </div>
                <code className="mono">{p.path}</code>
                <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSelectedPath(p.path);
                      navigate('Dashboard');
                    }}
                  >
                    Open in Studio
                  </Button>
                  <Button
                    onClick={async () => {
                      setGodotActionError(null);
                      setGodotActionError(await openProjectInGodot(p.path));
                    }}
                  >
                    Open in Godot
                  </Button>
                  <Button
                    onClick={async () => {
                      setGodotActionError(null);
                      setGodotActionError(await playProjectInGodot(p.path));
                    }}
                  >
                    Play (F5)
                  </Button>
                  <Button
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
                  </Button>
                  <Button
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
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}
