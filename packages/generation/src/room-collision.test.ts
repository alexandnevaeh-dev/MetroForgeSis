import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGodotRoomCollision } from './room-collision.js';
const roots: string[] = [];
const grid = '[node name="Room" type="Node2D"]\n[node name="Ground" type="TileMapLayer" parent="."]\ntile_size = 32\nroom_width = 640\nroom_height = 320\n';
function fixture(text: string) {
  const root = mkdtempSync(join(tmpdir(), 'metroforge-room-collision-')); roots.push(root);
  mkdirSync(join(root, 'scenes/rooms'), { recursive: true });
  writeFileSync(join(root, 'scenes/rooms/room_000.tscn'), text); return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('guarded Godot room scene reader', () => {
  it('reads grid metadata from the actual scene file', () => {
    expect(readGodotRoomCollision(fixture(grid), 'room_000')).toMatchObject({ roomId: 'room_000', tileSize: 32, widthTiles: 20, heightTiles: 10 });
  });
  it('refuses traversal in room IDs and external scene resource paths', () => {
    const root = fixture(grid);
    expect(() => readGodotRoomCollision(root, '../room_000')).toThrow('Invalid asset ID');
    writeFileSync(join(root, 'scenes/rooms/room_000.tscn'), '[ext_resource type="PackedScene" path="res://../outside.tscn" id="x"]\n' + grid + '[node name="Outside" parent="." instance=ExtResource("x")]');
    expect(() => readGodotRoomCollision(root, 'room_000')).toThrow('Invalid project asset path');
  });
  it('refuses missing, oversized and corrupt scene data', () => {
    const root = fixture(grid);
    expect(() => readGodotRoomCollision(root, 'room_missing')).toThrow('missing');
    writeFileSync(join(root, 'scenes/rooms/room_000.tscn'), 'x'.repeat(1024 * 1024 + 1));
    expect(() => readGodotRoomCollision(root, 'room_000')).toThrow('size limit');
    writeFileSync(join(root, 'scenes/rooms/room_000.tscn'), 'invalid scene');
    expect(() => readGodotRoomCollision(root, 'room_000')).toThrow('root');
  });
});
