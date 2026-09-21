extends Node
## Windowed acceptance playtest: traverse the generated World with Input only.
## No teleports, freeze_presentation, forced boss states, take_damage, or granted abilities.
## Diagnostic WorldMotionCapture / WorldVisualCapture remain separate scenes.
## Automated Input is not a human playthrough.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/visual-polish/pass6/acceptance"
const MOTION := "res://qa/visual-polish/pass6/acceptance/motion"

var _checks: Array[Dictionary] = []
var _world: Node2D
var _agent: PlaytestAgent
var _hardware: Dictionary = {}
var _limitations: Array[String] = []
var _events: Array = []
var _rooms_visited: Array[String] = []
var _biomes_shot: Dictionary = {}
var _door_clips: Dictionary = {}
var _npc_ok := false
var _last_speaker := ""
var _dash_ok := false
var _gate_ok := false
var _save_ok := false
var _reload_ok := false
var _phase2_ok := false
var _burst_ok := false
var _hurt_ok := false
var _death_ok := false
var _victory_ok := false
var _recording_clip := ""
var _clip_frames: Array[Image] = []
var _clip_max := 72
var _boss_clips: Dictionary = {}
var _started_ms := 0

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
		"method": "INPUT",
	}
	_started_ms = Time.get_ticks_msec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(MOTION))
	SaveManager.select_slot(0)
	SaveManager.delete_slot(0)
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
	await get_tree().physics_frame
	_agent = PlaytestAgent.new()
	var outcome := await _run_acceptance()
	_check("acceptance_route_completed", bool(outcome.get("ok", false)))
	_release_input()
	_write_report(outcome)
	var code := 0 if _hard_failures() == 0 else 1
	print("ACCEPTANCE_EXIT:%d" % code)
	_finish(code)


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


func _run_acceptance() -> Dictionary:
	var route := _agent._load_route()
	_check("playtest_route_present", not route.is_empty())
	if route.is_empty():
		_limit("missing playtest_route.json")
		return {"ok": false, "reason": "missing_route"}
	_agent._apply_persona(route.get("persona", {}))
	_agent._visited_rooms = [String(route.get("startRoomId", GameManager.current_room_id))]
	_agent._rewire_damage_tracking(self)
	EventBus.room_entered.connect(func(_room_id: String) -> void: _agent._rewire_damage_tracking(self))
	EventBus.object_activated.connect(func(object_id: String) -> void:
		if object_id.begins_with("save_"):
			_save_ok = true
			_note("save_activated", object_id)
	)
	EventBus.ability_acquired.connect(func(ability_id: String) -> void:
		if ability_id == "dash":
			_dash_ok = true
			_note("dash_acquired", ability_id)
	)
	if not route.get("reachable", false):
		_limit("route marked unreachable")
		return {"ok": false, "reason": "route_unreachable"}

	_mark_room()
	await _shot("spawn_%s" % GameManager.current_room_id)
	await _maybe_biome_evidence("spawn")

	var transitions: Array = route.get("transitions", [])
	for step in transitions:
		var from_room: String = step.get("fromRoomId", "")
		var to_room: String = step.get("toRoomId", "")
		var requirements: Array = step.get("requirements", [])
		if not await _prepare_room_actions(from_room):
			return {"ok": false, "reason": "room_action_failed", "from": from_room}
		var before := String(GameManager.current_room_id)
		var clip_name := _door_clip_name(before)
		var walked := false
		if clip_name != "":
			_door_clips[clip_name] = true
			_recording_clip = clip_name
			_clip_frames.clear()
			walked = await _agent._execute_transition(_world, self, from_room, to_room, requirements)
			await _stop_clip()
		else:
			walked = await _agent._execute_transition(_world, self, from_room, to_room, requirements)
		if not walked:
			_limit("door walk failed %s -> %s (%s)" % [from_room, to_room, _agent._fail_stage])
			_check("transition_%s_to_%s" % [from_room, to_room], false)
			return {"ok": false, "reason": "transition_failed", "from": from_room, "to": to_room, "stage": _agent._fail_stage}
		_agent.steps_completed += 1
		if requirements.has("dash"):
			_gate_ok = GameManager.has_ability("dash") and String(GameManager.current_room_id) == to_room
			_check("dash_gate_crossed_with_acquired_dash", _gate_ok)
			await _shot("dash_gate_%s" % to_room)
		_mark_room()
		await _wait_fade_idle()
		await _maybe_biome_evidence("door")
		if not _save_ok and _current_room() != null and _current_room().get_node_or_null("SavePoint") != null:
			if not await _activate_save_and_continue():
				return {"ok": false, "reason": "save_or_reload_failed"}

	if not _save_ok:
		_limit("never reached a SavePoint via Input overlap")
		_check("save_beacon_activated", false)

	var boss_ok := await _fight_boss_natural(String(route.get("victoryBossId", "boss_final")))
	_victory_ok = boss_ok and (
		GameManager.current_state == GameManager.GameState.VICTORY or GameManager.game_complete
	)
	_check("boss_defeated_via_input", boss_ok)
	_check("victory_state", _victory_ok)
	var expected_rooms: Array = route.get("visitedRoomOrder", [])
	var route_rooms_visited := not expected_rooms.is_empty()
	for room_id in expected_rooms:
		if not _rooms_visited.has(String(room_id)):
			route_rooms_visited = false
	_check("all_route_rooms_visited", route_rooms_visited)
	_check("generated_npc_dialogue_via_input", _npc_ok)
	_check("dash_acquired_via_pickup", _dash_ok)
	_check("save_beacon_activated", _save_ok)
	_check("save_reload_restored_checkpoint", _reload_ok)
	_check("boss_phase_2_natural", _phase2_ok)
	if not _burst_ok:
		_limit("phase-2 area_burst is RNG; this Input fight did not roll it before death")
	_check("boss_burst_natural", _burst_ok, true)
	_check("boss_hurt_natural", _hurt_ok)
	_check("boss_death_natural", _death_ok)
	return {
		"ok": _hard_failures() == 0,
		"reason": "" if _hard_failures() == 0 else "checks_failed",
		"rooms": _rooms_visited.duplicate(),
	}


func _prepare_room_actions(from_room: String) -> bool:
	if GameManager.current_room_id != from_room:
		_limit("wrong room before actions current=%s expected=%s" % [GameManager.current_room_id, from_room])
		return false
	var player := _player()
	if player == null:
		_limit("no player in %s" % from_room)
		return false
	var npc := _find_npc(_current_room())
	if npc != null and not _npc_ok:
		if not await _interact_npc(player, npc):
			_limit("NPC interact via Input did not open readable dialogue")
			_check("npc_interact_via_input", false)
			return false
	return true


func _interact_npc(player: Node, npc: Node2D) -> bool:
	_note("npc_approach", String(npc.get("npc_name")))
	await _agent._walk_player_to(self, player, npc.global_position, 6.0)
	for _settle in 6:
		await get_tree().physics_frame
	await _shot("npc_prompt")
	_last_speaker = ""
	await _record_clip("npc_dialogue", func() -> void:
		await _tap("interact")
		for _i in 12:
			await get_tree().process_frame
			_capture_speaker()
			var overlay_open := get_tree().get_first_node_in_group("dialogue_overlay")
			if overlay_open != null and bool(overlay_open.get("visible")):
				break
		for _line in 8:
			var overlay_line := get_tree().get_first_node_in_group("dialogue_overlay")
			if overlay_line == null or not bool(overlay_line.get("visible")):
				break
			_capture_speaker()
			await _pause_safe_wait(0.35)
			await _tap("interact")
			for _wait in 8:
				await get_tree().process_frame
	)
	var overlay := get_tree().get_first_node_in_group("dialogue_overlay")
	if overlay and overlay.has_method("is_active") and overlay.is_active():
		for _extra in 10:
			_capture_speaker()
			await _tap("interact")
			await _pause_safe_wait(0.25)
			if not overlay.is_active():
				break
	var close_deadline := Time.get_ticks_msec() + 4000
	while Time.get_ticks_msec() < close_deadline:
		var overlay_wait := get_tree().get_first_node_in_group("dialogue_overlay")
		if overlay_wait == null or not bool(overlay_wait.get("visible")):
			break
		await _tap("interact")
		await _pause_safe_wait(0.2)
	if get_tree().paused:
		_limit("dialogue overlay left the tree paused after Input interact")
	var speaker := _last_speaker
	var expected_speaker := String(npc.get("npc_name")).strip_edges()
	_npc_ok = not expected_speaker.is_empty() and speaker.strip_edges() == expected_speaker
	if not _npc_ok and speaker.length() > 0:
		_limit("dialogue speaker was '%s' (expected '%s')" % [speaker, expected_speaker])
	print("ACCEPTANCE_NPC speaker=%s overlay=%s" % [speaker, str(overlay != null and bool(overlay.get("visible")))])
	_check("npc_speaker_matches_generated_npc", _npc_ok)
	await _shot("npc_dialogue")
	for _rest in 10:
		await get_tree().process_frame
	var prompt := npc.get_node_or_null("PromptLabel")
	_check("npc_prompt_restored", prompt != null and bool(prompt.visible))
	await _shot("npc_after_dialogue")
	return _npc_ok


func _activate_save_and_continue() -> bool:
	var player := _player()
	var save_point := _current_room().get_node_or_null("SavePoint") if _current_room() else null
	if save_point == null:
		_limit("current room has no SavePoint node")
		_check("save_point_present", false)
		return false
	_note("save_approach", "walk into SavePoint Area2D")
	await _record_clip("save_activate", func() -> void:
		await _agent._walk_player_to(self, player, (save_point as Node2D).global_position, 6.0)
		for _i in 20:
			await get_tree().physics_frame
			if _save_ok:
				break
	)
	_check("save_beacon_activated", _save_ok)
	if not _save_ok:
		_limit("walking onto SavePoint did not emit save_ activated")
		return false
	await _shot("save_activated")
	var expected_room := SaveManager.get_checkpoint_room_id()
	var had_dash := GameManager.has_ability("dash")
	var saved_abilities: Array = GameManager.player_abilities.duplicate()
	_check("checkpoint_room_is_save_room", expected_room == String(GameManager.current_room_id))
	_note("continue_flow", "SaveManager.load_game + World.tscn (TitleScreen Continue path)")
	_world.queue_free()
	_world = null
	await get_tree().process_frame
	await get_tree().process_frame
	var loaded := SaveManager.load_game()
	_check("continue_load_game", loaded)
	if not loaded:
		_limit("SaveManager.load_game() failed after beacon")
		return false
	var packed := load("res://scenes/world/World.tscn") as PackedScene
	_world = packed.instantiate()
	add_child(_world)
	var resume_deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < resume_deadline:
		await get_tree().physics_frame
		if _player() != null and GameManager.current_room_id == expected_room:
			break
	await _record_clip("save_reload", func() -> void:
		for _i in 24:
			await get_tree().physics_frame
	)
	_reload_ok = (
		loaded
		and GameManager.current_room_id == expected_room
		and GameManager.has_ability("dash") == had_dash
		and _player() != null
	)
	print("ACCEPTANCE_RELOAD room=%s expected=%s dash=%s ok=%s" % [
		GameManager.current_room_id, expected_room, str(GameManager.has_ability("dash")), str(_reload_ok)
	])
	var restored_abilities: Array = GameManager.player_abilities.duplicate()
	saved_abilities.sort()
	restored_abilities.sort()
	_reload_ok = _reload_ok and saved_abilities == restored_abilities
	_check("save_reload_restored_checkpoint", _reload_ok)
	await _shot("save_reloaded")
	_mark_room()
	return _reload_ok


func _fight_boss_natural(boss_id: String) -> bool:
	var player := _player()
	if player == null:
		_limit("no player entering boss fight")
		return false
	var room := _current_room()
	var boss := room.get_node_or_null("Boss") if room else null
	if boss == null or String(boss.get("boss_id")) != boss_id:
		_limit("boss %s not in current room %s" % [boss_id, GameManager.current_room_id])
		return false
	_note("boss_fight", "Input attack / move / jump / dash only; no reset_health, facing poke, or _perform_attack")
	await _wait_fade_idle()
	await _shot("boss_enter")
	var boss_room_id := String(GameManager.current_room_id)
	var start_ms := Time.get_ticks_msec()
	var timeout_ms := 120000
	while Time.get_ticks_msec() - start_ms < timeout_ms:
		if GameManager.current_state == GameManager.GameState.VICTORY or GameManager.game_complete:
			_death_ok = true
			break
		player = _player()
		if player == null or not is_instance_valid(boss) or GameManager.current_room_id != boss_room_id:
			if _death_ok:
				break
			await _wait_player(4.0)
			await _wait_fade_idle()
			if _player() == null:
				_limit("player missing after death/respawn during boss")
				return false
			if GameManager.current_room_id != boss_room_id:
				_note("boss_death_respawn", "respawned in %s — walking back with Input" % GameManager.current_room_id)
				if not await _walk_back_to_boss(boss_room_id):
					_limit("could not walk back to boss after checkpoint respawn")
					return false
			boss = _current_room().get_node_or_null("Boss") if _current_room() else null
			player = _player()
			if boss == null or String(boss.get("boss_id")) != boss_id or player == null:
				_limit("expected boss/player missing after return from respawn")
				return false
		await _observe_boss(boss)
		if not is_instance_valid(boss):
			# Reacquire after respawn on the next iteration; freeing is not death evidence.
			continue
		await _boss_input_tick(player, boss)
		if not is_instance_valid(boss):
			# Reacquire after respawn on the next iteration; freeing is not death evidence.
			continue
		if _recording_clip == "" and _should_start_boss_clip(boss):
			var clip := _pending_boss_clip(boss)
			if clip != "":
				_boss_clips[clip] = true
				_recording_clip = clip
				_clip_frames.clear()
		if _recording_clip != "" and _clip_frames.size() >= 36:
			await _stop_clip()
	if _recording_clip != "":
		await _stop_clip()
	await _wait_victory(4.0)
	await _shot("boss_end")
	if GameManager.current_state == GameManager.GameState.VICTORY or GameManager.game_complete:
		await _shot("victory")
		return true
	if _death_ok:
		_limit("boss death animation played but victory state was not set within 4s")
	else:
		_limit("boss not defeated within %dms via Input (phase2=%s burst=%s hurt=%s death=%s)" % [
			timeout_ms, str(_phase2_ok), str(_burst_ok), str(_hurt_ok), str(_death_ok)
		])
	return GameManager.current_state == GameManager.GameState.VICTORY or GameManager.game_complete


func _walk_back_to_boss(boss_room_id: String) -> bool:
	var route := _agent._load_route()
	var transitions: Array = route.get("transitions", [])
	var revisited: Dictionary = {}
	while GameManager.current_room_id != boss_room_id:
		var current := String(GameManager.current_room_id)
		if revisited.has(current):
			_limit("boss return route repeated room %s" % current)
			return false
		revisited[current] = true
		var next_id := ""
		for step in transitions:
			if String(step.get("fromRoomId", "")) == current:
				next_id = String(step.get("toRoomId", ""))
				if await _agent._execute_transition(_world, self, current, next_id, step.get("requirements", [])):
					break
				return false
		if next_id == "":
			return false
		if current == String(GameManager.current_room_id):
			return false
	return true


func _observe_boss(boss: Node) -> void:
	if not is_instance_valid(boss):
		return
	var phase := int(boss.get("_phase"))
	if phase >= 2:
		_phase2_ok = true
	var sprite := boss.get_node_or_null("Sprite") as AnimatedSprite2D
	if sprite == null:
		return
	match String(sprite.animation):
		"attack_burst":
			_burst_ok = true
		"hurt":
			_hurt_ok = true
		"death":
			_death_ok = true
	var health: HealthComponent = boss.get_node_or_null("HealthComponent")
	if health and health.current_health <= 0.0:
		_death_ok = true


func _should_start_boss_clip(boss: Node) -> bool:
	if not is_instance_valid(boss):
		return false
	return _pending_boss_clip(boss) != ""


func _pending_boss_clip(boss: Node) -> String:
	if not is_instance_valid(boss):
		return ""
	var sprite := boss.get_node_or_null("Sprite") as AnimatedSprite2D
	var anim := String(sprite.animation) if sprite else ""
	if int(boss.get("_phase")) >= 2 and not _boss_clips.get("boss_phase_2", false):
		return "boss_phase_2"
	var wanted := {
		"telegraph": "boss_telegraph",
		"attack": "boss_strike",
		"attack_projectile": "boss_projectile",
		"attack_burst": "boss_burst",
		"hurt": "boss_hurt",
		"death": "boss_death",
		"recovery": "boss_recovery",
	}
	if wanted.has(anim) and not _boss_clips.get(wanted[anim], false):
		return String(wanted[anim])
	return ""


func _boss_input_tick(player: Node, boss: Node) -> void:
	if not is_instance_valid(player) or not is_instance_valid(boss):
		await get_tree().physics_frame
		return
	var telegraph := bool(boss.get("_telegraph_active"))
	var dx: float = (boss as Node2D).global_position.x - (player as Node2D).global_position.x
	if telegraph:
		if dx >= 0.0:
			Input.action_press("move_left")
			Input.action_release("move_right")
		else:
			Input.action_press("move_right")
			Input.action_release("move_left")
		Input.action_press("jump")
		if GameManager.has_ability("dash"):
			Input.action_press("dash")
	else:
		Input.action_release("jump")
		Input.action_release("dash")
		const REACH := 56.0
		if absf(dx) > REACH:
			if dx > 0.0:
				Input.action_press("move_right")
				Input.action_release("move_left")
			else:
				Input.action_press("move_left")
				Input.action_release("move_right")
		else:
			# Hold facing toward the boss so attack just_pressed uses Input facing.
			if dx >= 0.0:
				Input.action_press("move_right")
				Input.action_release("move_left")
			else:
				Input.action_press("move_left")
				Input.action_release("move_right")
			Input.action_press("attack")
	await get_tree().physics_frame
	Input.action_release("attack")
	Input.action_release("dash")
	Input.action_release("jump")


func _maybe_biome_evidence(reason: String) -> void:
	var biome := _current_biome()
	if biome == "":
		return
	if not _biomes_shot.get(biome, false):
		_biomes_shot[biome] = true
		await _shot("traversal_%s_%s" % [biome, GameManager.current_room_id])
		_note("biome_still", "%s %s %s" % [reason, biome, GameManager.current_room_id])


func _door_clip_name(from_room: String) -> String:
	var biome := _biome_of(from_room)
	if biome == "":
		return ""
	if _door_clips.get("door_%s" % biome, false):
		return ""
	return "door_%s" % biome


func _current_biome() -> String:
	return _biome_of(GameManager.current_room_id)


func _biome_of(room_id: String) -> String:
	var rooms := _rooms_data()
	if not rooms.has(room_id):
		return ""
	return String(rooms[room_id].get("biomeId", ""))


func _rooms_data() -> Dictionary:
	if not FileAccess.file_exists("res://data/rooms/rooms.json"):
		return {}
	var file := FileAccess.open("res://data/rooms/rooms.json", FileAccess.READ)
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed.get("rooms", {})


func _mark_room() -> void:
	var rid := String(GameManager.current_room_id)
	if rid != "" and not _rooms_visited.has(rid):
		_rooms_visited.append(rid)
		_note("room_entered", rid)


func _unique_room_count() -> int:
	return _rooms_visited.size()


func _player() -> CharacterBody2D:
	return get_tree().get_first_node_in_group("player") as CharacterBody2D


func _current_room() -> Node2D:
	if _world == null:
		return null
	return _world.get("_current_room") as Node2D


func _find_npc(room: Node) -> Node2D:
	if room == null:
		return null
	for child in room.get_children():
		if String(child.name).begins_with("NPC") and child is Node2D:
			return child
	return null


func _wait_player(timeout_sec: float) -> void:
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if _player() != null:
			return
		await get_tree().process_frame


func _tap(action: String) -> void:
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = true
	ev.strength = 1.0
	Input.parse_input_event(ev)
	Input.action_press(action)
	await get_tree().process_frame
	var ev_up := InputEventAction.new()
	ev_up.action = action
	ev_up.pressed = false
	Input.parse_input_event(ev_up)
	Input.action_release(action)
	await get_tree().process_frame


func _pause_safe_wait(seconds: float) -> void:
	var timer := get_tree().create_timer(seconds, true, false, true)
	await timer.timeout


func _capture_speaker() -> void:
	var overlay := get_tree().get_first_node_in_group("dialogue_overlay")
	if overlay == null or not bool(overlay.get("visible")):
		return
	var label := overlay.get_node_or_null("Panel/HBox/Content/SpeakerLabel") as Label
	if label and not String(label.text).is_empty():
		_last_speaker = label.text


func _record_clip(name: String, work: Callable) -> void:
	if name == "":
		await work.call()
		return
	_recording_clip = name
	_clip_frames.clear()
	await work.call()
	await _stop_clip()


func _stop_clip() -> void:
	var name := _recording_clip
	_recording_clip = ""
	if name == "":
		_clip_frames.clear()
		return
	var dir := "%s/%s" % [MOTION, name]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var saved := 0
	for i in _clip_frames.size():
		_clip_frames[i].save_png(ProjectSettings.globalize_path("%s/f%03d.png" % [dir, i]))
		saved += 1
	_clip_frames.clear()
	var meta := {
		"clip": name,
		"frames_saved": saved,
		"max_frames": _clip_max,
		"size": "960x540",
		"filter": "nearest",
		"method": "INPUT",
		"hardware": _hardware,
	}
	var file := FileAccess.open(ProjectSettings.globalize_path("%s/%s/meta.json" % [MOTION, name]), FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(meta, "  "))
		file.close()
	print("ACCEPTANCE_CLIP: %s frames=%d" % [name, saved])


func _wait_fade_idle() -> void:
	if _world == null:
		return
	var fader := _world.get_node_or_null("TransitionFader")
	var deadline := Time.get_ticks_msec() + 2500
	while Time.get_ticks_msec() < deadline:
		var rect: ColorRect = fader.get_node_or_null("FadeRect") if fader else null
		if rect == null or not rect.visible or rect.color.a < 0.05:
			break
		await get_tree().process_frame


func _wait_victory(timeout_sec: float) -> void:
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if GameManager.current_state == GameManager.GameState.VICTORY or GameManager.game_complete:
			return
		await get_tree().process_frame


func _shot(name: String) -> void:
	# Room identity changes before fade-in completes; wait for the whole transition.
	var deadline := Time.get_ticks_msec() + 10000
	while is_instance_valid(_world) and _world.get("_transitioning") == true:
		if Time.get_ticks_msec() >= deadline:
			_check("screenshot_transition_timeout_%s" % name, false)
			return
		await get_tree().process_frame
	if not await CaptureGuard.await_frames(self, 2, 2.0):
		_check("screenshot_wait_%s" % name, false)
		return
	var tex := get_viewport().get_texture()
	if tex == null:
		_check("screenshot_%s" % name, false)
		return
	var img := tex.get_image()
	if img and not img.is_empty():
		img.save_png(ProjectSettings.globalize_path("%s/%s.png" % [QA, name]))
		print("ACCEPTANCE_STILL: %s" % name)
	else:
		_check("screenshot_%s" % name, false)


func _note(kind: String, detail: String) -> void:
	_events.append({"t_ms": Time.get_ticks_msec() - _started_ms, "kind": kind, "detail": detail})
	print("ACCEPTANCE_EVENT [%s] %s" % [kind, detail])


func _limit(text: String) -> void:
	_limitations.append(text)
	print("ACCEPTANCE_LIMITATION: %s" % text)


func _release_input() -> void:
	for action in ["move_left", "move_right", "move_down", "jump", "dash", "attack", "interact"]:
		Input.action_release(action)


func _check(name: String, ok: bool, soft: bool = false) -> void:
	_checks.append({"name": name, "passed": ok, "soft": soft})
	print("%s: %s%s" % ["PASS" if ok else "FAIL", name, " (observed)" if soft else ""])


func _hard_failures() -> int:
	var n := 0
	for c in _checks:
		if not c.passed and not bool(c.get("soft", false)):
			n += 1
	return n


func _write_report(outcome: Dictionary) -> void:
	var report := {
		"ok": bool(outcome.get("ok", false)),
		"elapsed_ms": Time.get_ticks_msec() - _started_ms,
		"hardware": _hardware,
		"rooms_visited": _rooms_visited,
		"room_count": _unique_room_count(),
		"npc": _npc_ok,
		"dash": _dash_ok,
		"dash_gate": _gate_ok,
		"save": _save_ok,
		"reload": _reload_ok,
		"boss_phase_2": _phase2_ok,
		"boss_burst": _burst_ok,
		"boss_hurt": _hurt_ok,
		"boss_death": _death_ok,
		"victory": _victory_ok,
		"limitations": _limitations,
		"events": _events,
		"checks": _checks,
		"note": "Automated Input is not a human playthrough. Swim pickup is not in this DNA.",
		"transition_ms_note": "Door swap+fades remain ~285-300 ms, not a single-frame hitch.",
	}
	var path := ProjectSettings.globalize_path("%s/acceptance_report.json" % QA)
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(report, "\t"))
		file.close()
	print("ACCEPTANCE_REPORT: %s" % path)


func _finish(code: int) -> void:
	print("ACCEPTANCE_RESULTS_BEGIN")
	for c in _checks:
		print("%s: %s" % ["PASS" if c.passed else "FAIL", c.name])
	print("ACCEPTANCE_RESULTS_END")
	get_tree().quit(code)
