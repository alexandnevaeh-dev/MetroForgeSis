extends Node
## Headless input-simulation playtest — follows playtest_route.json through the live world.
## Invoked via: godot --headless --path <project> res://scenes/test/PlaytestRunner.tscn

var _results: Array[Dictionary] = []
var _telemetry: Dictionary = {}
var _run_id: String = ""

func _ready() -> void:
	_run_id = OS.get_environment("METROFORGE_RUN_ID")
	if _run_id.is_empty():
		_run_id = "playtest_%d" % Time.get_ticks_msec()
	await get_tree().process_frame
	await get_tree().process_frame

	var world_scene := load("res://scenes/world/World.tscn") as PackedScene
	_check("world_scene_loads", world_scene != null)
	if world_scene == null:
		_finish()
		return

	GameManager.start_new_game()
	var world: Node2D = world_scene.instantiate()
	add_child(world)

	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().process_frame

	var agent := PlaytestAgent.new()
	var outcome: Dictionary = await agent.run(world, self)
	var telem: Variant = outcome.get("telemetry", {})
	_telemetry = telem if typeof(telem) == TYPE_DICTIONARY else {}
	if not outcome.get("ok", false):
		# outcome.ok=false carries a real reason (route_unreachable / transition_failed /
		# boss_not_defeated) that every downstream check here just reports as an opaque FAIL —
		# surface it so a failing run is diagnosable from --quit-after output alone, not only by
		# re-instrumenting PlaytestAgent.gd by hand each time.
		print("PLAYTEST_FAILURE_REASON: %s from=%s to=%s stage=%s" % [
			outcome.get("reason", "unknown"),
			outcome.get("from", ""),
			outcome.get("to", ""),
			outcome.get("failStage", ""),
		])

	_check("playtest_route_file_present", FileAccess.file_exists("res://playtest_route.json"))
	_check("playtest_persona_configured", _telemetry.get("personaId", "") != "")
	_check("playtest_used_input_simulation", agent.used_input_simulation)
	var planned_transitions: int = int(_telemetry.get("transitionsPlanned",0))
	_check("playtest_completed_transitions", planned_transitions > 0 and agent.steps_completed == planned_transitions)
	_check("playtest_reached_victory_flow", outcome.get("ok", false))
	_check(
		"playtest_victory_state_or_boss_defeated",
		GameManager.current_state == GameManager.GameState.VICTORY or GameManager.game_complete,
	)
	_check("playtest_telemetry_emitted", not _telemetry.is_empty())

	_release_input()
	await get_tree().process_frame
	_finish()

func _release_input() -> void:
	Input.action_release("move_left")
	Input.action_release("move_right")
	Input.action_release("attack")
	Input.action_release("move_down")
	Input.action_release("jump")
	Input.action_release("dash")

func _check(name: String, condition: bool) -> void:
	_results.append({"name": name, "passed": condition, "soft": false})

func _finish() -> void:
	var hard_failures := 0
	print("PLAYTEST_RESULTS_BEGIN")
	for r in _results:
		var status: String = "PASS" if r.passed else "FAIL"
		print("%s: %s" % [status, r.name])
		if not r.passed:
			hard_failures += 1
	print("PLAYTEST_RESULTS_END")
	_emit_telemetry()
	get_tree().quit(0 if hard_failures == 0 else 1)

func _emit_telemetry() -> void:
	if _telemetry.is_empty():
		return
	_telemetry["run_id"] = _run_id
	_telemetry["route_started"] = true
	_telemetry["endpoint_reached"] = bool(_telemetry.get("gameComplete", false))
	print("PLAYTEST_TELEMETRY_BEGIN")
	print(JSON.stringify(_telemetry))
	print("PLAYTEST_TELEMETRY_END")
	var json := JSON.stringify(_telemetry, "\t")
	var telemetry_path := "user://multi_ability_progression_telemetry.json"
	print("PLAYTEST_TELEMETRY_PATH: %s" % ProjectSettings.globalize_path(telemetry_path))
	var file := FileAccess.open(telemetry_path, FileAccess.WRITE)
	if file:
		file.store_string(json)
		file.flush()
		file.close()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://playtest"))
	var existing := ""
	if FileAccess.file_exists("res://playtest/telemetry.jsonl"):
		var reader := FileAccess.open("res://playtest/telemetry.jsonl", FileAccess.READ)
		if reader:
			existing = reader.get_as_text()
			reader.close()
	var line: Dictionary = _telemetry.duplicate(true)
	line["timestamp"] = Time.get_datetime_string_from_system(true)
	var jsonl := FileAccess.open("res://playtest/telemetry.jsonl", FileAccess.WRITE)
	if jsonl:
		jsonl.store_string(existing + JSON.stringify(line) + "\n")
		jsonl.close()
