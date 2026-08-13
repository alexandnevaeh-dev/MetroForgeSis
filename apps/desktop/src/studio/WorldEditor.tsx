import { useEffect, useState } from 'react';
import { WorldMapPreview } from './WorldMapPreview';
import { CommandBar } from './CommandBar';
import { EditStatusBadge } from './EditStatusBadge';
import type { StudioProject } from './types';

export function WorldEditor() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [worldGraph, setWorldGraph] = useState<Parameters<typeof WorldMapPreview>[0]['worldGraph']>(null);
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
    if (graph?.nodes?.[0]?.id) {
      setConnectFrom(graph.nodes[0].id);
      setConnectTo(graph.nodes[1]?.id ?? graph.nodes[0].id);
      setDisconnectFrom(graph.nodes[0].id);
      setDisconnectTo(graph.nodes[1]?.id ?? graph.nodes[0].id);
    }
  };

  useEffect(() => {
    window.metroforge?.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) {
        const first = list[0]!.path;
        setSelectedPath((p) => p || first);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedPath) {
      loadGraph(selectedPath);
      refreshHistory();
      refreshCheckpoints();
    }
  }, [selectedPath]);

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
      <h2>World Editor <EditStatusBadge projectPath={selectedPath} /></h2>
      <p className="hint">
        View and edit the real WorldGraph. Layout is visual-only; topology changes go through validated commands.
      </p>
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

      <CommandBar projectPath={selectedPath} onSuccess={() => loadGraph(selectedPath)} />

      <WorldMapPreview worldGraph={worldGraph} />

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
    </section>
  );
}
