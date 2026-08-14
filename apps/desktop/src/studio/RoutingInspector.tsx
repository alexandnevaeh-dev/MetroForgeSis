import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import type { ModelRoutingExplanation } from './metroforge-api.js';
import { useStudio } from './StudioContext.js';
import { Badge, Button, DataTable, EmptyState, Input, Panel, Select } from './ui/index.js';

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

type DoctorCheck = { name: string; status: string; message: string };

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

function doctorTone(status: string): 'success' | 'warning' | 'danger' | 'muted' {
  const s = status.toLowerCase();
  if (s === 'ok' || s === 'pass' || s === 'passed') return 'success';
  if (s === 'warn' || s === 'warning' || s === 'degraded') return 'warning';
  if (s === 'fail' || s === 'failed' || s === 'error') return 'danger';
  return 'muted';
}

function doctorRowClass(status: string): string {
  const tone = doctorTone(status);
  if (tone === 'success') return 'check-pass';
  if (tone === 'danger' || tone === 'warning') return 'check-warn';
  return 'hint';
}

export function RoutingInspector() {
  const { navigate } = useStudio();
  const [capability, setCapability] = useState<string>('IMAGE_GENERATION');
  const [query, setQuery] = useState('');
  const [trace, setTrace] = useState<ModelRoutingExplanation | null>(null);
  const [doctorChecks, setDoctorChecks] = useState<DoctorCheck[]>([]);
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

  const loadDoctor = useCallback(async () => {
    if (!window.metroforge?.runDoctor) return;
    try {
      setDoctorChecks(await window.metroforge.runDoctor());
    } catch {
      /* keep prior doctor rows; routing inspect remains primary */
    }
  }, []);

  useEffect(() => {
    void inspect(capability);
  }, [capability, inspect]);

  useEffect(() => {
    void loadDoctor();
  }, [loadDoctor]);

  const q = query.trim().toLowerCase();
  const candidates = useMemo(() => {
    const list = trace?.candidates ?? [];
    if (!q) return list;
    return list.filter(
      (entry) => entry.modelId.toLowerCase().includes(q) || entry.provider.toLowerCase().includes(q),
    );
  }, [trace, q]);
  const rejected = useMemo(() => {
    const list = trace?.rejected ?? [];
    if (!q) return list;
    return list.filter(
      (entry) => entry.modelId.toLowerCase().includes(q) || entry.provider.toLowerCase().includes(q),
    );
  }, [trace, q]);
  const selected = trace?.selected;
  const hardware = trace?.hardware;
  const isImageCapability = IMAGE_CAPABILITIES.has(capability);
  const doctorWarn = doctorChecks.filter((c) => {
    const s = c.status.toLowerCase();
    return s !== 'ok' && s !== 'pass' && s !== 'passed';
  }).length;

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
          <Select value={capability} onChange={(e) => setCapability(e.target.value)}>
            {CAPABILITIES.map((cap) => (
              <option key={cap} value={cap}>
                {cap}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="primary" onClick={() => void inspect(capability)} disabled={loading}>
          {loading ? 'Inspecting…' : 'Refresh routing'}
        </Button>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter candidates…"
          aria-label="Filter routing results"
        />
        <Button onClick={() => navigate('Models')}>Open catalog</Button>
        {isImageCapability && <Button onClick={() => navigate('Providers')}>Image providers</Button>}
      </div>

      {error && <p className="result error">{error}</p>}

      {isImageCapability && trace?.degradedFallback && (
        <Panel level={2} className="routing-degraded-banner">
          <p className="check-warn">
            No healthy image provider — AssetPipeline would use procedural PLACEHOLDER art and mark the phase
            DEGRADED (not SUCCESS). This is not a separate image pipeline.
          </p>
        </Panel>
      )}

      <div className="routing-layout">
        <Panel level={1} title="Request">
          <dl className="settings-dl routing-request-dl">
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
        </Panel>

        <Panel
          level={1}
          className="routing-selected"
          title="Selected"
          actions={
            selected ? (
              <Badge tone="success">WINNER</Badge>
            ) : (
              <Badge tone="warning">{isImageCapability ? 'DEGRADED' : 'NONE'}</Badge>
            )
          }
        >
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
            <EmptyState
              title="No selection"
              description={
                isImageCapability
                  ? 'No healthy image provider — procedural PLACEHOLDER fallback (DEGRADED).'
                  : 'No routable model for this capability on the current hardware/keys.'
              }
            />
          )}
        </Panel>

        <Panel
          level={1}
          title="Fallbacks"
          actions={<Badge tone="muted">{trace?.fallbacks?.length ?? 0}</Badge>}
        >
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
            <EmptyState
              title="No fallbacks"
              description={
                isImageCapability && trace?.degradedFallback
                  ? 'Procedural PLACEHOLDER is the only remaining path.'
                  : 'No scored fallbacks returned.'
              }
            />
          )}
        </Panel>
      </div>

      <div className="routing-bottom">
        <Panel
          level={1}
          className="routing-candidates-pane"
          title={`Candidates (${candidates.length}${q ? ` of ${trace?.candidates.length ?? 0}` : ''})`}
        >
          <DataTable columns={['Rank', 'Model', 'Provider', 'Locality', 'Health', 'Score', 'Reasons']}>
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
                <tr
                  key={`${entry.provider}-${entry.modelId}`}
                  className={index === 0 && !q ? 'row-selected' : undefined}
                >
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
          </DataTable>
        </Panel>

        <div className="routing-side-stack">
          <Panel
            level={1}
            title={`Rejected (${rejected.length}${q ? ` of ${trace?.rejected.length ?? 0}` : ''})`}
          >
            <p className="hint">
              {isImageCapability
                ? 'Image providers and catalog IMAGE models with accept/reject reasons. Rejection reasons are never hidden.'
                : 'Explicit reject reasons from explainModelRouting. Rejection reasons are never hidden.'}
            </p>
            {rejected.length === 0 ? (
              <EmptyState title="No rejected entries" description="Nothing filtered out for this capability." />
            ) : (
              <ul className="routing-reject-list">
                {rejected.map((entry) => (
                  <li key={`${entry.provider}-${entry.modelId}-${entry.reasons.join('|')}`}>
                    <strong>{entry.modelId}</strong>
                    <span className="hint">{entry.provider}</span>
                    <span className="routing-reject-reasons">{entry.reasons.join(' · ') || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            level={1}
            title="QA / Health log"
            actions={
              <Badge tone={doctorWarn > 0 ? 'warning' : doctorChecks.length ? 'success' : 'muted'}>
                {doctorChecks.length
                  ? doctorWarn > 0
                    ? `${doctorWarn} not OK`
                    : 'all OK'
                  : '—'}
              </Badge>
            }
          >
            {doctorChecks.length === 0 ? (
              <EmptyState title="No doctor results" description="runDoctor has not returned checks yet." />
            ) : (
              <ul className="check-list routing-health-log">
                {doctorChecks.map((check) => (
                  <li key={check.name} className={doctorRowClass(check.status)}>
                    <Badge tone={doctorTone(check.status)}>{check.status}</Badge> {check.name}:{' '}
                    {check.message}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="routing-footer row">
        <Button
          variant="primary"
          onClick={() => {
            void loadDoctor();
            navigate('QA');
          }}
        >
          Run quick validation
        </Button>
        <Button onClick={() => navigate('Export')}>Export</Button>
        <Button size="sm" variant="ghost" onClick={() => void loadDoctor()}>
          Refresh health
        </Button>
      </div>
    </section>
  );
}
