extends Node2D

const TELEMETRY_PATH := "user://combat_micro_test_telemetry.json"
const MAX_APPROACH_FRAMES := 180
const MAX_WAIT_FRAMES := 90

var telemetry: Dictionary = {}
var enemy_damage_events := 0
var player_damage_events := 0
var enemy_deaths := 0
var attack_attempts: Array[Dictionary] = []
@onready var player: CharacterBody2D = $Player
@onready var enemy: CharacterBody2D = $Enemy

func _ready() -> void:
	telemetry = {"run_id": OS.get_environment("METROFORGE_RUN_ID"), "test_passed": false, "failure_stage": "", "player_damage_amount": 0.0, "enemy_damage_events": 0, "player_damage_events": 0, "unexpected_repeat_damage": false, "unexpected_repeat_hits": false, "enemy_destroyed": false}
	if String(telemetry["run_id"]).is_empty():
		telemetry["run_id"] = "combat_micro_%d" % Time.get_ticks_msec()
	GameManager.start_new_game()
	await get_tree().physics_frame
	await get_tree().physics_frame
	var player_health := player.get_node_or_null("HealthComponent") as HealthComponent
	var enemy_health := enemy.get_node_or_null("HealthComponent") as HealthComponent
	if player_health == null or enemy_health == null:
		_fail("FIXTURE_INVALID")
		_finish()
		return
	player_health.damaged.connect(func(amount: float) -> void: player_damage_events += 1; telemetry["player_damage_amount"] = amount)
	enemy_health.damaged.connect(func(_amount: float) -> void: enemy_damage_events += 1)
	enemy_health.died.connect(_on_enemy_died)
	telemetry["player_start_health"] = player_health.current_health
	telemetry["enemy_start_health"] = enemy_health.current_health
	await _run(player_health, enemy_health)
	_finish()

func _run(player_health: HealthComponent, enemy_health: HealthComponent) -> void:
	if player_health.current_health < 100.0:
		_fail("PREMATURE_CONTACT_DAMAGE")
		return
	if not await _approach_enemy():
		_fail("APPROACH_FAILED")
		return
	if not await _attack_once(enemy_health):
		_fail("FIRST_ATTACK_FAILED")
		return
	telemetry["enemy_health_after_first_hit"] = enemy_health.current_health
	telemetry["player_attack_damage"] = telemetry["enemy_start_health"] - enemy_health.current_health
	if enemy_damage_events != 1 or telemetry["player_attack_damage"] != 10.0:
		telemetry["unexpected_repeat_hits"] = enemy_damage_events > 1
		_fail("PLAYER_DAMAGE_FLOW_INVALID")
		return
	if not await _receive_enemy_contact(player_health):
		_fail("ENEMY_CONTACT_DAMAGE_FAILED")
		return
	if not await _kill_enemy(enemy_health):
		_fail("ENEMY_DEATH_FAILED")
		return
	telemetry["enemy_death_frame"] = Engine.get_physics_frames()
	telemetry["enemy_final_health"] = 0.0
	telemetry["enemy_destroyed"] = enemy_deaths == 1
	telemetry["enemy_death_events"] = enemy_deaths
	telemetry["player_survived"] = player_health.is_alive()
	telemetry["test_passed"] = bool(telemetry["enemy_destroyed"]) and bool(telemetry["player_survived"])
	if not bool(telemetry["test_passed"]):
		_fail("FINAL_ASSERTION_FAILED")

func _approach_enemy() -> bool:
	for _frame in range(MAX_APPROACH_FRAMES):
		if not is_instance_valid(enemy):
			return false
		var dx := enemy.global_position.x - player.global_position.x
		# The production AttackHitbox node is offset +30 and its CollisionShape2D
		# adds another +30, so a right-facing hit lands around player X + 60.
		if dx >= 52.0 and dx <= 68.0:
			Input.action_release("move_right")
			Input.action_release("move_left")
			return true
		if dx > 68.0:
			Input.action_press("move_right")
			Input.action_release("move_left")
		else:
			Input.action_press("move_left")
			Input.action_release("move_right")
		await get_tree().physics_frame
	Input.action_release("move_right")
	Input.action_release("move_left")
	return false

func _attack_once(enemy_health: HealthComponent) -> bool:
	var hitbox := player.get_node_or_null("AttackHitbox") as HitboxComponent
	if hitbox == null:
		return false
	if not await _wait_attack_ready(hitbox):
		return false
	var health_before_attack := enemy_health.current_health
	# Establish facing through the normal movement input path. Do not assign
	# PlayerController.facing directly: the production controller owns it.
	Input.action_press("move_right")
	await get_tree().physics_frame
	Input.action_release("move_right")
	await get_tree().physics_frame
	var attempt := {
		"frame": Engine.get_physics_frames(),
		"enemy_health_before": health_before_attack,
		"player_position": _vector_record(player.global_position),
		"enemy_position": _vector_record(enemy.global_position),
		"facing": player.get("facing"),
		"cooldown": player.get("_attack_cooldown"),
	}
	Input.action_release("attack")
	await get_tree().physics_frame
	telemetry["attack_start_frame"] = Engine.get_physics_frames()
	Input.action_press("attack")
	await get_tree().physics_frame
	await get_tree().physics_frame
	telemetry["attack_active_start_frame"] = Engine.get_physics_frames() if hitbox.monitoring else -1
	Input.action_release("attack")
	for _frame in range(MAX_WAIT_FRAMES):
		await get_tree().physics_frame
		if enemy_health.current_health < health_before_attack:
			telemetry["enemy_hit_frame"] = Engine.get_physics_frames()
			break
	for _frame in range(30):
		await get_tree().physics_frame
		if not hitbox.monitoring:
			telemetry["attack_active_end_frame"] = Engine.get_physics_frames()
			break
	telemetry["attack_recovery_end_frame"] = Engine.get_physics_frames()
	attempt["enemy_health_after"] = enemy_health.current_health
	attempt["hitbox_active"] = hitbox.monitoring
	attack_attempts.append(attempt)
	telemetry["attack_attempts"] = attack_attempts
	return enemy_health.current_health < health_before_attack

func _wait_attack_ready(hitbox: HitboxComponent) -> bool:
	var sprite := player.get_node_or_null("Sprite") as AnimatedSprite2D
	for _frame in range(MAX_WAIT_FRAMES):
		var animation_locked := sprite != null and sprite.is_playing() and (sprite.animation == "attack" or sprite.animation == "attack_2" or sprite.animation == "attack_3" or sprite.animation == "hurt")
		if not hitbox.monitoring and not animation_locked:
			return true
		await get_tree().physics_frame
	return not hitbox.monitoring

func _receive_enemy_contact(player_health: HealthComponent) -> bool:
	var before := player_health.current_health
	Input.action_press("move_right")
	for _frame in range(MAX_APPROACH_FRAMES):
		await get_tree().physics_frame
		if player_health.current_health < before:
			break
	Input.action_release("move_right")
	telemetry["player_health_after_enemy_hit"] = player_health.current_health
	telemetry["player_invulnerable_after_hit"] = player_health.invulnerable
	if player_health.current_health >= before or not player_health.invulnerable:
		return false
	var initial_events := player_damage_events
	for _frame in range(20):
		await get_tree().physics_frame
	telemetry["unexpected_repeat_damage"] = player_damage_events > initial_events
	telemetry["player_invulnerability_frames"] = 20
	return not bool(telemetry["unexpected_repeat_damage"])

func _kill_enemy(enemy_health: HealthComponent) -> bool:
	while is_instance_valid(enemy) and enemy_health.current_health > 0.0:
		if not await _approach_enemy():
			return false
		var before := enemy_damage_events
		if not await _attack_once(enemy_health):
			return false
		if enemy_damage_events != before + 1:
			return false
	for _frame in range(MAX_WAIT_FRAMES):
		if not is_instance_valid(enemy):
			telemetry["enemy_death_events"] = enemy_deaths
			telemetry["enemy_destroyed"] = enemy_deaths == 1
			return enemy_deaths == 1
		if _frame == MAX_WAIT_FRAMES - 1:
			var sprite := enemy.get_node_or_null("Sprite") as AnimatedSprite2D
			var contact_hitbox := enemy.get_node_or_null("ContactHitbox") as HitboxComponent
			telemetry["enemy_death_wait_state"] = {
				"animation": String(sprite.animation) if sprite else "",
				"playing": sprite.is_playing() if sprite else false,
				"death_loop": str(sprite.sprite_frames.get_animation_loop("death")) if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("death") else "unknown",
				"contact_hitbox_monitoring": contact_hitbox.monitoring if contact_hitbox else false,
				"health_alive": enemy_health.is_alive(),
			}
		await get_tree().physics_frame
	return false

func _on_enemy_died() -> void:
	enemy_deaths += 1
	telemetry["enemy_final_health"] = 0.0

func _fail(stage: String) -> void:
	telemetry["failure_stage"] = stage
	telemetry["enemy_damage_events"] = enemy_damage_events
	telemetry["player_damage_events"] = player_damage_events

func _vector_record(value: Vector2) -> Dictionary:
	return {"x": value.x, "y": value.y}

func _finish() -> void:
	telemetry["enemy_damage_events"] = enemy_damage_events
	telemetry["player_damage_events"] = player_damage_events
	var path := ProjectSettings.globalize_path(TELEMETRY_PATH)
	print("COMBAT_MICRO_TELEMETRY_PATH: %s" % path)
	var file := FileAccess.open(TELEMETRY_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(telemetry, "\t"))
		file.flush()
		file.close()
	print("COMBAT_MICRO_TELEMETRY: %s" % JSON.stringify(telemetry))
	get_tree().quit(0 if bool(telemetry["test_passed"]) else 1)
