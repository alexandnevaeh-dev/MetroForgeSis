import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { applyRoomEditAndRecompile } from '../packages/generation/dist/project-edit-service.js';
import { spawnCapturedSync } from '../packages/qa/dist/process-capture.js';
const source = process.argv[2];
const godot = process.env.GODOT_EXECUTABLE;
assert.ok(source && godot, 'Provide fixture project and GODOT_EXECUTABLE');
const project = mkdtempSync(join(tmpdir(), 'metroforge-native-npcs-'));
cpSync(source, project, { recursive: true, filter: path => !['qa', '.git'].includes(basename(path)) });
const rooms = JSON.parse(readFileSync(join(project, 'data/rooms/rooms.json'))).rooms;
const room = Object.values(rooms).find(r => r.npcs.length > 0);
assert.ok(room);
const original = room.entityPlacements.find(p => p.kind === 'npc');
assert.ok(original);
const copy = { ...original, id: `${original.id}_copy`, definitionId: original.id, x: original.x + 80 };
const edit = applyRoomEditAndRecompile(project, { roomId: room.id, npcs: [original.id, copy.id], entityPlacements: [...room.entityPlacements, copy] });
assert.equal(edit.success, true, edit.errors.join('\n'));
const script = `extends Node
func interact_with(npc, player) -> bool:
	player.global_position = npc.global_position
	player.velocity = Vector2.ZERO
	for frame in range(4):
		await get_tree().physics_frame
	await get_tree().process_frame
	if not npc._player_in_range:
		return false
	var press = InputEventAction.new()
	press.action = "interact"
	press.pressed = true
	Input.parse_input_event(press)
	await get_tree().process_frame
	var release = InputEventAction.new()
	release.action = "interact"
	release.pressed = false
	Input.parse_input_event(release)
	return true

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	GameManager.start_new_game()
	var room = load(${JSON.stringify(`res://scenes/rooms/${room.id}.tscn`)}).instantiate()
	add_child(room)
	var overlay = load("res://scenes/world/DialogueOverlay.tscn").instantiate()
	add_child(overlay)
	var first = room.get_node("NPC_0")
	var second = room.get_node("NPC_1")
	var player = room.get_node("Player")
	player.set_physics_process(false)
	var failures = []
	if first.npc_id != second.npc_id or second.npc_id != ${JSON.stringify(original.id)}:
		failures.append("shared NPC definition")
	if second.get_meta("metroforge_entity_id", "") != ${JSON.stringify(copy.id)}:
		failures.append("copy identity")
	var original_dialogue = first._resolve_dialogue_id()
	if original_dialogue.is_empty() or second._resolve_dialogue_id() != original_dialogue:
		failures.append("shared dialogue resolution")
	if not await interact_with(second, player):
		failures.append("copy proximity detection")
	if not overlay.is_active() or overlay._dialogue_id != original_dialogue:
		failures.append("copy opens dialogue")
	if overlay._context.get("npc_id", "") != first.npc_id or overlay.text_label.text.is_empty():
		failures.append("dialogue context and text")
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://native-npcs.png")
	overlay.close_dialogue()
	if get_tree().paused:
		failures.append("dialogue leaves gameplay paused")
	if not await interact_with(first, player):
		failures.append("original proximity detection")
	if not overlay.is_active() or overlay._dialogue_id != original_dialogue:
		failures.append("original remains interactive")
	overlay.close_dialogue()
	print("NATIVE_NPC_RESULT ", JSON.stringify({"failures": failures, "instances": 2}))
	get_tree().quit(0 if failures.is_empty() else 1)
`;
writeFileSync(join(project, 'native-npcs.gd'), script);
writeFileSync(join(project, 'native-npcs.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://native-npcs.gd" id="1"]\n[node name="NativeNPCs" type="Node"]\nscript = ExtResource("1")\n');
const result = spawnCapturedSync(godot, ['--path', project, '--audio-driver', 'Dummy', 'res://native-npcs.tscn', '--quit-after', '300'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
writeFileSync(join(project, 'native-npcs.log'), result.stdout + result.stderr);
console.log(JSON.stringify({ project, exitCode: result.status, error: result.error?.message }));
assert.equal(result.status, 0);
assert.match(result.stdout, /NATIVE_NPC_RESULT.*"failures":\[\]/);
console.log('PASS: native NPC proximity, interact input, dialogue, identity and pause lifecycle');
