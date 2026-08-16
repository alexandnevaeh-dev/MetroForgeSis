extends Camera2D
## Room-aware camera: lock horizontally when a generated room is smaller than the view,
## otherwise dead-zone + look-ahead. Bounds come from QualityPresentation after each load.
## Transition colliders are not modified.

const PROFILE_PATH := "res://data/quality/camera_profile.json"

var _room_size := Vector2(800, 600)
var _look_ahead := 28.0
var _dead_zone := 0.18

func _ready() -> void:
	_load_profile()
	position_smoothing_enabled = true
	position_smoothing_speed = 8.0
	drag_horizontal_enabled = true
	drag_vertical_enabled = true
	drag_left_margin = _dead_zone
	drag_right_margin = _dead_zone
	drag_top_margin = _dead_zone
	drag_bottom_margin = 0.22
	make_current()

func _load_profile() -> void:
	if not FileAccess.file_exists(PROFILE_PATH):
		zoom = Vector2(1.85, 1.85)
		return
	var file := FileAccess.open(PROFILE_PATH, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var z := float(parsed.get("zoom", 1.85))
	zoom = Vector2(z, z)
	_dead_zone = float(parsed.get("deadZone", 0.18))
	_look_ahead = float(parsed.get("lookAheadPx", 28.0))

func apply_room_bounds(room_size: Vector2) -> void:
	_room_size = room_size
	limit_left = 0
	limit_top = 0
	limit_right = int(room_size.x)
	limit_bottom = int(room_size.y)
	limit_smoothed = true

func _process(_delta: float) -> void:
	var parent := get_parent() as Node2D
	if parent == null:
		return
	var view := get_viewport_rect().size / zoom
	if view.x >= _room_size.x - 2.0:
		offset.x = _room_size.x * 0.5 - parent.global_position.x
	else:
		var facing := int(parent.get("facing")) if parent.get("facing") != null else 1
		var goal := float(facing) * _look_ahead
		offset.x = lerpf(offset.x, goal, 0.08)
	if view.y >= _room_size.y - 2.0:
		offset.y = _room_size.y * 0.5 - parent.global_position.y
	else:
		offset.y = lerpf(offset.y, -20.0, 0.08)
	offset.x = round(offset.x)
	offset.y = round(offset.y)
