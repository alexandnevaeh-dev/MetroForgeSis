extends Node
## Per-family spawn smoke: physics and real actions; no position edits after load.
var checks: Array = []
var observations: Array = []

func record(label: String, passed: bool) -> void:
	checks.append({"label": label, "passed": passed})
	print("FAMILY_INPUT " + JSON.stringify(checks.back()))

func release_actions() -> void:
	for action in ["move_left", "move_right", "move_down", "jump", "attack"]:
		Input.action_release(action)

func reach(player: CharacterBody2D, target: Vector2) -> bool:
	var started := Time.get_ticks_msec()
	var next_jump := 0
	while Time.get_ticks_msec() - started < 7000:
		if not is_instance_valid(player):
			return false
		var dx := target.x - player.position.x
		if absf(dx) < 18 and absf(player.position.y - target.y) < 5 and player.is_on_floor():
			release_actions()
			return true
		Input.action_release("move_left")
		Input.action_release("move_right")
		if absf(dx) > 10:
			Input.action_press("move_right" if dx > 0 else "move_left")
		Input.action_release("jump")
		if player.is_on_floor() and player.position.y > target.y + 6 and Time.get_ticks_msec() > next_jump:
			Input.action_press("jump")
			next_jump = Time.get_ticks_msec() + 180
		await get_tree().physics_frame
	release_actions()
	return false

func _ready() -> void:
	GameManager.start_new_game()
	var world: Node2D = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	var plans: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/visual/castle-room-families.json")).rooms
	for id: String in plans:
		release_actions()
		await world._load_room(id, "left")
		await get_tree().create_timer(0.6).timeout
		var player: CharacterBody2D = world._current_room.get_node("Player")
		var start := player.position
		record(id + " spawn grounded", player.is_on_floor())
		var grounded_y := player.position.y
		await get_tree().physics_frame
		Input.action_press("jump")
		await get_tree().create_timer(0.15).timeout
		record(id + " jump rises", player.position.y < grounded_y - 10)
		Input.action_release("jump")
		await get_tree().create_timer(0.9).timeout
		Input.action_press("move_right")
		await get_tree().create_timer(0.65).timeout
		record(id + " walking advances", player.position.x > start.x + 35)
		await get_tree().physics_frame
		Input.action_press("attack")
		await get_tree().create_timer(0.1).timeout
		record(id + " attack animation plays", String(player.sprite.animation).begins_with("attack"))
		Input.action_release("attack")
		await get_tree().create_timer(0.9).timeout
		release_actions()
		await get_tree().create_timer(0.4).timeout
		record(id + " lands alive", player.is_on_floor() and player.health.current_health > 0)
		if "--stairs" in OS.get_cmdline_user_args():
			for index in range(plans[id].routes[0].targets.size()):
				var target: Dictionary = plans[id].routes[0].targets[index]
				var reached := await reach(player, Vector2(target.x, target.y))
				record(id + " first staircase tread " + str(index + 1), reached)
				if not reached:
					break
		observations.append({"room": id, "start": {"x": start.x, "y": start.y}, "end": {"x": player.position.x, "y": player.position.y}, "health": player.health.current_health})
	var out := "res://qa/castle-room-family-input"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	var file := FileAccess.open(out + "/proof.json", FileAccess.WRITE)
	var passed := checks.all(func(row): return row.passed)
	file.store_string(JSON.stringify({"passed": passed, "checks": checks, "observations": observations, "scope": "Actual input smoke in eight rooms, plus first-staircase ascent when --stairs is supplied. Does not establish full route or door-return traversal."}, "\t"))
	file.close()
	world.queue_free()
	await get_tree().process_frame
	AudioManager.request_quit(0 if passed else 1)
