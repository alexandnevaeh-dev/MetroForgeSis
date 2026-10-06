import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const slug = process.env.METROFORGE_SLICE_SLUG || 'metroforge-multi-ability-progression';
const project = join(root, 'GeneratedGames', slug);
const graphPath = join(project, 'multi_ability_progression_graph.json');
const errors = [];
if (!existsSync(graphPath)) errors.push('missing canonical graph artifact');
const canonical = errors.length ? { roomIds: [], worldGraph: { nodes: [], edges: [] } } : JSON.parse(readFileSync(graphPath, 'utf8'));
const roomIds = canonical.roomIds ?? [];
const roomDir = join(project, 'scenes/rooms');
const generatedRoomIds = existsSync(roomDir) ? readdirSync(roomDir).filter((file) => file.endsWith('.tscn')).map((file) => file.slice(0, -5)).sort() : [];
if (roomIds.length !== 8) errors.push(`expected 8 canonical rooms, got ${roomIds.length}`);
if (JSON.stringify(generatedRoomIds) !== JSON.stringify([...roomIds].sort())) errors.push(`room scenes disagree with graph: ${generatedRoomIds.join(', ')}`);
const route = existsSync(join(project, 'playtest_route.json')) ? JSON.parse(readFileSync(join(project, 'playtest_route.json'), 'utf8')) : null;
if (!route) errors.push('missing playtest route');
const edgeFor = (from, to) => canonical.worldGraph.edges.find((edge) => edge.from === from && edge.to === to);
for (const step of route?.transitions ?? []) {
  const edge = edgeFor(step.fromRoomId, step.toRoomId);
  if (!edge) errors.push(`route edge missing from canonical graph: ${step.fromRoomId}->${step.toRoomId}`);
  else if (JSON.stringify(edge.requirements) !== JSON.stringify(step.requirements)) errors.push(`route requirements differ: ${step.fromRoomId}->${step.toRoomId}`);
}
const readRoom = (id) => existsSync(join(roomDir, `${id}.tscn`)) ? readFileSync(join(roomDir, `${id}.tscn`), 'utf8') : '';
const slamRoom = readRoom('room_004');
const phaseRoom = readRoom('room_006');
if (!slamRoom.includes('AbilityPickup_ground_slam')) errors.push('room_004 lacks ground_slam pickup');
if (!slamRoom.includes('WeakFloor_room_005') || !slamRoom.includes('WeakFloor.tscn')) errors.push('room_004 lacks WeakFloor gate');
if (!slamRoom.includes('Transition_down_room_005') || !slamRoom.includes('PackedStringArray("ground_slam")')) errors.push('room_004 lacks ground_slam down transition');
if (!phaseRoom.includes('AbilityPickup_phase')) errors.push('room_006 lacks phase pickup');
if (!phaseRoom.includes('PhaseBarrier_room_007') || !phaseRoom.includes('PhaseBarrier.tscn')) errors.push('room_006 lacks phase barrier');
const combined = edgeFor('room_006', 'room_007');
if (JSON.stringify(combined?.requirements) !== JSON.stringify(['phase', 'ground_slam'])) errors.push('combined edge does not require phase and ground_slam');
if (!existsSync(join(project, 'scenes/rooms/room_007.tscn'))) errors.push('endpoint room missing');
console.log(JSON.stringify({ passed: errors.length === 0, expectedRoomIds: roomIds, generatedRoomIds, errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;
