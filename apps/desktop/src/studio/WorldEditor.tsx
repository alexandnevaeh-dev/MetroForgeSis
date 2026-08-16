import { useEffect, useMemo, useState } from 'react';
import { WorldMapPreview } from './WorldMapPreview.js';
import { CommandBar } from './CommandBar.js';
import { EditStatusBadge } from './EditStatusBadge.js';
import { ScreenHeader } from './ScreenHeader.js';
import type { OverworldMapPreview, WorldGraphPreview } from './metroforge-api.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import {
  Button,
  EditorDock,
  EditorPropertyRow,
  EditorToolbar,
  EditorViewport,
  EditorWorkbench,
  Input,
  InspectorSection,
  Select,
  ViewModeTabs,
} from './ui/index.js';

function overworldToGraph(map: OverworldMapPreview | null): WorldGraphPreview | null {
  if (!map?.nodes?.length) return null;
  return {
    nodes: map.nodes.map((node) => ({
      id: node.id,
      label: node.id,
      metadata: {
        archetype: node.kind,
        kind: node.kind,
        x: node.x,
        y: node.y,
        dungeonId: node.dungeonId,
      },
    })),
    edges: map.edges ?? [],
  };
}

type DockTab = 'structure' | 'connections' | 'checkpoints';

export function WorldEditor() {
  const { selectedPath, hasActiveProject, openRoom, navigate } = useStudio();
  const [worldGraph, setWorldGraph] = useState<WorldGraphPreview | null>(null);
  const [overworld, setOverworld] = useState<OverworldMapPreview | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState<'progression' | 'graph' | 'spatial'>('progression');
  const [dockTab, setDockTab] = useState<DockTab>('structure');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [newRoomId, setNewRoomId] = useState('room_treasure_optional');
  const [connectFrom, setConnectFrom] = useState('');
  const [connectTo, setConnectTo] = useState('');
  const [disconnectFrom, setDisconnectFrom] = useState('');
  const [disconnectTo, setDisconnectTo] = useState('');
  const [checkpointLabel, setCheckpointLabel] = useState('');
  const [checkpoints, setCheckpoints] = useState<Array<{ id: string; label: string; timestamp: string }>>([]);

  const refreshCheckpoints = async () => {
    if (!selectedPath || !window.metroforge?.listProjectCheckpoints) return;
    setCheckpoints(await window.metroforge.listProjectCheckpoints(selectedPath));
  };

  const refreshHistory = async () => {
    if (!selectedPath || !window.metroforge?.getEditHistory) return;
    const h = await window.metroforge.getEditHistory(selectedPath);
    setCanUndo(h.canUndo);
  };

  const loadGraph = async (path: string) => {
    if (!window.metroforge?.getWorldGraph) return;
    const graph = await window.metroforge.getWorldGraph(path);
    setWorldGraph(graph);
    const start = graph?.nodes?.[0];
    if (start?.id) {
      setSelectedId((prev) => prev || start.id);
      setConnectFrom(start.id);
      setConnectTo(graph?.nodes?.[1]?.id ?? start.id);
      setDisconnectFrom(start.id);
      setDisconnectTo(graph?.nodes?.[1]?.id ?? start.id);
    }
    if (window.metroforge.getOverworldMap) {
      const map = await window.metroforge.getOverworldMap(path);
      setOverworld(map?.error ? { ...map, nodes: [] } : map);
    } else {
      setOverworld(null);
    }
  };

  useEffect(() => {
    if (selectedPath) {
      void loadGraph(selectedPath);
      void refreshHistory();
      void refreshCheckpoints();
    }
  }, [selectedPath]);

  const spatialGraph = useMemo(() => overworldToGraph(overworld) ?? worldGraph, [overworld, worldGraph]);
  const previewGraph = view === 'spatial' ? spatialGraph : worldGraph;
  const hasDedicatedOverworld = Boolean(overworld?.nodes?.length);
  const selectedNode = previewGraph?.nodes?.find((n) => n.id === selectedId);
  const outbound = (previewGraph?.edges ?? []).filter((e) => e.from === selectedId);
  const inbound = (previewGraph?.edges ?? []).filter((e) => e.to === selectedId);

  const handleAddRoom = async () => {
    if (!selectedPath || !connectFrom || !window.metroforge?.updateWorldGraph) return;
    setError(null);
    setMessage(null);
    const result = await window.metroforge.updateWorldGraph(selectedPath, {
      type: 'add_room',
      roomId: newRoomId,
      label: 'Optional Treasure',
      archetype: 'treasure',
      connectFromRoomId: connectFrom,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage(result.message ?? 'Room added');
    setWorldGraph(result.worldGraph ?? null);
    await refreshHistory();
  };

  const runWorldCommand = async (command: unknown, okMessage: string) => {
    if (!selectedPath || !window.metroforge?.updateWorldGraph) return;
    setError(null);
    setMessage(null);
    const result = await window.metroforge.updateWorldGraph(selectedPath, command);
    if (result.error) setError(result.error);
    else {
      setMessage(result.message ?? okMessage);
      setWorldGraph(result.worldGraph ?? null);
      await refreshHistory();
    }
  };

  const handleConnect = () =>
    runWorldCommand(
      { type: 'connect_rooms', from: connectFrom, to: connectTo, bidirectional: true },
      'Rooms connected',
    );

  const handleDisconnect = () =>
    runWorldCommand(
      { type: 'disconnect_rooms', from: disconnectFrom, to: disconnectTo },
      'Rooms disconnected',
    );

  const handleCheckpoint = async () => {
    if (!selectedPath || !window.metroforge?.createProjectCheckpoint) return;
    await window.metroforge.createProjectCheckpoint(selectedPath, checkpointLabel || 'Manual snapshot');
    setCheckpointLabel('');
    await refreshCheckpoints();
    setMessage('Checkpoint saved');
  };

  const handleRestoreCheckpoint = async (id: string) => {
    if (!selectedPath || !window.metroforge?.restoreProjectCheckpoint) return;
    const result = await window.metroforge.restoreProjectCheckpoint(selectedPath, id);
    if (!result.success) setError(result.error ?? 'Restore failed');
    else {
      setMessage('Checkpoint restored');
      await loadGraph(selectedPath);
    }
  };

  const handleUndo = async () => {
    if (!selectedPath || !window.metroforge?.undoWorldEdit) return;
    setError(null);
    const result = await window.metroforge.undoWorldEdit(selectedPath);
    if (result.error || !result.success) setError(result.error ?? 'Undo failed');
    else {
      setMessage('Undid last world edit');
      setWorldGraph(result.worldGraph ?? null);
    }
    await refreshHistory();
  };

  const nodeOptions = (worldGraph?.nodes ?? []).map((n) => (
    <option key={n.id} value={n.id}>
      {n.label ?? n.id}
    </option>
  ));

  return (
    <section className="workspace-screen world-editor-screen">
      <ScreenHeader
        compact
        eyebrow="World"
        title="World Editor"
        description="Canonical WorldGraph · topology via validated updateWorldGraph."
        actions={
          <>
            <ProjectSelect />
            <EditStatusBadge projectPath={selectedPath} />
          </>
        }
      />
      <NoProjectHint />

      {hasActiveProject && (
        <>
          <CommandBar
            compact
            projectPath={selectedPath}
            onSuccess={() => loadGraph(selectedPath)}
          />

          <ViewModeTabs
            label="World view mode"
            items={[
              { id: 'progression', label: 'Progression' },
              { id: 'graph', label: 'Graph' },
              { id: 'spatial', label: 'Spatial' },
            ]}
            value={view}
            onChange={(id) => setView(id as 'progression' | 'graph' | 'spatial')}
          />
          {view === 'spatial' && (
            <p className="contract-note type-caption">
              {hasDedicatedOverworld
                ? `Spatial uses getOverworldMap (${overworld?.regions?.[0]?.name ?? overworld?.archetype ?? 'overworld'}).`
                : overworld?.error
                  ? `${overworld.error} Falling back to world_graph node metadata x/y when present.`
                  : 'Spatial layout uses node metadata x/y when present. Dedicated overworld maps appear when getOverworldMap returns data.'}
            </p>
          )}

          <EditorWorkbench variant="world" className="world-editor-workbench">
            <EditorViewport
              className="world-editor-canvas"
              toolbar={
                <EditorToolbar>
                  <span className="hint">
                    {(previewGraph?.nodes?.length ?? 0)} nodes · {(previewGraph?.edges?.length ?? 0)} edges ·{' '}
                    {view}
                  </span>
                  <span className="status-grow" />
                  <span className="hint mono">{selectedId || 'none selected'}</span>
                </EditorToolbar>
              }
            >
              <WorldMapPreview
                worldGraph={previewGraph}
                view={view}
                selectedId={selectedId}
                fitView
                emptyTitle={
                  view === 'spatial'
                    ? 'Sparse spatial layout'
                    : view === 'progression'
                      ? 'No progression graph yet'
                      : 'No world graph yet'
                }
                emptyDescription={
                  view === 'spatial'
                    ? 'Intentional empty: overworld/spatial coordinates are not authored for this project yet. Switch to Graph or Progression, or regenerate a project that writes getOverworldMap.'
                    : undefined
                }
                onSelect={(id) => {
                  setSelectedId(id);
                  setConnectFrom(id);
                  setDisconnectFrom(id);
                }}
                onActivate={openRoom}
              />
            </EditorViewport>

            <aside className="panel editor-inspector">
              <InspectorSection title="General">
                {selectedNode ? (
                  <>
                    <EditorPropertyRow label="Room">
                      {selectedNode.label ?? selectedId}
                    </EditorPropertyRow>
                    <EditorPropertyRow label="Id">
                      <code>{selectedId}</code>
                    </EditorPropertyRow>
                    <EditorPropertyRow label="Archetype">
                      {String(selectedNode.metadata?.archetype ?? 'room')}
                    </EditorPropertyRow>
                    {(selectedNode.metadata?.x != null || selectedNode.metadata?.y != null) && (
                      <EditorPropertyRow label="Coords">
                        <span className="mono">
                          {String(selectedNode.metadata?.x ?? '—')}, {String(selectedNode.metadata?.y ?? '—')}
                        </span>
                      </EditorPropertyRow>
                    )}
                  </>
                ) : (
                  <p className="hint">Select a room on the map.</p>
                )}
              </InspectorSection>

              <InspectorSection title="Connections">
                {selectedNode ? (
                  <dl className="settings-dl">
                    <dt>Outbound</dt>
                    <dd>
                      {outbound
                        .map((e) => `${e.to}${e.requirements?.length ? ` (${e.requirements.join(', ')})` : ''}`)
                        .join(' · ') || 'none'}
                    </dd>
                    <dt>Inbound</dt>
                    <dd>{inbound.map((e) => e.from).join(' · ') || 'none'}</dd>
                  </dl>
                ) : (
                  <p className="hint">No selection.</p>
                )}
              </InspectorSection>

              <InspectorSection title="Progression">
                <p className="hint">
                  View mode <strong>{view}</strong>
                  {view === 'progression'
                    ? ' — depth layout from graph BFS starting at the first world_graph node.'
                    : view === 'spatial'
                      ? ' — positions from getOverworldMap / metadata x,y only.'
                      : ' — topological grid layout.'}
                </p>
                <EditorPropertyRow label="Edges from selection">
                  {outbound.length}
                </EditorPropertyRow>
              </InspectorSection>

              <InspectorSection title="Actions">
                <div className="row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                  <Button variant="primary" size="sm" disabled={!selectedId} onClick={() => openRoom(selectedId)}>
                    Open in Room Editor
                  </Button>
                  <Button size="sm" onClick={() => navigate('Dungeon')}>
                    Dungeon
                  </Button>
                  <Button size="sm" disabled={!canUndo} onClick={() => void handleUndo()}>
                    Undo
                  </Button>
                </div>
              </InspectorSection>
            </aside>
          </EditorWorkbench>

          <EditorDock
            className="world-editor-dock"
            tabs={[
              { id: 'structure', label: 'Structure' },
              { id: 'connections', label: 'Connections' },
              { id: 'checkpoints', label: 'Checkpoints' },
            ]}
            activeTab={dockTab}
            onTabChange={(id) => setDockTab(id as DockTab)}
          >
            {dockTab === 'structure' && (
              <div className="world-dock-pane">
                <div className="row world-dock-row">
                  <Input
                    value={newRoomId}
                    onChange={(e) => setNewRoomId(e.target.value)}
                    placeholder="room id"
                    aria-label="New room id"
                  />
                  <Select value={connectFrom} onChange={(e) => setConnectFrom(e.target.value)} aria-label="Connect from">
                    {nodeOptions}
                  </Select>
                  <Button variant="primary" size="sm" onClick={() => void handleAddRoom()}>
                    Add &amp; Validate
                  </Button>
                  <Button size="sm" disabled={!canUndo} onClick={() => void handleUndo()}>
                    Undo
                  </Button>
                </div>
              </div>
            )}
            {dockTab === 'connections' && (
              <div className="world-dock-pane">
                <div className="row world-dock-row">
                  <Select value={connectFrom} onChange={(e) => setConnectFrom(e.target.value)} aria-label="Connect from">
                    {(worldGraph?.nodes ?? []).map((n) => (
                      <option key={`cf-${n.id}`} value={n.id}>
                        {n.label ?? n.id}
                      </option>
                    ))}
                  </Select>
                  <span aria-hidden="true">→</span>
                  <Select value={connectTo} onChange={(e) => setConnectTo(e.target.value)} aria-label="Connect to">
                    {(worldGraph?.nodes ?? []).map((n) => (
                      <option key={`ct-${n.id}`} value={n.id}>
                        {n.label ?? n.id}
                      </option>
                    ))}
                  </Select>
                  <Button variant="primary" size="sm" onClick={() => void handleConnect()}>
                    Connect
                  </Button>
                </div>
                <div className="row world-dock-row">
                  <Select
                    value={disconnectFrom}
                    onChange={(e) => setDisconnectFrom(e.target.value)}
                    aria-label="Disconnect from"
                  >
                    {(worldGraph?.nodes ?? []).map((n) => (
                      <option key={`df-${n.id}`} value={n.id}>
                        {n.label ?? n.id}
                      </option>
                    ))}
                  </Select>
                  <span aria-hidden="true">↮</span>
                  <Select
                    value={disconnectTo}
                    onChange={(e) => setDisconnectTo(e.target.value)}
                    aria-label="Disconnect to"
                  >
                    {(worldGraph?.nodes ?? []).map((n) => (
                      <option key={`dt-${n.id}`} value={n.id}>
                        {n.label ?? n.id}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" onClick={() => void handleDisconnect()}>
                    Disconnect
                  </Button>
                </div>
              </div>
            )}
            {dockTab === 'checkpoints' && (
              <div className="world-dock-pane">
                <div className="row world-dock-row">
                  <Input
                    value={checkpointLabel}
                    onChange={(e) => setCheckpointLabel(e.target.value)}
                    placeholder="Checkpoint label"
                    aria-label="Checkpoint label"
                  />
                  <Button size="sm" onClick={() => void handleCheckpoint()}>
                    Save Checkpoint
                  </Button>
                </div>
                <ul className="checkpoint-list">
                  {checkpoints.length === 0 && <li className="hint">No checkpoints yet.</li>}
                  {checkpoints.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="tab" onClick={() => void handleRestoreCheckpoint(c.id)}>
                        {c.label} · {new Date(c.timestamp).toLocaleString()}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </EditorDock>

          {message && <p className="result success">{message}</p>}
          {error && <p className="result error">{error}</p>}
        </>
      )}
    </section>
  );
}
