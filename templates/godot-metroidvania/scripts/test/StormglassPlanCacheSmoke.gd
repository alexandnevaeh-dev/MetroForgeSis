extends Node

const Guard := preload("res://scripts/test/CaptureGuard.gd")
var checks: Array = []

func check(label: String, passed: bool) -> void:
	checks.append({"label": label, "passed": passed})
	print("PLAN_CACHE_SMOKE " + JSON.stringify(checks.back()))

func _ready() -> void:
	if Guard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	var output := "res://qa/plan-cache-smoke"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	GameManager.start_new_game()
	var world: Node2D = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world._load_room("room_001", "left")
	await get_tree().create_timer(1.0).timeout
	var room: Node2D = world._current_room
	var decor: Node = room.get_node("StormglassDecor")
	var player: CharacterBody2D = room.get_node("Player")
	check("spawn is grounded", player.is_on_floor())
	check("region masonry remains present", decor.has_node("RegionMasonryCourses") or decor.has_node("RegionFacadeModules"))
	check("all twenty furnishings remain present", decor.find_children("RegionFurnishing_*", "Sprite2D", true, false).size() == 20)
	var furnishing_report: Array = []
	var supported := true
	for sprite: Sprite2D in decor.find_children("RegionFurnishing_*", "Sprite2D", true, false):
		var floor_y := float(sprite.get_meta("support_y"))
		var support_half_width := float(sprite.get_meta("support_half_width"))
		var support: bool = decor._region_surface_supported(sprite.position.x, floor_y, support_half_width)
		supported = supported and support
		furnishing_report.append({"id": String(sprite.name), "x": sprite.position.x, "y": sprite.position.y, "width": sprite.texture.get_width() * sprite.scale.x, "height": sprite.texture.get_height() * sprite.scale.y, "supported": support})
	check("each furnishing has five-point native floor support", supported)
	var before := player.position
	if await Guard.await_post_draw(self):
		get_viewport().get_texture().get_image().save_png(output + "/before.png")
	var floor_y := player.position.y
	Input.action_press("jump")
	await get_tree().create_timer(0.15).timeout
	Input.action_release("jump")
	check("real jump input rises", player.position.y < floor_y - 10)
	var landing_deadline := Time.get_ticks_msec() + 3000
	while not player.is_on_floor() and Time.get_ticks_msec() < landing_deadline:
		await get_tree().physics_frame
	check("player lands after jump", player.is_on_floor())
	Input.action_press("move_right")
	await get_tree().create_timer(0.65).timeout
	Input.action_release("move_right")
	check("real walking input advances", player.position.x > before.x + 35)
	if await Guard.await_post_draw(self):
		get_viewport().get_texture().get_image().save_png(output + "/after.png")
	var passed := checks.all(func(item): return item.passed)
	var file := FileAccess.open(output + "/proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed": passed, "checks": checks, "furnishings": furnishing_report, "visualApproved": false, "scope": "Initial controlled room load; subsequent walking and jumping use real input. Short room-loading regression, not full region or campaign traversal."}, "\t"))
	file.close()
	world.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	AudioManager.request_quit(0 if passed else 1)
