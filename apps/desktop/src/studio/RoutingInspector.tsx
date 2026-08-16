import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import type { ModelRoutingExplanation } from './metroforge-api.js';
import { useStudio } from './StudioContext.js';
import {
  computeRouteBlockers,
  parseScoreFactorReasons,
  REJECTION_TAG_LABELS,
  uniqueRejectionTags,
} from './aiOpsShared.js';
import {
  AiOpsBody,
  AiOpsLog,
  AiOpsWorkbench,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Panel,
  RejectionTagBadge,
  Select,
} from './ui/index.js';

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

function localityFromReasons(reasons: string[]): string {
  const hit = reasons.find((r) => /local|remote|hosted|VRAM N\/A/i.test(r));
  if (!hit) return '—';
  if (/remote|hosted|VRAM N\/A/i.test(hit)) return 'remote';
  if (/local/i.test(hit)) return 'local';
  return hit;
}

function healthFromReasons(reasons: string[]): string {
  const hit = reasons.find((r) => /health|offline|unavailable|healthy/i.test(r));
  return hit ?? '—';
}

function hardwareFromReasons(reasons: string[]): string {
  const hit = reasons.find((r) => /vram|ram|hardware/i.test(r));
  return hit ?? '—';
}

function licenseFromReasons(reasons: string[]): string {
  const hit = reasons.find((r) => /license/i.test(r));
  return hit?.replace(/^license:\s*/i, '') ?? '—';
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

function RejectedRow({
  entry,
  defaultOpen,
}: {
  entry: { modelId: string; provider: string; reasons: string[] };
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const tags = uniqueRejectionTags(entry.reasons);
  const vramReq = entry.reasons.find((r) => /requires ~?\d+MB VRAM/i.test(r));
  const detected = entry.reasons.find((r) => /detected \d+MB/i.test(r));

  return (
    <li className="routing-reject-row">
      <div className="routing-reject-row-head">
        <div>
          <strong className="mono">{entry.modelId}</strong>
          <span className="hint">{entry.provider}</span>
        </div>
        <Badge tone="danger">BLOCKED</Badge>
      </div>
      <div className="rejection-tag-row">
        {tags.map((tag) => (
          <RejectionTagBadge key={tag} code={tag} label={REJECTION_TAG_LABELS[tag]} />
        ))}
      </div>
      {(vramReq || detected) && (
        <p className="hint mono routing-reject-hw">
          {vramReq ?? ''}
          {detected ? ` · ${detected}` : ''}
        </p>
      )}
      <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide details' : 'View details'}
      </Button>
      {open ? (
        <ul className="routing-reject-detail">
          {entry.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
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
  const blockers = useMemo(() => computeRouteBlockers(trace?.rejected ?? []), [trace]);
  const scoreFactors = selected
    ? parseScoreFactorReasons(
        (trace?.candidates.find((c) => c.modelId === selected.modelId && c.provider === selected.provider)
          ?.reasons ?? []) as string[],
      )
    : [];
  const zeroCandidates = (trace?.candidates.length ?? 0) === 0;

  return (
    <section className="workspace-screen routing-inspector">
      <ScreenHeader
        eyebrow="AI orchestration"
        title="Routing Inspector"
        description="Explainable capability routing across registered providers and models."
        compact
        actions={
          <div className="row routing-header-actions">
            <label className="routing-cap-label">
              Capability
              <Select value={capability} onChange={(e) => setCapability(e.target.value)} aria-label="Requested capability">
                {CAPABILITIES.map((cap) => (
                  <option key={cap} value={cap}>
                    {cap}
                  </option>
                ))}
              </Select>
            </label>
            <Button variant="primary" onClick={() => void inspect(capability)} disabled={loading}>
              {loading ? 'Inspecting…' : 'Refresh Routing'}
            </Button>
            <Button onClick={() => navigate('Models')}>Open Catalog</Button>
            {isImageCapability ? <Button onClick={() => navigate('Providers')}>Image providers</Button> : null}
          </div>
        }
      />

      {error && <p className="result error">{error}</p>}

      <AiOpsWorkbench variant="routing">
        {isImageCapability && trace?.degradedFallback ? (
          <Panel level={2} className="routing-degraded-banner">
            <p className="check-warn">
              No healthy image provider — AssetPipeline would use procedural PLACEHOLDER art and mark the phase
              DEGRADED (not SUCCESS). This is not a separate image pipeline.
            </p>
          </Panel>
        ) : null}

        <div className="toolbar routing-filter-bar">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter candidates…"
            aria-label="Filter routing results"
          />
          <span className="hint mono">
            candidates {trace?.candidates.length ?? 0} · rejected {trace?.rejected.length ?? 0}
          </span>
        </div>

        <div className="routing-layout">
          <Panel level={1} title="Request">
            <dl className="settings-dl routing-request-dl">
              <dt>Capability</dt>
              <dd>
                <code className="mono">{capability}</code>
              </dd>
              <dt>Requirements</dt>
              <dd>
                {(trace?.requirements ?? []).length ? (
                  <ul className="routing-req-list">
                    {(trace?.requirements ?? []).map((req) => (
                      <li key={req}>{req}</li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Hardware</dt>
              <dd>
                {hardware ? (
                  <>
                    <Badge tone={hardware.profile === 'LOW_RESOURCE' ? 'warning' : 'info'}>{hardware.profile}</Badge>
                    <div className="mono hint">
                      RAM {hardware.ramMb} MB
                      {hardware.vramMb != null ? ` · VRAM ${hardware.vramMb} MB` : ''}
                    </div>
                    {'note' in (hardware as object) && (hardware as { note?: string }).note ? (
                      <span className="hint">{(hardware as { note?: string }).note}</span>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
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
                <p className="routing-winner mono">{selected.modelId}</p>
                <dl className="settings-dl">
                  <dt>Provider</dt>
                  <dd>{selected.provider}</dd>
                  <dt>Score</dt>
                  <dd className="mono">{selected.score.toFixed(1)}</dd>
                  {selected.workflow ? (
                    <>
                      <dt>Workflow</dt>
                      <dd>{selected.workflow}</dd>
                    </>
                  ) : null}
                </dl>
                {scoreFactors.length > 0 ? (
                  <div className="routing-score-factors">
                    <h3 className="mf-panel-title type-label">Score factors</h3>
                    <ul>
                      {scoreFactors.map((f) => (
                        <li key={`${f.label}-${f.detail}`}>
                          <span>{f.label}</span>
                          {f.detail ? <code className="mono">{f.detail}</code> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="hint">No structured score breakdown from backend beyond total score.</p>
                )}
              </>
            ) : (
              <EmptyState
                title="No routable model"
                description={
                  isImageCapability
                    ? 'No registered model satisfies the current capability/provider/hardware/license requirements. Procedural PLACEHOLDER may apply (DEGRADED).'
                    : 'No registered model satisfies the current capability/provider/hardware/license requirements.'
                }
                actions={
                  blockers.length ? (
                    <ul className="routing-blocker-list">
                      {blockers.map((b) => (
                        <li key={b.tag}>
                          <strong className="mono">{b.count}</strong> {b.label}
                        </li>
                      ))}
                    </ul>
                  ) : undefined
                }
              />
            )}
          </Panel>

          <Panel level={1} title="Fallbacks" actions={<Badge tone="muted">{trace?.fallbacks?.length ?? 0}</Badge>}>
            {(trace?.fallbacks?.length ?? 0) > 0 ? (
              <ol className="routing-fallbacks">
                {trace!.fallbacks.map((entry, i) => (
                  <li key={`${entry.provider}-${entry.modelId}`}>
                    <span className="mono hint">{i + 1}</span>
                    <strong className="mono">{entry.modelId}</strong>
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
                    : 'No scored fallback route is currently available.'
                }
              />
            )}
          </Panel>
        </div>

        <AiOpsBody className="routing-bottom">
          <Panel
            level={1}
            className="routing-candidates-pane"
            title={`Candidates (${candidates.length}${q ? ` of ${trace?.candidates.length ?? 0}` : ''})`}
          >
            {zeroCandidates && !q ? (
              <EmptyState
                title="0 candidates"
                description={
                  isImageCapability
                    ? 'No accepted image providers/models for this capability — see Rejected for real health reasons. FLUX routes are not invented.'
                    : 'No accepted candidates.'
                }
                actions={
                  blockers.length ? (
                    <ul className="routing-blocker-list">
                      {blockers.map((b) => (
                        <li key={b.tag}>
                          <strong className="mono">{b.count}</strong> {b.label}
                        </li>
                      ))}
                    </ul>
                  ) : undefined
                }
              />
            ) : (
              <DataTable columns={['Rank', 'Model', 'Provider', 'Score', 'Health', 'Hardware', 'License', 'Reason']}>
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <span className="hint">No candidates match filter.</span>
                    </td>
                  </tr>
                ) : (
                  candidates.map((entry, index) => {
                    const rank =
                      (trace?.candidates.findIndex(
                        (c) => c.modelId === entry.modelId && c.provider === entry.provider,
                      ) ?? index) + 1;
                    const isWinner = rank === 1 && !q;
                    return (
                      <tr
                        key={`${entry.provider}-${entry.modelId}`}
                        className={isWinner ? 'row-selected routing-candidate-winner' : undefined}
                      >
                        <td className="mono">{rank}</td>
                        <td className="mono">{entry.modelId}</td>
                        <td>{entry.provider}</td>
                        <td className="mono">{entry.score.toFixed(1)}</td>
                        <td>{healthFromReasons(entry.reasons)}</td>
                        <td>{hardwareFromReasons(entry.reasons)}</td>
                        <td className="mono">{licenseFromReasons(entry.reasons)}</td>
                        <td title={entry.reasons.join(' · ')}>
                          {entry.reasons.slice(0, 2).join(' · ') || localityFromReasons(entry.reasons)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </DataTable>
            )}
          </Panel>

          <div className="routing-side-stack">
            <Panel
              level={1}
              title={`Rejected (${rejected.length}${q ? ` of ${trace?.rejected.length ?? 0}` : ''})`}
            >
              <p className="hint">
                Explicit reject reasons from explainModelRouting. Tags are display mappings only — decisions are
                unchanged.
              </p>
              {rejected.length === 0 ? (
                <EmptyState title="No rejected entries" description="Nothing filtered out for this capability." />
              ) : (
                <ul className="routing-reject-list">
                  {rejected.map((entry) => (
                    <RejectedRow
                      key={`${entry.provider}-${entry.modelId}-${entry.reasons.join('|')}`}
                      entry={entry}
                    />
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </AiOpsBody>

        <AiOpsLog
          title="QA / Health log"
          actions={
            <Badge tone={doctorWarn > 0 ? 'warning' : doctorChecks.length ? 'success' : 'muted'}>
              {doctorChecks.length ? (doctorWarn > 0 ? `${doctorWarn} not OK` : 'all OK') : '—'}
            </Badge>
          }
        >
          {doctorChecks.length === 0 ? (
            <EmptyState title="No doctor results" description="runDoctor has not returned checks yet." />
          ) : (
            <ul className="check-list routing-health-log">
              {doctorChecks.map((check) => (
                <li key={check.name} className={doctorRowClass(check.status)}>
                  <Badge tone={doctorTone(check.status)}>{check.status}</Badge>{' '}
                  <span className="mono">{check.name}</span>: {check.message}
                </li>
              ))}
            </ul>
          )}
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
        </AiOpsLog>
      </AiOpsWorkbench>
    </section>
  );
}
