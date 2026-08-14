import { useEffect, useState } from 'react';
import type { ConcurrencyStatus } from './metroforge-api.js';

const LANES: Array<{ key: keyof ConcurrencyStatus; label: string; short: string }> = [
  { key: 'llm', label: 'LLM', short: 'LLM' },
  { key: 'image', label: 'Image', short: 'IMG' },
  { key: 'audio', label: 'Audio', short: 'AUD' },
  { key: 'cpu', label: 'CPU', short: 'CPU' },
];

function laneCapacity(lane: { active?: number; max?: number; limit?: number } | undefined): number | null {
  if (!lane) return null;
  const cap = lane.max ?? lane.limit;
  return typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? cap : null;
}

function formatLane(status: ConcurrencyStatus | null, key: keyof ConcurrencyStatus): string {
  const lane = status?.[key] as { active?: number; max?: number; limit?: number } | undefined;
  const cap = laneCapacity(lane);
  if (cap == null) return '—';
  return `${lane?.active ?? 0}/${cap}`;
}

export function useConcurrencyStatus(intervalMs = 1500) {
  const [status, setStatus] = useState<ConcurrencyStatus | null>(null);

  useEffect(() => {
    if (!window.metroforge?.getConcurrencyStatus) return;
    const tick = () => {
      window.metroforge?.getConcurrencyStatus?.()
        .then(setStatus)
        .catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return status;
}

export function ConcurrencyMeters({ compact = false }: { compact?: boolean }) {
  const status = useConcurrencyStatus(compact ? 2500 : 1500);

  if (compact) {
    return (
      <span className="concurrency-compact" title="Live worker pool from getConcurrencyStatus">
        {LANES.map((lane) => `${lane.short} ${formatLane(status, lane.key)}`).join(' | ')}
      </span>
    );
  }

  return (
    <div className="concurrency-meters">
      {LANES.map((lane) => {
        const data = status?.[lane.key] as { active?: number; max?: number; limit?: number } | undefined;
        const max = laneCapacity(data);
        const active = data?.active ?? 0;
        const pct = max != null && max > 0 ? Math.min(100, (active / max) * 100) : 0;
        return (
          <div key={lane.key} className="concurrency-meter">
            <span>{lane.label}</span>
            <div className="concurrency-meter-bar" aria-hidden="true">
              <div className="concurrency-meter-fill" style={{ width: `${pct}%` }} />
            </div>
            <span>
              {max == null ? '—' : `${active}/${max}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
