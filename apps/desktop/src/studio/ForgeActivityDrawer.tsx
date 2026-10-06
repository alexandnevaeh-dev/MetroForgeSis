import { GenerationQueuePanel } from './GenerationQueuePanel.js';
import { useStudio } from './StudioContext.js';

export function ForgeActivityDrawer() {
  const { activityOpen, setActivityOpen, navigate } = useStudio();

  return (
    <div className={`forge-activity${activityOpen ? ' open' : ''}`}>
      <button
        type="button"
        className="forge-activity-toggle"
        onClick={() => setActivityOpen(!activityOpen)}
        aria-expanded={activityOpen}
      >
        {activityOpen ? 'Hide forge activity' : 'Show forge activity'}
      </button>
      {activityOpen ? (
        <div className="forge-activity-body">
          <GenerationQueuePanel />
          <p className="hint forge-activity-note">
            Queue states are live jobs (queued, running, cancelled, failed). Progress percents only
            appear when the pipeline reports them.{' '}
            <button type="button" className="linkish" onClick={() => navigate('Studio')}>
              Open Crucible
            </button>
          </p>
        </div>
      ) : null}
    </div>
  );
}
