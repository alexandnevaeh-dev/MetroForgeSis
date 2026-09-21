import { useEffect, useState } from 'react';

export function EditStatusBadge({ projectPath }: { projectPath: string }) {
  const [status, setStatus] = useState({ projectPath: '', state: 'CHECKING' });
  const state = status.projectPath === projectPath ? status.state : 'CHECKING';

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    setStatus({ projectPath, state: 'CHECKING' });
    if (!projectPath || !window.metroforge?.getEditStatus) {
      setStatus({ projectPath, state: 'UNAVAILABLE' });
      return;
    }
    const tick = async () => {
      try {
        const result = await window.metroforge!.getEditStatus(projectPath);
        if (!cancelled) setStatus({ projectPath, state: result.state || 'UNAVAILABLE' });
      } catch {
        if (!cancelled) setStatus({ projectPath, state: 'UNAVAILABLE' });
      } finally {
        if (!cancelled) timer = window.setTimeout(() => { void tick(); }, 1500);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectPath]);

  const cls = state === 'CLEAN' ? 'badge-ok'
    : state === 'COMPILING' || state === 'CHECKING' ? 'status-running' : 'badge-warn';
  return <span className={`edit-status ${cls}`} role="status">{state}</span>;
}
