import { useEffect, useState } from 'react';

type QueueJob = {
  id: string;
  type: string;
  status: string;
  label: string;
  createdAt: string;
  error?: string;
};

export function GenerationQueuePanel() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);

  const refresh = () => {
    window.metroforge?.listGenerationQueue?.().then(setJobs);
  };

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="queue-panel panel">
      <h4>Generation Queue</h4>
      {jobs.length === 0 ? (
        <p className="hint">No queued jobs</p>
      ) : (
        <ul className="queue-list">
          {jobs.map((job) => (
            <li key={job.id} className={`queue-item status-${job.status}`}>
              <strong>{job.label}</strong>
              <span>{job.type}</span>
              <span>{job.status}</span>
              {job.status === 'queued' && (
                <button type="button" onClick={() => window.metroforge?.cancelGenerationJob?.(job.id).then(refresh)}>
                  Cancel
                </button>
              )}
              {job.error && <span className="result error">{job.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
