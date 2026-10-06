extends Node2D
## Reproduces jump/dash escape past visual walls and pit-fall stranding.
## Shell colliders must stop the body; OOB recovery must return the player
## to the last grounded position without dealing damage.

const ROOM_W := 800.0
const ROOM_H := 600.0

var _results: Array[Dictionary] = []
@onready var player: CharacterBody2D = $Player

func _ready() -> void:
	GameManager.start_new_game()
	await get_tree().physics_frame
	await get_tree().physics_frame
	if player.has_method("set_room_containment"):
		player.call("set_room_containment", ROOM_W, ROOM_H, false)
	await get_tree().physics_frame
	await _run()
	_finish()

func _run() -> void:
	var health := player.get_node_or_null("HealthComponent") as HealthComponent
	var start_health := health.current_health if health else -1.0
	player.global_position = Vector2(400, 400)
	player.velocity = Vector2.ZERO
	for _i in range(8):
		await get_tree().physics_frame
	_check("starts_on_floor", player.is_on_floor(), "y=%.1f" % player.global_position.y)
	var safe := player.global_position

	player.global_position = Vector2(-48, 400)
	player.velocity = Vector2.ZERO
	for _i in range(6):
		await get_tree().physics_frame
	_check("recovers_from_left_void", player.global_position.x > 0.0 and player.global_position.x < ROOM_W)
	_check("left_void_does_not_strand", player.global_position.y < ROOM_H + 40.0)

	player.global_position = Vector2(400, ROOM_H + 120.0)
	player.velocity = Vector2(0, 400)
	for _i in range(8):
		await get_tree().physics_frame
	_check("recovers_from_pit_without_down_exit", player.global_position.y <= ROOM_H + 8.0)
	if health:
		_check("recovery_does_not_damage", health.current_health == start_health,
			"%.0f vs %.0f" % [health.current_health, start_health])

	player.global_position = Vector2(48, 400)
	player.velocity = Vector2.ZERO
	for _i in range(4):
		await get_tree().physics_frame
	Input.action_press("move_left")
	Input.action_press("jump")
	for _i in range(50):
		await get_tree().physics_frame
	Input.action_release("move_left")
	Input.action_release("jump")
	_check("jump_cannot_leave_left_wall", player.global_position.x >= 14.0,
		"x=%.1f" % player.global_position.x)

	player.global_position = Vector2(752, 400)
	player.velocity = Vector2.ZERO
	for _i in range(4):
		await get_tree().physics_frame
	if player.has_method("enable_dash"):
		player.enable_dash()
	Input.action_press("move_right")
	Input.action_press("jump")
	Input.action_press("dash")
	for _i in range(40):
		await get_tree().physics_frame
	Input.action_release("move_right")
	Input.action_release("jump")
	Input.action_release("dash")
	_check("jump_dash_cannot_leave_right_wall", player.global_position.x <= ROOM_W - 14.0,
		"x=%.1f" % player.global_position.x)
	_check("stays_below_ceiling", player.global_position.y >= 24.0, "y=%.1f" % player.global_position.y)
	_check("safe_spawn_was_inside", safe.x > 8.0 and safe.x < ROOM_W - 8.0)

func _check(name: String, passed: bool, detail: String = "") -> void:
	_results.append({ "name": name, "passed": passed, "detail": detail })
	print("ROOM_CONTAINMENT %s %s %s" % [name, "PASS" if passed else "FAIL", detail])

func _finish() -> void:
	var failures := 0
	for r in _results:
		if not r.passed:
			failures += 1
	print("ROOM_CONTAINMENT_SUMMARY total=%d passed=%d failed=%d" % [_results.size(), _results.size() - failures, failures])
	get_tree().quit(0 if failures == 0 else 1)
