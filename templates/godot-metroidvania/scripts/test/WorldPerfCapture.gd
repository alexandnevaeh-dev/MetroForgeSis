extends Node
## Steady gameplay frame timing with screenshot/video encode kept outside measured intervals.
## Room-transition hitches are recorded separately from traversal/water/combat/boss samples.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/visual-polish/world"

var _world: Node2D
var _measuring := false
var _bucket := ""
var _samples: Dictionary = {}
var _last_usec := 0
var _hardware: Dictionary = {}

func _ready() -> void:
	if CaptureGuard.is_dummy_renderer():
		print("WORLD_PERF_NOTE: dummy renderer — frame times are not GPU evidence. Windowed Metal required for Pass 6 perf.")
	_hardware = {
		"os": OS.get_name(),
		"processor": OS.get_processor_name(),
		"adapter": RenderingServer.get_video_adapter_name(),
		"adapter_vendor": RenderingServer.get_video_adapter_vendor(),
		"renderer": RenderingServer.get_current_rendering_method(),
		"vsync": DisplayServer.window_get_vsync_mode(),
		"window": DisplayServer.window_get_size(),
		"headless": DisplayServer.get_name() == "headless",
	}
	GameManager.start_new_game()
	await get_tree().process_frame
	var packed := load("res://scenes/world/World.tscn") as PackedScene
	if packed == null:
		push_error("WORLD_PERF: World.tscn missing")
		get_tree().quit(1)
		return
	_world = packed.instantiate()
	add_child(_world)
	await get_tree().physics_frame
	await get_tree().physics_frame
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	if player:
		var health := player.get_node_or_null("HealthComponent")
		if health:
			health.set("invulnerable", true)
	await _sample_phase("traversal", 3.0, func():
		Input.action_press("move_right")
	, func():
		Input.action_release("move_right")
	)
	await _sample_water()
	await _sample_combat()
	await _sample_boss()
	await _sample_transition()
	_write_report()
	print("WORLD_PERF_RESULTS_BEGIN")
	print("PASS: perf_report_written")
	print("WORLD_PERF_RESULTS_END")
	get_tree().quit(0)


func _process(_delta: float) -> void:
	if not _measuring:
		_last_usec = 0
		return
	var now := Time.get_ticks_usec()
	if _last_usec > 0:
		var bucket: Array = _samples.get(_bucket, [])
		bucket.append((now - _last_usec) / 1000.0)
		_samples[_bucket] = bucket
	_last_usec = now


func _sample_phase(name: String, seconds: float, start: Callable, stop: Callable) -> void:
	await start.call()
	await get_tree().physics_frame
	_bucket = name
	_measuring = true
	_last_usec = 0
	await get_tree().create_timer(seconds).timeout
	_measuring = false
	await stop.call()
	print("PERF_PHASE %s n=%d" % [name, (_samples.get(name, []) as Array).size()])


func _sample_water() -> void:
	var water_id := _first_room_for("biome_1")
	if water_id == "":
		return
	await _load_room(water_id)
	await get_tree().physics_frame
	await get_tree().physics_frame
	await _sample_phase("water", 3.0, func():
		Input.action_press("move_right")
		Input.action_press("move_down")
	, func():
		Input.action_release("move_right")
		Input.action_release("move_down")
	)


func _sample_combat() -> void:
	var combat_id := _first_archetype("combat")
	if combat_id == "":
		combat_id = _first_room_with_enemy()
	if combat_id == "":
		return
	await _load_room(combat_id)
	await get_tree().physics_frame
	await get_tree().physics_frame
	await _sample_phase("combat", 3.0, func():
		Input.action_press("move_right")
	, func():
		Input.action_release("move_right")
	)


func _sample_boss() -> void:
	var boss_id := _first_archetype("boss")
	if boss_id == "":
		return
	await _load_room(boss_id)
	await get_tree().physics_frame
	await get_tree().physics_frame
	await _sample_phase("boss", 3.0, func():
		Input.action_press("move_right")
	, func():
		Input.action_release("move_right")
	)


func _sample_transition() -> void:
	await _load_room("room_000")
	await get_tree().physics_frame
	await get_tree().physics_frame
	var crossings: Array = []
	for i in 3:
		var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
		if player == null:
			break
		var before := String(GameManager.current_room_id)
		var action := "move_right" if i % 2 == 0 else "move_left"
		var t_walk := Time.get_ticks_usec()
		Input.action_press(action)
		for _j in 280:
			await get_tree().physics_frame
			if _world.get("_transitioning") == true or String(GameManager.current_room_id) != before:
				break
		Input.action_release(action)
		var walk_ms := (Time.get_ticks_usec() - t_walk) / 1000.0
		while _world.get("_transitioning") == true:
			await get_tree().physics_frame
		var profile: Dictionary = {}
		var raw = _world.get("last_transition_profile")
		if typeof(raw) == TYPE_DICTIONARY:
			profile = (raw as Dictionary).duplicate()
		profile["walk_to_door_ms"] = walk_ms
		profile["crossing"] = i
		profile["after_room"] = String(GameManager.current_room_id)
		crossings.append(profile)
		print(
			"PERF_TRANSITION_CROSSING i=%d walk_to_door_ms=%.2f total_ms=%.2f resource_ms=%.2f instantiate_ms=%.2f presentation_ms=%.2f fade_in_ms=%.2f after=%s"
			% [
				i,
				walk_ms,
				float(profile.get("total_ms", 0.0)),
				float(profile.get("resource_ms", 0.0)),
				float(profile.get("instantiate_ms", 0.0)),
				float(profile.get("presentation_ms", 0.0)),
				float(profile.get("fade_in_ms", 0.0)),
				String(profile.get("after_room", "")),
			]
		)
	_samples["transition_crossings"] = crossings
	if crossings.size() > 0:
		_samples["transition_total_ms"] = [float((crossings[0] as Dictionary).get("total_ms", 0.0))]


func _write_report() -> void:
	var phases := {}
	for key in _samples.keys():
		var arr: Array = _samples[key]
		if arr.is_empty():
			continue
		if key == "transition_hitch_ms" or key == "transition_total_ms":
			phases[key] = {"ms": arr[0], "note": "door swap plus fades; walk-to-door is separate"}
			continue
		if key == "transition_crossings":
			phases[key] = {
				"note": "Repeated Input door crossings with fades on. walk_to_door_ms is approach, not a frame hitch. Automated input is not a human playthrough.",
				"crossings": arr,
			}
			continue
		var sorted := arr.duplicate()
		sorted.sort()
		var sum := 0.0
		for v in sorted:
			sum += float(v)
		phases[key] = {
			"sample_count": sorted.size(),
			"duration_s": snapped(sum / 1000.0, 0.01),
			"min_ms": sorted[0],
			"max_ms": sorted[sorted.size() - 1],
			"mean_ms": sum / sorted.size(),
			"p50_ms": _pct(sorted, 0.50),
			"p95_ms": _pct(sorted, 0.95),
			"p99_ms": _pct(sorted, 0.99),
		}
	var report := {
		"method": "Time.get_ticks_usec in WorldPerfCapture._process; measuring flag off during room loads and PNG-less",
		"hardware": _hardware,
		"resolution": {"w": 1920, "h": 1080},
		"capture_overhead": "No screenshots or video encode during measured intervals",
		"phases": phases,
	}
	var path := ProjectSettings.globalize_path("%s/frame_timing.json" % QA)
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(report, "  "))
		file.close()
	print("FRAME_TIMING_JSON: %s" % path)


func _pct(sorted: Array, p: float) -> float:
	var idx := clampi(int(round((sorted.size() - 1) * p)), 0, sorted.size() - 1)
	return float(sorted[idx])


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


func _first_room_for(biome: String) -> String:
	var rooms := _rooms()
	for room_id in rooms.keys():
		if String(rooms[room_id].get("biomeId", "")).contains(biome):
			return String(room_id)
	return ""


func _first_archetype(arch: String) -> String:
	var rooms := _rooms()
	for room_id in rooms.keys():
		var info: Dictionary = rooms[room_id]
		if String(info.get("archetype", "")) == arch or String(info.get("worldArchetype", "")) == arch:
			return String(room_id)
	return ""


func _first_room_with_enemy() -> String:
	var rooms := _rooms()
	for room_id in rooms.keys():
		var enemies = rooms[room_id].get("enemies", [])
		if typeof(enemies) == TYPE_ARRAY and enemies.size() > 0:
			return String(room_id)
	return ""


func _load_room(room_id: String) -> void:
	if _world and _world.has_method("_load_room"):
		await _world._load_room(room_id, "left")
