extends Node

var checks: Array = []

func check(label: String, passed: bool) -> void:
	checks.append({"label": label, "passed": passed})
	print("PLAYER_RECOVERY_CHECK " + JSON.stringify(checks.back()))

func _ready() -> void:
	GameManager.start_new_game()
	var player: CharacterBody2D = load("res://scenes/player/Player.tscn").instantiate()
	add_child(player)
	player.set_physics_process(false)
	await get_tree().physics_frame
	await get_tree().physics_frame
	# Resource loading can consume the first idle delta; settle both clocks before
	# testing durations so newly created SceneTreeTimers cannot expire on that delta.
	await get_tree().process_frame
	await get_tree().process_frame
	var before: float = player.health.current_health
	player.hurtbox.receive_hit(1, 0, null)
	check("accepted hit damages the player", player.health.current_health < before)
	check("accepted hit starts recovery invulnerability", player.health.invulnerable)
	var after: float = player.health.current_health
	player.hurtbox.receive_hit(1, 100, null)
	check("repeated contact cannot damage during recovery", player.health.current_health == after)
	check("protected contact does not apply knockback", player.velocity == Vector2.ZERO)
	var recovery_started := Time.get_ticks_msec()
	await get_tree().create_timer(0.7, true, false, true).timeout
	print("PLAYER_RECOVERY_TIMING " + JSON.stringify({"elapsedMs": Time.get_ticks_msec() - recovery_started, "timeScale": Engine.time_scale}))
	check("recovery ends after its half-second interval", not player.health.invulnerable)
	player.hurtbox.receive_hit(-1, 100, null)
	check("invalid damage cannot start hurt recovery or knockback", not player.health.invulnerable and player.velocity == Vector2.ZERO and player.health.current_health == after)
	player.hurtbox.receive_hit(1, 0, null)
	check("damage resumes after recovery", player.health.current_health < after)
	player.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	check("removing a hurt player frees the player", not is_instance_valid(player))
	var passed := checks.all(func(item): return item.passed)
	var file := FileAccess.open("res://player-recovery-proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed": passed, "checks": checks, "scope": "Controlled production player hurtbox, damage protection, recovery and removal lifecycle. Native shutdown diagnostics are evaluated separately."}, "\t"))
	file.close()
	AudioManager.request_quit(0 if passed else 1)
