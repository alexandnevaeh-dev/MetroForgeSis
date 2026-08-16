import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import type { DungeonGraphPreview, WorldGraphPreview } from './metroforge-api.js';
import { WorldMapPreview } from './WorldMapPreview.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { CommandBar } from './CommandBar.js';
import { useStudio } from './StudioContext.js';
import {
  Button,
  EditorToolbar,
  EditorViewport,
  EditorWorkbench,
  EmptyState,
  EmptyViewport,
  InspectorSection,
  Select,
} from './ui/index.js';

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
    <section className="workspace-screen dungeon-editor">
      <ScreenHeader
        compact
        eyebrow="Top-down / dungeon"
        title="Dungeon Editor"
        description="getDungeonGraph when present; else dungeon-filtered world_graph."
        actions={<ProjectSelect />}
      />
      <NoProjectHint />

      {isSideViewProject && (
        <EmptyState
          title="Dungeon Editor is for top-down projects"
          description="This project is side-view Metroidvania. Dungeon graphs (keys, locked doors, overworld POIs) belong to TOP_DOWN_ACTION_ADVENTURE generations. Use World / Room editors for side-view graphs."
          actions={
            <>
              <Button variant="primary" onClick={() => navigate('World')}>
                Open World Editor
              </Button>
              <Button onClick={() => navigate('Rooms')}>Open Room Editor</Button>
              <Button onClick={() => navigate('Create')}>New top-down game</Button>
            </>
          }
        />
      )}

      {hasActiveProject && isTopDownProject && (
        <>
          <CommandBar
            compact
            projectPath={selectedPath}
            selectedRoomId={selectedId}
            placeholder="Try: connect rooms, add a locked door, make this dungeon harder…"
            onSuccess={() => void loadGraph(selectedPath, dungeonFilter)}
          />

          {error && <p className="result error">{error}</p>}
          {authoredDungeon?.dungeonId && (
            <p className="hint type-caption">
              Authored dungeon {authoredDungeon.dungeonId}
              {authoredDungeon.dungeonItem ? ` · item ${authoredDungeon.dungeonItem}` : ''}
              {authoredDungeon.bossId ? ` · boss ${authoredDungeon.bossId}` : ''}
              {authoredDungeon.miniBossId ? ` · mini-boss ${authoredDungeon.miniBossId}` : ''}
            </p>
          )}

          {!dungeonGraph?.nodes?.length ? (
            <EmptyState
              title="No dungeon graph yet"
              description="No getDungeonGraph / dungeon-filtered world_graph nodes for this top-down project."
              actions={
                <Button onClick={() => selectedPath && void loadGraph(selectedPath, dungeonFilter)}>
                  Reload dungeon graph
                </Button>
              }
            />
          ) : (
            <EditorWorkbench variant="dungeon" className="dungeon-workspace-large">
              <aside className="panel editor-palette">
                <InspectorSection title="Rooms">
                  {dungeonIds.length > 0 && (
                    <label>
                      Dungeon
                      <Select value={dungeonFilter} onChange={(e) => setDungeonFilter(e.target.value)}>
                        <option value="all">All dungeon rooms</option>
                        {dungeonIds.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </Select>
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
                            className={selectedId === node.id ? 'room-item active room-item-compact' : 'room-item room-item-compact'}
                            onClick={() => setSelectedId(node.id)}
                          >
                            <strong>{node.label ?? node.id}</strong>
                            <span>{nodeArchetype(node)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </InspectorSection>
              </aside>

              <EditorViewport
                className="dungeon-editor-canvas"
                toolbar={
                  <EditorToolbar>
                    <span>Room graph</span>
                    <span className="hint">
                      {dungeonGraph?.nodes?.length ?? 0} rooms · {keys.length} lock types ·{' '}
                      {criticalPath.length} critical
                      {authoredDungeon?.criticalPath?.length ? ' (authored)' : ''}
                    </span>
                    <span className="status-grow" />
                    <span className="hint type-caption">cyan = critical · amber = locked · boss fill</span>
                  </EditorToolbar>
                }
              >
                <WorldMapPreview
                  worldGraph={dungeonGraph}
                  view="graph"
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onActivate={openRoom}
                  fitView
                  criticalPathIds={criticalPath.map((n) => n.id)}
                  emptyTitle="Empty dungeon graph"
                  emptyDescription="Filtered dungeon nodes are empty for this selection."
                />
              </EditorViewport>

              <aside className="panel editor-inspector">
                <InspectorSection title="Selection">
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
                    <EmptyViewport
                      className="inspector-empty"
                      title="No room selected"
                      description="Pick a room from the list or graph."
                    />
                  )}
                  {selected && (
                    <div className="row" style={{ marginTop: '0.55rem' }}>
                      <Button variant="primary" size="sm" onClick={() => openRoom(selected.id)}>
                        Open in Room Editor
                      </Button>
                    </div>
                  )}
                </InspectorSection>

                <InspectorSection title="Locks & keys">
                  <ul className="stat-list">
                    {keys.length === 0 && <li>No edge requirements in this graph</li>}
                    {keys.map((key) => (
                      <li key={key}>{key}</li>
                    ))}
                  </ul>
                </InspectorSection>

                <InspectorSection title="Critical path">
                  <ol className="stat-list">
                    {criticalPath.length === 0 && <li className="hint">No critical path in authored data</li>}
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
                </InspectorSection>
              </aside>
            </EditorWorkbench>
          )}
        </>
      )}
    </section>
  );
}
