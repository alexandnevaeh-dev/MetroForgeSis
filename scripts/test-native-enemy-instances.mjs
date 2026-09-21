import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { applyRoomEditAndRecompile } from '../packages/generation/dist/project-edit-service.js';
import { spawnCapturedSync } from '../packages/qa/dist/process-capture.js';
const source = process.argv[2];
const godot = process.env.GODOT_EXECUTABLE;
assert.ok(source && godot, 'Provide fixture project and GODOT_EXECUTABLE');
const project = mkdtempSync(join(tmpdir(), 'metroforge-native-enemies-'));
cpSync(source, project, { recursive: true, filter: path => !['qa', '.git'].includes(basename(path)) });
const rooms = JSON.parse(readFileSync(join(project, 'data/rooms/rooms.json'))).rooms;
const room = Object.values(rooms).find(r => r.enemies.some(id => id.startsWith('enemy_')));
assert.ok(room);
const original = room.entityPlacements.find(p => p.kind === 'enemy');
assert.ok(original);
const copy = { ...original, id: `${original.id}_copy`, definitionId: original.id, x: original.x - 120 };
const edit = applyRoomEditAndRecompile(project, { roomId: room.id, enemies: [original.id, copy.id], entityPlacements: [...room.entityPlacements, copy] });
assert.equal(edit.success, true, edit.errors.join('\n'));
const script = `extends Node
func _ready() -> void:
	var room = load(${JSON.stringify(`res://scenes/rooms/${room.id}.tscn`)}).instantiate()
	add_child(room)
	var first = room.get_node("Enemy")
	var second = room.get_node("Enemy_1")
	var failures = []
	if first.enemy_id != second.enemy_id or first.enemy_id != ${JSON.stringify(original.id)}:
		failures.append("shared definition")
	if first.get_meta("metroforge_entity_id", "") != ${JSON.stringify(original.id)} or second.get_meta("metroforge_entity_id", "") != ${JSON.stringify(copy.id)}:
		failures.append("distinct authoring identities")
	if absf(first.position.x - second.position.x - 120.0) > 0.1:
		failures.append("authored positions")
	for enemy in [first, second]:
		if enemy._load_enemy_definition(enemy.enemy_id).is_empty():
			failures.append("definition missing")
		var sprite = enemy.get_node("Sprite")
		if sprite.sprite_frames == null or sprite.sprite_frames.get_frame_count("walk") == 0:
			failures.append("walk artwork missing")
		enemy.set_physics_process(false)
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var picture = get_viewport().get_texture().get_image()
	if picture == null or picture.is_empty():
		failures.append("render missing")
	else:
		picture.save_png("res://native-enemies.png")
	var kills = []
	EventBus.enemy_killed.connect(func(id): kills.append(id))
	var first_health = first.get_node("HealthComponent")
	var second_health = second.get_node("HealthComponent")
	var first_start = first_health.current_health
	var second_start = second_health.current_health
	first.get_node("HurtboxComponent").receive_hit(1.0, 0.0, room.get_node("Player"))
	if first_health.current_health != first_start - 1.0 or second_health.current_health != second_start:
		failures.append("independent nonlethal damage")
	first.get_node("HurtboxComponent").receive_hit(first_start + 1.0, 0.0, room.get_node("Player"))
	await get_tree().create_timer(2.0).timeout
	if is_instance_valid(first):
		failures.append("defeated instance not removed")
	if not is_instance_valid(second) or not second_health.is_alive() or second_health.current_health != second_start:
		failures.append("surviving instance changed")
	if kills.size() != 1 or kills[0] != ${JSON.stringify(original.id)}:
		failures.append("kill event definition or count")
	print("NATIVE_ENEMY_RESULT ", JSON.stringify({"failures": failures, "instances": 2}))
	get_tree().quit(0 if failures.is_empty() else 1)
`;
writeFileSync(join(project, 'native-enemies.gd'), script);
writeFileSync(join(project, 'native-enemies.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://native-enemies.gd" id="1"]\n[node name="NativeEnemies" type="Node"]\nscript = ExtResource("1")\n');
const result = spawnCapturedSync(godot, ['--path', project, '--audio-driver', 'Dummy', 'res://native-enemies.tscn', '--quit-after', '300'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
writeFileSync(join(project, 'native-enemies.log'), result.stdout + result.stderr);
console.log(JSON.stringify({ project, exitCode: result.status, error: result.error?.message }));
assert.equal(result.status, 0);
assert.match(result.stdout, /NATIVE_ENEMY_RESULT.*"failures":\[\]/);
console.log('PASS: native enemy definitions, artwork, identities, positions, rendered frame and independent damage/death');
