import { useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { ProjectPreview } from './metroforge-api.js';
import { Badge, Button, EmptyState, Panel } from './ui/index.js';

const SHOTS = [
  { id: 'traversal', label: 'Traversal', path: 'reports/02-traversal.png' },
  { id: 'combat', label: 'Combat', path: 'reports/03-combat.png' },
  { id: 'climb', label: 'Vertical / climb', path: 'reports/04-vertical-room.png' },
  { id: 'npc', label: 'NPC', path: 'reports/07-checkpoint.png' },
  { id: 'ability', label: 'Ability', path: 'reports/05-ability-room.png' },
  { id: 'boss', label: 'Boss', path: 'reports/08-boss-room.png' },
  { id: 'ui', label: 'UI / HUD', path: 'reports/hud.png' },
];

export function VisualReviewScreen() {
  const { selectedPath, hasActiveProject } = useStudio();
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selectedPath || !window.metroforge?.getProjectPreview) return;
    void window.metroforge.getProjectPreview(selectedPath).then(setPreview);
  }, [selectedPath]);

  const decide = async (decision: 'approve' | 'reject') => {
    if (!selectedPath || !window.metroforge?.decideVisualSliceReview) return;
    setBusy(true);
    await window.metroforge.decideVisualSliceReview(selectedPath, decision);
    const next = await window.metroforge.getProjectPreview?.(selectedPath);
    if (next) setPreview(next);
    setBusy(false);
  };

  const dna = preview?.visualDNA;
  const qa = preview?.visualQa;
  const shots = preview?.assetPreviews?.filter((a) => a.path.includes('reports/') || a.path.includes('qa/')) ?? [];

  return (
    <section className="workspace-screen">
      <ScreenHeader
        eyebrow="AI"
        title="Visual Review"
        description="Automated visual scores beside representative captures. Only a human can approve or reject art direction."
        actions={<ProjectSelect />}
      />
      <NoProjectHint />
      {hasActiveProject && (
        <div className="form-stack">
          <Panel level={1} title="Visual identity">
            {dna ? (
              <dl className="kv">
                <dt>Style fingerprint</dt>
                <dd className="mono">{dna.styleFingerprint ?? '—'}</dd>
                <dt>Rendering</dt>
                <dd>{dna.renderingStyle ?? dna.artStyle?.label ?? '—'}</dd>
                <dt>Automated verdict</dt>
                <dd>
                  <Badge>{qa?.verdict ?? preview?.visualReview?.status ?? 'pending'}</Badge>
                </dd>
              </dl>
            ) : (
              <EmptyState title="No VisualDNA" description="Generate a VISUAL_VERTICAL_SLICE to populate identity." />
            )}
            <div className="row" style={{ marginTop: '0.75rem' }}>
              <Button variant="primary" disabled={busy} onClick={() => void decide('approve')}>
                Approve Visual Direction
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => void decide('reject')}>
                Reject
              </Button>
            </div>
          </Panel>
          <Panel level={1} title="Scores">
            {qa?.scores ? (
              <ul>
                {Object.entries(qa.scores).map(([k, v]) => (
                  <li key={k}>
                    {k}: {Math.round(Number(v))}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Scores appear after automated visual QA writes reports/VGF2_VISUAL_VERTICAL_SLICE.json.</p>
            )}
            {qa?.defects && qa.defects.length > 0 && (
              <p className="hint">Defects: {qa.defects.join(', ')}</p>
            )}
          </Panel>
          <Panel level={1} title="Representative captures">
            <ul>
              {SHOTS.map((shot) => (
                <li key={shot.id}>
                  {shot.label} — {shot.path}
                </li>
              ))}
            </ul>
            {shots.length > 0 && (
              <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                {shots.slice(0, 8).map((shot) => (
                  <img key={shot.id} src={shot.dataUrl} alt={shot.path} width={160} height={90} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </section>
  );
}
