extends Node
## Native render diagnostic, not an end-to-end traversal or visual acceptance.
## Starts the real world and uses player movement input; force-loads forty rooms
## afterwards to check the configured plate, floor anchor and four district stills.
const Guard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/biome-background"
var checks: Array[Dictionary] = []

func check(label: String, passed: bool) -> void:
	checks.append({"label": label, "passed": passed})
	print("%s: %s" % ["PASS" if passed else "FAIL", label])

func _ready() -> void:
	if Guard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	var expected := OS.get_environment("METROFORGE_EXPECTED_BACKGROUND")
	check("independent expected image path supplied", expected.begins_with("assets/"))
	GameManager.start_new_game()
	var world := (load("res://scenes/world/World.tscn") as PackedScene).instantiate() as Node2D
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	check("playable world has a player", player != null)
	if player:
		var initial_x := player.position.x
		Input.action_press("move_right")
		for _i in 18:
			await get_tree().physics_frame
		Input.action_release("move_right")
		check("player moves using actual game input", player.position.x > initial_x + 10.0)
		await get_tree().create_timer(0.3).timeout
		check("player remains alive after movement", player.get_node("HealthComponent").current_health > 0.0)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	var rooms: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/rooms/rooms.json")).get("rooms", {})
	check("forty castle rooms retained", rooms.size() == 40)
	for room_id in rooms.keys():
		await world._load_room(String(room_id), "left")
		await get_tree().process_frame
		await get_tree().process_frame
		var room := world.get("_current_room") as Node2D
		var decor := room.get_node_or_null("StormglassDecor") if room else null
		var plate := decor.get_node_or_null("AuthoredStormglassPanorama") as Sprite2D if decor else null
		check("%s uses exact selected artwork" % room_id, plate != null and plate.texture != null and plate.texture.resource_path == "res://" + expected)
		if plate:
			var floor_y := float(rooms[room_id].get("height", 1152)) - float(rooms[room_id].get("tileSize", 32)) * 2.0
			check("%s plate meets floor framing" % room_id, absf(plate.position.y + float(plate.texture.get_height()) * plate.scale.y * 0.5 - floor_y) < 0.1)
			check("%s honors chosen opacity" % room_id, is_equal_approx(plate.modulate.a, 0.9))
		if String(room_id) in ["room_000", "room_010", "room_020", "room_030"]:
			await get_tree().create_timer(0.3).timeout
			if await Guard.await_post_draw(self):
				var image := get_viewport().get_texture().get_image()
				check("%s renders a native framebuffer" % room_id, image != null and not image.is_empty())
				if image and not image.is_empty():
					check("%s capture saved" % room_id, image.save_png(ProjectSettings.globalize_path(QA + "/" + String(room_id) + ".png")) == OK)
			else:
				check("%s frame draw completes" % room_id, false)
	var passed := checks.all(func(row: Dictionary) -> bool: return bool(row["passed"]))
	var file := FileAccess.open(QA + "/proof.json", FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"passed": passed, "checks": checks, "expectedBackground": expected, "scope": "Native GPU forty-room plate continuity and framing diagnostic; real spawn movement input. Rooms after spawn are force-loaded, not traversed. No new inference or complete game acceptance."}, "  "))
	get_tree().quit(0 if passed else 1)
