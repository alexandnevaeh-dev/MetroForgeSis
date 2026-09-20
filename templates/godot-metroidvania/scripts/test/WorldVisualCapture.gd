extends Node
## Automated World.tscn visual capture. This is not a human playthrough and not VisualPolishSlice.
## Force-loads representative rooms for biome/water/parallax stills after physics has run.
##
## Bypass / teleport methods used here (NOT end-to-end traversal evidence):
##   _load_room() via WorldManager — jumps to a room without walking a door
##   player.global_position = water... — teleports the courier into the pool (no swim grant)
##   DialogueOverlay.start_dialogue() — opens quest text without NPC interact
##   PauseMenu._open() / sprite.play("telegraph"|"attack") — UI/anim methods, not combat input
## Input-driven sections: spawn move_right + attack only.
## Windowed Metal only. Dummy/headless launches refuse immediately.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/visual-polish/world"

var _checks: Array[Dictionary] = []
var _world: Node2D

func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(CaptureGuard.EXIT_DUMMY)
		return
	GameManager.start_new_game()
	await get_tree().process_frame
	var packed := load("res://scenes/world/World.tscn") as PackedScene
	_check("world_scene_loads", packed != null)
	if packed == null:
		_finish(1)
		return
	_world = packed.instantiate()
	add_child(_world)
	if not await CaptureGuard.await_physics_frames(self, 2, 3.0):
		get_tree().quit(CaptureGuard.EXIT_TIMEOUT)
		return
	await get_tree().create_timer(0.25).timeout
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	await _capture_live_spawn()
	await _capture_biomes_and_water()
	await _capture_ui()
	_finish(0 if _hard_failures() == 0 else 1)


func _capture_live_spawn() -> void:
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	_check("player_present", player != null)
	if player:
		var health := player.get_node_or_null("HealthComponent")
		if health:
			health.set("invulnerable", true)
		Input.action_press("move_right")
		for _i in 24:
			await get_tree().physics_frame
		await _shot("courier_run")
		Input.action_release("move_right")
		Input.action_press("attack")
		await get_tree().physics_frame
		Input.action_release("attack")
		for _j in 18:
			await get_tree().physics_frame
		await _shot("courier_attack")
	await _shot("hud_ingame")
	_note_parallax("spawn", true)


func _capture_biomes_and_water() -> void:
	var rooms := _rooms()
	var seen: Dictionary = {}
	var boss_id := ""
	for room_id in rooms.keys():
		var info: Dictionary = rooms[room_id]
		var biome := String(info.get("biomeId", "biome_0"))
		var arch := String(info.get("archetype", ""))
		if arch == "boss" or String(info.get("worldArchetype", "")) == "boss":
			boss_id = String(room_id)
		if seen.has(biome):
			continue
		seen[biome] = room_id
		await _load_room(String(room_id))
		await get_tree().physics_frame
		await get_tree().physics_frame
		await get_tree().create_timer(0.2).timeout
		await _shot("biome_%s" % biome)
		var skip_mid := arch == "tutorial"
		_note_parallax(biome, skip_mid)
		var room := _current_room()
		var water := _first_water(room)
		if biome.ends_with("_1") or biome == "biome_1":
			_check("flooded_room_has_water_zone", water != null)
			if water:
				await _shot("water_%s" % biome)
				await _swim_probe(water)
		var enemy := room.get_node_or_null("Enemy") if room else null
		if enemy:
			await _shot("enemy_%s" % biome)
		var npc := room.get_node_or_null("NPC") if room else null
		if npc:
			await _shot("npc_%s" % biome)
	_check("captured_three_biomes", seen.size() >= 3)
	for special in ["npc", "save", "ability_shrine", "ability_gate"]:
		for room_id in rooms.keys():
			var info: Dictionary = rooms[room_id]
			var arch := String(info.get("archetype", ""))
			var world_arch := String(info.get("worldArchetype", ""))
			if arch != special and world_arch != special:
				continue
			await _load_room(String(room_id))
			await get_tree().physics_frame
			await get_tree().create_timer(0.2).timeout
			await _shot("room_%s" % special)
			if special == "npc" or special == "ability_shrine":
				var npc := _current_room().get_node_or_null("NPC") if _current_room() else null
				if npc:
					_check("npc_present", true)
					await _shot("npc_in_world")
			if special == "save":
				var savep := false
				if _current_room():
					for child in _current_room().get_children():
						if String(child.name).begins_with("Save"):
							savep = true
				_check("save_point_present", savep)
			break
	if not boss_id.is_empty():
		await _load_room(boss_id)
		await get_tree().physics_frame
		await get_tree().create_timer(0.35).timeout
		await _shot("boss_room")
		var boss := _current_room().get_node_or_null("Boss") if _current_room() else null
		if boss:
			var sprite := boss.get_node_or_null("Sprite") as AnimatedSprite2D
			if sprite and sprite.sprite_frames:
				if sprite.sprite_frames.has_animation("telegraph"):
					sprite.play("telegraph")
					await get_tree().create_timer(0.25).timeout
					await _shot("boss_telegraph")
				if sprite.sprite_frames.has_animation("attack"):
					sprite.play("attack")
					await get_tree().create_timer(0.25).timeout
					await _shot("boss_strike")
		var bolt_scene := load("res://scenes/enemies/Projectile.tscn") as PackedScene
		if bolt_scene and _current_room():
			var bolt := bolt_scene.instantiate()
			_current_room().add_child(bolt)
			var player := get_tree().get_first_node_in_group("player") as Node2D
			if player:
				bolt.global_position = player.global_position + Vector2(80, -28)
			bolt.set("direction", Vector2.RIGHT)
			bolt.set("speed", 220.0)
			await get_tree().create_timer(0.12).timeout
			await _shot("projectile_trail")


func _swim_probe(water: Node2D) -> void:
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	if player == null:
		return
	_note_bypass("swim_probe", "player.global_position into WaterZone — volume check only; this slice has no swim pickup")
	player.global_position = water.global_position + Vector2(0, 40)
	for _i in 20:
		await get_tree().physics_frame
	var controller := player.get_node_or_null("AbilityController")
	_check("water_volume_marks_player_in_water", controller != null and bool(controller.in_water))
	await _shot("water_in_volume_no_swim_unlock")


func _capture_ui() -> void:
	var pause := _world.get_node_or_null("PauseMenu")
	if pause and pause.has_method("_open"):
		pause.call("_open")
		await get_tree().process_frame
		await _shot("pause_menu")
		if pause.has_method("_close"):
			pause.call("_close")
	var overlay := get_tree().get_first_node_in_group("dialogue_overlay")
	if overlay and overlay.has_method("start_dialogue"):
		overlay.call("start_dialogue", "quest_000_offer", "Quen Isley", {"role": "quest_giver"})
		await get_tree().process_frame
		await get_tree().process_frame
		await _shot("npc_dialogue")
		if overlay.has_method("close_dialogue"):
			overlay.call("close_dialogue")
	var hud := _world.get_node_or_null("GameHUD/HUD/MarginContainer/VBox/AbilityLabel") as Label
	_check("hud_ability_label_not_stray_dash", hud == null or hud.text != "dash" or not hud.visible)


func _note_bypass(name: String, detail: String) -> void:
	print("CAPTURE_METHOD [LABELED_TELEPORT] %s: %s" % [name, detail])
	_checks.append({"name": "method_labeled_teleport_%s" % name, "passed": true})


func _note_parallax(tag: String, skip_mid: bool = false) -> void:
	var room := _current_room()
	if room == null:
		_check("parallax_%s_room" % tag, false)
		return
	var mid := room.get_node_or_null("ParallaxMid")
	if mid == null:
		mid = room.get_node_or_null("QualityParallaxMid")
	var near := room.get_node_or_null("ParallaxNear")
	if near == null:
		near = room.get_node_or_null("QualityParallaxNear")
	_check("parallax_mid_%s" % tag, skip_mid or (mid != null and (mid as CanvasItem).visible))
	_check("parallax_near_%s" % tag, near != null and (near as CanvasItem).visible)
	if not skip_mid and mid is Parallax2D:
		_check("parallax_mid_scroll_%s" % tag, (mid as Parallax2D).scroll_scale.x > 0.0 and (mid as Parallax2D).scroll_scale.x < 1.0)


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
		if not c.passed:
			n += 1
	return n


func _finish(code: int) -> void:
	print("WORLD_CAPTURE_RESULTS_BEGIN")
	for c in _checks:
		print("%s: %s" % ["PASS" if c.passed else "FAIL", c.name])
	print("WORLD_CAPTURE_RESULTS_END")
	print("WORLD_CAPTURE_DIR: %s" % ProjectSettings.globalize_path(QA))
	get_tree().quit(code)
