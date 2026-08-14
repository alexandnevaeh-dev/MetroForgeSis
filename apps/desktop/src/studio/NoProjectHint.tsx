import { useStudio } from './StudioContext.js';
import { EmptyState } from './ui/index.js';

export function NoProjectHint() {
  const { hasActiveProject, projects, navigate } = useStudio();
  if (hasActiveProject) return null;

  return (
    <EmptyState
      title={projects.length === 0 ? 'No generated project yet' : 'No active project'}
      description={
        projects.length === 0
          ? 'Create a new game to populate the library, or open an existing project.'
          : 'Select a project to use this workspace.'
      }
      actions={
        <>
          <button type="button" className="primary" onClick={() => navigate('Create')}>
            New Game
          </button>
          <button type="button" onClick={() => navigate('Projects')}>
            Projects
          </button>
        </>
      }
    />
  );
}
