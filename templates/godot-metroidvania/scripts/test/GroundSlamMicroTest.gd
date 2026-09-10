extends Node2D

const TELEMETRY_PATH := "user://ground_slam_micro_test_telemetry.json"
const MAX_AIRBORNE_FRAMES := 45
const MAX_SLAM_FRAMES := 90

var telemetry: Dictionary = {}
@onready var player: CharacterBody2D = $Player
@onready var weak_floor: StaticBody2D = $WeakFloor

func _ready() -> void:
	telemetry = {
		"run_id": OS.get_environment("METROFORGE_RUN_ID"),
		"test_started": true,
		"ground_slam_unlocked": false,
		"initial_player_position": Vector2.ZERO,
		"initial_player_velocity": Vector2.ZERO,
		"weak_floor_bounds": {},
		"horizontal_alignment_passed": false,
		"jump_input_pressed": false,
		"airborne_entered": false,
		"frames_until_airborne": -1,
		"slam_input_pressed": false,
		"slam_state_entered": false,
		"slam_velocity": Vector2.ZERO,
		"weak_floor_contact": false,
		"weak_floor_group_confirmed": false,
		"weak_floor_break_triggered": false,
		"weak_floor_destroyed": false,
		"player_passed_floor_plane": false,
		"safe_landing_reached": false,
		"slam_samples": [],
		"failure_stage": "",
		"failure_reason": "",
		"test_passed": false,
	}
	if String(telemetry["run_id"]).is_empty():
		telemetry["run_id"] = "ground_slam_micro_%d" % Time.get_ticks_msec()
	GameManager.start_new_game()
	GameManager._on_ability_acquired("ground_slam")
	await get_tree().physics_frame
	await get_tree().physics_frame
	await _run_test()
	_write_and_quit()

func _run_test() -> void:
	var ability_controller := player.get_node_or_null("AbilityController") as AbilityController
	var health := player.get_node_or_null("HealthComponent") as HealthComponent
	if ability_controller == null or health == null:
		_fail("FIXTURE_INVALID", "production player components missing")
		return
	telemetry["ground_slam_unlocked"] = GameManager.has_ability("ground_slam")
	telemetry["initial_player_position"] = _vector_record(player.global_position)
	telemetry["initial_player_velocity"] = _vector_record(player.velocity)
	var weak_shape := weak_floor.get_node_or_null("CollisionShape2D") as CollisionShape2D
	var rect := weak_shape.shape as RectangleShape2D if weak_shape else null
	if rect == null:
		_fail("FIXTURE_INVALID", "WeakFloor has no rectangle collision")
		return
	var left := weak_floor.global_position.x - rect.size.x / 2.0
	var right := weak_floor.global_position.x + rect.size.x / 2.0
	var player_half_width := 12.0
	var overlap := player.global_position.x + player_half_width >= left and player.global_position.x - player_half_width <= right
	telemetry["weak_floor_bounds"] = {"left": left, "right": right, "top": weak_floor.global_position.y, "bottom": weak_floor.global_position.y + rect.size.y}
	telemetry["horizontal_alignment_passed"] = overlap
	telemetry["weak_floor_group_confirmed"] = weak_floor.is_in_group("weak_floor")
	if not GameManager.has_ability("ground_slam"):
		_fail("ABILITY_NOT_UNLOCKED", "ground_slam is absent from GameManager")
		return
	if not player.is_on_floor():
		_fail("INITIAL_NOT_GROUNDED", "player did not settle on WeakFloor")
		return
	if ability_controller.is_dashing or ability_controller.is_slamming or not health.is_alive():
		_fail("INVALID_PLAYER_STATE", "player is dashing, slamming, or dead before input")
		return
	if not overlap:
		_fail("FIXTURE_ALIGNMENT_FAILED", "player collision does not overlap WeakFloor")
		return

	Input.action_release("move_down")
	await get_tree().physics_frame
	Input.action_press("jump")
	telemetry["jump_input_pressed"] = true
	var airborne := false
	for frame in range(MAX_AIRBORNE_FRAMES):
		await get_tree().physics_frame
		if not player.is_on_floor() and player.velocity.y < 0.0:
			telemetry["airborne_entered"] = true
			telemetry["frames_until_airborne"] = frame + 1
			telemetry["airborne_position"] = _vector_record(player.global_position)
			telemetry["airborne_velocity"] = _vector_record(player.velocity)
			airborne = true
			break
	Input.action_release("jump")
	if not airborne:
		_fail("JUMP_INPUT_FAILED", "jump input did not produce an airborne upward state")
		return

	Input.action_release("move_down")
	await get_tree().physics_frame
	telemetry["slam_input_frame"] = Engine.get_physics_frames()
	telemetry["player_velocity_before_slam"] = _vector_record(player.velocity)
	Input.action_press("move_down")
	telemetry["slam_input_pressed"] = true
	await get_tree().physics_frame
	# This coroutine resumes at the physics-frame signal before the Player child
	# processes its tick. Wait one more tick to observe the controller's state.
	await get_tree().physics_frame
	telemetry["slam_state_entered"] = ability_controller.is_slamming
	telemetry["slam_velocity"] = _vector_record(player.velocity)
	Input.action_release("move_down")
	if not ability_controller.is_slamming:
		_fail("INPUT_EDGE_NOT_OBSERVED", "move_down did not enter AbilityController.is_slamming")
		return

	var floor_plane := weak_floor.global_position.y
	for _frame in range(MAX_SLAM_FRAMES):
		await get_tree().physics_frame
		var sample := {
			"frame": _frame,
			"position": _vector_record(player.global_position),
			"velocity": _vector_record(player.velocity),
			"slamming": ability_controller.is_slamming,
			"on_floor": player.is_on_floor(),
			"collision_count": player.get_slide_collision_count(),
		}
		telemetry["slam_samples"].append(sample)
		if player.get_slide_collision_count() > 0:
			for collision_index in player.get_slide_collision_count():
				var collider := player.get_slide_collision(collision_index).get_collider()
				if collider == weak_floor:
					telemetry["weak_floor_contact"] = true
					telemetry["weak_floor_break_triggered"] = bool(weak_floor.get("_broken"))
		if is_instance_valid(weak_floor) and bool(weak_floor.get("_broken")):
			telemetry["weak_floor_break_triggered"] = true
			telemetry["weak_floor_destroyed"] = true
		elif bool(telemetry["weak_floor_contact"]) and not is_instance_valid(weak_floor):
			# WeakFloor's production break path queues the node after its fade; a contacted
			# floor becoming invalid is evidence that the real break callback completed.
			telemetry["weak_floor_break_triggered"] = true
			telemetry["weak_floor_destroyed"] = true
		if player.global_position.y > floor_plane + 24.0:
			telemetry["player_passed_floor_plane"] = true
		if player.is_on_floor() and player.global_position.y > floor_plane + 80.0:
			telemetry["safe_landing_reached"] = true
			break
	if not bool(telemetry["weak_floor_contact"]):
		_fail("WEAK_FLOOR_CONTACT_MISSING", "no slide collision with WeakFloor")
	elif not bool(telemetry["weak_floor_destroyed"]):
		_fail("WEAK_FLOOR_NOT_DESTROYED", "WeakFloor did not enter its production broken state")
	elif not bool(telemetry["player_passed_floor_plane"]):
		_fail("PLAYER_DID_NOT_PASS_FLOOR", "player did not fall below the broken floor")
	elif not bool(telemetry["safe_landing_reached"]):
		_fail("SAFE_LANDING_NOT_REACHED", "player did not land on lower platform")
	else:
		telemetry["test_passed"] = true

func _vector_record(value: Vector2) -> Dictionary:
	return {"x": value.x, "y": value.y}

func _fail(stage: String, reason: String) -> void:
	telemetry["failure_stage"] = stage
	telemetry["failure_reason"] = reason

func _write_and_quit() -> void:
	var absolute_path := ProjectSettings.globalize_path(TELEMETRY_PATH)
	print("GROUND_SLAM_MICRO_TELEMETRY_PATH: %s" % absolute_path)
	var file := FileAccess.open(TELEMETRY_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(telemetry, "\t"))
		file.flush()
		file.close()
	print("GROUND_SLAM_MICRO_TELEMETRY: %s" % JSON.stringify(telemetry))
	get_tree().quit(0 if bool(telemetry["test_passed"]) else 1)
