import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import type { DungeonGraphPreview, WorldGraphPreview } from './metroforge-api.js';
import { WorldMapPreview } from './WorldMapPreview.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { CommandBar } from './CommandBar.js';
import { useStudio } from './StudioContext.js';

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

function dungeonIdOf(node: { metadata?: Record<string, unknown> }): string {
  const id = node.metadata?.dungeonId;
  return typeof id === 'string' && id.length > 0 ? id : '';
}

function dungeonToGraph(dungeon: DungeonGraphPreview | null): WorldGraphPreview | null {
  if (!dungeon?.rooms?.length) return null;
  return {
    nodes: dungeon.rooms.map((room) => ({
      id: room.id,
      label: room.id,
      metadata: { archetype: room.kind, kind: room.kind, dungeonId: dungeon.dungeonId },
    })),
    edges: (dungeon.doors ?? []).map((door) => ({
      from: door.from,
      to: door.to,
      requirements: door.keyId ? [door.keyId] : undefined,
    })),
  };
}

export function DungeonEditor() {
  const { selectedPath, hasActiveProject, openRoom, selectedProject, navigate } = useStudio();
  const [worldGraph, setWorldGraph] = useState<WorldGraphPreview | null>(null);
  const [authoredDungeon, setAuthoredDungeon] = useState<DungeonGraphPreview | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [dungeonFilter, setDungeonFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);

  const projectArchetype =
    selectedProject?.archetype === 'TOP_DOWN_ACTION_ADVENTURE'
      ? 'TOP_DOWN_ACTION_ADVENTURE'
      : selectedProject?.archetype === 'SIDE_VIEW_METROIDVANIA'
        ? 'SIDE_VIEW_METROIDVANIA'
        : selectedProject
          ? 'SIDE_VIEW_METROIDVANIA'
          : null;
  const isTopDownProject = projectArchetype === 'TOP_DOWN_ACTION_ADVENTURE';
  const isSideViewProject = hasActiveProject && projectArchetype === 'SIDE_VIEW_METROIDVANIA';

  const loadGraph = async (path: string, preferredDungeonId?: string) => {
    if (!window.metroforge?.getWorldGraph) return;
    try {
      const graph = await window.metroforge.getWorldGraph(path);
      setWorldGraph(graph);

      let authored: DungeonGraphPreview | null = null;
      if (window.metroforge.getDungeonGraph) {
        const dungeonId = preferredDungeonId && preferredDungeonId !== 'all' ? preferredDungeonId : undefined;
        authored = await window.metroforge.getDungeonGraph(path, dungeonId);
        if (authored?.error) {
          setAuthoredDungeon(null);
        } else {
          setAuthoredDungeon(authored);
        }
      } else {
        setAuthoredDungeon(null);
      }

      const authoredGraph = dungeonToGraph(authored?.error ? null : authored);
      const firstId = authoredGraph?.nodes?.[0]?.id ?? graph?.nodes?.[0]?.id ?? '';
      setSelectedId((prev) =>
        prev && (authoredGraph?.nodes?.some((n) => n.id === prev) || graph?.nodes?.some((n) => n.id === prev))
          ? prev
          : firstId,
      );
      setError(authored?.error && !graph?.nodes?.length ? authored.error : null);
    } catch (err) {
      setError(String(err));
    }
  };

  useEffect(() => {
    if (selectedPath) void loadGraph(selectedPath, dungeonFilter);
  }, [selectedPath, dungeonFilter]);

  const dungeonIds = useMemo(() => {
    const ids = new Set<string>();
    if (authoredDungeon?.dungeonId) ids.add(authoredDungeon.dungeonId);
    for (const node of worldGraph?.nodes ?? []) {
      const id = dungeonIdOf(node);
      if (id) ids.add(id);
    }
    return [...ids];
  }, [worldGraph, authoredDungeon]);

  const authoredGraph = useMemo(() => dungeonToGraph(authoredDungeon), [authoredDungeon]);

  const dungeonGraph = useMemo(() => {
    if (authoredGraph?.nodes?.length) return authoredGraph;
    if (!worldGraph?.nodes?.length) return null;
    const dungeonNodes = worldGraph.nodes.filter(isDungeonNode);
    let useNodes = dungeonNodes.length > 0 ? dungeonNodes : worldGraph.nodes;
    if (dungeonFilter !== 'all') {
      useNodes = useNodes.filter((node) => dungeonIdOf(node) === dungeonFilter);
    }
    const ids = new Set(useNodes.map((n) => n.id));
    const edges = (worldGraph.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to));
    return { nodes: useNodes, edges };
  }, [worldGraph, dungeonFilter, authoredGraph]);

  const selected = dungeonGraph?.nodes?.find((n) => n.id === selectedId);
  const keys = useMemo(() => {
    if (authoredDungeon?.keys?.length) return authoredDungeon.keys;
    const reqs = new Set<string>();
    for (const edge of dungeonGraph?.edges ?? []) {
      for (const req of edge.requirements ?? []) reqs.add(req);
    }
    return [...reqs];
  }, [dungeonGraph, authoredDungeon]);

  const criticalPath = useMemo(() => {
    if (authoredDungeon?.criticalPath?.length) {
      return authoredDungeon.criticalPath.map((id) => ({
        id,
        label: id,
        metadata: { archetype: authoredDungeon.rooms?.find((r) => r.id === id)?.kind ?? 'room' },
      }));
    }
    return (dungeonGraph?.nodes ?? []).filter((n) => {
      const optional = n.metadata?.optional === true || nodeArchetype(n) === 'treasure';
      return !optional;
    });
  }, [dungeonGraph, authoredDungeon]);

  return (
    <section className="dungeon-editor">
      <ScreenHeader
        eyebrow="Top-down / dungeon"
        title="Dungeon Editor"
        description="Prefers getDungeonGraph when present; otherwise filters dungeon-like rooms from world_graph.json."
        actions={<ProjectSelect />}
      />
      <NoProjectHint />

      {isSideViewProject && (
        <div className="empty-state panel-l1" style={{ marginBottom: '0.85rem' }}>
          <h3>Dungeon Editor is for top-down projects</h3>
          <p>
            This project is side-view Metroidvania. Dungeon graphs (keys, locked doors, overworld POIs) belong
            to <code>TOP_DOWN_ACTION_ADVENTURE</code> generations.
          </p>
          <p className="hint">
            Use World Editor / Room Editor for side-view room graphs. Generate or select a top-down project to
            edit dungeons here.
          </p>
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="primary" onClick={() => navigate('World')}>
              Open World Editor
            </button>
            <button type="button" onClick={() => navigate('Rooms')}>
              Open Room Editor
            </button>
            <button type="button" onClick={() => navigate('Create')}>
              New top-down game
            </button>
          </div>
        </div>
      )}

      {hasActiveProject && isTopDownProject && (
        <>
          <CommandBar
            projectPath={selectedPath}
            selectedRoomId={selectedId}
            placeholder="Try: connect rooms, add a locked door, make this dungeon harder…"
            onSuccess={() => void loadGraph(selectedPath, dungeonFilter)}
          />

          {error && <p className="result error">{error}</p>}
          {authoredDungeon?.dungeonId && (
            <p className="hint">
              Authored dungeon {authoredDungeon.dungeonId}
              {authoredDungeon.dungeonItem ? ` · item ${authoredDungeon.dungeonItem}` : ''}
              {authoredDungeon.bossId ? ` · boss ${authoredDungeon.bossId}` : ''}
              {authoredDungeon.miniBossId ? ` · mini-boss ${authoredDungeon.miniBossId}` : ''}
            </p>
          )}

          {!dungeonGraph?.nodes?.length ? (
            <div className="empty-state panel-l1">
              <p>No dungeon graph yet for this top-down project. Regenerate or wait until dungeon data is written.</p>
              <button type="button" onClick={() => selectedPath && void loadGraph(selectedPath, dungeonFilter)}>
                Reload dungeon graph
              </button>
            </div>
          ) : (
            <div className="editor-workspace dungeon-workspace">
              <aside className="panel editor-palette">
                <h3>Rooms</h3>
                {dungeonIds.length > 0 && (
                  <label>
                    Dungeon
                    <select value={dungeonFilter} onChange={(e) => setDungeonFilter(e.target.value)}>
                      <option value="all">All dungeon rooms</option>
                      {dungeonIds.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(dungeonGraph?.nodes?.length ?? 0) === 0 ? (
                  <p className="hint">No rooms in this dungeon filter.</p>
                ) : (
                  <ul className="room-list">
                    {(dungeonGraph?.nodes ?? []).map((node) => (
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
                )}
              </aside>

              <div className="panel editor-canvas">
                <div className="editor-toolbar">
                  <span>Room graph</span>
                  <span className="hint">
                    {dungeonGraph?.nodes?.length ?? 0} rooms · {keys.length} lock types
                  </span>
                </div>
                <WorldMapPreview
                  worldGraph={dungeonGraph}
                  view="graph"
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onActivate={openRoom}
                />
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
                    <dd>{authoredDungeon?.dungeonId || dungeonIdOf(selected) || '—'}</dd>
                    <dt>Keys on outbound edges</dt>
                    <dd>
                      {(dungeonGraph?.edges ?? [])
                        .filter((e) => e.from === selected.id && (e.requirements?.length ?? 0) > 0)
                        .map((e) => `${e.to}: ${(e.requirements ?? []).join(', ')}`)
                        .join(' · ') || 'none'}
                    </dd>
                  </dl>
                ) : (
                  <p className="hint">Select a room.</p>
                )}
                {selected && (
                  <div className="row" style={{ marginTop: '0.75rem' }}>
                    <button type="button" className="primary" onClick={() => openRoom(selected.id)}>
                      Open in Room Editor
                    </button>
                  </div>
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
                    <li key={node.id}>
                      <button
                        type="button"
                        className={selectedId === node.id ? 'room-item active' : 'room-item'}
                        onClick={() => setSelectedId(node.id)}
                      >
                        {'label' in node ? (node.label ?? node.id) : node.id}
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
          )}
        </>
      )}
    </section>
  );
}
