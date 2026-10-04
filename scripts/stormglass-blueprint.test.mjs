import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyStormglassBlueprint } from './refresh-test-game.mjs';
import { buildRoomConnections, deriveWeakFloors } from '../packages/godot/dist/room-assembler.js';
import { validateMovementFeasibility } from '../packages/procedural/dist/index.js';
function blueprint() {
  const roomIds = Array.from({ length: 40 }, (_, i) => `room_${String(i).padStart(3, '0')}`);
  const topology = {
    roomIds,
    worldGraph: { nodes: roomIds.map((id) => ({ id, metadata: {} })), edges: [] },
    progressionGraph: { nodes: [], edges: [], criticalPath: roomIds, endNodeId: roomIds.at(-1) },
  };
  const content = {
    bosses: ['boss_000', 'boss_001', 'boss_002', 'boss_final'].map((id) => ({ id })),
    enemies: Array.from({ length: 20 }, (_, i) => ({ id: `enemy_${i}` })),
    npcs: [],
  };
  applyStormglassBlueprint(topology, content);
  return { topology, content };
}
test('mandatory ground-slam edge generates a physical floor gate', () => {
  const { topology } = blueprint();
  const edge = topology.worldGraph.edges.find((e) => e.from === 'room_029' && e.to === 'room_030');
  assert.deepEqual(edge.requirements, ['ground_slam']);
  assert.equal(edge.transition, 'down');
  assert.equal(edge.bidirectional, true);
  const connections = buildRoomConnections(topology.roomIds, topology.worldGraph.edges);
  assert.deepEqual(deriveWeakFloors(connections.get('room_029'), 2048), [
    { x: 1024, width: 128, targetRoomId: 'room_030' },
  ]);
  assert.ok(
    connections.get('room_030').some((c) => c.targetRoomId === 'room_029' && c.direction === 'up'),
  );
});
test('authored castle has no incompatible ability directions or duplicate door sides', () => {
  const { topology } = blueprint();
  assert.equal(validateMovementFeasibility(topology.worldGraph).feasible, true);
  for (const [id, connections] of buildRoomConnections(topology.roomIds, topology.worldGraph.edges))
    assert.equal(new Set(connections.map((c) => c.direction)).size, connections.length, id);
});
test('guardian placement, early ability grants and forty-room single world stay intact', () => {
  const { topology, content } = blueprint();
  assert.equal(topology.worldGraph.nodes.length, 40);
  assert.equal(content.enemies.length, 20);
  assert.deepEqual(
    content.bosses.map((b) => b.arenaRoomId),
    ['room_008', 'room_018', 'room_028', 'room_038'],
  );
  assert.deepEqual(
    topology.worldGraph.nodes.find((n) => n.id === 'room_023').metadata.grantsAbilities,
    ['ground_slam'],
  );
  assert.equal(topology.progressionGraph.endNodeId, 'room_038');
});

test('castle route agent cannot revive, teleport, freeze actors or force hitboxes', () => {
  const source = readFileSync(
    new URL('../templates/godot-metroidvania/scripts/test/PlaytestAgent.gd', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /freeze_presentation|_perform_attack|take_damage|\.activate\(|collision_layer\s*=|global_position\s*=|current_health\s*=|invulnerable\s*=|grant_ability|\.monitoring\s*=/,
  );
  assert.match(source, /observed\.defeated/);
  assert.match(source, /_dispose_signal_tracking\(\)/);
});
