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
          if (typeof hw.vramMb === 'number' && Number.isFinite(hw.vramMb) && hw.vramMb > 0) {
            setVram(`${Math.round(hw.vramMb / 1024)} GB VRAM`);
          } else if (typeof hw.totalRamMb === 'number' && Number.isFinite(hw.totalRamMb)) {
            setVram(`${Math.round(hw.totalRamMb / 1024)} GB RAM`);
          } else {
            setVram('—');
          }
        } else {
          setHwProfile('—');
          setVram('—');
        }
        if (list && Array.isArray(list)) {
          const healthy = list.filter((p) => p.health === 'healthy' && p.enabled).length;
          setProviders(`${healthy}/${list.length} providers`);
        } else {
          setProviders('—');
        }
        const activeJobs = jobs?.filter((j) => j.status === 'queued' || j.status === 'running').length;
        setQueue(typeof activeJobs === 'number' ? activeJobs : 0);
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
      <span className="type-status" title="App version">
        {bridgeReady === false ? 'Bridge offline' : version}
      </span>
      <span className="status-sep" aria-hidden="true" />
      <span className="type-status" title="Workspace">
        {activeNav}
      </span>
      <span className="status-sep" aria-hidden="true" />
      <button
        type="button"
        className="status-link status-context type-status"
        onClick={() => navigate('Dashboard')}
        title={selectedProject?.path ?? projectLabel}
      >
        {projectLabel}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <button type="button" className="status-link type-status" onClick={() => navigate('Models')} title="Hardware profile">
        {hwProfile}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <button type="button" className="status-link type-status" onClick={() => navigate('Models')} title="VRAM / RAM">
        {vram}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <button type="button" className="status-link type-status" onClick={() => navigate('Providers')} title="Providers">
        {providers}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <button type="button" className="status-link type-status" onClick={() => navigate('Settings')} title="Worker pool">
        <ConcurrencyMeters compact />
      </button>
      <span className="status-grow" />
      <button
        type="button"
        className={`status-link type-status${queue > 0 ? ' status-busy' : ''}`}
        onClick={() => navigate('Studio')}
        title="Generation queue"
      >
        {queue > 0 ? `${queue} generation job${queue === 1 ? '' : 's'}` : 'Idle'}
      </button>
      <span className="status-sep" aria-hidden="true" />
      <span className="status-hint type-status">Ctrl+K to Jump</span>
    </footer>
  );
}
