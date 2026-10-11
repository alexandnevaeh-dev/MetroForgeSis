import { useId } from 'react';
import type { RoomFurnishingReview, RoomFurnishingEntry } from '@metroforge/engines';
import { Badge, Select, InspectorSection } from './ui/index.js';

export function furnishingChoices(review?: RoomFurnishingReview) {
  return review?.status === 'ready'
    ? (review.entries ?? []).map((entry, index) => ({
        key: `${entry.status}:${index}:${entry.id}`,
        entry,
      }))
    : [];
}
export function furnishingReason(reason?: string) {
  const messages: Record<string, { check: string; message: string }> = {
    'unsupported-full-footprint': {
      check: 'Support anchor',
      message:
        'The full footprint has no continuous floor support. This decoration cannot bridge a real floor gap.',
    },
    'door-arrival-or-return': {
      check: 'Arrival readability',
      message:
        'The artwork overlaps a reserved door arrival or return area. It has not been moved elsewhere.',
    },
    'stair-flight-clearance': {
      check: 'Visual clearance',
      message:
        'Foreground artwork overlaps the stair travel silhouette. Decorative furniture does not change stair collision.',
    },
    'solid-or-overhead-clearance': {
      check: 'Visual clearance',
      message:
        'Foreground artwork overlaps solid geometry or its headroom silhouette. Physical collision remains unchanged.',
    },
    'actor-or-arrival-readability': {
      check: 'Visual clearance',
      message:
        'The artwork overlaps an actor or arrival silhouette. Inspect visibility at the native camera scale.',
    },
    'furnishing-overlap': {
      check: 'Visual clearance',
      message: 'The artwork overlaps another exported furnishing.',
    },
    'outside-room': {
      check: 'Authored bounds',
      message: 'The authored footprint extends outside this room.',
    },
    'invalid-request': {
      check: 'Authored request',
      message: 'The furnishing request is invalid or has a duplicate identity.',
    },
  };
  return (
    messages[reason ?? ''] ?? {
      check: 'Placement',
      message: 'The export omitted this furnishing. A detailed reason is unavailable.',
    }
  );
}
export function RoomFurnishingInspector({
  review,
  selectedKey,
  onSelect,
}: {
  review: RoomFurnishingReview;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const controlId = useId(),
    choices = furnishingChoices(review);
  const key = choices.some((c) => c.key === selectedKey) ? selectedKey : (choices[0]?.key ?? '');
  const entry = choices.find((c) => c.key === key)?.entry,
    omitted = choices.filter((c) => c.entry.status === 'omitted').length;
  return (
    <InspectorSection title="Chamber furnishings">
      {review.status === 'unavailable' ? (
        <p className="hint" role="status">
          {review.error ?? 'Furnishing information is unavailable.'}
        </p>
      ) : (
        <>
          <p className="hint">
            {choices.length - omitted} exported · {omitted} omitted
          </p>
          <p className="hint">
            Placement facts come from the saved export; geometry drafts are not revalidated here.
            Native-camera visual review is pending.
          </p>
          {!choices.length ? (
            <p className="hint">No furnishing requests are recorded in this export.</p>
          ) : (
            <>
              <label htmlFor={controlId}>Inspect furnishing</label>
              <Select id={controlId} value={key} onChange={(event) => onSelect(event.target.value)}>
                {(['placed', 'omitted'] as const).map((status) => (
                  <optgroup key={status} label={status === 'placed' ? 'Exported' : 'Omitted'}>
                    {choices
                      .filter((c) => c.entry.status === status)
                      .map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.entry.role?.replaceAll('_', ' ') ?? c.entry.id} · {c.entry.id}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
              {entry && (
                <>
                  <p>
                    <Badge tone={entry.status === 'omitted' ? 'warning' : 'default'}>
                      {entry.status === 'omitted'
                        ? 'Omitted at authored position'
                        : 'Exported placement'}
                    </Badge>
                  </p>
                  <dl className="settings-dl">
                    <dt>Identity</dt>
                    <dd>{entry.id}</dd>
                    {entry.anchor && (
                      <>
                        <dt>Anchor</dt>
                        <dd>{entry.anchor}</dd>
                      </>
                    )}
                    {entry.layer && (
                      <>
                        <dt>Layer</dt>
                        <dd>{entry.layer === 'rear' ? 'Rear scenery' : 'Foreground decoration'}</dd>
                      </>
                    )}
                    {entry.collision && (
                      <>
                        <dt>Collision</dt>
                        <dd>None · decorative</dd>
                      </>
                    )}
                    {entry.footprint && (
                      <>
                        <dt>Ground position</dt>
                        <dd>
                          {Math.round(entry.footprint.x * 10) / 10},{' '}
                          {Math.round(entry.footprint.floorY * 10) / 10} px
                        </dd>
                        <dt>Footprint</dt>
                        <dd>
                          {Math.round(entry.footprint.width * 10) / 10} ×{' '}
                          {Math.round(entry.footprint.height * 10) / 10} px
                        </dd>
                      </>
                    )}
                  </dl>
                  {entry.status === 'omitted' && (
                    <p role="status">
                      <strong>{furnishingReason(entry.reason).check}: </strong>
                      {furnishingReason(entry.reason).message}
                    </p>
                  )}
                  {!entry.footprint && (
                    <p className="hint">
                      This older export has no authored footprint to highlight.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          <p className="hint">
            Dashed outlines are inspection guides, not platforms. This view does not move props,
            alter geometry or replace atlas files.
          </p>
        </>
      )}
    </InspectorSection>
  );
}
export function RoomFurnishingOutline({ entry }: { entry?: RoomFurnishingEntry }) {
  const box = entry?.footprint;
  if (!entry || !box) return null;
  const omitted = entry.status === 'omitted';
  return (
    <g
      aria-label={`${omitted ? 'Omitted' : 'Exported'} furnishing footprint ${entry.id}`}
      pointerEvents="none"
    >
      <title>
        {entry.id} ·{' '}
        {omitted ? 'omitted, not a collision surface' : 'exported decoration, no collision'}
      </title>
      <rect
        x={box.x - box.width / 2}
        y={box.floorY - box.height}
        width={box.width}
        height={box.height}
        fill="none"
        stroke={omitted ? 'var(--danger)' : 'var(--forge-accent)'}
        strokeWidth={2}
        strokeDasharray="8 5"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
