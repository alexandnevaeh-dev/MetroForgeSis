import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModelEntry } from '@metroforge/schemas';
import { ScreenHeader } from './ScreenHeader';
import type { RankedModel } from './metroforge-api';

const CAPABILITIES = [
  'REASONING',
  'NARRATIVE',
  'WORLD_DESIGN',
  'JSON_GENERATION',
  'CODE_GENERATION',
  'GDSCRIPT',
  'IMAGE_GENERATION',
  'PIXEL_ART_PROCESS',
  'VISION_ANALYSIS',
  'SFX_GENERATION',
  'MUSIC_GENERATION',
  'SPEECH_GENERATION',
  'QA_REASONING',
  'EMBEDDING',
] as const;

function rejectionReason(model: ModelEntry, capability: string, rankedIds: Set<string>): string {
  if (rankedIds.has(model.id)) return '';
  if (!model.enabled) return 'Disabled in catalog';
  if (!model.capabilities?.includes(capability as ModelEntry['capabilities'][number])) {
    return 'Missing requested capability';
  }
  if (model.health === 'unavailable') return 'Provider health unavailable';
  if (model.minRamMb) return `Hardware filter (min ${model.minRamMb} MB RAM)`;
  if (model.minVramMb) return `Hardware filter (min ${model.minVramMb} MB VRAM)`;
  return 'Filtered by ranker (license, locality, or score gate)';
}

export function RoutingInspector() {
  const [capability, setCapability] = useState<string>('IMAGE_GENERATION');
  const [ranked, setRanked] = useState<RankedModel[]>([]);
  const [catalog, setCatalog] = useState<ModelEntry[]>([]);
  const [hardware, setHardware] = useState<{
    profile: string;
    totalRamMb: number;
    vramMb?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inspect = useCallback(async (cap: string) => {
    if (!window.metroforge?.rankModels || !window.metroforge.listModels) {
      setError('Routing IPC is unavailable — restart the desktop app.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ranks, models, hw] = await Promise.all([
        window.metroforge.rankModels(cap),
        window.metroforge.listModels({ capability: cap }),
        window.metroforge.getHardwareProfile(),
      ]);
      setRanked(Array.isArray(ranks) ? ranks : []);
      setCatalog(models ?? []);
      setHardware(hw);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    inspect(capability);
  }, [capability, inspect]);

  const rankedIds = useMemo(() => new Set(ranked.map((r) => r.model.id)), [ranked]);
  const selected = ranked[0];
  const rejected = catalog.filter((m) => !rankedIds.has(m.id));

  return (
    <section className="routing-inspector">
      <ScreenHeader
        eyebrow="AI orchestration"
        title="Routing Inspector"
        description="Shows how MetroForge ranks real catalog models for a capability. Candidates and scores come from rankModels; rejected rows are catalog entries that the ranker did not return."
      />

      <div className="toolbar">
        <label>
          Requested capability
          <select value={capability} onChange={(e) => setCapability(e.target.value)}>
            {CAPABILITIES.map((cap) => (
              <option key={cap} value={cap}>
                {cap}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" onClick={() => inspect(capability)} disabled={loading}>
          {loading ? 'Inspecting…' : 'Refresh routing'}
        </button>
      </div>

      {error && <p className="result error">{error}</p>}

      <div className="routing-layout">
        <aside className="panel">
          <h3>Request</h3>
          <dl className="settings-dl">
            <dt>Capability</dt>
            <dd>
              <code>{capability}</code>
            </dd>
            <dt>Hardware</dt>
            <dd>
              {hardware
                ? `${hardware.profile} · ${hardware.totalRamMb} MB RAM${hardware.vramMb ? ` · ${hardware.vramMb} MB VRAM` : ''}`
                : '—'}
            </dd>
            <dt>Workflow</dt>
            <dd>Capability → catalog filter → hardware gates → score → first candidate</dd>
          </dl>
        </aside>

        <div className="panel routing-selected">
          <h3>Selected model</h3>
          {selected ? (
            <>
              <p className="routing-winner">{selected.model.name}</p>
              <dl className="settings-dl">
                <dt>Provider</dt>
                <dd>{selected.model.provider}</dd>
                <dt>Score</dt>
                <dd>{selected.score.toFixed(1)}</dd>
                <dt>License</dt>
                <dd>
                  {selected.model.license} · {selected.model.commercialUse}
                </dd>
                <dt>Local</dt>
                <dd>{selected.model.local ? 'yes' : 'hosted'}</dd>
                <dt>Installed</dt>
                <dd>{selected.model.installed ? 'yes' : 'no'}</dd>
                <dt>Reasons</dt>
                <dd>{selected.reasons.join(' · ') || 'priority only'}</dd>
              </dl>
            </>
          ) : (
            <p className="hint">No routable model for this capability on the current hardware/keys.</p>
          )}
        </div>

        <aside className="panel">
          <h3>Fallbacks</h3>
          {ranked.length > 1 ? (
            <ol className="routing-fallbacks">
              {ranked.slice(1, 6).map((entry) => (
                <li key={entry.model.id}>
                  <strong>{entry.model.name}</strong>
                  <span>
                    {entry.model.provider} · {entry.score.toFixed(1)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">No scored fallbacks returned.</p>
          )}
        </aside>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>Candidates ({ranked.length})</h3>
        <div className="table-wrap">
          <table className="provider-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Model</th>
                <th>Provider</th>
                <th>Score</th>
                <th>License</th>
                <th>Hardware</th>
                <th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((entry, index) => (
                <tr key={entry.model.id} className={index === 0 ? 'row-selected' : undefined}>
                  <td>{index + 1}</td>
                  <td>{entry.model.name}</td>
                  <td>{entry.model.provider}</td>
                  <td>{entry.score.toFixed(1)}</td>
                  <td>{entry.model.license}</td>
                  <td>
                    {entry.model.recommendedRamMb ? `${entry.model.recommendedRamMb} MB RAM` : '—'}
                    {entry.model.minVramMb ? ` / ${entry.model.minVramMb} VRAM` : ''}
                  </td>
                  <td>{entry.reasons.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>Rejected ({rejected.length})</h3>
        <p className="hint">
          Inferred from catalog minus ranker output. Explicit rejection traces are listed as a backend
          requirement if Claude exposes `explainModelRouting`.
        </p>
        <div className="table-wrap">
          <table className="provider-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th>Likely reason</th>
              </tr>
            </thead>
            <tbody>
              {rejected.slice(0, 40).map((model) => (
                <tr key={model.id}>
                  <td>{model.name}</td>
                  <td>{model.provider}</td>
                  <td>{rejectionReason(model, capability, rankedIds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
