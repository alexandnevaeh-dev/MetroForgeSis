extends Node
var failures := 0
func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world._load_room("room_002","left")
	await get_tree().create_timer(0.5).timeout
	for enemy in get_tree().get_nodes_in_group("enemies"):
		enemy.queue_free()
	var camera = get_tree().get_first_node_in_group("player").get_node("Camera2D")
	var view_height: float = get_viewport().get_visible_rect().size.y/camera.zoom.y
	if view_height > 600.0:
		failures += 1
	print("STAIR_CAMERA ","PASS " if view_height <= 600.0 else "FAIL ","world_height=",view_height)
	for flight in range(7):
		var right := flight % 2 == 0
		var player = get_tree().get_first_node_in_group("player")
		Input.action_press("move_right" if right else "move_left")
		var elapsed := 0.0
		while (player.position.x < 858.0 if right else player.position.x > 150.0) and elapsed < 12.0:
			await get_tree().create_timer(0.05).timeout
			elapsed += 0.05
		Input.action_release("move_right")
		Input.action_release("move_left")
		await get_tree().create_timer(0.25).timeout
		var passed: bool = absf(player.position.y-(1472.0-(flight+1)*192.0))<8.0 and player.is_on_floor()
		print("STAIR_WALK ","PASS " if passed else "FAIL ",flight," pos=",player.position," elapsed=",elapsed," velocity=",player.velocity)
		if not passed:
			for contact_index in range(player.get_slide_collision_count()):
				var contact = player.get_slide_collision(contact_index)
				print("STAIR_CONTACT ",contact.get_collider().name," normal=",contact.get_normal())
			print("STAIR_ACTIVE ",world._current_room.get_node("StairFlight_0/StoneFlight")._active_flight)
			failures += 1
			break
	if failures == 0:
		Input.action_press("move_down")
		for flight in range(6,-1,-1):
			var left := flight % 2 == 0
			var player = get_tree().get_first_node_in_group("player")
			Input.action_press("move_left" if left else "move_right")
			var elapsed := 0.0
			while (player.position.x > 150.0 if left else player.position.x < 858.0) and elapsed < 12.0:
				await get_tree().create_timer(0.05).timeout
				elapsed += 0.05
			Input.action_release("move_right")
			Input.action_release("move_left")
			await get_tree().create_timer(0.25).timeout
			var passed: bool = absf(player.position.y-(1472.0-flight*192.0))<8.0 and player.is_on_floor()
			print("STAIR_DESCENT ","PASS " if passed else "FAIL ",flight," pos=",player.position)
			if not passed:
				failures += 1
				break
		Input.action_release("move_down")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/stair-walk"))
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://qa/stair-walk/ascent.png")
	print("STAIR_WALK_RESULT failures=",failures)
	AudioManager.request_quit(0 if failures == 0 else 1)
