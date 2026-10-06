extends Node
var checks := 0
var failures := 0
func check(label: String, passed: bool) -> void:
	checks += 1
	if not passed:
		failures += 1
	print("SPATIAL_PORT_CHECK ","PASS " if passed else "FAIL ",label)

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	# Controlled initial room setup; both transitions below use actual movement.
	await world._load_room("room_003","left")
	await get_tree().create_timer(0.5).timeout
	for enemy in get_tree().get_nodes_in_group("enemies"):
		enemy.queue_free()
	Input.action_press("move_right")
	var elapsed := 0.0
	while GameManager.current_room_id == "room_003" and elapsed < 7.0:
		await get_tree().create_timer(0.05).timeout
		elapsed += 0.05
	Input.action_release("move_right")
	check("walks from shrine into stairwell",GameManager.current_room_id == "room_002")
	await get_tree().create_timer(0.5).timeout
	var player = get_tree().get_first_node_in_group("player")
	check("arrives at shared middle landing",absf(player.position.y-704.0)<3.0 and player.is_on_floor())
	var room: Node2D = world._current_room
	var door = room.get_node_or_null("Transition_left_room_003")
	check("door sensor follows chamber world elevation",door != null and door.position.y == 672.0)
	var query := PhysicsPointQueryParameters2D.new()
	query.position = room.to_global(Vector2(16,640))
	query.collision_mask = 1
	check("middle doorway is a real wall opening",room.get_world_2d().direct_space_state.intersect_point(query).is_empty())
	query.position = room.to_global(Vector2(16,900))
	check("wall below middle doorway is solid",not room.get_world_2d().direct_space_state.intersect_point(query).is_empty())
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/spatial-ports"))
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://qa/spatial-ports/middle-landing.png")
	Input.action_press("move_left")
	elapsed = 0.0
	while GameManager.current_room_id == "room_002" and elapsed < 3.0:
		await get_tree().create_timer(0.05).timeout
		elapsed += 0.05
	Input.action_release("move_left")
	check("returns through middle doorway to shrine",GameManager.current_room_id == "room_003")
	await get_tree().create_timer(0.3).timeout
	player = get_tree().get_first_node_in_group("player")
	check("return arrival remains on shrine floor",absf(player.position.y-704.0)<3.0)
	await world._load_room("room_001","left")
	await get_tree().create_timer(0.5).timeout
	for enemy in get_tree().get_nodes_in_group("enemies"):
		enemy.queue_free()
	room = world._current_room
	query.position = room.to_global(Vector2(1536,720))
	check("gallery floor opening aligns with shaft footprint",room.get_world_2d().direct_space_state.intersect_point(query).is_empty())
	elapsed = 0.0
	while GameManager.current_room_id == "room_001" and elapsed < 12.0:
		player = get_tree().get_first_node_in_group("player")
		Input.action_release("move_left")
		Input.action_release("move_right")
		if player.position.x < 1508.0:
			Input.action_press("move_right")
		elif player.position.x > 1564.0:
			Input.action_press("move_left")
		await get_tree().create_timer(0.05).timeout
		elapsed += 0.05
	Input.action_release("move_left")
	Input.action_release("move_right")
	check("walk and fall reaches aligned stairwell",GameManager.current_room_id == "room_002")
	await get_tree().create_timer(0.5).timeout
	player = get_tree().get_first_node_in_group("player")
	check("vertical arrival uses portal X and upper landing",absf(player.position.x-612.0)<5.0 and absf(player.position.y-128.0)<3.0 and player.is_on_floor())
	print("SPATIAL_PORT_RESULT checks=",checks," failures=",failures)
	AudioManager.request_quit(0 if failures == 0 else 1)
