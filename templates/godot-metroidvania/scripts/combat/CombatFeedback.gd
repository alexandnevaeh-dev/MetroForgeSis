extends Node
## Accessibility-aware hitstop / flash / shake. Automated playtests skip hitstop so
## 30/30 transition timing is unchanged. Profiles live in data/quality/.

const PROFILE_PATH := "res://data/quality/apply_combat_feedback.json"

var hitstop_ms: float = 40.0
var flash_ms: float = 70.0
var vfx_scale: float = 1.15
var shake_enabled_default: bool = true
var flash_enabled_default: bool = true
var _flashes: Dictionary = {}
var _shakes: Dictionary = {}
var _hitstop_timer: Timer
var _owns_hitstop: bool = false

func _ready() -> void:
	_load_profile()

func _load_profile() -> void:
	if not FileAccess.file_exists(PROFILE_PATH):
		return
	var file := FileAccess.open(PROFILE_PATH, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var data: Dictionary = parsed
	hitstop_ms = float(data.get("hitstopMs", hitstop_ms))
	flash_ms = float(data.get("flashMs", flash_ms))
	vfx_scale = float(data.get("vfxScale", vfx_scale))
	shake_enabled_default = bool(data.get("shakeEnabledDefault", shake_enabled_default))
	flash_enabled_default = bool(data.get("flashEnabledDefault", flash_enabled_default))

func is_automated_harness() -> bool:
	var scene := get_tree().current_scene
	if scene == null:
		return OS.has_feature("dedicated_server")
	var n := String(scene.name)
	return n.contains("Playtest") or n.contains("RuntimeSmoke") or OS.has_feature("dedicated_server")

func flash_allowed() -> bool:
	if not flash_enabled_default:
		return false
	if SettingsManager.reduce_flash:
		return false
	return true

func shake_allowed() -> bool:
	if not shake_enabled_default:
		return false
	return SettingsManager.screen_shake_enabled

func play_hit(target: Node, amount: float = 1.0) -> void:
	if flash_allowed():
		_flash_sprite(target)
	if not is_automated_harness():
		_hitstop()
		if shake_allowed():
			_nudge_camera(target, amount)

func vfx_mul() -> float:
	return vfx_scale

func _flash_sprite(target: Node) -> void:
	var sprite := _find_sprite(target)
	if sprite == null or not is_inside_tree():
		return
	var id := sprite.get_instance_id()
	if not _flashes.has(id):
		var timer := _effect_timer(maxf(0.01, flash_ms / 1000.0))
		timer.timeout.connect(_finish_flash.bind(id))
		sprite.tree_exiting.connect(_finish_flash.bind(id), CONNECT_ONE_SHOT)
		_flashes[id] = {"target": weakref(sprite), "original": sprite.modulate, "timer": timer}
	sprite.modulate = Color(1.6, 1.6, 1.6, 1.0)
	_flashes[id].timer.start(maxf(0.01, flash_ms / 1000.0))

func _finish_flash(id: int) -> void:
	if not _flashes.has(id):
		return
	var effect: Dictionary = _flashes[id]
	_flashes.erase(id)
	var sprite := (effect.target as WeakRef).get_ref() as CanvasItem
	if is_instance_valid(sprite):
		sprite.modulate = effect.original
		if sprite.tree_exiting.is_connected(_finish_flash.bind(id)):
			sprite.tree_exiting.disconnect(_finish_flash.bind(id))
	effect.timer.stop()
	effect.timer.queue_free()

func _effect_timer(seconds: float, ignore_time_scale: bool = false) -> Timer:
	# Owned nodes disappear with the feedback service. No suspended coroutine or
	# SceneTreeTimer retains a target after its room has been removed.
	var timer := Timer.new()
	timer.one_shot = true
	timer.wait_time = seconds
	timer.ignore_time_scale = ignore_time_scale
	timer.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(timer)
	return timer

func _hitstop() -> void:
	if Engine.time_scale != 1.0 or not is_inside_tree():
		return
	Engine.time_scale = 0.15
	_owns_hitstop = true
	_hitstop_timer = _effect_timer(maxf(0.01, hitstop_ms / 1000.0), true)
	_hitstop_timer.timeout.connect(_finish_hitstop, CONNECT_ONE_SHOT)
	_hitstop_timer.start()

func _finish_hitstop() -> void:
	if _owns_hitstop and is_equal_approx(Engine.time_scale, 0.15):
		Engine.time_scale = 1.0
	_owns_hitstop = false
	if is_instance_valid(_hitstop_timer):
		_hitstop_timer.stop()
		_hitstop_timer.queue_free()
	_hitstop_timer = null

func _nudge_camera(target: Node, amount: float) -> void:
	if not is_inside_tree() or not is_instance_valid(target):
		return
	var camera := target.get_node_or_null("Camera2D") as Camera2D
	if camera == null:
		var player := get_tree().get_first_node_in_group("player")
		if player:
			camera = player.get_node_or_null("Camera2D")
	if camera == null:
		return
	var id := camera.get_instance_id()
	if not _shakes.has(id):
		var timer := _effect_timer(0.05)
		timer.timeout.connect(_finish_shake.bind(id))
		camera.tree_exiting.connect(_finish_shake.bind(id), CONNECT_ONE_SHOT)
		_shakes[id] = {"target": weakref(camera), "original": camera.offset, "timer": timer}
	camera.offset = _shakes[id].original + Vector2(randf_range(-2.0, 2.0), randf_range(-2.0, 2.0)) * amount
	_shakes[id].timer.start(0.05)

func _finish_shake(id: int) -> void:
	if not _shakes.has(id):
		return
	var effect: Dictionary = _shakes[id]
	_shakes.erase(id)
	var camera := (effect.target as WeakRef).get_ref() as Camera2D
	if is_instance_valid(camera):
		camera.offset = effect.original
		if camera.tree_exiting.is_connected(_finish_shake.bind(id)):
			camera.tree_exiting.disconnect(_finish_shake.bind(id))
	effect.timer.stop()
	effect.timer.queue_free()

func _exit_tree() -> void:
	for id: int in _flashes.keys():
		_finish_flash(id)
	for id: int in _shakes.keys():
		_finish_shake(id)
	_finish_hitstop()

func _find_sprite(target: Node) -> CanvasItem:
	if target == null:
		return null
	if target is CanvasItem and target.name == "Sprite":
		return target
	return target.get_node_or_null("Sprite") as CanvasItem
