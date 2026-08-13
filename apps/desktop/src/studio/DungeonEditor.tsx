import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader';
import type { StudioProject, WorldGraphPreview } from './metroforge-api';
import { WorldMapPreview } from './WorldMapPreview';

const DUNGEON_ARCHETYPES = new Set([
  'dungeon',
  'dungeon_room',
  'puzzle',
  'key',
  'locked',
  'treasure',
  'mini_boss',
  'miniboss',
  'boss',
  'item',
  'dungeon_item',
]);

function nodeArchetype(node: { metadata?: Record<string, unknown> }): string {
  return String(node.metadata?.archetype ?? node.metadata?.kind ?? 'room');
}

function isDungeonNode(node: { metadata?: Record<string, unknown> }): boolean {
  const archetype = nodeArchetype(node).toLowerCase();
  if (DUNGEON_ARCHETYPES.has(archetype)) return true;
  if (node.metadata?.dungeonId || node.metadata?.region === 'dungeon') return true;
  return false;
}

export function DungeonEditor() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [worldGraph, setWorldGraph] = useState<WorldGraphPreview | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.metroforge?.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedPath((p) => p || list[0]!.path);
    });
  }, []);

  useEffect(() => {
    if (!selectedPath || !window.metroforge?.getWorldGraph) return;
    window.metroforge
      .getWorldGraph(selectedPath)
      .then((graph) => {
        setWorldGraph(graph);
        setSelectedId(graph?.nodes?.[0]?.id ?? '');
        setError(null);
      })
      .catch((err) => setError(String(err)));
  }, [selectedPath]);

  const dungeonGraph = useMemo(() => {
    if (!worldGraph?.nodes?.length) return null;
    const dungeonNodes = worldGraph.nodes.filter(isDungeonNode);
    const useNodes = dungeonNodes.length > 0 ? dungeonNodes : worldGraph.nodes;
    const ids = new Set(useNodes.map((n) => n.id));
    const edges = (worldGraph.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to));
    return { nodes: useNodes, edges };
  }, [worldGraph]);

  const selected = dungeonGraph?.nodes.find((n) => n.id === selectedId);
  const keys = useMemo(() => {
    const reqs = new Set<string>();
    for (const edge of dungeonGraph?.edges ?? []) {
      for (const req of edge.requirements ?? []) reqs.add(req);
    }
    return [...reqs];
  }, [dungeonGraph]);

  const criticalPath = useMemo(() => {
    return (dungeonGraph?.nodes ?? []).filter((n) => {
      const optional = n.metadata?.optional === true || nodeArchetype(n) === 'treasure';
      return !optional;
    });
  }, [dungeonGraph]);

  return (
    <section className="dungeon-editor">
      <ScreenHeader
        eyebrow="Top-down / dungeon"
        title="Dungeon Editor"
        description="Visualizes dungeon-like rooms, locks, and the critical path from canonical world_graph.json. Spatial dungeon layouts require a dedicated backend contract."
        actions={
          <label>
            Project
            <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)}>
              {projects.map((p) => (
                <option key={p.slug} value={p.path}>
                  {p.title ?? p.slug}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {error && <p className="result error">{error}</p>}

      {!dungeonGraph?.nodes?.length ? (
        <p className="hint">No world graph yet. Generate a project, then return here.</p>
      ) : (
        <div className="editor-workspace dungeon-workspace">
          <aside className="panel editor-palette">
            <h3>Rooms</h3>
            <ul className="room-list">
              {dungeonGraph.nodes.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    className={selectedId === node.id ? 'room-item active' : 'room-item'}
                    onClick={() => setSelectedId(node.id)}
                  >
                    <strong>{node.label ?? node.id}</strong>
                    <span>{nodeArchetype(node)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="panel editor-canvas">
            <div className="editor-toolbar">
              <span>Room graph</span>
              <span className="hint">{dungeonGraph.nodes.length} rooms · {keys.length} lock types</span>
            </div>
            <WorldMapPreview worldGraph={dungeonGraph} view="graph" selectedId={selectedId} />
          </div>

          <aside className="panel editor-inspector">
            <h3>Inspector</h3>
            {selected ? (
              <dl className="settings-dl">
                <dt>Room</dt>
                <dd>{selected.label ?? selected.id}</dd>
                <dt>Archetype</dt>
                <dd>{nodeArchetype(selected)}</dd>
                <dt>Dungeon id</dt>
                <dd>{String(selected.metadata?.dungeonId ?? '—')}</dd>
                <dt>Keys on outbound edges</dt>
                <dd>
                  {(dungeonGraph.edges ?? [])
                    .filter((e) => e.from === selected.id && (e.requirements?.length ?? 0) > 0)
                    .map((e) => `${e.to}: ${(e.requirements ?? []).join(', ')}`)
                    .join(' · ') || 'none'}
                </dd>
              </dl>
            ) : (
              <p className="hint">Select a room.</p>
            )}

            <h3>Locks & items</h3>
            <ul className="stat-list">
              {keys.length === 0 && <li>No edge requirements in this graph</li>}
              {keys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>

            <h3>Critical path</h3>
            <ol className="stat-list">
              {criticalPath.map((node) => (
                <li key={node.id}>{node.label ?? node.id}</li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </section>
  );
}
