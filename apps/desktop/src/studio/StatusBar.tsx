import { useEffect, useState } from 'react';
import { useStudio } from './StudioContext.js';
import { ConcurrencyMeters } from './ConcurrencyMeters.js';

export function StatusBar({
  version,
  bridgeReady,
  activeNav,
}: {
  version: string;
  bridgeReady: boolean | null;
  activeNav: string;
}) {
  const { selectedProject, navigate } = useStudio();
  const [hwProfile, setHwProfile] = useState('—');
  const [vram, setVram] = useState('—');
  const [providers, setProviders] = useState('—');
  const [queue, setQueue] = useState(0);

  useEffect(() => {
    if (!window.metroforge) return;
    const refresh = async () => {
      try {
        const [hw, list, jobs] = await Promise.all([
          window.metroforge?.getHardwareProfile?.(),
          window.metroforge?.listProviders?.(),
          window.metroforge?.listGenerationQueue?.(),
        ]);
        if (hw) {
          setHwProfile(hw.profile || '—');
          if (hw.vramMb) setVram(`${Math.round(hw.vramMb / 1024)} GB VRAM`);
          else setVram(`${Math.round(hw.totalRamMb / 1024)} GB RAM`);
        }
        if (list) {
          const healthy = list.filter((p) => p.health === 'healthy' && p.enabled).length;
          setProviders(`${healthy}/${list.length} providers`);
        }
        setQueue(jobs?.filter((j) => j.status === 'queued' || j.status === 'running').length ?? 0);
      } catch {
        /* status bar is optional */
      }
    };
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
  }, [bridgeReady]);

  const projectLabel = selectedProject?.title ?? selectedProject?.slug ?? 'No project';

  return (
    <footer className="status-bar" role="status">
      <span
        className={bridgeReady === false ? 'status-dot error' : 'status-dot ok'}
        aria-hidden="true"
      />
      <span>{bridgeReady === false ? 'Bridge offline' : version}</span>
      <span className="status-sep" aria-hidden="true" />
      <span>{activeNav}</span>
      <span className="status-sep" aria-hidden="true" />
      <button
        type="button"
        className="status-link status-context"
        onClick={() => navigate('Dashboard')}
        title={selectedProject?.path ?? projectLabel}
      >
        {projectLabel}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <button type="button" className="status-link" onClick={() => navigate('Models')}>
        {hwProfile}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <button type="button" className="status-link" onClick={() => navigate('Models')}>
        {vram}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <button type="button" className="status-link" onClick={() => navigate('Providers')}>
        {providers}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <button type="button" className="status-link" onClick={() => navigate('Settings')} title="Worker pool">
        <ConcurrencyMeters compact />
      </button>
      <span className="status-grow" />
      <button type="button" className="status-link" onClick={() => navigate('Studio')}>
        {queue > 0 ? `${queue} generation job${queue === 1 ? '' : 's'}` : 'Idle'}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <span className="status-hint">Ctrl+K to Jump</span>
    </footer>
  );
}
