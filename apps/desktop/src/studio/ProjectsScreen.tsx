import { useEffect, useMemo, useRef, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import { openProjectInGodot, playGeneratedProject } from './godot-actions.js';
import type { StudioProject, MetroforgeBridge } from './metroforge-api.js';
import { Badge, Button, EmptyState, SearchField, Panel } from './ui/index.js';

type RefreshPlan = Awaited<ReturnType<MetroforgeBridge['refreshProjectTemplate']>>;
const genreNames: Record<string, string> = {
  SIDE_VIEW_METROIDVANIA: 'Metroidvania',
  TOP_DOWN_ACTION_ADVENTURE: 'Top-down adventure',
  QUANTUM_SIMULATION_ROGUELITE: 'Quantum roguelite',
};

export function ProjectsScreen() {
  const {
    projects,
    projectsLoaded,
    projectsLoading,
    projectsError,
    selectedPath,
    setSelectedPath,
    navigate,
    refreshProjects,
  } = useStudio();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [review, setReview] = useState<{ project: StudioProject; plan: RefreshPlan } | null>(null);
  const actionLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setLimit(20);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) =>
      `${p.title ?? ''} ${p.slug} ${p.profile ?? ''} ${p.engine ?? 'godot'} ${genreNames[p.archetype ?? ''] ?? p.archetype ?? ''} ${p.path}`
        .toLowerCase()
        .includes(q),
    );
  }, [projects, query]);

  async function action(id: string, work: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(id);
    setFeedback(null);
    try {
      await work();
    } catch (error) {
      if (mounted.current)
        setFeedback({ error: true, text: error instanceof Error ? error.message : String(error) });
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  function report(text: string) {
    if (mounted.current) setFeedback({ error: false, text });
  }
  async function preview(project: StudioProject) {
    const api = window.metroforge;
    if (!api?.refreshProjectTemplate) throw new Error('Template refresh unavailable');
    const plan = await api.refreshProjectTemplate(project.path, { dryRun: true });
    if (!plan.success)
      throw new Error(plan.errors.join('; ') || 'Could not review template refresh');
    if (!mounted.current) return;
    if (!plan.copied.length && !plan.removed.length) {
      setReview(null);
      report(`${project.title ?? project.slug}: runtime template is current.`);
      return;
    }
    setReview({ project, plan });
  }
  async function applyRefresh() {
    if (!review?.plan.planDigest) throw new Error('Review the refresh before applying');
    const api = window.metroforge;
    if (!api?.refreshProjectTemplate) throw new Error('Template refresh unavailable');
    const result = await api.refreshProjectTemplate(review.project.path, {
      expectedPlanDigest: review.plan.planDigest,
    });
    if (!result.success) throw new Error(result.errors.join('; ') || 'Template refresh failed');
    if (!mounted.current) return;
    setReview(null);
    report(
      `${review.project.title ?? review.project.slug}: updated ${result.copied.length} files, removed ${result.removed.length}. Backup: ${result.backupPath ?? 'No changes required'}.${result.validationInvalidated ? ' Run validation again before exporting.' : ''}`,
    );
  }

  return (
    <section className="workspace-screen projects-screen">
      <ScreenHeader
        eyebrow="Library"
        title="Projects"
        description="Find a game, open its workspace, or play it. Review runtime updates and export validated Godot source projects."
        actions={
          <>
            <Button
              disabled={projectsLoading}
              aria-busy={projectsLoading}
              onClick={() => {
                void refreshProjects().catch(() => {});
              }}
            >
              Refresh library
            </Button>
            <Button variant="primary" onClick={() => navigate('Create')}>
              New Game
            </Button>
          </>
        }
      />
      {projectsError && (
        <p className="result error" role="alert">
          Could not load the library: {projectsError}.{' '}
          {projectsLoaded ? 'Showing the last loaded projects.' : 'Project status is unavailable.'}{' '}
          <Button
            disabled={projectsLoading}
            onClick={() => {
              void refreshProjects().catch(() => {});
            }}
          >
            Retry library
          </Button>
        </p>
      )}
      {feedback && (
        <p
          className={feedback.error ? 'result error' : 'result'}
          role={feedback.error ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      )}
      {review && (
        <Panel level={1} title={`Review refresh: ${review.project.title ?? review.project.slug}`}>
          <p>
            {review.plan.templateName ?? 'Matching genre'} runtime: replace{' '}
            {review.plan.copied.length} files and remove {review.plan.removed.length}. A backup will
            be saved inside this project on E:. Generated rooms, assets, saves and custom rendering
            settings stay in place. Runtime validation must be repeated after changes.
          </p>
          <details>
            <summary>Files in this refresh</summary>
            <ul className="project-refresh-files">
              {review.plan.copied.map((path) => (
                <li key={path}>Update: {path}</li>
              ))}
              {review.plan.removed.map((path) => (
                <li key={path}>Remove: {path}</li>
              ))}
            </ul>
          </details>
          <div className="row">
            <Button
              variant="primary"
              disabled={!!busy}
              aria-busy={busy === 'apply'}
              onClick={() => {
                void action('apply', applyRefresh);
              }}
            >
              Apply reviewed refresh
            </Button>
            <Button
              disabled={!!busy}
              onClick={() => {
                void action('review', () => preview(review.project));
              }}
            >
              Review again
            </Button>
            <Button disabled={!!busy} onClick={() => setReview(null)}>
              Cancel refresh
            </Button>
          </div>
        </Panel>
      )}
      {!projectsLoaded ? (
        !projectsError && <p role="status">Loading projects…</p>
      ) : projects.length === 0 ? (
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
            <SearchField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery('')}
              placeholder="Search title, genre, engine or path…"
              aria-label="Search projects"
            />
          </div>
          <ul className="project-list">
            {filtered.length === 0 && (
              <li>
                <EmptyState
                  title="No matches"
                  description="Try another title, genre or engine."
                  actions={<Button onClick={() => setQuery('')}>Clear search</Button>}
                />
              </li>
            )}
            {filtered.slice(0, limit).map((p) => {
              const engine = p.engine ?? 'godot';
              const canRefresh =
                engine === 'godot' && p.archetype !== 'QUANTUM_SIMULATION_ROGUELITE';
              return (
                <li
                  key={p.path}
                  className={p.path === selectedPath ? 'project-card active' : 'project-card'}
                >
                  <div className="project-card-head">
                    <strong>{p.title ?? p.slug}</strong>
                    <Badge tone="info">{engine}</Badge>
                    <Badge tone="muted">
                      {genreNames[p.archetype ?? ''] ?? p.archetype ?? 'Genre unspecified'}
                    </Badge>
                    {p.profile && <Badge tone="muted">{p.profile}</Badge>}
                  </div>
                  <code className="mono">{p.path}</code>
                  <div className="row project-actions">
                    <Button
                      variant="primary"
                      disabled={!!busy}
                      onClick={() => {
                        setSelectedPath(p.path);
                        navigate('Dashboard');
                      }}
                    >
                      Open in Studio
                    </Button>
                    {engine === 'godot' && (
                      <Button
                        disabled={!!busy}
                        aria-busy={busy === p.path + ':open'}
                        onClick={() => {
                          void action(p.path + ':open', async () => {
                            const error = await openProjectInGodot(p.path);
                            if (error) throw new Error(error);
                            report('Godot editor launch requested.');
                          });
                        }}
                      >
                        Open in Godot
                      </Button>
                    )}
                    <Button
                      disabled={!!busy || engine === 'unreal'}
                      aria-busy={busy === p.path + ':play'}
                      onClick={() => {
                        void action(p.path + ':play', async () => {
                          const error = await playGeneratedProject(p.path);
                          if (error) throw new Error(error);
                          report(`${p.title ?? p.slug}: play launch requested.`);
                        });
                      }}
                    >
                      Play
                    </Button>
                    {canRefresh && (
                      <Button
                        disabled={!!busy}
                        aria-busy={busy === p.path + ':review'}
                        onClick={() => {
                          void action(p.path + ':review', () => preview(p));
                        }}
                      >
                        Review template refresh
                      </Button>
                    )}
                    {engine === 'godot' && (
                      <Button
                        disabled={!!busy}
                        aria-busy={busy === p.path + ':export'}
                        onClick={() => {
                          void action(p.path + ':export', async () => {
                            if (!window.metroforge?.exportProject)
                              throw new Error('Project export unavailable');
                            const result = await window.metroforge.exportProject(p.path);
                            if (!result.success)
                              throw new Error(result.errors?.join('; ') || 'Export failed');
                            report(
                              `${p.title ?? p.slug}: source project exported to ${result.archivePath ?? result.manifestPath ?? 'the project export directory'}. This export contains source files.${result.warnings?.length ? ' ' + result.warnings.join('; ') : ''}`,
                            );
                          });
                        }}
                      >
                        Export project
                      </Button>
                    )}
                  </div>
                  {!canRefresh && (
                    <p className="muted">
                      {p.archetype === 'QUANTUM_SIMULATION_ROGUELITE'
                        ? 'Quantum runtime updates require a fresh generated project.'
                        : 'Runtime refresh and source export use the engine-specific workflow.'}
                    </p>
                  )}
                  {engine === 'unreal' && (
                    <p className="muted">Play requires an available Unreal build.</p>
                  )}
                </li>
              );
            })}
          </ul>
          {filtered.length > limit && (
            <Button onClick={() => setLimit((value) => value + 20)}>
              Show {Math.min(20, filtered.length - limit)} more projects
            </Button>
          )}
        </Panel>
      )}
    </section>
  );
}
