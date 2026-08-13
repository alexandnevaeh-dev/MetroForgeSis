extends Node
## Headless input-simulation playtest — follows playtest_route.json through the live world.
## Invoked via: godot --headless --path <project> res://scenes/test/PlaytestRunner.tscn

var _results: Array[Dictionary] = []
var _telemetry: Dictionary = {}

func _ready() -> void:
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
	_telemetry = outcome.get("telemetry", {})

	_check("playtest_route_file_present", FileAccess.file_exists("res://playtest_route.json"))
	_check("playtest_persona_configured", _telemetry.get("personaId", "") != "")
	_check("playtest_used_input_simulation", agent.used_input_simulation)
	_check("playtest_completed_transitions", agent.steps_completed > 0)
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
	if not _telemetry.is_empty():
		print("PLAYTEST_TELEMETRY_BEGIN")
		print(JSON.stringify(_telemetry))
		print("PLAYTEST_TELEMETRY_END")
	get_tree().quit(0 if hard_failures == 0 else 1)
