extends Node

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	for i in range(12):
		await get_tree().process_frame
	await world.load_area("overworld")
	for i in range(12):
		await get_tree().process_frame
	var player = get_tree().get_first_node_in_group("player")
	var sprite = player.get_node("Sprite") if player else null
	var observed: Dictionary = {}
	Input.action_press("move_right")
	for i in range(45):
		await get_tree().physics_frame
		await get_tree().process_frame
		if sprite:
			observed[str(sprite.animation) + ":" + str(sprite.frame)] = true
	Input.action_release("move_right")
	await RenderingServer.frame_post_draw
	var capture_dir := "E:/Metroforge/Recovery-Audit/development-20260929/topdown/pixel-redesign"
	DirAccess.make_dir_recursive_absolute(capture_dir)
	get_viewport().get_texture().get_image().save_png(capture_dir + "/gameplay-v2.png")
	var file := FileAccess.open(capture_dir + "/capture-v2.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({
		"genre": "topdown",
		"layoutStyle": "woodland_ruins",
		"playerPresent": is_instance_valid(player),
		"observedFrames": observed.keys(),
		"scope": "Native rendered redesign candidate after actual movement input; not visual approval or a complete playthrough"
	}, "  "))
	file.close()
	get_tree().quit()
