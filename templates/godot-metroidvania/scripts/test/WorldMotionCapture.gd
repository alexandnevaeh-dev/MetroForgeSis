extends Node
## World motion + input capture. Normal-speed recordings, not stills-only.
##
## INPUT sections walk/attack/interact using Input.action_press. They do not teleport.
## Motion clips sample every _process frame at 960×540 nearest (display rate, not ~15 fps).
## LABELED sections call WorldManager._load_room to reach later rooms. Those are not
## end-to-end traversal evidence. This scene is not a Playtest harness, so room fades run.
## Steady frame timing lives in WorldPerfCapture — PNG encode is kept off those intervals.
## Dash-gate traversal evidence remains PlaytestRunner.
## Windowed Metal only. Dummy/headless launches refuse immediately.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/visual-polish/world"
const MOTION := "res://qa/visual-polish/world/motion"

var _checks: Array[Dictionary] = []
var _world: Node2D
var _recording_clip: String = ""
var _clip_saved: int = 0
var _clip_max: int = 96
var _clip_frames: Array[Image] = []
var _hardware: Dictionary = {}

func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(CaptureGuard.EXIT_DUMMY)
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	_hardware = {
		"os": OS.get_name(),
		"processor": OS.get_processor_name(),
		"adapter": RenderingServer.get_video_adapter_name(),
		"adapter_vendor": RenderingServer.get_video_adapter_vendor(),
		"vsync": DisplayServer.window_get_vsync_mode(),
		"headless": DisplayServer.get_name() == "headless",
	}
	GameManager.start_new_game()
	await get_tree().process_frame
	var packed := load("res://scenes/world/World.tscn") as PackedScene
	_check("world_scene_loads", packed != null)
	if packed == null:
		_finish(1)
		return
	_world = packed.instantiate()
	add_child(_world)
	await get_tree().physics_frame
	await get_tree().physics_frame
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(MOTION))
	await _input_spawn_motion()
	await _input_door_if_present()
	await _labeled_shrine_and_npc()
	await _labeled_swim_walk_in()
	await _labeled_enemy_biome_stills()
	_finish(0 if _hard_failures() == 0 else 1)


func _process(_delta: float) -> void:
	if _recording_clip == "" or _clip_frames.size() >= _clip_max:
		return
	if CaptureGuard.is_dummy_renderer():
		return
	var img := get_viewport().get_texture().get_image()
	if img == null or img.is_empty():
		return
	img.convert(Image.FORMAT_RGBA8)
	img.resize(960, 540, Image.INTERPOLATE_NEAREST)
	_clip_frames.append(img)


func _input_spawn_motion() -> void:
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	_check("player_present", player != null)
	if player == null:
		return
	var health := player.get_node_or_null("HealthComponent")
	if health:
		health.set("invulnerable", true)
	_note_method("INPUT", "spawn_run", "Input.action_press move_right")
	await _record_clip("courier_run", func():
		Input.action_press("move_right")
		for _i in 36:
			await get_tree().physics_frame
		Input.action_release("move_right")
	)
	await _shot("courier_run_end")
	_note_method("INPUT", "spawn_attack", "Input.action_press attack")
	await _record_clip("courier_attack", func():
		Input.action_press("attack")
		await get_tree().physics_frame
		Input.action_release("attack")
		for _j in 28:
			await get_tree().physics_frame
	)
	await _shot("courier_attack_recovery")
	var enemy := _current_room().get_node_or_null("Enemy") if _current_room() else null
	if enemy:
		_note_method("INPUT", "spawn_enemy_patrol", "wait while enemy walk plays; no teleport")
		await _record_clip("enemy_000_patrol", func():
			for _k in 40:
				await get_tree().physics_frame
		)


func _input_door_if_present() -> void:
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	if player == null or _current_room() == null:
		return
	var door: Node2D = null
	for node in get_tree().get_nodes_in_group("room_transition"):
		if _current_room().is_ancestor_of(node) and node is Node2D:
			door = node
			break
	if door == null:
		_note_method("INPUT", "camera_transition", "no door in spawn room — skipped")
		return
	var before_room := String(GameManager.current_room_id)
	var cam := player.get_node_or_null("Camera2D") as Camera2D
	var cam_before := cam.global_position if cam else Vector2.ZERO
	var door_x := door.global_position.x
	_note_method("INPUT", "camera_transition", "walk into RoomTransition with fade enabled; WorldMotionCapture is not a Playtest harness")
	var start_x := player.global_position.x
	var last_x := start_x
	var stuck := 0
	Input.action_press("move_right")
	for i in 280:
		await get_tree().physics_frame
		if String(GameManager.current_room_id) != before_room:
			break
		if not is_instance_valid(player):
			player = get_tree().get_first_node_in_group("player") as CharacterBody2D
			if player == null:
				break
		var x_now := player.global_position.x
		if abs(x_now - last_x) < 0.5:
			stuck += 1
			if stuck == 20:
				print("DOOR_DIAG stuck at x=%.1f door_x=%.1f frame=%d — jump" % [x_now, door_x, i])
				Input.action_press("jump")
			elif stuck == 22:
				Input.action_release("jump")
		else:
			stuck = 0
		last_x = x_now
	Input.action_release("move_right")
	Input.action_release("jump")
	# Let the 0.15s fade complete instead of shooting mid-transition.
	for _wait in 24:
		await get_tree().physics_frame
	player = get_tree().get_first_node_in_group("player") as CharacterBody2D
	cam = player.get_node_or_null("Camera2D") as Camera2D if player else null
	var changed := String(GameManager.current_room_id) != before_room
	var end_x := player.global_position.x if player else last_x
	print("DOOR_DIAG start_x=%.1f end_x=%.1f door_x=%.1f before=%s after=%s changed=%s" % [
		start_x, end_x, door_x, before_room, GameManager.current_room_id, changed
	])
	_check("input_door_changed_room", changed)
	if cam:
		_check("camera_moved_after_door", cam.global_position.distance_to(cam_before) > 1.0 or changed)
	await _shot("camera_after_door")


func _labeled_shrine_and_npc() -> void:
	var rooms := _rooms()
	var shrine_id := ""
	var npc_id := ""
	for room_id in rooms.keys():
		var info: Dictionary = rooms[room_id]
		var arch := String(info.get("archetype", ""))
		var world_arch := String(info.get("worldArchetype", ""))
		if shrine_id == "" and (arch == "ability_shrine" or world_arch == "ability_shrine"):
			shrine_id = String(room_id)
		if npc_id == "" and (arch == "npc" or world_arch == "npc"):
			npc_id = String(room_id)
	if shrine_id != "":
		_note_method("LABELED_TELEPORT", "shrine_room", "WorldManager._load_room(%s) then walk into AbilityPickup" % shrine_id)
		await _load_room(shrine_id)
		var had_dash := GameManager.has_ability("dash")
		Input.action_press("move_right")
		for _i in 80:
			await get_tree().physics_frame
			if GameManager.has_ability("dash") and not had_dash:
				break
		Input.action_release("move_right")
		_check("shrine_pickup_via_overlap_after_room_load", GameManager.has_ability("dash") or had_dash)
		await _shot("shrine_after_walk")
	# This slice places the quest NPC on the shrine (room_006), not the empty npc archetype room.
	_note_method("LABELED_TELEPORT", "npc_interact", "stay in shrine / load NPC room then Input interact")
	var npc := _find_npc(_current_room())
	if npc == null and shrine_id != "":
		await _load_room(shrine_id)
		npc = _find_npc(_current_room())
	if npc == null and npc_id != "":
		await _load_room(npc_id)
		npc = _find_npc(_current_room())
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	_check("npc_present_for_interact", npc != null)
	if npc and player:
		await _walk_toward(player, npc, 36.0, 220)
		for _settle in 4:
			await get_tree().physics_frame
		print("NPC_DIAG dist=%.1f in_range=%s prompt=%s" % [
			player.global_position.distance_to(npc.global_position),
			str(npc.get("_player_in_range")),
			str(npc.get_node_or_null("PromptLabel") != null and bool(npc.get_node("PromptLabel").visible)),
		])
		await _shot("shrine_prompt")
		await _record_clip("npc_interact_cycle", func():
			Input.action_press("interact")
			await get_tree().process_frame
			await get_tree().physics_frame
			Input.action_release("interact")
			for _hold in 18:
				await get_tree().process_frame
		)
		var overlay := get_tree().get_first_node_in_group("dialogue_overlay")
		var speaker := ""
		var prompt_during := true
		if npc.get_node_or_null("PromptLabel"):
			prompt_during = bool(npc.get_node("PromptLabel").visible)
		if overlay:
			var label := overlay.get_node_or_null("Panel/HBox/Content/SpeakerLabel") as Label
			if label:
				speaker = label.text
		print("NPC_DIAG overlay_visible=%s speaker=%s prompt_during_dialogue=%s" % [
			str(overlay != null and bool(overlay.get("visible"))),
			speaker,
			str(prompt_during),
		])
		_check("npc_interact_opens_dialogue", overlay != null and bool(overlay.get("visible")) and speaker.length() > 0)
		_check("npc_prompt_hidden_during_dialogue", overlay != null and bool(overlay.get("visible")) and not prompt_during)
		await _shot("npc_interact_input")
		if overlay and overlay.has_method("close_dialogue"):
			overlay.call("close_dialogue")
		await get_tree().physics_frame
		await get_tree().physics_frame
		await get_tree().process_frame
		var prompt_after := npc.get_node_or_null("PromptLabel") != null and bool(npc.get_node("PromptLabel").visible)
		print("NPC_DIAG prompt_after_close=%s overlay=%s" % [
			str(prompt_after),
			str(overlay != null and bool(overlay.get("visible"))),
		])
		_check("npc_prompt_restored_after_dialogue", prompt_after)
		await _shot("npc_after_dialogue")


func _labeled_swim_walk_in() -> void:
	var rooms := _rooms()
	var water_id := ""
	for room_id in rooms.keys():
		var info: Dictionary = rooms[room_id]
		if String(info.get("biomeId", "")).ends_with("_1") or String(info.get("biomeId", "")) == "biome_1":
			water_id = String(room_id)
			break
	var swim_pickup := _find_swim_pickup()
	_note_method(
		"FINDING",
		"swim_pickup",
		"AbilityPickup ability_id=swim present=%s — VISUAL_VERTICAL_SLICE DNA lists dash only" % str(swim_pickup != null)
	)
	if water_id == "":
		return
	_note_method("LABELED_TELEPORT", "swim_room", "WorldManager._load_room(%s); player walks into WaterZone — no swim grant" % water_id)
	await _load_room(water_id)
	var water := _first_water(_current_room())
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	_check("flooded_room_has_water_zone", water != null)
	if water == null or player == null:
		return
	var toward := signf(water.global_position.x - player.global_position.x)
	if toward < 0.0:
		Input.action_press("move_left")
	else:
		Input.action_press("move_right")
	Input.action_press("move_down")
	await _record_clip("water_walk_in_no_swim_unlock", func():
		for _i in 50:
			await get_tree().physics_frame
	)
	Input.action_release("move_left")
	Input.action_release("move_right")
	Input.action_release("move_down")
	var controller := player.get_node_or_null("AbilityController")
	_check("walked_into_water_marks_in_water", controller != null and bool(controller.in_water))
	_check("swim_mode_stays_off_without_pickup", controller == null or not bool(controller.swim_mode))
	await _shot("water_in_volume_no_swim_unlock")


func _labeled_enemy_biome_stills() -> void:
	var rooms := _rooms()
	var seen: Dictionary = {}
	for room_id in rooms.keys():
		var info: Dictionary = rooms[room_id]
		var biome := String(info.get("biomeId", "biome_0"))
		if seen.has(biome):
			continue
		await _load_room(String(room_id))
		var room := _current_room()
		var enemy := room.get_node_or_null("Enemy") if room else null
		if enemy == null:
			continue
		seen[biome] = room_id
		_note_method("LABELED_TELEPORT", "enemy_%s" % biome, "WorldManager._load_room(%s) then walk until enemy is on camera" % room_id)
		var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
		await _walk_toward(player, enemy as Node2D, 88.0, 240)
		if enemy:
			var es := enemy.get_node_or_null("Sprite") as AnimatedSprite2D
			if es and es.sprite_frames and es.sprite_frames.has_animation("attack"):
				es.speed_scale = 1.0
				es.play("attack")
			await _record_clip("enemy_%s_walk" % biome, func():
				for _i in 36:
					await get_tree().physics_frame
			)
			await _shot("enemy_%s" % biome)
		await _shot("biome_%s_dressed" % biome)
	# Biome 1 (flood) has no generated Enemy on this slice. Lighting probe only.
	if not seen.has("biome_1"):
		var flood_id := ""
		for room_id in rooms.keys():
			var info: Dictionary = rooms[room_id]
			if String(info.get("biomeId", "")).ends_with("_1"):
				flood_id = String(room_id)
				break
		if flood_id != "":
			_note_method("LABELED_INSTANCE", "enemy_biome_1", "no generated Enemy in flood rooms; instance Enemy.tscn on floor for lighting readability")
			await _load_room(flood_id)
			var room := _current_room()
			var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
			var packed := load("res://scenes/enemies/Enemy.tscn") as PackedScene
			if room and player and packed:
				var probe := packed.instantiate() as Node2D
				probe.name = "EnemyLightingProbe"
				probe.position = Vector2(player.position.x + 96.0, player.position.y)
				room.add_child(probe)
				await get_tree().physics_frame
				await get_tree().physics_frame
				var es := probe.get_node_or_null("Sprite") as AnimatedSprite2D
				if es and es.sprite_frames and es.sprite_frames.has_animation("attack"):
					es.speed_scale = 1.0
					es.play("attack")
				await _record_clip("enemy_biome_1_walk", func():
					for _i in 36:
						await get_tree().physics_frame
				)
				await _shot("enemy_biome_1")
				probe.queue_free()
	var boss_id := ""
	for room_id in rooms.keys():
		var info: Dictionary = rooms[room_id]
		if String(info.get("archetype", "")) == "boss" or String(info.get("worldArchetype", "")) == "boss":
			boss_id = String(room_id)
			break
	if boss_id != "":
		_note_method("LABELED_TELEPORT", "boss_combat_cycle", "WorldManager._load_room(%s); idle then live telegraph/strike, then labeled projectile/burst/hurt/death" % boss_id)
		await _load_room(boss_id)
		await get_tree().create_timer(0.35).timeout
		await _record_clip("boss_idle", func():
			for _i in 36:
				await get_tree().physics_frame
		)
		await _shot("boss_room")
		var boss := _current_room().get_node_or_null("Boss") if _current_room() else null
		if boss:
			for _wait in 90:
				await get_tree().physics_frame
				if bool(boss.get("_telegraph_active")):
					break
			await _record_clip("boss_telegraph", func():
				for _i in 28:
					await get_tree().physics_frame
			)
			await _shot("boss_telegraph")
			for _wait2 in 40:
				await get_tree().physics_frame
				var spr := boss.get_node_or_null("Sprite") as AnimatedSprite2D
				if spr and String(spr.animation).begins_with("attack"):
					break
			await _record_clip("boss_strike", func():
				for _i in 24:
					await get_tree().physics_frame
			)
			await _shot("boss_strike")
			if boss.has_method("freeze_presentation"):
				boss.freeze_presentation()
			var sprite := boss.get_node_or_null("Sprite") as AnimatedSprite2D
			if sprite and sprite.sprite_frames:
				if sprite.sprite_frames.has_animation("attack_projectile") and boss.has_method("_fire_projectile_attack"):
					sprite.play("attack_projectile")
					boss.call("_fire_projectile_attack")
					await _record_clip("boss_projectile", func():
						for _i in 24:
							await get_tree().physics_frame
					)
					await _shot("boss_projectile")
				if sprite.sprite_frames.has_animation("attack_burst") and boss.has_method("_fire_burst_attack"):
					sprite.play("attack_burst")
					boss.call("_fire_burst_attack")
					await _record_clip("boss_burst", func():
						for _i in 24:
							await get_tree().physics_frame
					)
					await _shot("boss_burst")
			if boss.has_method("_on_hit_received"):
				boss.call("_on_hit_received", 8.0, Vector2(-80, 0))
				await _record_clip("boss_hurt", func():
					for _i in 16:
						await get_tree().physics_frame
				)
				await _shot("boss_hurt")
			var health := boss.get_node_or_null("HealthComponent")
			if health and health.has_method("take_damage"):
				health.call("take_damage", 10000.0)
				await _record_clip("boss_death", func():
					for _i in 36:
						await get_tree().physics_frame
						if not is_instance_valid(boss):
							break
				)
				await _shot("boss_death")


func _walk_toward(player: CharacterBody2D, target: Node2D, stop_dist: float, max_frames: int) -> void:
	if player == null or target == null:
		return
	var toward := signf(target.global_position.x - player.global_position.x)
	if toward < 0.0:
		Input.action_press("move_left")
	else:
		Input.action_press("move_right")
	for _i in max_frames:
		await get_tree().physics_frame
		if not is_instance_valid(player) or not is_instance_valid(target):
			break
		if player.global_position.distance_to(target.global_position) <= stop_dist:
			break
	Input.action_release("move_left")
	Input.action_release("move_right")


func _record_clip(name: String, work: Callable) -> void:
	_recording_clip = name
	_clip_frames.clear()
	await work.call()
	_recording_clip = ""
	var dir := "%s/%s" % [MOTION, name]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var saved := 0
	for i in _clip_frames.size():
		var img: Image = _clip_frames[i]
		img.save_png(ProjectSettings.globalize_path("%s/f%03d.png" % [dir, i]))
		saved += 1
	_clip_frames.clear()
	var meta := {
		"clip": name,
		"frames_saved": saved,
		"max_frames": _clip_max,
		"size": "960x540",
		"filter": "nearest",
		"method": "every _process frame buffered, PNG written after clip (display rate; encode off the sample)",
		"hardware": _hardware,
	}
	var path := ProjectSettings.globalize_path("%s/%s/meta.json" % [MOTION, name])
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(meta, "  "))
		file.close()
	print("MOTION_CLIP: %s frames_saved=%d method=process_png_display_rate_960x540" % [name, saved])


func _find_swim_pickup() -> Node:
	return _find_ability_id(get_tree().root, "swim")


func _find_ability_id(n: Node, id: String) -> Node:
	var v = n.get("ability_id")
	if typeof(v) == TYPE_STRING and String(v) == id:
		return n
	for child in n.get_children():
		var found := _find_ability_id(child, id)
		if found:
			return found
	return null


func _find_npc(room: Node) -> Node2D:
	if room == null:
		return null
	var named := room.get_node_or_null("NPC")
	if named is Node2D:
		return named
	for child in room.get_children():
		if String(child.name).begins_with("NPC") and child is Node2D:
			return child
	return null


func _note_method(kind: String, name: String, detail: String) -> void:
	print("CAPTURE_METHOD [%s] %s: %s" % [kind, name, detail])
	_checks.append({"name": "method_%s_%s" % [kind.to_lower(), name], "passed": true})


func _rooms() -> Dictionary:
	var path := "res://data/rooms/rooms.json"
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed.get("rooms", {})


func _load_room(room_id: String) -> void:
	if _world and _world.has_method("_load_room"):
		await _world._load_room(room_id, "left")
	await get_tree().physics_frame
	await get_tree().physics_frame


func _current_room() -> Node2D:
	if _world == null:
		return null
	return _world.get("_current_room") as Node2D


func _first_water(room: Node) -> Node2D:
	if room == null:
		return null
	for child in room.get_children():
		if child is Area2D and child.is_in_group("water_zone"):
			return child
	return null


func _shot(name: String) -> void:
	if not await CaptureGuard.await_frames(self, 2, 2.0):
		_check("screenshot_wait_%s" % name, false)
		return
	var tex := get_viewport().get_texture()
	if tex == null:
		print("CAPTURE_EMPTY_FRAMEBUFFER shot=%s texture=null" % name)
		_check("screenshot_%s" % name, false)
		return
	var img := tex.get_image()
	if img and not img.is_empty():
		img.save_png(ProjectSettings.globalize_path("%s/%s.png" % [QA, name]))
	else:
		print("CAPTURE_EMPTY_FRAMEBUFFER shot=%s" % name)
		_check("screenshot_%s" % name, false)


func _check(name: String, ok: bool) -> void:
	_checks.append({"name": name, "passed": ok})
	print("%s: %s" % ["PASS" if ok else "FAIL", name])


func _hard_failures() -> int:
	var n := 0
	for c in _checks:
		if not c.passed and not String(c.name).begins_with("method_"):
			n += 1
	return n


func _finish(code: int) -> void:
	print("WORLD_MOTION_RESULTS_BEGIN")
	for c in _checks:
		print("%s: %s" % ["PASS" if c.passed else "FAIL", c.name])
	print("WORLD_MOTION_RESULTS_END")
	get_tree().quit(code)
