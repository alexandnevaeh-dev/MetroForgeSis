extends Node
## Checkpoint/death fixture. Setup loads stages directly and removes encounters;
## checkpoint entry uses Area2D physics and death uses real HealthComponent damage.
var checks: Array = []

func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("PLATFORMER_CHECKPOINT ","PASS " if passed else "FAIL ",label)

func clear_encounters() -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		enemy.queue_free()

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world.transition_to_room("room_003","left")
	clear_encounters()
	await get_tree().create_timer(0.4).timeout
	var player = get_tree().get_first_node_in_group("player")
	var checkpoint = world._current_room.get_node_or_null("SavePoint")
	check("checkpoint stage contains a real save point",checkpoint is Area2D)
	if checkpoint == null:
		AudioManager.request_quit(1)
		return
	# Fixture setup positions the actor just outside the zone. Walk into it.
	# Approach from inside the stage, clear of its left return-door sensor.
	player.position = checkpoint.position+Vector2(80,0)
	Input.action_press("move_left")
	await get_tree().create_timer(0.5).timeout
	Input.action_release("move_left")
	check("walking into save zone activates checkpoint",SaveManager.get_checkpoint_room_id()=="room_003" and SaveManager.has_save())
	var checkpoint_health := SaveManager.get_checkpoint_health()
	await world.transition_to_room("room_004","left")
	clear_encounters()
	await get_tree().create_timer(0.4).timeout
	player = get_tree().get_first_node_in_group("player")
	var old_actor_id: int = player.get_instance_id()
	var health = player.get_node("HealthComponent")
	health.take_damage(health.max_health*10.0)
	check("lethal damage kills the real actor",not health.is_alive())
	await get_tree().create_timer(0.1).timeout
	check("death enters the game-over window",GameManager.current_state==GameManager.GameState.GAME_OVER)
	var elapsed := 0.0
	while elapsed < 5.0 and (GameManager.current_state!=GameManager.GameState.PLAYING or GameManager.current_room_id!="room_003"):
		await get_tree().create_timer(0.1).timeout
		elapsed += 0.1
	clear_encounters()
	await get_tree().create_timer(0.4).timeout
	player = get_tree().get_first_node_in_group("player")
	check("respawn returns to the saved stage",GameManager.current_room_id=="room_003")
	check("respawn creates a fresh actor",is_instance_valid(player) and player.get_instance_id()!=old_actor_id)
	health = player.get_node("HealthComponent")
	check("saved checkpoint health is restored",health.is_alive() and is_equal_approx(health.current_health,checkpoint_health))
	check("respawn restores playable state",GameManager.current_state==GameManager.GameState.PLAYING)
	check("respawn lands on stage geometry",player.is_on_floor())
	var before_x: float = player.position.x
	Input.action_press("move_right")
	await get_tree().create_timer(0.3).timeout
	Input.action_release("move_right")
	check("real movement works after respawn",player.position.x>before_x+20.0)
	var passed := true
	for row in checks:
		passed = passed and row.passed
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/platformer-checkpoint"))
	var report := FileAccess.open("user://qa/platformer-checkpoint/proof.json",FileAccess.WRITE)
	report.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Native checkpoint and death/respawn; direct stage setup, encounters removed, combat acceptance separate."},"\t"))
	report.close()
	print("PLATFORMER_CHECKPOINT_RESULT checks=",checks.size()," passed=",passed)
	AudioManager.request_quit(0 if passed else 1)
