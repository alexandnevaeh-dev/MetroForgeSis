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
}: {
  worldGraph?: WorldGraphPreview | null;
  view?: ViewMode;
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  if (!worldGraph?.nodes?.length) {
    return <p className="hint">No world graph data yet.</p>;
  }

  const nodes = worldGraph.nodes;
  const edges = worldGraph.edges ?? [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const spacing = nodes.length > 80 ? 56 : 80;
  const progression = view === 'progression' ? progressionDepths(nodes, edges) : new Map<string, number>();
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, i) => {
    positions.set(node.id, nodePos(node, i, cols, spacing, view, progression));
  });

  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  const width = Math.max(cols * spacing + 40, Math.max(...xs) + 48);
  const height = Math.max(Math.ceil(nodes.length / cols) * spacing + 40, Math.max(...ys) + 48);
  const showLabels = nodes.length <= 64;

  return (
    <div className="map-preview-wrap">
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
              className={selected ? 'map-node-selected' : undefined}
              onClick={() => onSelect?.(node.id)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
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
