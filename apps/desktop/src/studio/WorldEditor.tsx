import { useEffect, useMemo, useState } from 'react';
import { WorldMapPreview } from './WorldMapPreview.js';
import { CommandBar } from './CommandBar.js';
import { EditStatusBadge } from './EditStatusBadge.js';
import { ScreenHeader } from './ScreenHeader.js';
import type { OverworldMapPreview, WorldGraphPreview } from './metroforge-api.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';

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

export function WorldEditor() {
  const { selectedPath, hasActiveProject, openRoom, navigate } = useStudio();
  const [worldGraph, setWorldGraph] = useState<WorldGraphPreview | null>(null);
  const [overworld, setOverworld] = useState<OverworldMapPreview | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState<'progression' | 'graph' | 'spatial'>('progression');
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

  return (
    <section>
      <ScreenHeader
        eyebrow="World"
        title="World Editor"
        description="Canonical WorldGraph from the project. Layout is visual; topology changes go through validated updateWorldGraph commands."
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
      <CommandBar projectPath={selectedPath} onSuccess={() => loadGraph(selectedPath)} />

      <div className="editor-toolbar">
        <button type="button" className={view === 'progression' ? 'tab active' : 'tab'} onClick={() => setView('progression')}>
          Progression
        </button>
        <button type="button" className={view === 'graph' ? 'tab active' : 'tab'} onClick={() => setView('graph')}>
          Graph
        </button>
        <button type="button" className={view === 'spatial' ? 'tab active' : 'tab'} onClick={() => setView('spatial')}>
          Spatial / overworld
        </button>
      </div>
      {view === 'spatial' && (
        <p className="contract-note">
          {hasDedicatedOverworld
            ? `Spatial view uses getOverworldMap (${overworld?.regions?.[0]?.name ?? overworld?.archetype ?? 'overworld'}).`
            : overworld?.error
              ? `${overworld.error} Falling back to world_graph node metadata x/y when present.`
              : 'Spatial layout uses node metadata x/y when present. Dedicated overworld maps appear when getOverworldMap returns data.'}
        </p>
      )}
      <div className="editor-workspace world-workspace">
        <div className="panel editor-canvas editor-canvas-fill">
          <WorldMapPreview
            worldGraph={previewGraph}
            view={view}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setConnectFrom(id);
              setDisconnectFrom(id);
            }}
            onActivate={openRoom}
          />
        </div>
        <aside className="panel editor-inspector">
          <h3>Inspector</h3>
          {previewGraph?.nodes?.find((n) => n.id === selectedId) ? (
            <dl className="settings-dl">
              <dt>Room</dt>
              <dd>{previewGraph.nodes.find((n) => n.id === selectedId)?.label ?? selectedId}</dd>
              <dt>Id</dt>
              <dd>
                <code>{selectedId}</code>
              </dd>
              <dt>Archetype</dt>
              <dd>{String(previewGraph.nodes.find((n) => n.id === selectedId)?.metadata?.archetype ?? 'room')}</dd>
              <dt>Outbound</dt>
              <dd>
                {(previewGraph.edges ?? [])
                  .filter((e) => e.from === selectedId)
                  .map((e) => `${e.to}${e.requirements?.length ? ` (${e.requirements.join(', ')})` : ''}`)
                  .join(' · ') || 'none'}
              </dd>
            </dl>
          ) : (
            <p className="hint">Select a room on the map.</p>
          )}
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="primary" disabled={!selectedId} onClick={() => openRoom(selectedId)}>
              Open in Room Editor
            </button>
            <button type="button" onClick={() => navigate('Dungeon')}>
              Dungeon
            </button>
          </div>
        </aside>
      </div>

      <div className="world-edit panel">
        <h3>Add Optional Room</h3>
        <div className="row">
          <input value={newRoomId} onChange={(e) => setNewRoomId(e.target.value)} placeholder="room id" />
          <select value={connectFrom} onChange={(e) => setConnectFrom(e.target.value)}>
            {(worldGraph?.nodes ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.label ?? n.id}
              </option>
            ))}
          </select>
          <button type="button" className="primary" onClick={handleAddRoom}>
            Add &amp; Validate
          </button>
          <button type="button" disabled={!canUndo} onClick={handleUndo}>
            Undo
          </button>
        </div>
        {message && <p className="result success">{message}</p>}
        {error && <p className="result error">{error}</p>}
      </div>

      <div className="world-edit panel">
        <h3>Connect / Disconnect Rooms</h3>
        <div className="row">
          <select value={connectFrom} onChange={(e) => setConnectFrom(e.target.value)}>
            {(worldGraph?.nodes ?? []).map((n) => (
              <option key={`cf-${n.id}`} value={n.id}>{n.label ?? n.id}</option>
            ))}
          </select>
          <span>→</span>
          <select value={connectTo} onChange={(e) => setConnectTo(e.target.value)}>
            {(worldGraph?.nodes ?? []).map((n) => (
              <option key={`ct-${n.id}`} value={n.id}>{n.label ?? n.id}</option>
            ))}
          </select>
          <button type="button" className="primary" onClick={handleConnect}>Connect</button>
        </div>
        <div className="row">
          <select value={disconnectFrom} onChange={(e) => setDisconnectFrom(e.target.value)}>
            {(worldGraph?.nodes ?? []).map((n) => (
              <option key={`df-${n.id}`} value={n.id}>{n.label ?? n.id}</option>
            ))}
          </select>
          <span>↮</span>
          <select value={disconnectTo} onChange={(e) => setDisconnectTo(e.target.value)}>
            {(worldGraph?.nodes ?? []).map((n) => (
              <option key={`dt-${n.id}`} value={n.id}>{n.label ?? n.id}</option>
            ))}
          </select>
          <button type="button" onClick={handleDisconnect}>Disconnect</button>
        </div>
      </div>

      <div className="world-edit panel">
        <h3>Project Checkpoints</h3>
        <div className="row">
          <input
            value={checkpointLabel}
            onChange={(e) => setCheckpointLabel(e.target.value)}
            placeholder="Checkpoint label"
          />
          <button type="button" onClick={handleCheckpoint}>Save Checkpoint</button>
        </div>
        <ul className="checkpoint-list">
          {checkpoints.map((c) => (
            <li key={c.id}>
              <button type="button" className="tab" onClick={() => handleRestoreCheckpoint(c.id)}>
                {c.label} · {new Date(c.timestamp).toLocaleString()}
              </button>
            </li>
          ))}
        </ul>
      </div>
        </>
      )}
    </section>
  );
}
