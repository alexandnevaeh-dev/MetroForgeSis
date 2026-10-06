extends Node
var failures := 0
var checks := 0

func check(label: String, value: bool) -> void:
	checks += 1
	if not value:
		failures += 1
	print("MASONRY_CHECK ", "PASS " if value else "FAIL ", label)

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world._load_room("room_000", "left")
	await get_tree().create_timer(0.5).timeout
	var room: Node2D = world._current_room
	var kit = room.find_child("ThemedRoomKit", true, false)
	check("background clips to exact authored room size", kit.interior_clip.clip_contents and kit.interior_clip.size == Vector2(3072,768))
	var space := room.get_world_2d().direct_space_state
	var player = get_tree().get_first_node_in_group("player")
	check("player body cannot jump into solid roof", player.test_move(Transform2D(0.0,room.to_global(Vector2(300,640))),Vector2(0,-700)))
	check("player body fits connecting hall", not player.test_move(Transform2D(0.0,room.to_global(Vector2(680,660))),Vector2(160,0)))
	for point in [Vector2(300,100),Vector2(900,200),Vector2(1536,400)]:
		var query := PhysicsPointQueryParameters2D.new()
		query.position = room.to_global(point)
		query.collision_mask = 1
		check("unused canvas is solid masonry " + str(point), not space.intersect_point(query).is_empty())
	for point in [Vector2(300,640),Vector2(768,640),Vector2(1536,640),Vector2(2304,640)]:
		var query := PhysicsPointQueryParameters2D.new()
		query.position = room.to_global(point)
		query.collision_mask = 1
		check("interconnecting hall remains open " + str(point), space.intersect_point(query).is_empty())
	for body in room.get_children():
		if body is StaticBody2D and String(body.name).begins_with("Masonry"):
			var art = kit.get_node_or_null("Brick_" + String(body.name))
			check(String(body.name) + " has collision matched brick face", art != null and art.get_meta("collision_body") == body)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/masonry"))
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://qa/masonry/opening.png")
	var start_x: float = player.position.x
	Input.action_press("move_right")
	await get_tree().create_timer(4.5).timeout
	Input.action_release("move_right")
	check("real movement crosses the first chamber hall", GameManager.current_room_id == "room_000" and player.position.x > 840.0 and player.position.x > start_x+600.0)
	check("player remains within built floor band", player.position.y > 384.0 and player.position.y < 705.0)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://qa/masonry/hall-traversal.png")
	print("MASONRY_RESULT checks=",checks," failures=",failures)
	get_tree().quit(0 if failures == 0 else 1)
