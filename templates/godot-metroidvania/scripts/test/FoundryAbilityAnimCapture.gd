extends Node
## DIAGNOSTIC — wall slide / wall jump / swim. Not World evidence.
## This generated slice only grants dash, so those clips are unreachable in World.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/visual-polish/foundry-pass2/diagnostic"

var _recording_clip: String = ""
var _clip_max: int = 220
var _clip_frames: Array[Image] = []
var _player: CharacterBody2D = null

func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(CaptureGuard.EXIT_DUMMY)
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	GameManager.start_new_game()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	_build_stage()
	await CaptureGuard.await_physics_frames(self, 6, 4.0)
	EventBus.ability_acquired.emit("wall_slide")
	EventBus.ability_acquired.emit("wall_jump")
	EventBus.ability_acquired.emit("swim")
	EventBus.ability_acquired.emit("dash")
	if _player and _player.has_method("get"):
		var ac = _player.get("ability_controller")
		if ac and ac.has_method("_sync_unlocked_abilities"):
			ac._sync_unlocked_abilities()
	await _record_clip("diag_wall_slide_wall_jump", func():
		Input.action_press("move_right")
		Input.action_press("jump")
		await get_tree().physics_frame
		Input.action_release("jump")
		for _air in 18:
			await get_tree().physics_frame
		Input.action_press("jump")
		await get_tree().physics_frame
		Input.action_release("jump")
		for _wj in 28:
			await get_tree().physics_frame
		Input.action_release("move_right")
		for _rest in 10:
			await get_tree().physics_frame
	)
	await _shot("diag_wall_end")
	if _player:
		_player.global_position = Vector2(280, 520)
		_player.velocity = Vector2.ZERO
		if _player.has_method("enter_water"):
			_player.enter_water()
	await _record_clip("diag_swim", func():
		Input.action_press("move_right")
		Input.action_press("move_up")
		for _s in 36:
			await get_tree().physics_frame
		Input.action_release("move_up")
		Input.action_press("move_down")
		for _s2 in 20:
			await get_tree().physics_frame
		Input.action_release("move_down")
		Input.action_release("move_right")
	)
	await _shot("diag_swim_end")
	print("FOUNDRY_DIAG_OK")
	get_tree().quit(0)


func _process(_delta: float) -> void:
	if _recording_clip == "" or _clip_frames.size() >= _clip_max:
		return
	if CaptureGuard.is_dummy_renderer():
		return
	var img := get_viewport().get_texture().get_image()
	if img == null or img.is_empty():
		return
	img.convert(Image.FORMAT_RGBA8)
	img.resize(960, 540, Image.INTERPOLATE_NEAREST)
	_clip_frames.append(img)


func _build_stage() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.07, 0.05, 0.04, 1)
	bg.offset_right = 1920
	bg.offset_bottom = 1080
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bg.show_behind_parent = true
	add_child(bg)
	var banner := Label.new()
	banner.text = "DIAGNOSTIC — ability clips (not World evidence)"
	banner.position = Vector2(48, 36)
	banner.add_theme_font_size_override("font_size", 28)
	banner.add_theme_color_override("font_color", Color(0.94, 0.78, 0.32, 1))
	add_child(banner)
	_static_box(Vector2(960, 700), Vector2(1920, 40))
	_static_box(Vector2(1180, 520), Vector2(36, 360))
	var water := Area2D.new()
	water.collision_layer = 0
	water.collision_mask = 2
	var wshape := CollisionShape2D.new()
	var wrect := RectangleShape2D.new()
	wrect.size = Vector2(420, 180)
	wshape.shape = wrect
	water.position = Vector2(280, 610)
	water.add_child(wshape)
	add_child(water)
	water.body_entered.connect(func(body: Node2D) -> void:
		if body.has_method("enter_water"):
			body.enter_water()
	)
	var cam := Camera2D.new()
	cam.position = Vector2(960, 560)
	cam.zoom = Vector2(1.35, 1.35)
	cam.make_current()
	add_child(cam)
	var packed := load("res://scenes/player/Player.tscn") as PackedScene
	if packed == null:
		print("FOUNDRY_DIAG_FAIL player")
		return
	_player = packed.instantiate() as CharacterBody2D
	add_child(_player)
	_player.global_position = Vector2(980, 668)
	var health := _player.get_node_or_null("HealthComponent")
	if health:
		health.set("invulnerable", true)
	var player_cam := _player.get_node_or_null("Camera2D") as Camera2D
	if player_cam:
		player_cam.enabled = false


func _static_box(pos: Vector2, size: Vector2) -> void:
	var body := StaticBody2D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	body.position = pos
	body.add_child(shape)
	var vis := ColorRect.new()
	vis.color = Color(0.28, 0.22, 0.16, 1)
	vis.offset_left = -size.x * 0.5
	vis.offset_top = -size.y * 0.5
	vis.offset_right = size.x * 0.5
	vis.offset_bottom = size.y * 0.5
	vis.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(vis)
	add_child(body)


func _record_clip(name: String, work: Callable) -> void:
	_recording_clip = name
	_clip_frames.clear()
	await work.call()
	_recording_clip = ""
	var dir := "%s/%s" % [QA, name]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var saved := 0
	for i in _clip_frames.size():
		var img: Image = _clip_frames[i]
		img.save_png(ProjectSettings.globalize_path("%s/f%03d.png" % [dir, i]))
		saved += 1
	_clip_frames.clear()
	print("FOUNDRY_DIAG_CLIP %s frames=%d" % [name, saved])


func _shot(name: String) -> void:
	if not await CaptureGuard.await_frames(self, 2, 2.0):
		return
	var tex := get_viewport().get_texture()
	if tex == null:
		return
	var img := tex.get_image()
	if img and not img.is_empty():
		img.save_png(ProjectSettings.globalize_path("%s/%s.png" % [QA, name]))
		print("FOUNDRY_DIAG_SHOT %s" % name)
