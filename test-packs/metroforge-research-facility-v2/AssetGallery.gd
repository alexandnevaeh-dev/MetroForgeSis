extends Node2D
## Standalone asset gallery for the metroforge-research-facility pack -- NOT the playable test
## dungeon (see TestScenarios.gd/.tscn for that). Deliberately separate per this milestone's
## explicit instruction to "keep an asset gallery separate from the playable test dungeon": this
## scene loads pack files directly by path and lays them out on a grid with labels; it never
## touches OverworldManager/GameManager/InventoryManager and has no win/lose state.
##
## Run: godot --path <project-with-this-pack-active> --resolution 1280x800 --rendering-driver
## metal res://AssetGallery.tscn (windowed, not --headless, so the saved PNGs are real GPU-backed
## captures, same convention as every other visual-evidence capture this project has used).
## Copy this .gd + a matching minimal .tscn (root Node2D, script attached) into the generated
## project first -- it is an ad hoc verification harness, not a shipped template file, exactly
## like BossVerificationRunner.gd/GameplayCaptureRunner.gd from earlier sessions.
##
## The full gallery is taller than one viewport, so it's captured as several section
## contact-sheets (qa_gallery/01_player.png, 02_enemies.png, ...) via a Camera2D that pans
## between sections, rather than one image with most of it off-screen.

const CELL := Vector2(150, 170)
const COLS := 8

var _col := 0
var _row := 0
var _shot_index := 0
var _cam: Camera2D

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://qa_gallery"))
	_cam = Camera2D.new()
	add_child(_cam)
	_cam.make_current()

	await _section("player", func():
		_add_section_label("PLAYER")
		_add_static("assets/characters/player.png", "idle")
		_add_sheet_frames("assets/characters/player_walk.png", 4, "walk")
		_add_sheet_frames("assets/characters/player_attack.png", 4, "attack")
		_add_sheet_frames("assets/characters/player_hurt.png", 3, "hurt")
		_add_sheet_frames("assets/characters/player_death.png", 4, "death")
	)

	for family in ["melee", "ranged", "heavy"]:
		await _section("enemy_%s" % family, func():
			_add_section_label("ENEMY: %s" % family.to_upper())
			_add_static("assets/enemies/%s.png" % family, "idle")
			_add_sheet_frames("assets/enemies/%s_walk.png" % family, 4, "walk")
			_add_sheet_frames("assets/enemies/%s_attack.png" % family, 4, "attack")
			_add_sheet_frames("assets/enemies/%s_hurt.png" % family, 3, "hurt")
			_add_sheet_frames("assets/enemies/%s_death.png" % family, 4, "death")
		)

	await _section("boss", func():
		_add_section_label("BOSS: REACTOR CORE AUTOMATON")
		_add_static("assets/bosses/boss_final.png", "idle")
		_add_sheet_frames("assets/bosses/boss_final_walk.png", 4, "walk")
		_add_sheet_frames("assets/bosses/boss_final_attack.png", 4, "attack")
		_add_sheet_frames("assets/bosses/boss_final_hurt.png", 3, "hurt")
		_add_sheet_frames("assets/bosses/boss_final_death.png", 4, "death")
	)

	await _section("terrain_props", func():
		_add_section_label("TERRAIN")
		_add_static("assets/tilesets/biome_0/source.png", "tileset")
		_newline()
		_add_section_label("PROPS")
		for p in ["terminal_lantern", "exhaust_pipe", "support_pillar", "containment_gear", "server_rack", "canister_cluster", "research_console", "reactor_service_gear"]:
			_add_static("assets/props/biome_0/%s.png" % _prop_dest(p), p)
	)

	await _section("interactive_items", func():
		_add_section_label("INTERACTIVE OBJECTS")
		_add_static("assets/generated/checkpoint/interactive_checkpoint.png", "checkpoint")
		_add_static("assets/generated/chest/interactive_chest_closed.png", "chest closed")
		_add_static("assets/generated/chest/interactive_chest_open.png", "chest open")
		_add_static("assets/generated/gate/interactive_ability_gate.png", "door")
		_add_static("assets/generated/pickup/interactive_ability_pickup.png", "switch")
		_add_static("assets/generated/portal/interactive_portal.png", "portal")
		_add_static("assets/generated/completion/interactive_completion.png", "completion")
		_add_static("assets/generated/items/health_pickup.png", "health pickup")
		_add_static("assets/generated/items/progression_pickup.png", "progression pickup")
	)

	await _section("vfx", func():
		_add_section_label("PROJECTILES / VFX")
		_add_static("assets/vfx/ranged_projectile.png", "projectile")
		_add_static("assets/vfx/hit_spark.png", "hit spark")
		_add_static("assets/vfx/attack_warning.png", "attack warning")
	)

	print("[GALLERY] DONE — %d section screenshots saved to res://qa_gallery/" % _shot_index)
	get_tree().quit(0)

## The four pack props ship under descriptive filenames in the pack; the generated project's
## real destination (matching the base pipeline's own biome_0_prop_N.png convention) is what's
## actually on disk here -- see manifest.json's family:'prop' entries.
func _prop_dest(descriptive_name: String) -> String:
	var idx := {"terminal_lantern": 0, "exhaust_pipe": 1, "support_pillar": 2, "containment_gear": 3, "server_rack": 4, "canister_cluster": 5, "research_console": 6, "reactor_service_gear": 7}
	return "biome_0_prop_%d" % idx.get(descriptive_name, 0)

## Runs one section's layout callable, screenshots just that band (camera centered on the rows
## it used), then clears the section's nodes and resets the row/col cursor so the next section
## starts clean at the top -- this is what makes each output image a readable contact sheet
## instead of one giant mostly-empty page.
func _section(id: String, build_fn: Callable) -> void:
	_row = 0
	_col = 0
	for child in get_children():
		if child != _cam:
			child.queue_free()
	await get_tree().process_frame
	build_fn.call()
	var content_rows := _row + 1
	_cam.position = Vector2(COLS * CELL.x / 2.0, content_rows * CELL.y / 2.0)
	await get_tree().process_frame
	await get_tree().process_frame
	_shot_index += 1
	var name := "%02d_%s" % [_shot_index, id]
	await RenderingServer.frame_post_draw
	RenderingServer.force_draw(true)
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var err := img.save_png("res://qa_gallery/%s.png" % name)
	print("[GALLERY] saved res://qa_gallery/%s.png (err=%d)" % [name, err])

func _newline() -> void:
	_col = 0
	_row += 1

func _add_section_label(text: String) -> void:
	if _col != 0:
		_newline()
	var label := Label.new()
	label.text = text
	label.add_theme_color_override("font_color", Color(0.4, 0.9, 1.0))
	label.position = Vector2(8, _row * CELL.y + 4)
	add_child(label)
	_row += 1

func _cell_pos() -> Vector2:
	return Vector2(_col * CELL.x + 16, _row * CELL.y + 24)

func _caption_pos() -> Vector2:
	return Vector2(_col * CELL.x + 8, _row * CELL.y + CELL.y - 20)

func _advance() -> void:
	_col += 1
	if _col >= COLS:
		_newline()

func _add_static(path: String, caption: String) -> void:
	var res_path := path if path.begins_with("res://") else "res://" + path
	if not ResourceLoader.exists(res_path):
		_add_missing(caption)
		return
	var tex: Texture2D = load(res_path)
	var sprite := Sprite2D.new()
	sprite.texture = tex
	sprite.centered = false
	sprite.position = _cell_pos()
	# Scale small icons up for visibility; leave the tileset/boss stills near-native.
	var scale_factor := 2.0 if tex.get_width() <= 64 else 1.0
	sprite.scale = Vector2(scale_factor, scale_factor)
	add_child(sprite)
	_add_caption(caption)
	_advance()

## v2 note: frame_count is now auto-derived from the sheet's real width (every character frame is
## square, so frame_size == texture height) instead of trusting a hardcoded caller argument -- the
## whole point of this pass is variable, higher frame counts per clip, so a fixed number here would
## silently mis-slice a 12-frame sheet using a stale "4". The passed-in frame_count is now only a
## fallback for a malformed/non-square sheet.
func _add_sheet_frames(path: String, frame_count_hint: int, caption: String) -> void:
	var res_path := path if path.begins_with("res://") else "res://" + path
	if not ResourceLoader.exists(res_path):
		_add_missing(caption)
		return
	var tex: Texture2D = load(res_path)
	var frame_h := tex.get_height()
	var frame_count := frame_count_hint
	if frame_h > 0 and tex.get_width() % frame_h == 0:
		frame_count = tex.get_width() / frame_h
	var frame_w := tex.get_width() / frame_count
	var start_col := _col
	for i in range(frame_count):
		var atlas := AtlasTexture.new()
		atlas.atlas = tex
		atlas.region = Rect2(i * frame_w, 0, frame_w, frame_h)
		var sprite := Sprite2D.new()
		sprite.texture = atlas
		sprite.centered = false
		sprite.position = _cell_pos()
		var scale_factor := 2.0 if frame_w <= 64 else 1.0
		sprite.scale = Vector2(scale_factor, scale_factor)
		add_child(sprite)
		_advance()
	# Caption under the first frame of this clip, not the fixed left margin -- avoids stacking
	# every clip's caption on top of each other at x=8 (the bug the first gallery capture showed).
	var label := Label.new()
	label.text = "%s (%d frames)" % [caption, frame_count]
	label.add_theme_font_size_override("font_size", 11)
	label.position = Vector2(start_col * CELL.x + 8, _row * CELL.y + CELL.y - 20)
	add_child(label)

func _add_caption(text: String) -> void:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 11)
	label.position = _caption_pos()
	add_child(label)

func _add_missing(caption: String) -> void:
	var rect := ColorRect.new()
	rect.color = Color(1, 0, 0, 0.5)
	rect.size = Vector2(48, 48)
	rect.position = _cell_pos()
	add_child(rect)
	var label := Label.new()
	label.text = "MISSING: %s" % caption
	label.position = _caption_pos()
	add_child(label)
	_advance()
