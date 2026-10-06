extends Node
## Controlled positions validate geometry and presentation, not input traversal.
const Guard := preload("res://scripts/test/CaptureGuard.gd")
var checks: Array = []
var captures: Array = []

func check(label: String, passed: bool) -> void:
	checks.append({"label": label, "passed": passed})
	print("FAMILY_CHECK " + JSON.stringify(checks.back()))

func _ready() -> void:
	if Guard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	var out := "res://qa/castle-room-families"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out))
	GameManager.start_new_game()
	var world: Node2D = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	var plans: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/visual/castle-room-families.json")).rooms
	for id: String in plans:
		await world._load_room(id, "left")
		await get_tree().create_timer(0.3).timeout
		var room: Node2D = world._current_room
		var plan: Dictionary = plans[id]
		check(id + " has original room decoration", room.has_node("CastleRoomFamilyDecor"))
		var decor: Node = room.get_node("CastleRoomFamilyDecor")
		check(id + " has imported modular pieces", decor.get_children().filter(func(n): return n is Sprite2D).size() >= 3)
		check(id + " has physical stair treads", room.get_children().filter(func(n): return n is StaticBody2D and String(n.name).begins_with("Platform_")).size() >= plan.routes.size() * 8)
		var player: CharacterBody2D = room.get_node("Player")
		player.set_physics_process(false)
		var camera: Camera2D = player.get_node("Camera2D")
		camera.set_process(false)
		camera.set_physics_process(false)
		camera.set_as_top_level(true)
		camera.position_smoothing_enabled = false
		camera.limit_smoothed = false
		camera.limit_left = -20000
		camera.limit_top = -20000
		camera.limit_right = 20000
		camera.limit_bottom = 20000
		camera.offset = Vector2.ZERO
		for mode in ["overview", "detail"]:
			if mode == "overview":
				camera.zoom = Vector2.ONE * minf(1200.0 / float(plan.width), 640.0 / float(plan.height))
				camera.global_position = Vector2(float(plan.width) / 2, float(plan.height) / 2)
			else:
				camera.zoom = Vector2.ONE * 1.6
				camera.global_position = Vector2(float(plan.width) * 0.55, float(plan.floorY) - 192)
			camera.reset_smoothing()
			camera.force_update_scroll()
			await get_tree().process_frame
			if await Guard.await_post_draw(self):
				var path: String = out + "/" + String(plan.family) + "-" + mode + ".png"
				get_viewport().get_texture().get_image().save_png(path)
				captures.append(path)
		check(id + " captured both native views", captures.size() % 2 == 0)
	var passed: bool = checks.all(func(row): return row.passed) and captures.size() == 16
	var file := FileAccess.open(out + "/proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed": passed, "checks": checks, "captures": captures, "scope": "Native NVIDIA render and collision structure with controlled camera/positions; not input traversal or final art acceptance."}, "\t"))
	file.close()
	AudioManager.stop_all_audio()
	world.queue_free()
	await get_tree().process_frame
	get_tree().quit(0 if passed else 1)
