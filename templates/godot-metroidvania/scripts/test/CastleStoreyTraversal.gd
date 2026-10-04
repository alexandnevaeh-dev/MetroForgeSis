extends Node
## Controlled room load, then actual controller input. No position, ability or health changes.
const Guard := preload("res://scripts/test/CaptureGuard.gd")
var world: Node2D
var player: CharacterBody2D
var observations: Array = []
var captures: Array = []

func _ready() -> void:
	if Guard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://qa/castle-storeys"))
	GameManager.start_new_game()
	world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world._load_room("room_001", "left")
	await get_tree().create_timer(0.5).timeout
	player = world._current_room.get_node("Player")
	var plan: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/visual/castle-interiors.json"))["rooms"]["room_001"]
	var passed := true
	for index in range(plan["ascent"].size()):
		var target: Dictionary = plan["ascent"][index]
		var side: float = 1.0 if index <= 5 else -1.0
		# The last upper tread joins a continuous floor. Launch from outside that
		# floor's end so the real solid underside cannot block the player's head.
		var launch_x: float = float(target["x"]) - side * 132.0
		if index == 9:
			launch_x = float(plan["width"]) - 1004.0
		var approach: bool = await move_to(Vector2(launch_x, player.position.y), 20000, false)
		if not approach:
			observations.append({"step": index, "phase": "approach", "reached": false, "position": [player.position.x, player.position.y] if is_instance_valid(player) else []})
			passed = false
			break
		var reached: bool = await move_to(Vector2(float(target["x"]), float(target["y"])))
		observations.append({"step": index, "target": target, "reached": reached, "position": [player.position.x, player.position.y] if is_instance_valid(player) else []})
		print("STOREY_STEP " + JSON.stringify(observations.back()))
		if not reached:
			passed = false
			break
		if index == 4 or index == 9:
			await capture("middle" if index == 4 else "upper")
	if passed:
		var loft: bool = await move_to(Vector2(832, float(plan["floors"]["upper"])))
		observations.append({"route": "upper-loft-crossing", "reached": loft})
		passed = loft
		await capture("archive-loft")
	if passed:
		var returned: bool = await move_to(Vector2(3904, float(plan["floors"]["lower"])), 30000)
		observations.append({"route": "downstairs-return", "reached": returned})
		passed = returned
		await capture("downstairs-return")
	for action in ["move_left", "move_right", "jump", "attack"]:
		Input.action_release(action)
	var proof := {"passed": passed, "observations": observations, "captures": captures, "scope": "Controlled initial room load, then actual Input-only stair ascent, loft crossing and downstairs return; no actor position, health, ability or enemy modifications."}
	var file := FileAccess.open("res://qa/castle-storeys/proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(proof, "\t"))
	file.close()
	world.queue_free()
	world = null
	player = null
	await get_tree().process_frame
	await get_tree().process_frame
	AudioManager.request_quit(0 if passed else 1)

func move_to(target: Vector2, timeout_ms: int = 15000, gap_jump: bool = true) -> bool:
	var started := Time.get_ticks_msec()
	var last_attack := 0
	var jump_until := 0
	while Time.get_ticks_msec() - started < timeout_ms:
		if not is_instance_valid(player) or GameManager.current_room_id != "room_001":
			return false
		var dx := target.x - player.position.x
		if absf(dx) < 18 and absf(player.position.y - target.y) < 4 and player.is_on_floor():
			Input.action_release("move_left")
			Input.action_release("move_right")
			return true
		var direction := signf(dx) if absf(dx) > 10 else 0.0
		Input.action_release("move_left")
		Input.action_release("move_right")
		if direction != 0:
			Input.action_press("move_right" if direction > 0 else "move_left")
		var ahead := player.global_position + Vector2(direction * 60, -6)
		var query := PhysicsRayQueryParameters2D.create(ahead, ahead + Vector2(0, 90), 1)
		var supported := not player.get_world_2d().direct_space_state.intersect_ray(query).is_empty()
		if player.is_on_floor() and (player.position.y > target.y + 6 or (gap_jump and not supported)) and Time.get_ticks_msec() > jump_until + 100:
			jump_until = Time.get_ticks_msec() + 450
		if Time.get_ticks_msec() < jump_until:
			Input.action_press("jump")
		else:
			Input.action_release("jump")
		if Time.get_ticks_msec() - last_attack > 420:
			Input.action_press("attack")
			last_attack = Time.get_ticks_msec()
		await get_tree().physics_frame
		Input.action_release("attack")
	return false

func capture(label: String) -> void:
	await get_tree().process_frame
	if await Guard.await_post_draw(self):
		var path := "res://qa/castle-storeys/" + label + ".png"
		get_viewport().get_texture().get_image().save_png(path)
		captures.append(path)
