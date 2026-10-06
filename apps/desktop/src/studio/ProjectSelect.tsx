import { useStudio } from './StudioContext.js';

export function ProjectSelect({ compact = false }: { compact?: boolean }) {
  const {
    projects,
    projectsLoading,
    projectsLoaded,
    projectsError,
    selectedPath,
    setSelectedPath,
    navigate,
  } = useStudio();

  if (!projectsLoaded)
    return (
      <div className={compact ? 'project-select compact' : 'project-select'}>
        <p className="hint" role="status">
          {projectsError
            ? 'Library unavailable'
            : projectsLoading
              ? 'Loading projects…'
              : 'Library unavailable'}
        </p>
      </div>
    );

  if (projects.length === 0) {
    return (
      <div className={compact ? 'project-select compact' : 'project-select'}>
        <p className="hint">{compact ? 'No project' : 'No generated projects yet.'}</p>
        {!compact && (
          <button type="button" className="tab" onClick={() => navigate('Create')}>
            New Game
          </button>
        )}
      </div>
    );
  }

  return (
    <label className={compact ? 'project-select compact' : 'project-select'}>
      {compact ? 'Active project' : 'Project'}
      <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)}>
        {projects.map((project) => (
          <option key={project.path} value={project.path}>
            {project.title ?? project.slug}
          </option>
        ))}
      </select>
    </label>
  );
}
