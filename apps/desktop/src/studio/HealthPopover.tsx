import { useEffect, useRef, useState } from 'react';
import { Badge, HealthDot } from './ui/index.js';
import { healthLabel, normalizeHealth } from './aiOpsShared.js';

type ProviderRow = {
  id: string;
  name: string;
  local: boolean;
  enabled: boolean;
  health: string;
};

export function HealthPopover({
  bridgeReady,
  onOpenProviders,
}: {
  bridgeReady: boolean | null;
  onOpenProviders: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [label, setLabel] = useState('Checking…');
  const [status, setStatus] = useState<'PASS' | 'WARN' | 'FAIL' | 'PENDING'>('PENDING');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.metroforge) {
      setLabel('Bridge offline');
      setStatus('FAIL');
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await window.metroforge?.listProviders?.();
        if (cancelled) return;
        if (!list || list.length === 0) {
          setProviders([]);
          setLabel('No providers');
          setStatus('WARN');
          return;
        }
        setProviders(list);
        const healthy = list.filter((p) => p.health === 'healthy' && p.enabled).length;
        const degraded = list.filter((p) => p.health === 'degraded').length;
        if (healthy === list.length) {
          setLabel('All systems nominal');
          setStatus('PASS');
        } else if (healthy > 0) {
          setLabel(`${healthy}/${list.length} healthy`);
          setStatus(degraded > 0 ? 'WARN' : 'PASS');
        } else {
          setLabel('Providers unhealthy');
          setStatus('FAIL');
        }
      } catch {
        if (!cancelled) {
          setLabel('Health unknown');
          setStatus('WARN');
        }
      }
    };
    void refresh();
    const id = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [bridgeReady]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="health-popover-root" ref={rootRef}>
      <button
        type="button"
        className="topbar-health"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Provider health (live)"
        onClick={() => setOpen((v) => !v)}
      >
        <Badge tone={status === 'PASS' ? 'success' : status === 'FAIL' ? 'danger' : 'warning'}>
          {label}
        </Badge>
      </button>
      {open && (
        <div className="health-popover" role="dialog" aria-label="Provider health">
          <header className="health-popover-header">
            <strong>Provider health</strong>
            <button type="button" className="mf-btn mf-btn-ghost mf-btn-sm" onClick={onOpenProviders}>
              Open Providers
            </button>
          </header>
          {providers.length === 0 ? (
            <p className="hint">No providers returned from listProviders.</p>
          ) : (
            <ul className="health-popover-list">
              {providers.map((p) => {
                const kind = normalizeHealth(p.health);
                return (
                  <li key={p.id}>
                    <HealthDot status={p.health} />
                    <span className="mono">{p.id}</span>
                    <span className="hint">{p.local ? 'local' : 'hosted'}</span>
                    <Badge tone={kind === 'healthy' ? 'success' : kind === 'degraded' ? 'warning' : 'danger'}>
                      {p.enabled ? healthLabel(kind) : 'Disabled'}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="hint">Presence-only — no credentials shown.</p>
        </div>
      )}
    </div>
  );
}
