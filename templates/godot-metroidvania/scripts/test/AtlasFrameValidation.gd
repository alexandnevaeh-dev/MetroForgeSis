extends Node

var checks: Array[Dictionary] = []

func check(label: String, passed: bool, detail: Variant = null) -> void:
	checks.append({"name": label, "passed": passed, "detail": detail})
	print("ATLAS_CHECK ", label, " ", passed, " ", detail)

func _ready() -> void:
	var script = load("res://scripts/core/AnimatedAssetSprite.gd")
	var sprite = script.new()
	sprite.sheet_path = "assets/characters/player_walk.png"
	sprite.attack_sheet_path = "assets/characters/player_attack.png"
	sprite.hurt_sheet_path = "assets/characters/player_hurt.png"
	sprite.death_sheet_path = "assets/characters/player_death.png"
	sprite.position = Vector2(-1000, -1000)
	add_child(sprite)
	await get_tree().process_frame
	var frame_total := 0
	var unsafe := 0
	var malformed := 0
	for animation in sprite.sprite_frames.get_animation_names():
		for frame in range(sprite.sprite_frames.get_frame_count(animation)):
			var texture = sprite.sprite_frames.get_frame_texture(animation, frame)
			if not texture is AtlasTexture:
				continue
			frame_total += 1
			if not texture.filter_clip: unsafe += 1
			if texture.region.size != Vector2(64, 64): malformed += 1
	check("authored frame regions unchanged", malformed == 0 and frame_total > 1, frame_total)
	check("all authored atlas frames isolate sampling", unsafe == 0, unsafe)
	var source := Image.create(16, 8, false, Image.FORMAT_RGBA8)
	source.fill(Color.GREEN)
	source.fill_rect(Rect2i(8, 0, 8, 8), Color.MAGENTA)
	var atlas := AtlasTexture.new()
	atlas.atlas = ImageTexture.create_from_image(source)
	atlas.region = Rect2(0, 0, 8, 8)
	# Reuse the actual runtime flag, so this regression fails on the old loader.
	atlas.filter_clip = sprite.sprite_frames.get_frame_texture("walk", 0).filter_clip
	var viewport := SubViewport.new()
	viewport.size = Vector2i(160, 160)
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	var test_sprite := Sprite2D.new()
	test_sprite.texture = atlas
	test_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	test_sprite.position = Vector2(80, 80)
	test_sprite.scale = Vector2(9.3, 9.3)
	test_sprite.rotation = 0.17
	viewport.add_child(test_sprite)
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var image := viewport.get_texture().get_image()
	var foreign := 0
	var visible_pixels := 0
	for y in range(image.get_height()):
		for x in range(image.get_width()):
			var pixel := image.get_pixel(x, y)
			if pixel.a < 0.2: continue
			visible_pixels += 1
			if pixel.r > 0.05 and pixel.b > 0.05: foreign += 1
	check("rotated linear-filtered frame excludes adjacent magenta", foreign == 0 and visible_pixels > 1000, {"foreign": foreign, "visible": visible_pixels})
	DirAccess.make_dir_recursive_absolute("res://.qa/frame-isolation")
	image.save_png("res://.qa/frame-isolation/render.png")
	var failures := checks.filter(func(item): return not item.passed).size()
	var file := FileAccess.open("res://.qa/frame-isolation/results.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks": checks, "failures": failures, "scope": "Actual runtime frame flags plus native rotated/linear GPU sampling; does not repair pixels already cut at source boundaries"}, "\t"))
	file.close()
	viewport.queue_free()
	sprite.queue_free()
	await get_tree().process_frame
	get_tree().quit(0 if failures == 0 else 1)
