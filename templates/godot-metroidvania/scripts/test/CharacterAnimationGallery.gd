extends Node2D
## Authored clip review. Controllers are frozen; this does not certify AI combat.
const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const CLIPS := ["idle", "walk", "run", "attack", "hurt", "death", "telegraph", "attack_projectile", "attack_burst", "recovery"]
const QA := "res://qa/actor-animation/gallery"
var sprites: Array[AnimatedSprite2D] = []
var captions: Array[Label] = []
var actor_ids: Array[String] = []
var names: Array[String] = []
var checks: Array[Dictionary] = []
var _clip_index := 0
@onready var _status: Label = $CanvasLayer/Status

func check(label: String, value: bool) -> void:
	checks.append({"label": label, "passed": value})
	print("%s: %s" % ["PASS" if value else "FAIL", label])

func _ready() -> void:
	GameManager.start_new_game()
	var enemy_data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/enemies/enemies.json"))
	var boss_data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/bosses/bosses.json"))
	var roster: Array[Dictionary] = [{"id": "player", "name": "Player", "scene": "res://scenes/player/Player.tscn", "prefix": "assets/characters/player"}]
	for index in [0, 4, 8, 12, 16]:
		if index >= enemy_data.get("enemies", []).size():
			continue
		var enemy: Dictionary = enemy_data.get("enemies", [])[index]
		roster.append({"id": String(enemy["id"]), "name": String(enemy["name"]), "scene": "res://scenes/enemies/Enemy.tscn", "prefix": "assets/enemies/" + String(enemy["id"])})
	for id in ["boss_000", "boss_final"]:
		for definition in boss_data.get("bosses", []):
			if String(definition["id"]) == id:
				roster.append({"id": id, "name": String(definition["name"]), "scene": "res://scenes/bosses/Boss.tscn", "prefix": "assets/bosses/" + id})
	var castle := String(ProjectSettings.get_setting("application/config/name", "")).begins_with("Stormglass Reliquary")
	check("gallery roster is available", roster.size() == 8 if castle else roster.size() > 0)
	var view := get_viewport_rect().size
	var cell := Vector2(view.x / 4.0, (view.y - 140.0) / 2.0)
	for index in range(roster.size()):
		var spec: Dictionary = roster[index]
		var actor := (load(spec["scene"]) as PackedScene).instantiate() as Node2D
		var sprite := actor.get_node("Sprite") as AnimatedSprite2D
		if spec["id"] != "player":
			actor.set("boss_id" if String(spec["id"]).begins_with("boss_") else "enemy_id", spec["id"])
			for pair in [["sheet_path", "walk"], ["run_sheet_path", "run"], ["attack_sheet_path", "attack"], ["hurt_sheet_path", "hurt"], ["death_sheet_path", "death"]]:
				sprite.set(String(pair[0]), "%s_%s.png" % [spec["prefix"], pair[1]])
			sprite.set("extra_animation_sheets", {"idle": "%s_idle.png" % spec["prefix"]})
		add_child(actor)
		actor.set_physics_process(false)
		if actor.has_method("freeze_presentation"):
			actor.freeze_presentation()
		var camera := actor.get_node_or_null("Camera2D") as Camera2D
		if camera:
			camera.enabled = false
		var origin := Vector2(cell.x * (index % 4 + 0.5), 140.0 + cell.y * (int(index / 4) + 1) - 70.0)
		actor.position = origin
		actor.scale = Vector2.ONE * (1.5 if String(spec["id"]).begins_with("boss_") else 2.5)
		var floor_line := Line2D.new()
		floor_line.points = PackedVector2Array([origin + Vector2(-cell.x * 0.42, 0), origin + Vector2(cell.x * 0.42, 0)])
		floor_line.width = 2.0
		floor_line.default_color = Color(0.35, 0.48, 0.52, 1)
		add_child(floor_line)
		var caption := Label.new()
		caption.position = origin + Vector2(-cell.x * 0.5 + 8.0, 12.0)
		caption.size = Vector2(cell.x - 16.0, 55.0)
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		caption.add_theme_font_size_override("font_size", 18)
		add_child(caption)
		sprites.append(sprite)
		captions.append(caption)
		actor_ids.append(spec["id"])
		names.append(spec["name"])
		var sidecar: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://%s_animations.json" % spec["prefix"]))
		for clip in ["idle", "walk", "run", "attack", "hurt", "death"]:
			var metadata: Dictionary = sidecar.get(clip, {})
			check("%s %s keeps authored frames, timing and loop" % [spec["id"], clip], sprite.sprite_frames.has_animation(clip) and not metadata.is_empty() and sprite.sprite_frames.get_frame_count(clip) == int(metadata.get("frameCount", -1)) and is_equal_approx(sprite.sprite_frames.get_animation_speed(clip), float(metadata.get("fps", -1))) and sprite.sprite_frames.get_animation_loop(clip) == bool(metadata.get("loop", false)))
	$CanvasLayer/Title.text = "Stormglass cast animation review" if castle else "Character animation review"
	_show_clip()
	if OS.get_environment("METROFORGE_GALLERY_CAPTURE") == "1":
		await _capture_suite()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_right"):
		_clip_index = posmod(_clip_index + 1, CLIPS.size())
		_show_clip()
	elif event.is_action_pressed("ui_left"):
		_clip_index = posmod(_clip_index - 1, CLIPS.size())
		_show_clip()
	elif event.is_action_pressed("ui_accept"):
		_show_clip()

func _show_clip() -> void:
	var clip: String = CLIPS[_clip_index]
	for index in range(sprites.size()):
		var sprite := sprites[index]
		var exists := sprite.sprite_frames.has_animation(clip)
		sprite.visible = exists
		captions[index].text = "%s\n%s" % [names[index], "No %s clip" % clip if not exists else "%s · %s fps" % [clip, sprite.sprite_frames.get_animation_speed(clip)]]
		if exists:
			sprite.speed_scale = 1.0
			sprite.stop()
			sprite.play(clip)
	_status.text = "%s | Left/Right: select clip · Enter: replay | authored clip review, controllers frozen" % clip

func _capture_suite() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	for index in range(CLIPS.size()):
		_clip_index = index
		_show_clip()
		await get_tree().create_timer(0.20).timeout
		if await CaptureGuard.await_post_draw(self):
			var image := get_viewport().get_texture().get_image()
			check("native %s gallery saved" % CLIPS[index], image != null and not image.is_empty() and image.save_png(ProjectSettings.globalize_path("%s/%s.png" % [QA, CLIPS[index]])) == OK)
	_clip_index = CLIPS.find("run")
	_show_clip()
	var traces: Array[Dictionary] = []
	for index in range(24):
		await get_tree().create_timer(0.08).timeout
		if await CaptureGuard.await_post_draw(self):
			var image := get_viewport().get_texture().get_image()
			image.save_png(ProjectSettings.globalize_path("%s/run-%02d.png" % [QA, index]))
			var values: Dictionary = {}
			for actor in range(sprites.size()):
				values[actor_ids[actor]] = sprites[actor].frame
			traces.append(values)
	for id in actor_ids:
		var distinct: Dictionary = {}
		for row in traces:
			distinct[row[id]] = true
		check(id + " advances through multiple real run frames", distinct.size() >= 4)
	var passed := checks.all(func(row: Dictionary) -> bool: return bool(row["passed"]))
	var file := FileAccess.open(QA + "/proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed": passed, "checks": checks, "runFrames": traces, "scope": "Real NVIDIA framebuffer gallery of the player, five authored enemy families, Bell Warden and Tempest Abbot. Controllers are frozen; this reviews loaded clips and playback, not combat AI or visual approval."}, "  "))
	for sprite in sprites:
		sprite.get_parent().queue_free()
	await get_tree().process_frame
	get_tree().quit(0 if passed else 1)
