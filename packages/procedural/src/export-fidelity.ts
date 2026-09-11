import type { WorldGraph } from '@metroforge/schemas';

/**
 * Cross-checks the WorldGraph this module and world.ts generate against the actual data the
 * Godot exporter recorded for each room (packages/godot/src/room-assembler.ts's
 * PublishedRoomRecord, as written to data/rooms/rooms.json). Answers a question
 * validateWorldDesign and generateWorldDesignReport cannot: sharing the same in-memory WorldGraph
 * object with the exporter proves the graph and the *report* agree with each other, but says
 * nothing about whether the exporter's own door/obstacle-placement logic actually preserved every
 * edge, requirement, and physical obstacle the graph declares. This module reads back what was
 * actually assembled and disagrees loudly if it drifted.
 *
 * Deliberately independent of `@metroforge/godot` — that package already depends on
 * `@metroforge/procedural` (for GameContent), so importing PublishedRoomRecord's concrete type
 * here would be circular. `ExportedRoomData` below is a structural (duck-typed) subset of it,
 * matching the exact fields buildPublishedRoomRecord writes.
 */

export interface ExportedConnection {
  direction: string;
  targetRoomId: string;
  optional: boolean;
  requirements: string[];
}

export interface ExportedRoomData {
  connections: ExportedConnection[];
  weakFloors?: { x: number; width: number; targetRoomId: string }[];
  phaseBarriers?: { x: number; targetRoomId: string }[];
}

export interface ExportFidelityIssue {
  code:
    | 'export_missing_room'
    | 'export_missing_connection'
    | 'export_requirements_mismatch'
    | 'export_door_mismatch'
    | 'export_missing_weak_floor'
    | 'export_missing_phase_barrier'
    | 'export_extra_connection';
  message: string;
  roomIds?: string[];
  edgeId?: string;
}

export interface ExportFidelityReport {
  passed: boolean;
  issues: ExportFidelityIssue[];
}

const OPPOSITE: Record<string, string> = { left: 'right', right: 'left', up: 'down', down: 'up' };

/** `edge.transition` is often left undefined for an ordinary horizontal connection (see
 *  movement-feasibility.ts's own normalizeTransition), while the exporter must still pick a
 *  concrete direction to actually build — and for a *non*-gated edge, room-assembler.ts's
 *  resolveNonCollidingDirection is explicitly free to move it off its preferred side entirely
 *  (any of the 4 directions) to avoid colliding with another edge already occupying that side of
 *  the room. Only a *gated* edge's direction is guaranteed preserved exactly (buildRoomConnections
 *  never runs collision-avoidance on an ability-gated edge — see its own comment on why: a gate's
 *  direction is load-bearing for the movement-feasibility check that reasons about it elsewhere).
 *  So direction is checked here only for a gated edge with an explicit 'up'/'down' transition
 *  (the two unambiguous cases); every other edge is matched on targetRoomId alone. Confirmed via a
 *  real MEDIUM-profile generation: an initial version of this function that required left/right
 *  for every direction-less edge flagged a real, correctly-exported 'up' door (room-assembler had
 *  freely relocated a same-zone shortcut there to avoid a collision) as a false export_missing_
 *  connection. */
function directionMatches(edge: WorldGraph['edges'][number], doorDirection: string): boolean {
  if (edge.requirements.length > 0 && (edge.transition === 'up' || edge.transition === 'down')) {
    return doorDirection === edge.transition;
  }
  return true;
}

export function validateExportFidelity(worldGraph: WorldGraph, rooms: Record<string, ExportedRoomData>): ExportFidelityReport {
  const issues: ExportFidelityIssue[] = [];
  const roomNodeIds = worldGraph.nodes.filter((n) => n.type === 'room' || n.type === 'zone').map((n) => n.id);

  for (const id of roomNodeIds) {
    if (!rooms[id]) {
      issues.push({ code: 'export_missing_room', message: `Room '${id}' exists in the world graph but was not found in the exported project's room data.`, roomIds: [id] });
    }
  }

  for (const edge of worldGraph.edges) {
    const fromRoom = rooms[edge.from];
    if (!fromRoom) continue; // already reported as export_missing_room

    const match = fromRoom.connections.find((c) => c.targetRoomId === edge.to && directionMatches(edge, c.direction));
    if (!match) {
      issues.push({ code: 'export_missing_connection', message: `World-graph edge ${edge.id} (${edge.from} -> ${edge.to}) has no matching door in the exported room '${edge.from}'.`, roomIds: [edge.from], edgeId: edge.id });
    } else {
      const graphReqs = new Set(edge.requirements);
      const doorReqs = new Set(match.requirements);
      const sameRequirements = graphReqs.size === doorReqs.size && [...graphReqs].every((r) => doorReqs.has(r));
      if (!sameRequirements) {
        issues.push({
          code: 'export_requirements_mismatch',
          message: `Door for edge ${edge.id} (${edge.from} -> ${edge.to}) requires [${[...doorReqs].join(', ')}] in the exported project but the world graph declares [${[...graphReqs].join(', ')}].`,
          roomIds: [edge.from],
          edgeId: edge.id,
        });
      }
      if (Boolean(match.optional) !== Boolean(edge.optional)) {
        issues.push({
          code: 'export_door_mismatch',
          message: `Door for edge ${edge.id} (${edge.from} -> ${edge.to}) is optional=${match.optional} in the exported project but the world graph declares optional=${Boolean(edge.optional)}.`,
          roomIds: [edge.from],
          edgeId: edge.id,
        });
      }
    }

    if (edge.bidirectional) {
      const toRoom = rooms[edge.to];
      if (toRoom) {
        const expectedReturnDir = edge.requirements.length > 0 && (edge.transition === 'up' || edge.transition === 'down') ? OPPOSITE[edge.transition] : undefined;
        const reciprocal = toRoom.connections.find((c) => c.targetRoomId === edge.from && (expectedReturnDir === undefined || c.direction === expectedReturnDir));
        if (!reciprocal) {
          issues.push({ code: 'export_missing_connection', message: `Bidirectional edge ${edge.id} (${edge.from} -> ${edge.to}) has no return door in the exported room '${edge.to}'.`, roomIds: [edge.to], edgeId: edge.id });
        }
      }
    }

    if (edge.transition === 'down' && edge.requirements.includes('ground_slam')) {
      const hasWeakFloor = (fromRoom.weakFloors ?? []).some((wf) => wf.targetRoomId === edge.to);
      if (!hasWeakFloor) {
        issues.push({
          code: 'export_missing_weak_floor',
          message: `Edge ${edge.id} (${edge.from} -> ${edge.to}) requires ground_slam on a 'down' transition but no WeakFloor obstacle targeting '${edge.to}' was found in the exported room '${edge.from}' — the physical obstacle this ability is supposed to break was never placed.`,
          roomIds: [edge.from],
          edgeId: edge.id,
        });
      }
    }

    if (edge.requirements.includes('phase')) {
      const hasBarrier = (fromRoom.phaseBarriers ?? []).some((pb) => pb.targetRoomId === edge.to);
      if (!hasBarrier) {
        issues.push({
          code: 'export_missing_phase_barrier',
          message: `Edge ${edge.id} (${edge.from} -> ${edge.to}) requires phase but no PhaseBarrier obstacle targeting '${edge.to}' was found in the exported room '${edge.from}' — the physical obstacle this ability is supposed to pass through was never placed.`,
          roomIds: [edge.from],
          edgeId: edge.id,
        });
      }
    }
  }

  for (const [roomId, data] of Object.entries(rooms)) {
    for (const conn of data.connections) {
      const hasGraphEdge = worldGraph.edges.some(
        (e) => (e.from === roomId && e.to === conn.targetRoomId) || (e.bidirectional && e.to === roomId && e.from === conn.targetRoomId),
      );
      if (!hasGraphEdge) {
        issues.push({ code: 'export_extra_connection', message: `Exported room '${roomId}' has a door to '${conn.targetRoomId}' with no corresponding edge in the world graph.`, roomIds: [roomId] });
      }
    }
  }

  return { passed: issues.length === 0, issues };
}
