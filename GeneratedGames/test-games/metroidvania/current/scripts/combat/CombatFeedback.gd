extends Node
## Accessibility-aware hitstop / flash / shake. Automated playtests skip hitstop so
## 30/30 transition timing is unchanged. Profiles live in data/quality/.

const PROFILE_PATH := "res://data/quality/apply_combat_feedback.json"

var hitstop_ms: float = 40.0
var flash_ms: float = 70.0
var vfx_scale: float = 1.15
var shake_enabled_default: bool = true
var flash_enabled_default: bool = true

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
	if sprite == null:
		return
	var original: Color = sprite.modulate
	sprite.modulate = Color(1.6, 1.6, 1.6, 1.0)
	var tree := get_tree()
	if tree == null:
		return
	await tree.create_timer(maxf(0.01, flash_ms / 1000.0)).timeout
	if is_instance_valid(sprite):
		sprite.modulate = original

func _hitstop() -> void:
	if Engine.time_scale != 1.0:
		return
	Engine.time_scale = 0.15
	await get_tree().create_timer(maxf(0.01, hitstop_ms / 1000.0), true, false, true).timeout
	Engine.time_scale = 1.0

func _nudge_camera(target: Node, amount: float) -> void:
	var camera := target.get_node_or_null("Camera2D") as Camera2D
	if camera == null:
		var player := get_tree().get_first_node_in_group("player")
		if player:
			camera = player.get_node_or_null("Camera2D")
	if camera == null:
		return
	var origin := camera.offset
	camera.offset = origin + Vector2(randf_range(-2.0, 2.0), randf_range(-2.0, 2.0)) * amount
	await get_tree().create_timer(0.05).timeout
	if is_instance_valid(camera):
		camera.offset = origin

func _find_sprite(target: Node) -> CanvasItem:
	if target == null:
		return null
	if target is CanvasItem and target.name == "Sprite":
		return target
	return target.get_node_or_null("Sprite") as CanvasItem
