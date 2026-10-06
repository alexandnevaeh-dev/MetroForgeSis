extends Node
## Rejected damage must not change movement, immunity, or an in-flight attack.
var checks: Array[Dictionary] = []

func check(label: String, ok: bool) -> void:
	checks.append({"label":label,"passed":ok})
	print(("PASS: " if ok else "FAIL: ") + label)

func actor(scene_path: String) -> CharacterBody2D:
	var body := load(scene_path).instantiate() as CharacterBody2D
	if scene_path.contains("enemies"):
		body.set("enemy_id", "damage_fixture_melee")
	add_child(body)
	body.set_physics_process(false)
	return body

func _ready() -> void:
	GameManager.start_new_game()
	for amount: float in [0.0, -1.0, NAN, INF]:
		var player := actor("res://scenes/player/Player.tscn")
		await get_tree().process_frame
		player.call("_start_attack")
		var health: HealthComponent = player.get_node("HealthComponent")
		player.get_node("HurtboxComponent").hit_received.emit(amount, Vector2(100, 0))
		check("player_rejected_" + str(amount) + "_preserves_attack_and_recovery", health.current_health == 100.0 and not health.invulnerable and player.get("_attack_state") == 1 and player.get("knockback") == Vector2.ZERO and player.get("_stun_time") == 0.0)
		player.queue_free()
		await get_tree().process_frame

	var player := actor("res://scenes/player/Player.tscn")
	var player_health: HealthComponent = player.get_node("HealthComponent")
	player.call("_start_attack")
	player_health.invulnerable = true
	player.get_node("HurtboxComponent").hit_received.emit(10.0, Vector2(100, 0))
	check("player_protected_hit_preserves_attack", player_health.current_health == 100.0 and player.get("_attack_state") == 1 and player.get("knockback") == Vector2.ZERO)
	player_health.invulnerable = false
	player_health.current_health = 0.0
	player.get_node("HurtboxComponent").hit_received.emit(10.0, Vector2(100, 0))
	check("player_dead_hit_does_not_restart_hurt", player.get("_attack_state") == 1 and player.get("_stun_time") == 0.0 and not player_health.invulnerable)
	player.queue_free()
	await get_tree().process_frame
	player = actor("res://scenes/player/Player.tscn")
	player_health = player.get_node("HealthComponent")
	player.call("_start_attack")
	player.get_node("HurtboxComponent").hit_received.emit(10.0, Vector2(100, 0))
	check("player_accepted_hit_interrupts_attack_and_protects", player_health.current_health == 90.0 and player_health.invulnerable and player.get("_attack_state") == 0 and player.get("knockback") == Vector2(100, 0))
	player.queue_free()
	await get_tree().process_frame

	for amount: float in [0.0, -1.0, NAN, INF]:
		await enemy_case("rejected_" + str(amount), amount, false, false, false)
	await enemy_case("protected", 10.0, true, false, false)
	await enemy_case("dead", 10.0, false, true, false)
	await enemy_case("accepted", 10.0, false, false, true)
	var failures := 0
	for item in checks:
		if not item.passed: failures += 1
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://.qa/rejected-damage"))
	FileAccess.open("res://.qa/rejected-damage/results.json", FileAccess.WRITE).store_string(JSON.stringify({"checks":checks,"failures":failures}))
	get_tree().quit(0 if failures == 0 else 1)

func enemy_case(label: String, amount: float, protected: bool, dead: bool, accepted: bool) -> void:
	var enemy := actor("res://scenes/enemies/Enemy.tscn")
	await get_tree().process_frame
	var health: HealthComponent = enemy.get_node("HealthComponent")
	var hitbox: HitboxComponent = enemy.get_node("AttackHitbox")
	health.invulnerable = protected
	if dead: health.current_health = 0.0
	var before := health.current_health
	enemy.set("_state", 3)
	hitbox.activate()
	enemy.get_node("HurtboxComponent").hit_received.emit(amount, Vector2(100, 0))
	if accepted:
		check("enemy_accepted_hit_interrupts_attack", health.current_health == before - 10.0 and enemy.get("_state") == 5 and not hitbox.monitoring)
	else:
		check("enemy_" + label + "_preserves_attack", health.current_health == before and enemy.get("_state") == 3 and hitbox.monitoring and enemy.get("_knockback") == Vector2.ZERO)
	enemy.queue_free()
	await get_tree().process_frame
