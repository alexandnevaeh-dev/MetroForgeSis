extends Node
## World-live remaining cast: valve hopper, cooling crawler, crane drone, pouring-crane boss.
## Never parent capture cameras to actors that can die, and never keep Node refs across
## awaits after a hit — EnemyController._on_died queue_free() invalidates the coroutine.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/visual-polish/foundry-pass2"
const MOTION := "res://qa/visual-polish/foundry-pass2/motion"

var _recording_clip: String = ""
var _clip_max: int = 260
var _clip_frames: Array[Image] = []
var _lock_cam: Camera2D = null
var _follow_id: int = 0
var _completed: PackedStringArray = PackedStringArray()
var _failed := false


func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(CaptureGuard.EXIT_DUMMY)
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	GameManager.start_new_game()
	await get_tree().process_frame
	var packed := load("res://scenes/world/World.tscn") as PackedScene
	if packed == null:
		_fail("world_scene_missing")
		return
	add_child(packed.instantiate())
	if not await CaptureGuard.await_physics_frames(self, 4, 4.0):
		_fail("physics_warmup_timeout")
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA + "/after"))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(MOTION))
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	if is_instance_valid(player):
		var health := player.get_node_or_null("HealthComponent")
		if health:
			health.set("invulnerable", true)
	if not await _actor_room("room_003", "hopper"):
		return
	if not await _actor_room("room_009", "crawler"):
		return
	if not await _actor_room("room_012", "drone", true):
		return
	print("FOUNDRY_CAST_RESULT status=OK completed=%s" % ",".join(_completed))
	print("FOUNDRY_CAST_OK")
	get_tree().quit(0)


func _process(_delta: float) -> void:
	_follow_camera()
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


func _fail(reason: String) -> void:
	if _failed:
		return
	_failed = true
	var done := ",".join(_completed) if _completed.size() > 0 else "-"
	print("FOUNDRY_CAST_FAIL %s" % reason)
	printerr("FOUNDRY_CAST_FAIL %s" % reason)
	print("FOUNDRY_CAST_RESULT status=FAIL reason=%s completed=%s" % [reason, done])
	printerr("FOUNDRY_CAST_RESULT status=FAIL reason=%s completed=%s" % [reason, done])
	get_tree().quit(1)


func _alive(node: Object) -> bool:
	return node != null and is_instance_valid(node)


func _from_id(id: int) -> Node2D:
	if id == 0:
		return null
	var obj := instance_from_id(id)
	if not is_instance_valid(obj):
		return null
	return obj as Node2D


func _keep_alive(actor: Node) -> void:
	if not _alive(actor):
		return
	var health := actor.get_node_or_null("HealthComponent")
	if health == null:
		return
	if "max_health" in health:
		health.set("max_health", 9999.0)
	if "current_health" in health:
		health.set("current_health", 9999.0)
	health.set("invulnerable", false)


func _actor_room(room_id: String, label: String, include_boss: bool = false) -> bool:
	await _load_room(room_id)
	if _failed:
		return false
	await _shot("after/%s_room" % label)
	var enemy := _find_enemy()
	if not _alive(enemy):
		_fail("missing_enemy_%s" % label)
		return false
	var enemy_id := enemy.get_instance_id()
	_keep_alive(enemy)
	_lock_camera_on(enemy, 2.6)
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	if _alive(player):
		player.global_position = enemy.global_position + Vector2(-90, 0)
		player.velocity = Vector2.ZERO
	enemy = null
	player = null
	if not await _record_clip("%s_move" % label, 70):
		return false
	await _shot("after/%s_live_move" % label)
	enemy = _from_id(enemy_id)
	player = get_tree().get_first_node_in_group("player") as CharacterBody2D
	if not _alive(enemy):
		_fail("freed_node after %s_move" % label)
		return false
	if _alive(player):
		player.global_position = enemy.global_position + Vector2(-50, 0)
	_keep_alive(enemy)
	enemy = null
	player = null
	if not await _record_clip("%s_attack" % label, 50):
		return false
	await _shot("after/%s_live_attack" % label)
	enemy = _from_id(enemy_id)
	if not _alive(enemy):
		_fail("freed_node after %s_attack" % label)
		return false
	_keep_alive(enemy)
	if enemy.has_method("_on_hit_received"):
		enemy.call("_on_hit_received", 1.0, Vector2(-40, 0))
	if not _alive(enemy):
		_fail("freed_node during %s_hurt" % label)
		return false
	enemy = null
	if not await _record_clip("%s_hurt" % label, 18):
		return false
	if include_boss:
		var boss := _find_boss()
		if not _alive(boss):
			_fail("missing_boss")
			return false
		var boss_id := boss.get_instance_id()
		_keep_alive(boss)
		_lock_camera_on(boss, 1.6)
		player = get_tree().get_first_node_in_group("player") as CharacterBody2D
		if _alive(player):
			player.global_position = boss.global_position + Vector2(-120, 0)
		boss = null
		player = null
		if not await _record_clip("boss_telegraph_attack_recover", 90):
			return false
		await _shot("after/boss_live")
		boss = _from_id(boss_id)
		if not _alive(boss):
			_fail("freed_node after boss_telegraph")
			return false
		_keep_alive(boss)
		if boss.has_method("_on_hit_received"):
			boss.call("_on_hit_received", 1.0, Vector2(-40, 0))
		if not _alive(boss):
			_fail("freed_node during boss_hurt")
			return false
		boss = null
		if not await _record_clip("boss_hurt", 20):
			return false
	_release_camera()
	return not _failed


func _lock_camera_on(target: Node2D, zoom: float) -> void:
	if not _alive(target):
		return
	_follow_id = target.get_instance_id()
	if not _alive(_lock_cam):
		_lock_cam = Camera2D.new()
		_lock_cam.name = "CastCam"
		add_child(_lock_cam)
	_lock_cam.zoom = Vector2(zoom, zoom)
	_lock_cam.global_position = target.global_position + Vector2(-24, -16)
	_lock_cam.make_current()


func _follow_camera() -> void:
	if not _alive(_lock_cam) or _follow_id == 0:
		return
	var target := _from_id(_follow_id)
	if _alive(target):
		_lock_cam.global_position = target.global_position + Vector2(-24, -16)


func _release_camera() -> void:
	_follow_id = 0
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	if _alive(player):
		var cam := player.get_node_or_null("Camera2D") as Camera2D
		if cam:
			cam.make_current()
	if _alive(_lock_cam):
		_lock_cam.queue_free()
	_lock_cam = null


func _load_room(room_id: String) -> void:
	var wm := get_tree().get_first_node_in_group("world_manager")
	if wm and wm.has_method("transition_to_room"):
		wm.transition_to_room(room_id, "left")
		if not await CaptureGuard.await_physics_frames(self, 24, 6.0):
			_fail("room_load_timeout_%s" % room_id)


func _record_clip(clip_name: String, frames: int) -> bool:
	_recording_clip = clip_name
	_clip_frames.clear()
	if not await CaptureGuard.await_physics_frames(self, frames, maxf(4.0, float(frames) * 0.08 + 2.0)):
		_recording_clip = ""
		_fail("clip_timeout_%s" % clip_name)
		return false
	_recording_clip = ""
	var dir := "%s/%s" % [MOTION, clip_name]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var saved := 0
	for i in _clip_frames.size():
		var img: Image = _clip_frames[i]
		img.save_png(ProjectSettings.globalize_path("%s/f%03d.png" % [dir, i]))
		saved += 1
	_clip_frames.clear()
	_completed.append("%s:%d" % [clip_name, saved])
	print("FOUNDRY_CAST_CLIP %s frames=%d" % [clip_name, saved])
	return true


func _shot(name: String) -> void:
	if not await CaptureGuard.await_frames(self, 2, 2.0):
		_fail("shot_timeout_%s" % name)
		return
	var tex := get_viewport().get_texture()
	if tex == null:
		return
	var img := tex.get_image()
	if img and not img.is_empty():
		img.save_png(ProjectSettings.globalize_path("%s/%s.png" % [QA, name]))
		print("FOUNDRY_CAST_SHOT %s" % name)


func _find_enemy() -> Node2D:
	for n in get_tree().get_nodes_in_group("enemies"):
		if is_instance_valid(n) and not n.is_in_group("bosses"):
			return n as Node2D
	return null


func _find_boss() -> Node2D:
	var grouped := get_tree().get_nodes_in_group("bosses")
	if grouped.size() > 0 and is_instance_valid(grouped[0]):
		return grouped[0] as Node2D
	var boss := get_tree().get_first_node_in_group("boss")
	return boss as Node2D if is_instance_valid(boss) else null
