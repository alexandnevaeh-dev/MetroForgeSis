import { useStudio } from './StudioContext.js';

export function NoProjectHint() {
  const { hasActiveProject, projects, navigate } = useStudio();
  if (hasActiveProject) return null;

  return (
    <div className="empty-state panel">
      <p>{projects.length === 0 ? 'No generated project yet.' : 'Select a project to use this workspace.'}</p>
      <div className="row">
        <button type="button" className="primary" onClick={() => navigate('Create')}>
          New Game
        </button>
        <button type="button" onClick={() => navigate('Projects')}>
          Projects
        </button>
      </div>
    </div>
  );
}
