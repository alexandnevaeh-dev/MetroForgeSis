import { describe, it, expect } from 'vitest';
import type { WorldGraph } from '@metroforge/schemas';
import { generateFullMetroidvaniaWorld, FULL_WORLD_TEST_CONFIG } from './world-design.js';
import { validateExportFidelity, type ExportedRoomData } from './export-fidelity.js';

const OPPOSITE: Record<string, string> = { left: 'right', right: 'left', up: 'down', down: 'up' };

/** Builds a rooms.json-shaped export that agrees with `worldGraph` exactly — every edge gets a
 *  matching door (and reciprocal door if bidirectional), and every ground_slam/phase requirement
 *  gets its physical obstacle recorded. Used as the "exporter did its job correctly" baseline;
 *  individual tests then mutate one piece of it to prove a specific real drift is caught. */
function buildMatchingExport(worldGraph: WorldGraph): Record<string, ExportedRoomData> {
  const rooms: Record<string, ExportedRoomData> = {};
  for (const node of worldGraph.nodes) {
    if (node.type === 'room' || node.type === 'zone') rooms[node.id] = { connections: [], weakFloors: [], phaseBarriers: [] };
  }
  for (const edge of worldGraph.edges) {
    const direction = edge.transition === 'up' || edge.transition === 'down' ? edge.transition : 'right';
    rooms[edge.from]!.connections.push({ direction, targetRoomId: edge.to, optional: Boolean(edge.optional), requirements: [...edge.requirements] });
    if (edge.bidirectional) {
      rooms[edge.to]!.connections.push({ direction: OPPOSITE[direction] ?? 'left', targetRoomId: edge.from, optional: Boolean(edge.optional), requirements: [...edge.requirements] });
    }
    if (edge.transition === 'down' && edge.requirements.includes('ground_slam')) {
      rooms[edge.from]!.weakFloors!.push({ x: 100, width: 128, targetRoomId: edge.to });
    }
    if (edge.requirements.includes('phase')) {
      rooms[edge.from]!.phaseBarriers!.push({ x: 100, targetRoomId: edge.to });
    }
  }
  return rooms;
}

describe('validateExportFidelity', () => {
  const { worldGraph } = generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed: 700001 });

  it('passes when the exported project agrees with the world graph exactly', () => {
    const rooms = buildMatchingExport(worldGraph);
    const report = validateExportFidelity(worldGraph, rooms);
    expect(report.issues).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('flags a room the graph declares but the exporter never wrote', () => {
    const rooms = buildMatchingExport(worldGraph);
    delete rooms['room_005'];
    const report = validateExportFidelity(worldGraph, rooms);
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.code === 'export_missing_room' && i.roomIds?.includes('room_005'))).toBe(true);
  });

  it('flags a door the graph declares but the exported room never got', () => {
    const rooms = buildMatchingExport(worldGraph);
    const gatedEdge = worldGraph.edges.find((e) => e.requirements.length > 0)!;
    rooms[gatedEdge.from]!.connections = rooms[gatedEdge.from]!.connections.filter((c) => c.targetRoomId !== gatedEdge.to);
    const report = validateExportFidelity(worldGraph, rooms);
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.code === 'export_missing_connection' && i.edgeId === gatedEdge.id)).toBe(true);
  });

  it('flags a door whose exported ability requirement disagrees with the graph', () => {
    const rooms = buildMatchingExport(worldGraph);
    const gatedEdge = worldGraph.edges.find((e) => e.requirements.length > 0)!;
    const conn = rooms[gatedEdge.from]!.connections.find((c) => c.targetRoomId === gatedEdge.to)!;
    conn.requirements = []; // exporter silently dropped the requirement
    const report = validateExportFidelity(worldGraph, rooms);
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.code === 'export_requirements_mismatch' && i.edgeId === gatedEdge.id)).toBe(true);
  });

  it('flags a mandatory edge the exporter marked optional', () => {
    const rooms = buildMatchingExport(worldGraph);
    const mandatoryEdge = worldGraph.edges.find((e) => !e.optional && e.kind !== 'shortcut')!;
    const conn = rooms[mandatoryEdge.from]!.connections.find((c) => c.targetRoomId === mandatoryEdge.to)!;
    conn.optional = true;
    const report = validateExportFidelity(worldGraph, rooms);
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.code === 'export_door_mismatch' && i.edgeId === mandatoryEdge.id)).toBe(true);
  });

  it('flags a ground_slam gate whose WeakFloor obstacle never got placed', () => {
    const rooms = buildMatchingExport(worldGraph);
    const breakableEdge = worldGraph.edges.find((e) => e.transition === 'down' && e.requirements.includes('ground_slam'));
    expect(breakableEdge, 'fixture requires FULL_WORLD_TEST_CONFIG to include ground_slam').toBeTruthy();
    rooms[breakableEdge!.from]!.weakFloors = [];
    const report = validateExportFidelity(worldGraph, rooms);
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.code === 'export_missing_weak_floor' && i.edgeId === breakableEdge!.id)).toBe(true);
  });

  it('flags a door the exported project has that no world-graph edge declares', () => {
    const rooms = buildMatchingExport(worldGraph);
    rooms['room_000']!.connections.push({ direction: 'right', targetRoomId: 'room_099_ghost', optional: false, requirements: [] });
    const report = validateExportFidelity(worldGraph, rooms);
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.code === 'export_extra_connection' && i.roomIds?.includes('room_000'))).toBe(true);
  });
});
