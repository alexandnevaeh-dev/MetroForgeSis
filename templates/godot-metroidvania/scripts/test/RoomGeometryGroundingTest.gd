extends Node
## Diagnostic: actual spawn movement, then force-loaded room geometry and art support.
## This is not a complete input-driven game traversal or artistic approval.
const Guard := preload("res://scripts/test/CaptureGuard.gd")
const Probe := preload("res://scripts/test/GroundingProbe.gd")
const QA := "res://qa/room-geometry-grounding"
var checks: Array[Dictionary] = []
var timings: Array[Dictionary] = []

func check(label: String, value: bool) -> void:
	checks.append({"label": label, "passed": value})
	print("%s: %s" % ["PASS" if value else "FAIL", label])

func box(parent: Node2D, label: String, center: Vector2, size: Vector2) -> StaticBody2D:
	var body := StaticBody2D.new()
	body.name = label
	body.position = center
	var shape := CollisionShape2D.new()
	shape.shape = RectangleShape2D.new()
	shape.shape.size = size
	body.add_child(shape)
	parent.add_child(body)
	return body

func _support_probes() -> void:
	var room := Node2D.new()
	room.position = Vector2(-20000, -20000)
	add_child(room)
	var floor_body := box(room, "Floor", Vector2(300, 368), Vector2(600, 64))
	box(room, "Platform_0", Vector2(300, 256), Vector2(64, 32))
	var probe := Probe.new()
	probe.room_width = 600
	probe.room_height = 400
	room.add_child(probe)
	await get_tree().physics_frame
	await get_tree().physics_frame
	check("floor furniture ignores a narrow raised platform", is_equal_approx(probe._support_surface_y(300, 336, 100), 336.0))
	floor_body.queue_free()
	box(room, "FloorLeft", Vector2(100, 368), Vector2(200, 64))
	box(room, "FloorRight", Vector2(500, 368), Vector2(200, 64))
	await get_tree().physics_frame
	await get_tree().physics_frame
	check("floor furniture is refused over a pit", not is_finite(probe._support_surface_y(300, 336, 100)))
	check("wide furniture is refused when its center alone has support", not is_finite(probe._support_surface_y(180, 336, 100)))
	check("supported furniture remains allowed beside the pit", is_equal_approx(probe._support_surface_y(100, 336, 50), 336.0))
	var image := Image.create(40, 40, false, Image.FORMAT_RGBA8)
	image.fill(Color(0, 0, 0, 0))
	image.fill_rect(Rect2i(8, 3, 24, 21), Color.WHITE)
	image.fill_rect(Rect2i(5, 35, 4, 4), Color.WHITE)
	var texture := ImageTexture.create_from_image(image)
	check("detached bottom specks do not define the ground anchor", is_equal_approx(probe._texture_bottom_inset(texture), 16.0))
	check("visible footprint follows the main silhouette", is_equal_approx(probe._texture_half_width(texture), 12.0))
	room.queue_free()
	await get_tree().process_frame

func _ready() -> void:
	if Guard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	await _support_probes()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	var expected: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(QA + "/expected.json"))
	GameManager.start_new_game()
	var world := (load("res://scenes/world/World.tscn") as PackedScene).instantiate() as Node2D
	add_child(world)
	await get_tree().create_timer(0.6).timeout
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	check("playable world has a player", player != null)
	if player:
		var initial_x := player.position.x
		Input.action_press("move_right")
		for _i in 18:
			await get_tree().physics_frame
		Input.action_release("move_right")
		check("player moves using real game input", player.position.x > initial_x + 10.0)
		check("player remains alive", player.get_node("HealthComponent").current_health > 0.0)
	check("forty rooms have independent source-scene geometry", expected["rooms"].size() == 40)
	for room_id in expected["rooms"]:
		var started := Time.get_ticks_usec()
		await world._load_room(String(room_id), "left")
		await get_tree().physics_frame
		await get_tree().physics_frame
		var room := world.get("_current_room") as Node2D
		var source: Dictionary = expected["rooms"][room_id]
		var solids: Dictionary = {}
		var floors: Array[Rect2] = []
		for collider in room.find_children("*", "CollisionShape2D", true, false):
			var body := collider.get_parent()
			if not body is StaticBody2D or collider.disabled or (body.collision_layer & 1) == 0 or not collider.shape is RectangleShape2D:
				continue
			var half: Vector2 = collider.shape.size * 0.5
			var top_left := room.to_local(collider.global_transform * -half)
			var bottom_right := room.to_local(collider.global_transform * half)
			solids[String(room.get_path_to(collider))] = Rect2(top_left, bottom_right - top_left)
			if String(body.name) in ["Floor", "FloorLeft", "FloorRight"] or String(body.name).begins_with("FloorSeg") or String(body.name).begins_with("FloorSection_"):
				floors.append(Rect2(top_left, bottom_right - top_left))
		var matches: bool = solids.size() == source["rects"].size()
		for rect in source["rects"]:
			var value: Rect2 = solids.get(String(rect["path"]), Rect2())
			matches = matches and value.position.is_equal_approx(Vector2(float(rect["x"]), float(rect["y"]))) and value.size.is_equal_approx(Vector2(float(rect["w"]), float(rect["h"])))
		check("%s editor collision matches all native static rectangles" % room_id, matches)
		var ground := room.get_node_or_null("Ground")
		check("%s editor and native grid units agree" % room_id, ground != null and int(ground.tile_size) == int(source["tileSize"]))
		var decor := room.get_node_or_null("StormglassDecor")
		var supported := true
		var grounded_count := 0
		var duplicate_window := false
		for sprite in decor.find_children("*", "Sprite2D", true, false) if decor else []:
			var floor_prop: bool = String(sprite.name).begins_with("AuthoredStormglassProp_") or (String(sprite.name).begins_with("ConditionDecal_") and String(sprite.get_meta("mount", "")) == "floor")
			if String(sprite.name).begins_with("AuthoredStormglassProp_04_"):
				duplicate_window = true
			if not floor_prop:
				continue
			grounded_count += 1
			var metrics: Dictionary = expected["alpha"].get(sprite.texture.resource_path, {})
			if metrics.is_empty():
				supported = false
				continue
			var base := room.to_local(sprite.global_transform * Vector2(0, float(metrics["bottom"]) + 1.0 - float(metrics["height"]) * 0.5))
			var half_width: float = float(metrics["right"] - metrics["left"] + 1) * float(sprite.scale.x) * 0.5
			for fraction in [-0.8, -0.4, 0.0, 0.4, 0.8]:
				var contact := Vector2(base.x + half_width * float(fraction), base.y)
				var hit := false
				for floor_rect in floors:
					if contact.x >= floor_rect.position.x and contact.x <= floor_rect.end.x and absf(contact.y - floor_rect.position.y) < 1.1:
						hit = true
				supported = supported and hit
		check("%s main prop silhouettes have full floor support" % room_id, supported and grounded_count > 0)
		check("%s redundant foreground window is absent" % room_id, not duplicate_window)
		timings.append({"room": room_id, "loadAndChecksMs": float(Time.get_ticks_usec() - started) / 1000.0, "groundedProps": grounded_count, "colliders": solids.size()})
		if String(room_id) in ["room_000", "room_002", "room_010", "room_020", "room_030"]:
			await get_tree().create_timer(0.2).timeout
			if await Guard.await_post_draw(self):
				var image := get_viewport().get_texture().get_image()
				check("%s native capture saved" % room_id, image != null and not image.is_empty() and image.save_png(ProjectSettings.globalize_path(QA + "/" + String(room_id) + ".png")) == OK)
			else:
				check("%s native frame completes" % room_id, false)
	var passed := checks.all(func(row: Dictionary) -> bool: return bool(row["passed"]))
	var file := FileAccess.open(QA + "/proof.json", FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"passed": passed, "checks": checks, "timings": timings, "scope": "Native NVIDIA render and collision/prop-grounding diagnostic; real spawn movement followed by force-loaded rooms. Not whole-game traversal or final visual acceptance."}, "  "))
	world.queue_free()
	await get_tree().process_frame
	get_tree().quit(0 if passed else 1)
