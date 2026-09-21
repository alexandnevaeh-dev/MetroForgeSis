import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { applyRoomEditAndRecompile, applyWorldEditAndRecompile } from '../packages/generation/dist/project-edit-service.js';
const source = process.argv[2];
assert.ok(source, 'Provide a generated project');
const project = mkdtempSync(join(tmpdir(), 'metroforge-npc-edits-'));
for (const file of ['game_dna.json', 'world_graph.json', 'data/rooms/rooms.json', 'data/npcs/npcs.json']) {
  mkdirSync(dirname(join(project, file)), { recursive: true });
  copyFileSync(join(source, file), join(project, file));
}
writeFileSync(join(project, 'project.godot'), 'config_version=5\n');
const roomsPath = join(project, 'data/rooms/rooms.json');
const room = Object.values(JSON.parse(readFileSync(roomsPath)).rooms).find(r => r.npcs.length);
assert.ok(room);
const original = room.entityPlacements.find(p => p.kind === 'npc');
assert.ok(original);
const copy = { ...original, id: `${original.id}_copy`, definitionId: original.id, x: original.x + 32 };
const scene = id => readFileSync(join(project, 'scenes/rooms', `${id}.tscn`), 'utf8');
const edit = patch => { const result = applyRoomEditAndRecompile(project, { roomId: room.id, ...patch }); assert.equal(result.success, true, result.errors.join('\n')); };
edit({ npcs: [original.id, copy.id], entityPlacements: [...room.entityPlacements, copy] });
for (let pass = 0; pass < 2; pass++) {
  assert.match(scene(room.id), /\[node name="NPC_1"/);
  assert.ok(scene(room.id).includes(`metadata/metroforge_entity_id = "${copy.id}"`));
  assert.ok(!scene(room.id).includes(`assets/npcs/${copy.id}_`));
  assert.equal((scene(room.id).match(new RegExp(`npc_id = "${original.id}"`, 'g')) ?? []).length, 2);
  edit({ width: 1280 });
}
const duplicate = applyWorldEditAndRecompile(project, { type: 'duplicate_room', roomId: room.id, newRoomId: 'npc_copy_room' });
assert.equal(duplicate.success, true, duplicate.errors.join('\n'));
assert.match(scene('npc_copy_room'), /\[node name="NPC_1"/);
edit({ npcs: [] });
edit({ height: 736 });
assert.doesNotMatch(scene(room.id), /\[node name="NPC_/);
assert.deepEqual(JSON.parse(readFileSync(roomsPath)).rooms[room.id].npcs, []);
const before = readFileSync(roomsPath);
const bad = applyRoomEditAndRecompile(project, { roomId: room.id, npcs: ['missing_npc'] });
assert.equal(bad.success, false);
assert.deepEqual(readFileSync(roomsPath), before);
console.log('PASS: NPC duplication, shared definitions, room duplication, removal persistence and missing-definition rollback');
