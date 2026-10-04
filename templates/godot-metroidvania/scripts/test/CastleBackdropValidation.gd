extends Node
## Controlled native room loads/config inputs; separate from ordinary gameplay proof.
const Guard := preload("res://scripts/test/CaptureGuard.gd")
const Decor := preload("res://scripts/world/StormglassDecor.gd")
const PROFILE := "res://data/visual/castle-spatial-profile.json"
const QA := "res://qa/castle-backdrop"
var checks: Array = []

func check(label: String, passed: bool) -> void:
	checks.append({"label": label, "passed": passed})
	print("CASTLE_BACKDROP_CHECK " + JSON.stringify(checks.back()))

func rect_data(sprite: Sprite2D) -> Dictionary:
	var rect := sprite.get_rect()
	return {"x": sprite.position.x + rect.position.x * sprite.scale.x, "y": sprite.position.y + rect.position.y * sprite.scale.y, "width": rect.size.x * sprite.scale.x, "height": rect.size.y * sprite.scale.y, "tileWidth": sprite.texture.get_width() * sprite.scale.x, "repeat": sprite.texture_repeat, "opacity": sprite.modulate.a, "tint": [sprite.modulate.r, sprite.modulate.g, sprite.modulate.b]}

func _ready() -> void:
	if Guard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	var original := FileAccess.get_file_as_string(PROFILE)
	check("valid gallery profile is read", Decor.spatial_settings("room_001") == {"panoramaHeight": 1024.0})
	check("other rooms keep legacy framing", Decor.spatial_settings("room_000").is_empty())
	for value in ["1024", [], {}, null, 511, 1537]:
		var file := FileAccess.open(PROFILE, FileAccess.WRITE)
		file.store_string(JSON.stringify({"version": 1, "rooms": ["room_001"], "panoramaHeight": value}))
		file.close()
		check("invalid height is refused: " + JSON.stringify(value), Decor.spatial_settings("room_001").is_empty())
	var restore := FileAccess.open(PROFILE, FileAccess.WRITE)
	restore.store_string(original)
	restore.close()
	check("profile bytes restored exactly", FileAccess.get_file_as_string(PROFILE) == original)
	GameManager.start_new_game()
	var world: Node2D = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.6).timeout
	var room: Node = world._current_room
	var legacy: Sprite2D = room.get_node("StormglassDecor/AuthoredStormglassPanorama")
	var legacy_data := rect_data(legacy)
	check("legacy background native rectangle retained", absf(legacy_data.x) < 0.01 and absf(legacy_data.y + 304.0) < 0.01 and absf(legacy_data.width - 1792.0) < 0.01 and absf(legacy_data.height - 1008.0) < 0.01)
	await world._load_room("room_001", "left")
	await get_tree().create_timer(0.6).timeout
	room = world._current_room
	var bands: Array = []
	for node in room.get_node("StormglassDecor").get_children():
		if String(node.name).begins_with("CastleInteriorBayBand_"):
			bands.append(rect_data(node))
	check("two native interior bands", bands.size() == 2)
	check("lower native band meets gallery floor", absf(bands[0].y - 448.0) < 0.01 and absf(bands[0].height - 1024.0) < 0.01 and absf(bands[0].width - 4096.0) < 0.01)
	check("upper band continues the same world scale", absf(bands[1].y + 576.0) < 0.01 and absf(bands[0].tileWidth - bands[1].tileWidth) < 0.01)
	check("horizontal native mirror repetition", bands.all(func(band): return band.repeat == CanvasItem.TEXTURE_REPEAT_MIRROR))
	check("upper band uses native depth opacity", absf(bands[1].opacity - bands[0].opacity * 0.68) < 0.0001)
	check("native stone material grading", absf(bands[0].tint[0] - 0.86) < 0.00001 and absf(bands[0].tint[1] - 0.90) < 0.00001 and absf(bands[0].tint[2] - 0.96) < 0.00001)
	check("eighteen stone balcony corbels", room.get_node("StormglassPlatformSupports").get_child_count() == 18)
	if await Guard.await_post_draw(self):
		get_viewport().get_texture().get_image().save_png(QA + "/native-gallery.png")
	var passed: bool = checks.all(func(row): return row.passed)
	var proof := {"passed": passed, "checks": checks, "legacy": legacy_data, "bands": bands, "scope": "Controlled native profile failures and forced room loads on NVIDIA; not gameplay traversal or final art acceptance."}
	var output := FileAccess.open(QA + "/proof.json", FileAccess.WRITE)
	output.store_string(JSON.stringify(proof, "\t"))
	output.close()
	world.queue_free()
	world = null
	await get_tree().process_frame
	await get_tree().process_frame
	AudioManager.request_quit(0 if passed else 1)
