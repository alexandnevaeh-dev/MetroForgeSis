extends Node
## Focused windowed checks for remaining acceptance gaps.
## 1) Title New Game → save beacon → Pause Return to Title → Continue (no load_game from this script).
## 2) Natural phase-2 area_burst, bounded wait, production RNG unchanged.
## 3) Death clip through Victory at display rate.
## Survives change_scene by remaining a root sibling of current_scene.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/visual-polish/pass6/acceptance/gaps"
const MOTION := "res://qa/visual-polish/pass6/acceptance/gaps/motion"
const PHASE2_BURST_TELEGRAPHS := 10

var _checks: Array[Dictionary] = []
var _limitations: Array[String] = []
var _hardware: Dictionary = {}
var _agent: PlaytestAgent
var _recording_clip := ""
var _clip_frames: Array[Image] = []
var _clip_max := 96
var _save_ok := false
var _continue_ok := false
var _dash_at_continue := false
var _burst_ok := false
var _death_anim_seen := false
var _death_frames := 0
var _victory_ok := false
var _started_ms := 0
var _hold_burst := false
var _phase2 := false
var _telegraph_was := false
var _phase2_telegraphs := 0

func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(CaptureGuard.EXIT_DUMMY)
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	_hardware = {
		"os": OS.get_name(),
		"processor": OS.get_processor_name(),
		"adapter": RenderingServer.get_video_adapter_name(),
		"headless": DisplayServer.get_name() == "headless",
		"method": "INPUT_UI",
	}
	_started_ms = Time.get_ticks_msec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(MOTION))
	print("BURST_SELECT phase 2 attacks=[slam, projectile, area_burst] equal randi()%%size; production weights unchanged; bounded wait %d telegraphs after phase 2" % PHASE2_BURST_TELEGRAPHS)
	SaveManager.select_slot(0)
	SaveManager.delete_slot(0)
	call_deferred("_boot_title")


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
	if _recording_clip == "boss_death_to_victory" and _death_anim_seen:
		_death_frames = _clip_frames.size()


func _boot_title() -> void:
	var packed := load("res://scenes/boot/Main.tscn") as PackedScene
	_check("title_scene_loads", packed != null)
	if packed == null:
		_finish(1)
		return
	var main := packed.instantiate()
	get_tree().root.add_child(main)
	get_tree().current_scene = main
	await get_tree().process_frame
	await get_tree().process_frame
	await _run()
	_release()
	_write_report()
	_finish(0 if _hard_failures() == 0 else 1)


func _run() -> void:
	_agent = PlaytestAgent.new()
	var route := _agent._load_route()
	_check("playtest_route_present", not route.is_empty())
	if route.is_empty():
		return
	_agent._apply_persona(route.get("persona", {}))
	EventBus.object_activated.connect(func(object_id: String) -> void:
		if object_id.begins_with("save_"):
			_save_ok = true
	)

	if not await _title_new_game():
		return
	if not await _walk_route_until("room_008", route):
		return
	if not await _touch_save():
		return
	if not await _quit_to_title_via_pause():
		return
	if not await _title_continue():
		return
	_check("continue_resumed_room_008", _continue_ok)
	_check("continue_kept_dash", _dash_at_continue)
	await _shot("continue_resumed")

	if not await _walk_route_until("room_012", route):
		return
	await _fight_boss_bounded(String(route.get("victoryBossId", "boss_final")))


func _title_new_game() -> bool:
	var title := _title()
	_check("title_present", title != null)
	if title == null:
		_limit("Main title not current after boot")
		return false
	await _shot("title_new_game")
	var new_btn := title.get_node_or_null("VBox/NewGameButton") as Button
	if new_btn == null:
		_limit("New Game button missing")
		return false
	await _activate_button(new_btn)
	var slot0 := title.get_node_or_null("FileSelectPanel/Slot0Button") as Button
	var deadline := Time.get_ticks_msec() + 4000
	while Time.get_ticks_msec() < deadline and (slot0 == null or not bool(title.get_node("FileSelectPanel").visible)):
		await get_tree().process_frame
		slot0 = title.get_node_or_null("FileSelectPanel/Slot0Button") as Button
	_check("new_game_opens_slot_select", slot0 != null and bool(title.get_node("FileSelectPanel").visible))
	if slot0 == null:
		return false
	await _activate_button(slot0)
	if not await _wait_world(12.0):
		_limit("New Game did not load World.tscn")
		_check("new_game_entered_world", false)
		return false
	_check("new_game_entered_world", GameManager.current_room_id == "room_000")
	print("GAPS_EVENT new_game room=%s" % GameManager.current_room_id)
	return GameManager.current_room_id == "room_000"


func _title_continue() -> bool:
	var title := _title()
	_check("title_after_quit", title != null)
	if title == null:
		_limit("Title missing after Return to Title")
		return false
	await get_tree().process_frame
	title.call("_refresh_continue")
	var cont := title.get_node_or_null("VBox/ContinueButton") as Button
	_check("continue_button_visible", cont != null and cont.visible)
	if cont == null or not cont.visible:
		_limit("Continue hidden — save did not occupy a slot")
		return false
	await _shot("title_continue")
	await _record_clip("title_continue", func() -> void:
		await _activate_button(cont)
		for _i in 36:
			await get_tree().process_frame
			if _world() != null and GameManager.current_room_id == "room_008":
				break
	)
	if not await _wait_world(12.0):
		_limit("Continue did not load World")
		return false
	await get_tree().physics_frame
	await get_tree().physics_frame
	_dash_at_continue = GameManager.has_ability("dash")
	_continue_ok = GameManager.current_room_id == "room_008" and _dash_at_continue and _player() != null
	print("GAPS_CONTINUE room=%s dash=%s" % [GameManager.current_room_id, str(_dash_at_continue)])
	return _continue_ok


func _quit_to_title_via_pause() -> bool:
	await _tap("pause")
	var pause := _pause_menu()
	var deadline := Time.get_ticks_msec() + 3000
	while Time.get_ticks_msec() < deadline:
		pause = _pause_menu()
		if pause != null and bool(pause.visible):
			break
		await get_tree().process_frame
	_check("pause_menu_opened", pause != null and bool(pause.visible))
	if pause == null or not bool(pause.visible):
		_limit("pause action did not open PauseMenu")
		return false
	await _shot("pause_to_title")
	var title_btn := pause.get_node_or_null("Panel/MainPanel/VBox/TitleButton") as Button
	if title_btn == null:
		_limit("Return to Title button missing")
		return false
	# Resume has focus; ui_down to Title (Resume, Map, Inventory, Quests, Settings, Title).
	for _i in 5:
		await _tap("ui_down")
		await get_tree().process_frame
	await _activate_button(title_btn)
	deadline = Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
		if _title() != null:
			break
	_check("returned_to_title", _title() != null)
	print("GAPS_EVENT returned_to_title present=%s" % str(_title() != null))
	return _title() != null


func _touch_save() -> bool:
	var room := _current_room()
	var save_point := room.get_node_or_null("SavePoint") if room else null
	_check("save_point_present", save_point != null)
	if save_point == null:
		return false
	var player := _player()
	await _record_clip("save_beacon", func() -> void:
		await _agent._walk_player_to(self, player, (save_point as Node2D).global_position, 6.0)
		for _i in 24:
			await get_tree().physics_frame
			if _save_ok:
				break
	)
	_check("save_beacon_activated", _save_ok)
	await _shot("save_beacon")
	_check("checkpoint_room_008", SaveManager.get_checkpoint_room_id() == "room_008")
	_check("dash_held_at_save", GameManager.has_ability("dash"))
	return _save_ok


func _walk_route_until(stop_room: String, route: Dictionary) -> bool:
	var transitions: Array = route.get("transitions", [])
	while GameManager.current_room_id != stop_room:
		var current := String(GameManager.current_room_id)
		var step: Dictionary = {}
		for s in transitions:
			if String(s.get("fromRoomId", "")) == current:
				step = s
				break
		if step.is_empty():
			_limit("no route step from %s toward %s" % [current, stop_room])
			return false
		var to_room: String = step.get("toRoomId", "")
		var world := _world()
		if world == null:
			_limit("World missing while walking %s -> %s" % [current, to_room])
			return false
		if not await _agent._execute_transition(world, self, current, to_room, step.get("requirements", [])):
			_limit("walk failed %s -> %s (%s)" % [current, to_room, _agent._fail_stage])
			_check("walk_%s_to_%s" % [current, to_room], false)
			return false
		print("GAPS_ROOM %s" % GameManager.current_room_id)
	return true


func _fight_boss_bounded(boss_id: String) -> void:
	var boss := _boss()
	if boss == null or String(boss.get("boss_id")) != boss_id:
		_limit("boss not in arena")
		_check("boss_present", false)
		return
	_check("boss_present", true)
	await _wait_fade()
	await _shot("boss_enter")
	var start_ms := Time.get_ticks_msec()
	var timeout_ms := 120000
	var last_hp_log := 0
	while Time.get_ticks_msec() - start_ms < timeout_ms:
		if GameManager.current_state == GameManager.GameState.VICTORY or GameManager.game_complete:
			_victory_ok = true
			break
		boss = _boss()
		if boss == null:
			if _death_anim_seen:
				break
			if GameManager.current_room_id != "room_012":
				if not await _recover_to_boss():
					_limit("could not return to arena after leaving room_012")
					break
				continue
			_limit("boss disappeared without death animation")
			break
		_observe(boss)
		var player := _player()
		if player == null or GameManager.current_state == GameManager.GameState.GAME_OVER:
			if not await _recover_to_boss():
				_limit("player missing after death/respawn during boss")
				break
			continue
		var now := Time.get_ticks_msec()
		if now - last_hp_log > 4000:
			last_hp_log = now
			var bh: HealthComponent = boss.get_node_or_null("HealthComponent")
			var ph: HealthComponent = player.get_node_or_null("HealthComponent")
			print("GAPS_HP player=%s boss=%s phase=%s last_attack=%s hold=%s telegraphs=%d" % [
				str(ph.current_health if ph else -1.0),
				str(bh.current_health if bh else -1.0),
				str(boss.get("_phase")),
				str(boss.get("_last_attack")),
				str(_hold_burst),
				_phase2_telegraphs,
			])
		await _boss_tick(player, boss)
		if not is_instance_valid(boss):
			if _death_anim_seen:
				break
			continue
		if _recording_clip == "" and _should_record(boss):
			_recording_clip = _pending_clip(boss)
			_clip_frames.clear()
		# Encode burst after the clip; keep death frames in memory until victory so PNG
		# encode does not stall the death→Victory sequence.
		if _recording_clip != "" and _clip_frames.size() >= _clip_cap():
			if _recording_clip != "boss_death_to_victory" or _victory_ok:
				await _stop_clip()
		if GameManager.current_state == GameManager.GameState.VICTORY:
			_victory_ok = true
			break
	if _recording_clip != "":
		await _stop_clip()
	var wait_ms := Time.get_ticks_msec() + 4000
	while Time.get_ticks_msec() < wait_ms:
		if GameManager.current_state == GameManager.GameState.VICTORY or GameManager.game_complete:
			_victory_ok = true
			break
		await get_tree().process_frame
	await _shot("boss_end")
	if _victory_ok:
		await _shot("victory")
	_check("boss_burst_natural", _burst_ok, true)
	if not _burst_ok:
		_limit("area_burst unverified after bounded wait of %d phase-2 telegraphs (1/3 RNG; fight saw %d telegraphs; production weights unchanged)" % [
			PHASE2_BURST_TELEGRAPHS, _phase2_telegraphs
		])
	_check("boss_death_animation_played", _death_anim_seen)
	_check("victory_after_death", _victory_ok)
	print("GAPS_BOSS burst=%s death_anim=%s death_frames=%s victory=%s phase2_telegraphs=%d" % [
		str(_burst_ok), str(_death_anim_seen), str(_death_frames), str(_victory_ok), _phase2_telegraphs
	])


func _observe(boss: Node) -> void:
	if not is_instance_valid(boss):
		return
	var phase := int(boss.get("_phase"))
	if phase >= 2 and not _phase2:
		_phase2 = true
		_hold_burst = true
		print("GAPS_EVENT phase_2 holding for area_burst")
	var telegraph := bool(boss.get("_telegraph_active"))
	if _phase2 and telegraph and not _telegraph_was:
		_phase2_telegraphs += 1
		if _hold_burst and not _burst_ok and _phase2_telegraphs >= PHASE2_BURST_TELEGRAPHS:
			_hold_burst = false
			print("GAPS_EVENT burst wait expired; resuming attacks")
	_telegraph_was = telegraph
	var sprite := boss.get_node_or_null("Sprite") as AnimatedSprite2D
	if sprite == null:
		return
	var anim := String(sprite.animation)
	if anim == "attack_burst":
		_burst_ok = true
		_hold_burst = false
	if anim == "death":
		_death_anim_seen = true
		_hold_burst = false
	elif bool(boss.get("_dying")):
		_hold_burst = false


func _should_record(boss: Node) -> bool:
	return _pending_clip(boss) != ""


func _pending_clip(boss: Node) -> String:
	if not is_instance_valid(boss):
		return ""
	var sprite := boss.get_node_or_null("Sprite") as AnimatedSprite2D
	var anim := String(sprite.animation) if sprite else ""
	if (anim == "attack_burst" or String(boss.get("_last_attack")) == "area_burst") and not _clip_exists("boss_burst"):
		return "boss_burst"
	if (anim == "death" or bool(boss.get("_dying"))) and not _clip_exists("boss_death_to_victory"):
		return "boss_death_to_victory"
	return ""


func _clip_exists(name: String) -> bool:
	return _recording_clip == name or FileAccess.file_exists(ProjectSettings.globalize_path("%s/%s/meta.json" % [MOTION, name]))


func _clip_cap() -> int:
	if _recording_clip == "boss_death_to_victory":
		return 96
	return 48


func _boss_tick(player: Node, boss: Node) -> void:
	if not is_instance_valid(player) or not is_instance_valid(boss):
		await get_tree().physics_frame
		return
	var dx: float = (boss as Node2D).global_position.x - (player as Node2D).global_position.x
	var telegraph := bool(boss.get("_telegraph_active"))
	var dying := bool(boss.get("_dying"))
	if dying:
		_release()
		await get_tree().physics_frame
		return
	if _hold_burst:
		# Stay on the arena floor in view. Jump telegraphs. Do not dash off the entry ledge.
		const WATCH := 72.0
		if absf(dx) > WATCH:
			if dx > 0.0:
				Input.action_press("move_right")
				Input.action_release("move_left")
			else:
				Input.action_press("move_left")
				Input.action_release("move_right")
		else:
			Input.action_release("move_left")
			Input.action_release("move_right")
		if telegraph:
			Input.action_press("jump")
		else:
			Input.action_release("jump")
		Input.action_release("dash")
		Input.action_release("attack")
	elif telegraph:
		if dx >= 0.0:
			Input.action_press("move_left")
			Input.action_release("move_right")
		else:
			Input.action_press("move_right")
			Input.action_release("move_left")
		Input.action_press("jump")
		if GameManager.has_ability("dash"):
			Input.action_press("dash")
		Input.action_release("attack")
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


func _recover_to_boss() -> bool:
	_release()
	var deadline := Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
		if _player() != null and GameManager.current_state == GameManager.GameState.PLAYING:
			break
	if _player() == null or GameManager.current_state != GameManager.GameState.PLAYING:
		return false
	if GameManager.current_room_id == "room_012" and _boss() != null:
		return true
	var route := _agent._load_route()
	if route.is_empty():
		return false
	print("GAPS_EVENT respawn walking back from %s" % GameManager.current_room_id)
	return await _walk_route_until("room_012", route)


func _title() -> Node:
	var cs := get_tree().current_scene
	if cs and cs.has_node("VBox/NewGameButton"):
		return cs
	return null


func _world() -> Node:
	var mgr := get_tree().get_first_node_in_group("world_manager")
	if mgr is Node:
		return mgr
	return get_tree().current_scene


func _current_room() -> Node2D:
	var world := _world()
	if world == null:
		return null
	return world.get("_current_room") as Node2D


func _player() -> CharacterBody2D:
	return get_tree().get_first_node_in_group("player") as CharacterBody2D


func _boss() -> Node:
	var room := _current_room()
	if room == null:
		return null
	return room.get_node_or_null("Boss")


func _pause_menu() -> Node:
	var world := _world()
	if world:
		var p := world.get_node_or_null("PauseMenu")
		if p:
			return p
	return get_tree().get_first_node_in_group("pause_menu") if false else _find_pause(get_tree().root)


func _find_pause(n: Node) -> Node:
	if n.name == "PauseMenu":
		return n
	for c in n.get_children():
		var found := _find_pause(c)
		if found:
			return found
	return null


func _wait_world(timeout_sec: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if _player() != null and _world() != null and String(GameManager.current_room_id).begins_with("room_"):
			return true
		await get_tree().process_frame
	return _player() != null


func _wait_fade() -> void:
	var world := _world()
	if world == null:
		return
	var fader := world.get_node_or_null("TransitionFader")
	var deadline := Time.get_ticks_msec() + 2500
	while Time.get_ticks_msec() < deadline:
		var rect: ColorRect = fader.get_node_or_null("FadeRect") if fader else null
		if rect == null or not rect.visible or rect.color.a < 0.05:
			break
		await get_tree().process_frame


func _activate_button(button: BaseButton) -> void:
	button.grab_focus()
	await get_tree().process_frame
	await _tap("ui_accept")


func _tap(action: String) -> void:
	var ev := InputEventAction.new()
	ev.action = action
	ev.pressed = true
	ev.strength = 1.0
	Input.parse_input_event(ev)
	Input.action_press(action)
	await get_tree().process_frame
	var up := InputEventAction.new()
	up.action = action
	up.pressed = false
	Input.parse_input_event(up)
	Input.action_release(action)
	await get_tree().process_frame


func _record_clip(name: String, work: Callable) -> void:
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
		"method": "INPUT",
		"hardware": _hardware,
		"note": "PNG encode after clip; not a frame-time sample",
	}
	var file := FileAccess.open(ProjectSettings.globalize_path("%s/%s/meta.json" % [MOTION, name]), FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(meta, "  "))
		file.close()
	print("GAPS_CLIP: %s frames=%d" % [name, saved])


func _shot(name: String) -> void:
	if not await CaptureGuard.await_frames(self, 2, 2.0):
		return
	var tex := get_viewport().get_texture()
	if tex == null:
		return
	var img := tex.get_image()
	if img and not img.is_empty():
		img.save_png(ProjectSettings.globalize_path("%s/%s.png" % [QA, name]))
		print("GAPS_STILL: %s" % name)


func _limit(text: String) -> void:
	_limitations.append(text)
	print("GAPS_LIMITATION: %s" % text)


func _release() -> void:
	for action in ["move_left", "move_right", "jump", "dash", "attack", "pause", "ui_accept", "ui_down"]:
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


func _write_report() -> void:
	var report := {
		"continue_room_008": _continue_ok,
		"dash": _dash_at_continue,
		"burst": _burst_ok,
		"death_anim": _death_anim_seen,
		"death_clip_frames": _death_frames,
		"victory": _victory_ok,
		"phase2_telegraphs": _phase2_telegraphs,
		"limitations": _limitations,
		"checks": _checks,
		"elapsed_ms": Time.get_ticks_msec() - _started_ms,
		"hardware": _hardware,
		"note": "Automated Input is not a human playthrough. Burst is 1/3 of phase-2 attacks.",
	}
	var file := FileAccess.open(ProjectSettings.globalize_path("%s/gaps_report.json" % QA), FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(report, "\t"))
		file.close()
	print("GAPS_REPORT: %s" % ProjectSettings.globalize_path("%s/gaps_report.json" % QA))


func _finish(code: int) -> void:
	print("GAPS_RESULTS_BEGIN")
	for c in _checks:
		print("%s: %s" % ["PASS" if c.passed else "FAIL", c.name])
	print("GAPS_RESULTS_END")
	print("GAPS_EXIT:%d" % code)
	get_tree().quit(code)
