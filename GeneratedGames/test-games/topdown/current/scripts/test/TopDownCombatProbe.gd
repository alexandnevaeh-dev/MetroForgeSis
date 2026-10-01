extends Node
## Focused real-input combat validation for TopDownCombatSandbox.tscn.

const PLAYER_ATTACK_STARTUP := 0.08
const PLAYER_ATTACK_ACTIVE := 0.10
const PLAYER_ATTACK_RECOVERY := 0.18
const PLAYER_ATTACK_MOVE_MULTIPLIER := 0.55
const PLAYER_IFRAMES := 0.65
const ENEMY_WINDUP := 0.28
const ENEMY_ACTIVE := 0.12
const ENEMY_RECOVERY := 0.42
const TopDownPlayerController = preload("res://scripts/player/TopDownPlayerController.gd")
const HealthComponent = preload("res://scripts/combat/HealthComponent.gd")
const HitboxComponent = preload("res://scripts/combat/HitboxComponent.gd")

var _results: Array[Dictionary] = []
var _sandbox: Node2D
var _player: CharacterBody2D
var _enemies: Array[CharacterBody2D] = []

func _ready() -> void:
	await get_tree().physics_frame
	GameManager.start_new_game()
	_sandbox = load("res://scenes/test/TopDownCombatSandbox.tscn").instantiate()
	add_child(_sandbox)
	await _frames(3)
	_player = _sandbox.get_node("Player") as CharacterBody2D
	for enemy_name in ["EnemyA", "EnemyB", "EnemyC", "EnemyD"]:
		_enemies.append(_sandbox.get_node(enemy_name) as CharacterBody2D)
	_check("sandbox_loads_real_player_and_four_enemies", _player != null and _enemies.size() == 4 and _enemies.all(func(enemy): return is_instance_valid(enemy)))
	if _player == null:
		_finish()
		return
	for enemy in _enemies:
		enemy.global_position = Vector2(850, 580)
	await _check_input_and_movement()
	await _check_player_attack()
	await _check_enemy_attack_and_iframes()
	await _check_enemy_hurt_and_death()
	await _check_player_death_respawn()
	_release_input()
	await get_tree().process_frame
	_finish()

func _check_input_and_movement() -> void:
	_check("wasd_actions_configured", InputMap.has_action("move_left") and InputMap.has_action("move_right") and InputMap.has_action("move_up") and InputMap.has_action("move_down"))
	var gamepad_configured := false
	for action in ["move_left", "move_right", "move_up", "move_down"]:
		for event in InputMap.action_get_events(action):
			if event is InputEventJoypadButton or event is InputEventJoypadMotion:
				gamepad_configured = true
	_check("gamepad_directional_input_configured", gamepad_configured)
	_player.global_position = Vector2(160, 500)
	var start: Vector2 = _player.global_position
	Input.action_press("move_right")
	await _frames(2)
	var accelerating_speed: float = _player.velocity.length()
	await _frames(10)
	var right_position: Vector2 = _player.global_position
	Input.action_release("move_right")
	await _frames(8)
	_check("wasd_right_movement_and_acceleration", right_position.x > start.x + 10.0 and accelerating_speed > 0.0)
	_check("deceleration_stops_player", _player.velocity.length() < accelerating_speed)
	var facing_before_idle: String = String(_player.get("facing_name"))
	await _frames(2)
	_check("idle_retains_cardinal_facing", _player.facing_name == facing_before_idle)
	start = _player.global_position
	Input.action_press("move_right")
	Input.action_press("move_down")
	await _frames(12)
	var diagonal_delta: Vector2 = _player.global_position - start
	Input.action_release("move_right")
	Input.action_release("move_down")
	await _frames(4)
	_check("diagonal_movement_is_normalized", abs(diagonal_delta.x - diagonal_delta.y) < 3.0 and diagonal_delta.length() < 45.0)
	start = _player.global_position
	Input.action_press("move_left")
	await _frames(20)
	Input.action_release("move_left")
	await _frames(2)
	_check("arrow_left_action_moves_player", _player.global_position.x < start.x - 20.0)
	_player.global_position = Vector2(45, 320)
	Input.action_press("move_left")
	await _frames(30)
	Input.action_release("move_left")
	await _frames(2)
	_check("wall_collision_prevents_escape", _player.global_position.x >= 39.0)
	var corner_escape_distance := await _move_for_frames("move_down", 8)
	_check("wall_collision_does_not_stick_player", corner_escape_distance > 8.0)

func _check_player_attack() -> void:
	var enemy := _enemies[0]
	_player.global_position = Vector2(180, 500)
	enemy.global_position = Vector2(220, 500)
	var health: HealthComponent = enemy.get_node("HealthComponent")
	var hitbox: HitboxComponent = _player.get_node("AttackHitbox")
	var original_health := health.current_health
	Input.action_press("attack")
	await get_tree().physics_frame
	Input.action_release("attack")
	_check("attack_enters_start_up_from_real_input", int(_player.get("_attack_state")) == 1 and not hitbox.monitoring)
	var startup_time := await _wait_for_player_state(2)
	_check("attack_startup_timing_and_hitbox_activation", startup_time >= PLAYER_ATTACK_STARTUP - 0.03 and startup_time <= PLAYER_ATTACK_STARTUP + 0.05 and hitbox.monitoring)
	var active_time := await _wait_for_player_state(3)
	_check("attack_active_timing_and_hitbox_deactivation", active_time >= PLAYER_ATTACK_ACTIVE - 0.03 and active_time <= PLAYER_ATTACK_ACTIVE + 0.05 and not hitbox.monitoring)
	var recovery_time := await _wait_for_player_state(0)
	_check("attack_recovery_timing", recovery_time >= PLAYER_ATTACK_RECOVERY - 0.03 and recovery_time <= PLAYER_ATTACK_RECOVERY + 0.06)
	_check("attack_hits_once_per_swing", is_equal_approx(original_health - health.current_health, 10.0))
	_check("attack_follows_retained_facing", hitbox.position == Vector2.RIGHT * 22.0)
	var normal_distance := await _measure_move_distance(false)
	var attack_distance := await _measure_move_distance(true)
	_check("attack_movement_multiplier_is_055", abs(attack_distance / normal_distance - PLAYER_ATTACK_MOVE_MULTIPLIER) < 0.14)
	Input.action_press("attack")
	await get_tree().physics_frame
	Input.action_release("attack")
	var attack_state_before_spam := int(_player.get("_attack_state"))
	Input.action_press("attack")
	await get_tree().physics_frame
	Input.action_release("attack")
	_check("attack_spam_cannot_bypass_recovery", attack_state_before_spam != 0 and int(_player.get("_attack_state")) == attack_state_before_spam)
	await _frames(30)

func _check_enemy_attack_and_iframes() -> void:
	var enemy := _enemies[1]
	enemy.global_position = _player.global_position + Vector2(-18, 0)
	var player_health: HealthComponent = _player.get_node("HealthComponent")
	var starting_health := player_health.current_health
	var states: Array[int] = []
	var windup_hitbox_disabled := true
	var active_seen := false
	for _frame in range(90):
		await get_tree().physics_frame
		var state := int(enemy.get("_state"))
		if states.is_empty() or states.back() != state:
			states.append(state)
		if state == 2:
			windup_hitbox_disabled = windup_hitbox_disabled and not (enemy.get_node("AttackHitbox") as HitboxComponent).monitoring
		if state == 3:
			active_seen = true
		if player_health.current_health < starting_health:
			break
	_check("enemy_idle_chase_windup_active_sequence", 1 in states and 2 in states and active_seen)
	_check("enemy_windup_has_no_active_hitbox", windup_hitbox_disabled)
	_check("enemy_attack_damages_player_only_after_active", player_health.current_health < starting_health)
	var after_first_hit := player_health.current_health
	await _frames(25)
	_check("player_iframes_prevent_repeat_contact_damage", is_equal_approx(player_health.current_health, after_first_hit))
	await _frames(25)
	_check("enemy_recovery_returns_to_chase", int(enemy.get("_state")) == 1 or int(enemy.get("_state")) == 2)
	_check("player_knockback_respects_world_collision", _player.global_position.x >= 39.0 and _player.global_position.x <= 921.0)

func _check_enemy_hurt_and_death() -> void:
	var enemy := _enemies[2]
	_player.global_position = Vector2(180, 500)
	enemy.global_position = Vector2(220, 500)
	var hitbox: HitboxComponent = enemy.get_node("AttackHitbox")
	Input.action_press("attack")
	await get_tree().physics_frame
	Input.action_release("attack")
	await _frames(8)
	_check("enemy_hurt_interrupts_attack_collision", int(enemy.get("_state")) == 5 and not hitbox.monitoring)
	await _frames(16)
	_check("enemy_hurt_returns_to_chase", int(enemy.get("_state")) == 1 or int(enemy.get("_state")) == 2)
	for _swing in range(2):
		Input.action_press("attack")
		await get_tree().physics_frame
		Input.action_release("attack")
		await _frames(26)
	_check("enemy_death_removes_actor_and_attack", not is_instance_valid(enemy) or enemy.is_queued_for_deletion())

func _check_player_death_respawn() -> void:
	var enemy := _enemies[3]
	_player.global_position = Vector2(180, 500)
	enemy.global_position = Vector2(162, 500)
	var player_health: HealthComponent = _player.get_node("HealthComponent")
	player_health.max_health = 12.0
	player_health.current_health = 12.0
	await _frames(90)
	_check("player_death_enters_game_over", GameManager.current_state == GameManager.GameState.GAME_OVER or player_health.current_health <= 0.0)
	await _frames(75)
	_check("player_respawn_restores_playing_state", GameManager.current_state == GameManager.GameState.PLAYING)
	_check("player_respawn_clears_dead_health_state", player_health.is_alive())

func _measure_move_distance(while_attacking: bool) -> float:
	_player.global_position = Vector2(180, 560)
	_player.velocity = Vector2.ZERO
	if while_attacking:
		Input.action_press("attack")
		await get_tree().physics_frame
		Input.action_release("attack")
		await _frames(2)
	var start: Vector2 = _player.global_position
	Input.action_press("move_up")
	await _frames(4)
	Input.action_release("move_up")
	await _frames(2)
	return _player.global_position.distance_to(start)

func _move_for_frames(action: String, count: int) -> float:
	var start: Vector2 = _player.global_position
	Input.action_press(action)
	await _frames(count)
	Input.action_release(action)
	await _frames(2)
	return _player.global_position.distance_to(start)

func _wait_for_player_state(target: int) -> float:
	var elapsed := 0.0
	while int(_player.get("_attack_state")) != target and elapsed < 1.0:
		await get_tree().physics_frame
		elapsed += 1.0 / float(Engine.physics_ticks_per_second)
	return elapsed

func _frames(count: int) -> void:
	for _frame in range(count):
		await get_tree().physics_frame

func _release_input() -> void:
	for action in ["move_left", "move_right", "move_up", "move_down", "attack", "dash", "interact"]:
		Input.action_release(action)

func _check(check_name: String, passed: bool) -> void:
	_results.append({"name": check_name, "passed": passed})

func _finish() -> void:
	var failures := 0
	print("TOP_DOWN_COMBAT_RESULTS_BEGIN")
	for result in _results:
		print("%s: %s" % ["PASS" if result.passed else "FAIL", result.name])
		if not result.passed:
			failures += 1
	print("TOP_DOWN_COMBAT_RESULTS_END")
	get_tree().quit(0 if failures == 0 else 1)
