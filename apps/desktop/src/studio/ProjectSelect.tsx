import { useStudio } from './StudioContext.js';

export function ProjectSelect({ compact = false }: { compact?: boolean }) {
  const { projects, selectedPath, setSelectedPath, navigate } = useStudio();

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
          <option key={project.slug} value={project.path}>
            {project.title ?? project.slug}
          </option>
        ))}
      </select>
    </label>
  );
}
