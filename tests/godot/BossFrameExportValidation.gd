extends Node

var checks := 0
var failures := 0

func check(label: String, passed: bool) -> void:
	checks += 1
	if not passed: failures += 1
	print("BOSS_FRAME_CHECK ", "PASS " if passed else "FAIL ", label)

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	for pair in [["room_008","boss_000"],["room_018","boss_001"],["room_028","boss_002"],["room_038","boss_final"]]:
		world._load_room(pair[0], "left")
		await get_tree().create_timer(0.2).timeout
		var boss = get_tree().get_first_node_in_group("bosses")
		check(pair[1]+" native boss exists", is_instance_valid(boss))
		if not is_instance_valid(boss): continue
		boss.freeze_presentation()
		var sprite = boss.get_node("Sprite")
		var texture = load("res://assets/bosses/"+pair[1]+"_walk.png") as Texture2D
		var size := texture.get_height()
		check(pair[1]+" scene cell equals final PNG height", sprite.frame_size == Vector2i(size,size))
		var expected := int(texture.get_width()/size)
		check(pair[1]+" every walk pose retained", sprite.sprite_frames.get_frame_count("walk") == expected)
		var bounded := true
		for i in range(sprite.sprite_frames.get_frame_count("walk")):
			var frame = sprite.sprite_frames.get_frame_texture("walk",i) as AtlasTexture
			bounded = bounded and frame != null and frame.filter_clip and frame.region == Rect2(i*size,0,size,size)
		check(pair[1]+" exact clipped non-overlapping cells", bounded)
		# The inspection capture deliberately selects the validated walk clip;
		# missing run-art fallback remains a separate production gap.
		sprite.play("walk")
		var player = get_tree().get_first_node_in_group("player")
		player.global_position = boss.global_position + Vector2(-120,0)
		await get_tree().create_timer(0.5).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("res://"+pair[1]+"-frame-review.png")
	for index in range(43):
		var id := "room_%03d" % index
		var path := "res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:
			await world._ensure_packed(id)
	world.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	print("BOSS_FRAME_RESULT checks=",checks," failures=",failures)
	get_tree().quit(0 if failures == 0 else 1)
