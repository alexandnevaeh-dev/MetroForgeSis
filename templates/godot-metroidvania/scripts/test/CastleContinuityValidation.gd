extends Node
## Controlled gallery composition and support checks; forced loads are not gameplay proof.
const Guard := preload("res://scripts/test/CaptureGuard.gd")
const Decor := preload("res://scripts/world/StormglassDecor.gd")
const PROFILE := "res://data/visual/castle-spatial-profile.json"
const QA := "res://qa/castle-continuity"
var checks: Array = []

func check(label: String, passed: bool) -> void:
	checks.append({"label": label, "passed": passed})
	print("CASTLE_CONTINUITY_CHECK " + JSON.stringify(checks.back()))

func _ready() -> void:
	if Guard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	var original := FileAccess.get_file_as_string(PROFILE)
	check("continuous profile is read", Decor.spatial_settings("room_001").get("panoramaMode") == "continuous")
	check("unselected rooms preserve their framing", Decor.spatial_settings("room_000").is_empty())
	for mode in [null, false, {}, "repeat", 3]:
		var file := FileAccess.open(PROFILE, FileAccess.WRITE)
		file.store_string(JSON.stringify({"version": 1, "rooms": ["room_001"], "panoramaHeight": 256, "panoramaMode": mode}))
		file.close()
		check("invalid composition is refused: " + JSON.stringify(mode), Decor.spatial_settings("room_001").is_empty())
	var restore := FileAccess.open(PROFILE, FileAccess.WRITE)
	restore.store_string(original)
	restore.close()
	check("authored profile restored exactly", FileAccess.get_file_as_string(PROFILE) == original)
	GameManager.start_new_game()
	var world: Node2D = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.6).timeout
	check("other rooms still use a single legacy panorama", world._current_room.has_node("StormglassDecor/AuthoredStormglassPanorama"))
	await world._load_room("room_001", "left")
	await get_tree().create_timer(0.6).timeout
	var room: Node = world._current_room
	var decor: Node = room.get_node("StormglassDecor")
	var plate: Sprite2D = decor.get_node_or_null("ContinuousCastlePanorama")
	check("exactly one continuous gallery plate", plate != null and decor.get_children().filter(func(node): return node is Sprite2D and node.texture == plate.texture).size() == 1)
	check("no whole-scene bay bands", decor.get_children().all(func(node): return not String(node.name).begins_with("CastleInteriorBayBand_")))
	check("source framing never repeats outside the original image", plate.texture_repeat == CanvasItem.TEXTURE_REPEAT_DISABLED and plate.region_enabled and plate.region_rect == Rect2(0, 0, 1024, 432))
	var rect := plate.get_rect()
	var left := plate.position.x + rect.position.x * plate.scale.x
	var top := plate.position.y + rect.position.y * plate.scale.y
	var width := rect.size.x * plate.scale.x
	var height := rect.size.y * plate.scale.y
	check("one composition covers the entire room width", absf(left) < 0.01 and absf(width - 4096.0) < 0.01)
	check("unbroken plate meets the collision floor", absf(top + height - 1472.0) < 0.01)
	check("no anisotropic stretching", absf(plate.scale.x - plate.scale.y) < 0.00001)
	var profile: Dictionary = JSON.parse_string(original)
	var grade: Array = profile["stoneGrade"]
	check("continuous material grade matches authored RGB", absf(plate.modulate.r - float(grade[0])) < 0.00001 and absf(plate.modulate.g - float(grade[1])) < 0.00001 and absf(plate.modulate.b - float(grade[2])) < 0.00001)
	check("gallery has no modulo-selected condition decals", not decor.has_node("StormglassConditionDecals"))
	var props: Array = decor.get_children().filter(func(node): return String(node.name).begins_with("AuthoredStormglassProp_"))
	check("exactly two intentional pier lights", props.size() == 2 and props.all(func(node): return node.get_meta("dressing_role", "") == "pier_light" and String(node.name).begins_with("AuthoredStormglassProp_00_")))
	for prop: Sprite2D in props:
		var baseline: float = prop.position.y + prop.texture.get_height() * prop.scale.y * 0.5 - decor._texture_bottom_inset(prop.texture) * prop.scale.y
		check("light has real floor support: " + String(prop.name), absf(baseline - 1472.0) < 0.01 and absf(decor._support_surface_y(prop.position.x, 1472.0, decor._texture_half_width(prop.texture) * prop.scale.x) - baseline) < 0.01)
		check("light sits beside architecture: " + String(prop.name), decor.get_children().any(func(node): return String(node.name).begins_with("AuthoredGrandArch_") and absf(node.position.x - prop.position.x) < 96.0))
		check("light clears combat sightline and door margins: " + String(prop.name), (prop.position.x < 950.0 or prop.position.x > 3150.0) and prop.position.x > 160.0 and prop.position.x < 3936.0 and prop.z_index < 0)
	var interiors: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/visual/castle-interiors.json"))
	var plan: Dictionary = interiors["rooms"]["room_001"]
	check("all three storeys have named internal chambers", plan["sections"].size() == 8 and decor.get_children().filter(func(node): return String(node.name).begins_with("InteriorChamber_")).size() == 5)
	check("balcony supports follow the real storey surfaces", room.get_node("StormglassPlatformSupports").get_child_count() == plan["platforms"].size() * 2)
	check("internal room doorway headers are real collision", room.get_children().filter(func(node): return node is StaticBody2D and String(node.name).begins_with("Platform_") and node.get_node("CollisionShape2D").shape.size.y > 64).size() == 3)
	var player: Node2D = room.get_node("Player")
	player.set_physics_process(false)
	var camera: Camera2D = player.get_node("Camera2D")
	camera.position_smoothing_enabled = false
	var captures: Array = []
	for x in [640.0, 2048.0, 3456.0]:
		player.position = Vector2(x, 1472.0)
		camera.reset_smoothing()
		camera.force_update_scroll()
		await get_tree().process_frame
		if await Guard.await_post_draw(self):
			var path := QA + "/gallery-%d.png" % int(x)
			get_viewport().get_texture().get_image().save_png(path)
			captures.append(path)
	for storey in ["middle", "upper"]:
		player.position = Vector2(2048, float(plan["floors"][storey]))
		camera.force_update_scroll()
		await get_tree().process_frame
		if await Guard.await_post_draw(self):
			var path: String = QA + "/gallery-" + str(storey) + ".png"
			get_viewport().get_texture().get_image().save_png(path)
			captures.append(path)
	camera.set_process(false)
	camera.set_physics_process(false)
	camera.set_as_top_level(true)
	camera.anchor_mode = Camera2D.ANCHOR_MODE_DRAG_CENTER
	camera.offset = Vector2.ZERO
	camera.limit_smoothed = false
	camera.limit_left = -10000
	camera.limit_top = -10000
	camera.limit_right = 10000
	camera.limit_bottom = 10000
	camera.zoom = Vector2.ONE * 0.3125
	camera.global_position = Vector2(2048, 768)
	camera.reset_smoothing()
	camera.force_update_scroll()
	await get_tree().process_frame
	if await Guard.await_post_draw(self):
		var path := QA + "/gallery-overview.png"
		get_viewport().get_texture().get_image().save_png(path)
		captures.append(path)
	var passed: bool = checks.all(func(row): return row.passed)
	var output := FileAccess.open(QA + "/proof.json", FileAccess.WRITE)
	output.store_string(JSON.stringify({"passed": passed, "checks": checks, "captures": captures, "plate": {"x": left, "y": top, "width": width, "height": height}, "scope": "Controlled native room loads, invalid-mode checks, scenery support and camera captures; not normal-input traversal or final art approval."}, "\t"))
	output.close()
	world.queue_free()
	world = null
	await get_tree().process_frame
	await get_tree().process_frame
	AudioManager.request_quit(0 if passed else 1)
