import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GodotProjectAssembler } from '../packages/godot/dist/index.js';
import { applyRoomEditAndRecompile } from '../packages/generation/dist/project-edit-service.js';
const source = process.argv[2];
if (!source) throw new Error('Provide a generated fixture project');
const project = mkdtempSync(join(tmpdir(), 'metroforge-room-rollback-'));
mkdirSync(join(project, 'data/rooms'), { recursive: true });
mkdirSync(join(project, 'scenes/rooms'), { recursive: true });
for (const file of ['game_dna.json', 'world_graph.json', 'data/rooms/rooms.json']) copyFileSync(join(source, file), join(project, file));
writeFileSync(join(project, 'project.godot'), 'config_version=5\n');
const roomsPath = join(project, 'data/rooms/rooms.json');
const originalRooms = readFileSync(roomsPath);
const roomId = Object.keys(JSON.parse(originalRooms).rooms)[0];
const scenePath = join(project, 'scenes/rooms', `${roomId}.tscn`);
const originalScene = Buffer.from('original scene sentinel\r\n');
writeFileSync(scenePath, originalScene);
const originalRecompile = GodotProjectAssembler.prototype.recompileRooms;
try {
  for (const throws of [false, true]) {
    GodotProjectAssembler.prototype.recompileRooms = function () {
      writeFileSync(scenePath, 'partial scene');
      writeFileSync(roomsPath, 'partial room data');
      if (throws) throw new Error('Injected write failure');
      return { success: false, recompiled: [roomId], errors: ['Injected compilation failure'] };
    };
    const result = applyRoomEditAndRecompile(project, { roomId, width: 900 });
    assert.equal(result.success, false);
    assert.match(result.errors.join(' '), /Injected/);
    assert.deepEqual(result.recompiledRooms, []);
    assert.deepEqual(readFileSync(roomsPath), originalRooms);
    assert.deepEqual(readFileSync(scenePath), originalScene);
  }
  unlinkSync(scenePath);
  assert.equal(applyRoomEditAndRecompile(project, { roomId, width: 900 }).success, false);
  assert.equal(existsSync(scenePath), false, 'Failed creation must not leave a new scene');
  assert.deepEqual(readFileSync(roomsPath), originalRooms);
  assert.equal(applyRoomEditAndRecompile(project, { roomId: '../outside' }).success, false);
  GodotProjectAssembler.prototype.recompileRooms = function () {
    writeFileSync(scenePath, 'successful scene');
    return { success: true, recompiled: [roomId], errors: [] };
  };
  assert.equal(applyRoomEditAndRecompile(project, { roomId, width: 900 }).success, true);
  assert.equal(JSON.parse(readFileSync(roomsPath)).rooms[roomId].width, 900);
  assert.equal(readFileSync(scenePath, 'utf8'), 'successful scene');
} finally { GodotProjectAssembler.prototype.recompileRooms = originalRecompile; }
console.log('PASS: room edit rollback on compiler error/exception, new scene cleanup, invalid ID and successful commit');
