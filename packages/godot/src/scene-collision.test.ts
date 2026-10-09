import { describe, expect, it } from 'vitest';
import { parseRoomSceneCollision } from './scene-collision.js';
const grid = '[node name="Room" type="Node2D"]\n[node name="Ground" type="TileMapLayer" parent="."]\ntile_size = 32\nroom_width = 640\nroom_height = 320\n';
const shape = '[sub_resource type="RectangleShape2D" id="box"]\nsize = Vector2(640, 64)\n';
const floor = '[node name="Floor" type="StaticBody2D" parent="."]\nposition = Vector2(320, 288)\n[node name="Collision" type="CollisionShape2D" parent="Floor"]\nshape = SubResource("box")\n';
describe('authored Godot collision preview', () => {
  it('preserves stair polygon edges instead of filling their bounding rectangle',()=>{
    const scene=grid+'[node name="StairFlight" type="StaticBody2D" parent="."]\nposition = Vector2(16, 0)\n[node name="Collision" type="CollisionPolygon2D" parent="StairFlight"]\npolygon = PackedVector2Array(32, 256, 320, 160, 320, 192, 32, 288)\n';
    expect(parseRoomSceneCollision(scene).rects[0]).toEqual({path:'StairFlight/Collision',x:48,y:160,w:288,h:128,points:[{x:48,y:256},{x:336,y:160},{x:336,y:192},{x:48,y:288}]});
  });
  it('rejects incomplete polygon coordinates',()=>{
    const scene=grid+'[node name="StairFlight" type="StaticBody2D" parent="."]\n[node name="Collision" type="CollisionPolygon2D" parent="StairFlight"]\npolygon = PackedVector2Array(32, 256, 320)\n';
    expect(()=>parseRoomSceneCollision(scene)).toThrow(/polygon coordinates/);
  });
  it('uses actual scene grid and rectangle positions rather than painted cells', () => {
    expect(parseRoomSceneCollision(shape + grid + floor)).toMatchObject({ tileSize: 32, widthTiles: 20, heightTiles: 10, source: 'godot_scene', rects: [{ path: 'Floor/Collision', x: 0, y: 256, w: 640, h: 64 }] });
  });
  it('composes nested translation and scale', () => {
    const text = shape + grid + '[node name="Group" type="Node2D" parent="."]\nposition = Vector2(10, 20)\nscale = Vector2(0.5, 2)\n' + floor.replaceAll('parent="."', 'parent="Group"').replace('parent="Floor"', 'parent="Group/Floor"');
    expect(parseRoomSceneCollision(text).rects[0]).toMatchObject({ x: 10, y: 532, w: 320, h: 128 });
  });
  it('retains exact rotated rectangle vertices instead of pretending its AABB is collision', () => {
    const result = parseRoomSceneCollision(shape + grid + floor.replace('position = Vector2(320, 288)', 'position = Vector2(320, 288)\nrotation = 0.7853981633974483'));
    expect(result.rects[0]?.points).toHaveLength(4); expect(result.rects[0]?.points?.[0]?.x).toBeCloseTo(116.353, 2);
  });
  it('excludes disabled shapes, other collision layers and character/area volumes', () => {
    for (const text of [floor.replace('shape =', 'disabled = true\nshape ='), floor.replace('position =', 'collision_layer = 2\nposition ='), floor.replace('StaticBody2D', 'CharacterBody2D'), floor.replace('StaticBody2D', 'Area2D')]) expect(parseRoomSceneCollision(shape + grid + text).rects).toEqual([]);
  });
  it('reads instanced static-body geometry and applies the instance transform', () => {
    const weak = '[sub_resource type="RectangleShape2D" id="box"]\nsize = Vector2(128, 32)\n[node name="Weak" type="StaticBody2D"]\n[node name="Collision" type="CollisionShape2D" parent="."]\nposition = Vector2(0, 16)\nshape = SubResource("box")\n';
    const scene = '[ext_resource type="PackedScene" path="res://weak.tscn" id="weak"]\n' + grid + '[node name="Weak" parent="." instance=ExtResource("weak")]\nposition = Vector2(200, 250)\n';
    expect(parseRoomSceneCollision(scene, () => weak).rects[0]).toMatchObject({ path: 'Weak/Collision', x: 136, y: 250, w: 128, h: 32 });
  });
  it('refuses unsupported active shape kinds, unresolved resources and invalid transforms', () => {
    expect(() => parseRoomSceneCollision(shape.replace('RectangleShape2D', 'CapsuleShape2D') + grid + floor)).toThrow('Unsupported static collision');
    expect(() => parseRoomSceneCollision(grid + floor)).toThrow('Unsupported static collision');
    expect(() => parseRoomSceneCollision(shape + grid + floor.replace('Vector2(320, 288)', 'Vector2(INF, 288)'))).toThrow('numeric');
  });
  it('refuses missing grid metadata and circular instances', () => {
    expect(() => parseRoomSceneCollision(shape + grid.replace('tile_size = 32', '') + floor)).toThrow('grid');
    const recursive = '[ext_resource type="PackedScene" path="res://loop.tscn" id="loop"]\n[node name="Loop" instance=ExtResource("loop")]';
    expect(() => parseRoomSceneCollision(recursive, () => recursive)).toThrow('Circular');
  });
  it('refuses transforms that cannot be represented accurately in the editor', () => {
    for (const property of ['skew = 0.2', 'top_level = true', 'transform = Transform2D(1, 0, 0, 1, 20, 20)']) {
      expect(() => parseRoomSceneCollision(shape + grid + floor.replace('position =', property + '\nposition ='))).toThrow('Unsupported scene transform');
    }
  });
});
