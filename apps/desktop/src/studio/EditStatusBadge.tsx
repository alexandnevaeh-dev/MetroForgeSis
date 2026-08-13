import { useEffect, useState } from 'react';

export function EditStatusBadge({ projectPath }: { projectPath: string }) {
  const [state, setState] = useState('CLEAN');

  useEffect(() => {
    if (!projectPath || !window.metroforge?.getEditStatus) return;
    const tick = () => window.metroforge!.getEditStatus!(projectPath).then((s) => setState(s.state));
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, [projectPath]);

  const cls =
    state === 'DIRTY' ? 'badge-warn' : state === 'COMPILING' ? 'status-running' : 'badge-ok';
  return <span className={`edit-status ${cls}`}>{state}</span>;
}
