import { useEffect, useRef, useState } from 'react';
import { Badge, HealthDot } from './ui/index.js';
import { healthLabel, normalizeHealth, summarizeTextHealth } from './aiOpsShared.js';

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
        const summary = summarizeTextHealth(list);
        setLabel(summary.label);
        setStatus(summary.status);
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
        title="Text AI health (live). Image providers and engines have separate checks."
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
          <p className="hint">Text AI only. Local game templates can run without hosted keys. Check Providers for image connections.</p>
        </div>
      )}
    </div>
  );
}
