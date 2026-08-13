import { useMemo } from 'react';

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
}: {
  worldGraph?: WorldGraphPreview | null;
  view?: ViewMode;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
}) {
  const nodes = worldGraph?.nodes ?? [];
  const edges = worldGraph?.edges ?? [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(nodes.length, 1))));
  const spacing = nodes.length > 80 ? 56 : 80;
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

  if (!nodes.length) {
    return <p className="hint">No world graph data yet.</p>;
  }

  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  const width = Math.max(cols * spacing + 40, Math.max(...xs) + 48);
  const height = Math.max(Math.ceil(nodes.length / cols) * spacing + 40, Math.max(...ys) + 48);
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
      className="map-preview-wrap"
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
      <svg className="map-preview" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {edges.map((edge, i) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const locked = (edge.requirements?.length ?? 0) > 0;
          return (
            <line
              key={`${edge.from}-${edge.to}-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={locked ? '#c4a35a' : '#6b6458'}
              strokeWidth={locked ? 2 : 1.5}
              strokeDasharray={locked ? '4 3' : undefined}
            />
          );
        })}
        {nodes.map((node) => {
          const pos = positions.get(node.id)!;
          const archetype = String(node.metadata?.archetype ?? 'room');
          const selected = selectedId === node.id;
          const cls =
            archetype === 'boss'
              ? 'map-node map-node-boss'
              : archetype === 'ability_shrine' || archetype === 'ability_gate'
                ? 'map-node map-node-ability_shrine'
                : archetype === 'treasure'
                  ? 'map-node map-node-treasure'
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
                {node.label ?? node.id} ({archetype})
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
