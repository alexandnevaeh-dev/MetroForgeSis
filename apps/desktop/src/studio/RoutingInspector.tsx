import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import type { ModelRoutingExplanation } from './metroforge-api.js';
import { useStudio } from './StudioContext.js';

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

const IMAGE_CAPABILITIES = new Set([
  'IMAGE_GENERATION',
  'CONCEPT_ART',
  'CHARACTER_CONCEPT',
  'ENVIRONMENT',
  'BACKGROUND',
  'TILE_SOURCE',
  'VFX_TEXTURE',
  'UI_ART',
  'ITEM_ICON',
  'PIXEL_ART_PROCESS',
  'TEXTURE_GENERATION',
]);

function localityLabel(reasons: string[]): string {
  const hit = reasons.find((r) => /local|remote|hosted|VRAM N\/A/i.test(r));
  if (!hit) return '—';
  if (/remote|hosted|VRAM N\/A/i.test(hit)) return 'remote (VRAM N/A)';
  if (/local/i.test(hit)) return 'local';
  return hit;
}

function healthLabel(reasons: string[]): string {
  const hit = reasons.find((r) => /health/i.test(r));
  return hit ?? '—';
}

export function RoutingInspector() {
  const { navigate } = useStudio();
  const [capability, setCapability] = useState<string>('IMAGE_GENERATION');
  const [query, setQuery] = useState('');
  const [trace, setTrace] = useState<ModelRoutingExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inspect = useCallback(async (cap: string) => {
    if (!window.metroforge?.explainModelRouting) {
      setError('explainModelRouting is unavailable — restart the desktop app after the latest preload build.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setTrace(await window.metroforge.explainModelRouting(cap));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void inspect(capability);
  }, [capability, inspect]);

  const q = query.trim().toLowerCase();
  const matches = (id: string, provider: string) =>
    !q || id.toLowerCase().includes(q) || provider.toLowerCase().includes(q);
  const candidates = useMemo(
    () => (trace?.candidates ?? []).filter((entry) => matches(entry.modelId, entry.provider)),
    [trace, q],
  );
  const rejected = useMemo(
    () => (trace?.rejected ?? []).filter((entry) => matches(entry.modelId, entry.provider)),
    [trace, q],
  );
  const selected = trace?.selected;
  const hardware = trace?.hardware;
  const isImageCapability = IMAGE_CAPABILITIES.has(capability);

  return (
    <section className="routing-inspector">
      <ScreenHeader
        eyebrow="AI orchestration"
        title="Routing Inspector"
        description={
          isImageCapability
            ? 'IMAGE path merges ImageProviderRegistry (ComfyUI / NVIDIA / Diffusers) with catalog image models — same AssetPipeline registry, not a second image router.'
            : 'Structured routing trace from explainModelRouting — selected model, scored candidates, and explicit reject reasons.'
        }
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
        <button type="button" className="primary" onClick={() => void inspect(capability)} disabled={loading}>
          {loading ? 'Inspecting…' : 'Refresh routing'}
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter candidates…"
          aria-label="Filter routing results"
        />
        <button type="button" onClick={() => navigate('Models')}>
          Open catalog
        </button>
        {isImageCapability && (
          <button type="button" onClick={() => navigate('Providers')}>
            Image providers
          </button>
        )}
      </div>

      {error && <p className="result error">{error}</p>}

      {isImageCapability && trace?.degradedFallback && (
        <div className="panel" style={{ marginBottom: '0.85rem' }}>
          <p className="check-warn">
            No healthy image provider — AssetPipeline would use procedural PLACEHOLDER art and mark the phase
            DEGRADED (not SUCCESS). This is not a separate image pipeline.
          </p>
        </div>
      )}

      <div className="routing-layout">
        <aside className="panel">
          <h3>Request</h3>
          <dl className="settings-dl">
            <dt>Capability</dt>
            <dd>
              <code>{capability}</code>
            </dd>
            <dt>Requirements</dt>
            <dd>{(trace?.requirements ?? []).join(' · ') || '—'}</dd>
            <dt>Hardware</dt>
            <dd>
              {hardware
                ? `${hardware.profile} · ${hardware.ramMb} MB RAM${hardware.vramMb ? ` · ${hardware.vramMb} MB VRAM` : ''}`
                : '—'}
              {hardware?.note ? (
                <>
                  <br />
                  <span className="hint">{hardware.note}</span>
                </>
              ) : null}
            </dd>
            <dt>License filter</dt>
            <dd>{trace?.license ?? '—'}</dd>
          </dl>
        </aside>

        <div className="panel routing-selected">
          <h3>{isImageCapability ? 'Selected image provider / model' : 'Selected model'}</h3>
          {selected ? (
            <>
              <p className="routing-winner">{selected.modelId}</p>
              <dl className="settings-dl">
                <dt>Provider</dt>
                <dd>{selected.provider}</dd>
                <dt>Score</dt>
                <dd>{selected.score.toFixed(1)}</dd>
                {selected.workflow && (
                  <>
                    <dt>Workflow</dt>
                    <dd>{selected.workflow}</dd>
                  </>
                )}
              </dl>
            </>
          ) : (
            <p className="hint">
              {isImageCapability
                ? 'No healthy image provider — procedural PLACEHOLDER fallback (DEGRADED).'
                : 'No routable model for this capability on the current hardware/keys.'}
            </p>
          )}
        </div>

        <aside className="panel">
          <h3>Fallbacks</h3>
          {(trace?.fallbacks?.length ?? 0) > 0 ? (
            <ol className="routing-fallbacks">
              {trace!.fallbacks.map((entry) => (
                <li key={`${entry.provider}-${entry.modelId}`}>
                  <strong>{entry.modelId}</strong>
                  <span>{entry.provider}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">
              {isImageCapability && trace?.degradedFallback
                ? 'Procedural PLACEHOLDER is the only remaining path.'
                : 'No scored fallbacks returned.'}
            </p>
          )}
        </aside>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>
          Candidates ({candidates.length}
          {q ? ` of ${trace?.candidates.length ?? 0}` : ''})
        </h3>
        <div className="table-wrap">
          <table className="provider-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Model</th>
                <th>Provider</th>
                <th>Locality</th>
                <th>Health</th>
                <th>Score</th>
                <th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <span className="hint">
                      {isImageCapability
                        ? 'No accepted image providers/models — see Rejected for ComfyUI / NVIDIA / Diffusers health reasons.'
                        : 'No accepted candidates.'}
                    </span>
                  </td>
                </tr>
              ) : (
                candidates.map((entry, index) => (
                  <tr key={`${entry.provider}-${entry.modelId}`} className={index === 0 && !q ? 'row-selected' : undefined}>
                    <td>
                      {(trace?.candidates.findIndex(
                        (c) => c.modelId === entry.modelId && c.provider === entry.provider,
                      ) ?? index) + 1}
                    </td>
                    <td>{entry.modelId}</td>
                    <td>{entry.provider}</td>
                    <td>{localityLabel(entry.reasons)}</td>
                    <td>{healthLabel(entry.reasons)}</td>
                    <td>{entry.score.toFixed(1)}</td>
                    <td>{entry.reasons.join(', ') || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>Rejected ({rejected.length})</h3>
        <p className="hint">
          {isImageCapability
            ? 'Image providers and catalog IMAGE models with accept/reject reasons (health, LOCAL_ONLY, locality). Remote providers are never VRAM-gated.'
            : 'Explicit reject reasons from explainModelRouting (license, locality, hardware, capability).'}
        </p>
        <div className="table-wrap">
          <table className="provider-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th>Locality</th>
                <th>Health</th>
                <th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {rejected.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <span className="hint">No rejected entries.</span>
                  </td>
                </tr>
              ) : (
                rejected.map((entry) => (
                  <tr key={`${entry.provider}-${entry.modelId}-${entry.reasons.join('|')}`}>
                    <td>{entry.modelId}</td>
                    <td>{entry.provider}</td>
                    <td>{localityLabel(entry.reasons)}</td>
                    <td>{healthLabel(entry.reasons)}</td>
                    <td>{entry.reasons.join(' · ') || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
