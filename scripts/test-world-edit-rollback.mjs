import assert from 'node:assert/strict';
import { unlinkSync, mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GodotProjectAssembler } from '../packages/godot/dist/index.js';
import { applyWorldEditAndRecompile } from '../packages/generation/dist/project-edit-service.js';
const source = process.argv[2];
if (!source) throw new Error('Provide a generated fixture project');
const project = mkdtempSync(join(tmpdir(), 'metroforge-world-rollback-'));
for (const dir of ['data/rooms', 'data/world', 'scenes/rooms']) mkdirSync(join(project, dir), { recursive: true });
for (const file of ['game_dna.json', 'world_graph.json', 'data/rooms/rooms.json']) copyFileSync(join(source, file), join(project, file));
writeFileSync(join(project, 'project.godot'), 'config_version=5\n');
const graphPath = join(project, 'world_graph.json');
const runtimeGraphPath = join(project, 'data/world/world_graph.json');
const roomsPath = join(project, 'data/rooms/rooms.json');
const roomId = JSON.parse(readFileSync(graphPath)).nodes.find(n => n.type === 'room').id;
const scenePath = join(project, 'scenes/rooms', `${roomId}.tscn`);
const newScenePath = join(project, 'scenes/rooms/rollback_copy.tscn');
writeFileSync(scenePath, 'original scene sentinel\r\n');
const originals = new Map([graphPath, roomsPath, scenePath].map(p => [p, readFileSync(p)]));
const checkRestored = () => {
  for (const [p, bytes] of originals) assert.deepEqual(readFileSync(p), bytes);
  assert.equal(existsSync(runtimeGraphPath), false, 'New runtime graph must be removed');
  assert.equal(existsSync(newScenePath), false, 'New scene must be removed');
};
const originalRecompile = GodotProjectAssembler.prototype.recompileRooms;
try {
  for (const failure of ['reported', 'thrown', 'empty-errors']) {
    const existingRuntimeGraph = failure === 'thrown';
    if (existingRuntimeGraph) writeFileSync(runtimeGraphPath, 'original runtime graph sentinel');
    GodotProjectAssembler.prototype.recompileRooms = function () {
      writeFileSync(scenePath, 'partial scene');
      writeFileSync(newScenePath, 'partial new scene');
      writeFileSync(roomsPath, 'partial room data');
      if (failure === 'thrown') throw new Error('Injected world compilation exception');
      return { success: false, recompiled: [roomId], errors: failure === 'empty-errors' ? [] : ['Injected world compilation failure'] };
    };
    const result = applyWorldEditAndRecompile(project, { type: 'duplicate_room', roomId, newRoomId: 'rollback_copy' });
    assert.equal(result.success, false);
    assert.match(result.errors.join(' '), /Injected world|World room compilation failed/);
    assert.equal(result.worldGraph, undefined, 'Failed edits must not advertise the new graph');
    assert.deepEqual(result.recompiledRooms, []);
    if (existingRuntimeGraph) {
      assert.equal(readFileSync(runtimeGraphPath, 'utf8'), 'original runtime graph sentinel');
      unlinkSync(runtimeGraphPath);
    }
    checkRestored();
  }
  for (const command of [
    { type: 'duplicate_room', roomId, newRoomId: '../outside' },
    { type: 'move_room', roomId, x: Infinity, y: 0 },
    { type: 'move_room', roomId, x: 0, y: NaN },
  ]) {
    assert.equal(applyWorldEditAndRecompile(project, command).success, false);
    checkRestored();
  }
  GodotProjectAssembler.prototype.recompileRooms = originalRecompile;
  const result = applyWorldEditAndRecompile(project, { type: 'duplicate_room', roomId, newRoomId: 'rollback_copy' });
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(existsSync(newScenePath), true);
  assert.deepEqual(readFileSync(graphPath), readFileSync(runtimeGraphPath));
  assert.ok(JSON.parse(readFileSync(roomsPath)).rooms.rollback_copy);
  assert.ok(result.recompiledRooms.includes('rollback_copy'));
} finally { GodotProjectAssembler.prototype.recompileRooms = originalRecompile; }
console.log('PASS: world rollback on reported/thrown failures, new file cleanup, invalid edits rejected, actual room duplication compiled');
