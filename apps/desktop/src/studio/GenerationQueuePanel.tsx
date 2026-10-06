import { useEffect, useRef, useState } from 'react';
import { Badge, Button, type Tone } from './ui/index.js';

type QueueJob = Awaited<
  ReturnType<NonNullable<Window['metroforge']>['listGenerationQueue']>
>[number];
const active = (job: QueueJob) => job.status === 'queued' || job.status === 'running';
const tones: Record<string, Tone> = {
  queued: 'muted',
  running: 'info',
  completed: 'success',
  failed: 'danger',
  cancelled: 'warning',
};
const types: Record<string, string> = {
  generate_game: 'Game',
  generate_asset: 'Asset',
  regenerate_room: 'Room regeneration',
  recompile_rooms: 'Room compilation',
};

export function GenerationQueuePanel() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(10);
  const refresh = useRef(() => {});
  const mounted = useRef(false);
  const cancellationPending = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let inFlight = false;
    let dirty = false;
    let timer: number | undefined;
    let signature = '';
    let delay = 10000;
    function schedule(wait: number) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), wait);
    }
    async function load() {
      window.clearTimeout(timer);
      if (inFlight) {
        dirty = true;
        return;
      }
      inFlight = true;
      try {
        if (!window.metroforge?.listGenerationQueue) throw new Error('Desktop bridge unavailable');
        const list = await window.metroforge.listGenerationQueue();
        if (disposed) return;
        if (!Array.isArray(list)) throw new Error('Invalid queue response');
        const next = list;
        const nextSignature = JSON.stringify(next);
        if (nextSignature !== signature) {
          signature = nextSignature;
          setJobs(next);
        }
        delay = next.some(active) ? 1500 : 10000;
        setLoaded(true);
        setError(null);
      } catch {
        delay = 10000;
        if (!disposed) {
          setLoaded(true);
          setError('Could not refresh the queue. Retry to check current jobs.');
        }
      } finally {
        inFlight = false;
        if (!disposed) {
          schedule(dirty ? 0 : delay);
          dirty = false;
        }
      }
    }
    refresh.current = () => {
      if (!disposed) schedule(0);
    };
    const unsubscribe = window.metroforge?.onGenerationEvent((event) => {
      if (
        ['GenerationStarted', 'GenerationCompleted', 'GenerationFailed'].includes(
          String(event.type),
        )
      )
        refresh.current();
    });
    void load();
    return () => {
      disposed = true;
      mounted.current = false;
      window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  async function cancel(job: QueueJob) {
    if (cancellationPending.current) return;
    cancellationPending.current = true;
    setCancelling(job.id);
    setNotice(null);
    try {
      const result = await window.metroforge?.cancelGenerationJob(job.id);
      if (mounted.current)
        setNotice(
          result?.cancelled
            ? 'Cancellation requested.'
            : 'This job has already finished or cannot be cancelled.',
        );
    } catch {
      if (mounted.current)
        setNotice('Could not request cancellation. Refresh the queue and try again.');
    } finally {
      cancellationPending.current = false;
      if (mounted.current) {
        setCancelling(null);
        refresh.current();
      }
    }
  }

  const history = jobs.filter((job) => !active(job));
  const visible = [...jobs.filter(active), ...history.slice(0, historyLimit)];
  return (
    <section className="queue-panel panel" aria-label="Generation queue">
      <div className="row">
        <h4>Generation Queue</h4>
        <Badge tone={error ? 'warning' : 'muted'}>
          {error
            ? 'Status unavailable'
            : loaded
              ? `${jobs.filter(active).length} active`
              : 'Loading'}
        </Badge>
        <Button size="compact" onClick={() => refresh.current()}>
          {error ? 'Retry queue' : 'Refresh queue'}
        </Button>
      </div>
      {error && (
        <p className="result error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}
      {!loaded ? (
        <p className="hint">Loading queue…</p>
      ) : jobs.length === 0 ? (
        <p className="hint">
          {error ? 'Job status is unavailable until the queue refreshes.' : 'No queued jobs'}
        </p>
      ) : (
        <ul className="queue-list">
          {visible.map((job) => (
            <li key={job.id} className={`queue-item status-${job.status}`}>
              <strong>{job.label}</strong>
              <span>{types[job.type] ?? job.type}</span>
              <Badge tone={tones[job.status] ?? 'muted'}>{job.status}</Badge>
              {active(job) && (
                <Button
                  size="compact"
                  disabled={cancelling !== null}
                  aria-busy={cancelling === job.id}
                  aria-label={`Cancel ${job.label}`}
                  onClick={() => void cancel(job)}
                >
                  Cancel
                </Button>
              )}
              {job.error && <span className="result error">{job.error}</span>}
            </li>
          ))}
        </ul>
      )}
      {history.length > historyLimit && (
        <Button size="compact" onClick={() => setHistoryLimit((limit) => limit + 10)}>
          Show 10 more past jobs ({history.length - historyLimit} remaining)
        </Button>
      )}
    </section>
  );
}
