import { useMemo, useRef, useEffect, useState } from 'react';
import { EmptyViewport } from './ui/index.js';

type WorldGraphPreview = {
  nodes?: Array<{ id: string; label?: string; metadata?: Record<string, unknown> }>;
  edges?: Array<{ from: string; to: string; requirements?: string[] }>;
};

type ViewMode = 'graph' | 'progression' | 'spatial';

function nodePos(
  node: { id: string; metadata?: Record<string, unknown> },
  index: number,
  cols: number,
  spacing: number,
  view: ViewMode,
  progressionIndex: Map<string, number>,
): { x: number; y: number } {
  const meta = node.metadata ?? {};
  if (view === 'spatial') {
    const x = Number(meta.x ?? meta.col ?? meta.mapX);
    const y = Number(meta.y ?? meta.row ?? meta.mapY);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x: 40 + x * spacing, y: 40 + y * spacing };
    }
  }
  if (view === 'progression') {
    const depth = progressionIndex.get(node.id) ?? index;
    const siblings = [...progressionIndex.entries()].filter(([, d]) => d === depth).map(([id]) => id);
    const col = Math.max(0, siblings.indexOf(node.id));
    return { x: 40 + col * spacing, y: 40 + depth * spacing };
  }
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: 30 + col * spacing, y: 30 + row * spacing };
}

function progressionDepths(
  nodes: Array<{ id: string }>,
  edges: Array<{ from: string; to: string }>,
): Map<string, number> {
  const depths = new Map<string, number>();
  const start = nodes[0]?.id;
  if (!start) return depths;
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    adj.set(edge.from, [...(adj.get(edge.from) ?? []), edge.to]);
  }
  const queue = [start];
  depths.set(start, 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const next of adj.get(id) ?? []) {
      if (!depths.has(next)) {
        depths.set(next, (depths.get(id) ?? 0) + 1);
        queue.push(next);
      }
    }
  }
  nodes.forEach((node, i) => {
    if (!depths.has(node.id)) depths.set(node.id, i);
  });
  return depths;
}

export function WorldMapPreview({
  worldGraph,
  view = 'graph',
  selectedId,
  onSelect,
  onActivate,
  emptyTitle,
  emptyDescription,
  fitView = true,
  criticalPathIds,
}: {
  worldGraph?: WorldGraphPreview | null;
  view?: ViewMode;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  fitView?: boolean;
  /** Real critical-path room ids (e.g. getDungeonGraph.criticalPath) — cyan stroke. */
  criticalPathIds?: string[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 640, h: 420 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewport({ w: Math.max(240, el.clientWidth), h: Math.max(200, el.clientHeight) });
    });
    ro.observe(el);
    setViewport({ w: Math.max(240, el.clientWidth), h: Math.max(200, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  const nodes = worldGraph?.nodes ?? [];
  const edges = worldGraph?.edges ?? [];
  const criticalSet = useMemo(() => new Set(criticalPathIds ?? []), [criticalPathIds]);
  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(nodes.length, 1))));
  const spacing = nodes.length > 80 ? 56 : view === 'spatial' ? 72 : 80;
  const progression = useMemo(
    () => (view === 'progression' ? progressionDepths(nodes, edges) : new Map<string, number>()),
    [view, worldGraph],
  );
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, i) => {
      map.set(node.id, nodePos(node, i, cols, spacing, view, progression));
    });
    return map;
  }, [worldGraph, cols, spacing, view, progression]);

  const spatialCoords = useMemo(() => {
    if (view !== 'spatial') return { withCoords: nodes.length, without: 0 };
    let withCoords = 0;
    for (const node of nodes) {
      const meta = node.metadata ?? {};
      const x = Number(meta.x ?? meta.col ?? meta.mapX);
      const y = Number(meta.y ?? meta.row ?? meta.mapY);
      if (Number.isFinite(x) && Number.isFinite(y)) withCoords += 1;
    }
    return { withCoords, without: nodes.length - withCoords };
  }, [view, nodes]);

  if (!nodes.length) {
    return (
      <EmptyViewport
        className="map-empty-viewport"
        title={emptyTitle ?? (view === 'spatial' ? 'No spatial layout yet' : 'No world graph data yet')}
        description={
          emptyDescription ??
          (view === 'spatial'
            ? 'Spatial view needs getOverworldMap nodes or world_graph metadata x/y. Topology edits still use Graph / Progression.'
            : 'getWorldGraph returned no nodes for this project.')
        }
      />
    );
  }

  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  const pad = 48;
  const contentW = Math.max(cols * spacing + 40, Math.max(...xs) + pad, 120);
  const contentH = Math.max(Math.ceil(nodes.length / cols) * spacing + 40, Math.max(...ys) + pad, 120);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  const boundsW = Math.max(120, maxX - minX);
  const boundsH = Math.max(120, maxY - minY);

  let viewBox = `0 0 ${contentW} ${contentH}`;
  let svgW = contentW;
  let svgH = contentH;
  if (fitView) {
    const scale = Math.min(viewport.w / boundsW, viewport.h / boundsH, 1.35);
    const vbW = viewport.w / Math.max(scale, 0.01);
    const vbH = viewport.h / Math.max(scale, 0.01);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    viewBox = `${cx - vbW / 2} ${cy - vbH / 2} ${vbW} ${vbH}`;
    svgW = viewport.w;
    svgH = viewport.h;
  }

  const showLabels = nodes.length <= 64;
  const interactive = Boolean(onSelect || onActivate);
  const activeIndex = Math.max(
    0,
    nodes.findIndex((node) => node.id === selectedId),
  );

  const moveSelection = (delta: number) => {
    if (!onSelect || nodes.length === 0) return;
    const next = (activeIndex + delta + nodes.length) % nodes.length;
    onSelect(nodes[next]!.id);
  };

  return (
    <div
      ref={wrapRef}
      className="map-preview-wrap map-preview-fit"
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'listbox' : undefined}
      aria-label={interactive ? 'World map rooms' : undefined}
      aria-activedescendant={interactive && selectedId ? `map-node-${selectedId}` : undefined}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          moveSelection(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveSelection(-1);
        } else if (event.key === 'Enter' || event.key === ' ') {
          const id = selectedId || nodes[0]?.id;
          if (!id) return;
          event.preventDefault();
          if (event.key === 'Enter' && onActivate) onActivate(id);
          else onSelect?.(id);
        }
      }}
    >
      {view === 'spatial' && spatialCoords.without > 0 && (
        <p className="hint map-sparse-note" role="status">
          Sparse spatial layout: {spatialCoords.withCoords} node
          {spatialCoords.withCoords === 1 ? '' : 's'} with authored x/y · {spatialCoords.without} without
          coordinates (grid-fallback placement — not invented rooms).
        </p>
      )}
      <svg className="map-preview" width={svgW} height={svgH} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        {edges.map((edge, i) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const locked = (edge.requirements?.length ?? 0) > 0;
          const onCritical = criticalSet.has(edge.from) && criticalSet.has(edge.to);
          const stroke = locked
            ? 'var(--canvas-locked, #c4a35a)'
            : onCritical
              ? 'var(--canvas-critical, #38b2f6)'
              : '#6b6458';
          return (
            <line
              key={`${edge.from}-${edge.to}-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={stroke}
              strokeWidth={locked || onCritical ? 2.25 : 1.5}
              strokeDasharray={locked ? '4 3' : undefined}
              className={
                locked ? 'map-edge-locked' : onCritical ? 'map-edge-critical' : 'map-edge'
              }
            />
          );
        })}
        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const archetype = String(node.metadata?.archetype ?? node.metadata?.kind ?? 'room').toLowerCase();
          const selected = selectedId === node.id;
          const onCritical = criticalSet.has(node.id);
          const cls =
            archetype === 'boss' || archetype === 'mini_boss' || archetype === 'miniboss'
              ? 'map-node map-node-boss'
              : archetype === 'ability_shrine' || archetype === 'ability_gate'
                ? 'map-node map-node-ability_shrine'
                : archetype === 'treasure'
                  ? 'map-node map-node-treasure'
                  : onCritical
                    ? 'map-node map-node-critical'
                    : 'map-node';
          return (
            <g
              key={node.id}
              id={`map-node-${node.id}`}
              role={interactive ? 'option' : undefined}
              aria-selected={interactive ? selected : undefined}
              className={selected ? 'map-node-selected' : undefined}
              onClick={() => onSelect?.(node.id)}
              onDoubleClick={() => onActivate?.(node.id)}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
            >
              <circle cx={pos.x} cy={pos.y} r={selected ? 16 : 13} className={cls} />
              {showLabels && (
                <text className="map-label" x={pos.x} y={pos.y + 26} textAnchor="middle">
                  {(node.label ?? node.id).slice(0, 14)}
                </text>
              )}
              <title>
                {node.label ?? node.id} ({archetype}
                {onCritical ? ', critical' : ''}
                {lockedTitle(node, edges)})
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function lockedTitle(
  node: { id: string },
  edges: Array<{ from: string; to: string; requirements?: string[] }>,
): string {
  const reqs = edges
    .filter((e) => e.from === node.id && (e.requirements?.length ?? 0) > 0)
    .flatMap((e) => e.requirements ?? []);
  return reqs.length ? `, locks: ${reqs.join(', ')}` : '';
}
