extends Camera2D
## Room-aware camera: contain-zoom so the authored room stays fully visible,
## then clamp in world space. Built-in Camera2D limits do not hold when this
## node is a child of the player (screen center can walk past limit_right).

const PROFILE_PATH := "res://data/quality/camera_profile.json"

var _room_size := Vector2(800, 600)
var _look_ahead := 28.0

func _ready() -> void:
	_load_profile()
	top_level = true
	enabled = true
	position_smoothing_enabled = false
	drag_horizontal_enabled = false
	drag_vertical_enabled = false
	make_current()

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
	_look_ahead = float(parsed.get("lookAheadPx", 28.0))

func apply_room_bounds(room_size: Vector2) -> void:
	_room_size = room_size
	top_level = true
	enabled = true
	position = Vector2.ZERO
	offset = Vector2.ZERO
	make_current()
	var vp := get_viewport().get_visible_rect().size
	if vp.x < 64.0 or vp.y < 64.0:
		vp = Vector2(
			float(ProjectSettings.get_setting("display/window/size/viewport_width", 1920)),
			float(ProjectSettings.get_setting("display/window/size/viewport_height", 1080)),
		)
	# Contain the whole room in the window. Cover-zoom (max of the ratios) on an 800×600
	# room in a 16:9 view cropped ~150px of height — exactly onto the RearWall lintel —
	# so climbRows and night openings never appeared in captures.
	var contain := minf(vp.x / maxf(room_size.x, 1.0), vp.y / maxf(room_size.y, 1.0))
	zoom = Vector2(contain, contain)
	position_smoothing_enabled = false
	drag_horizontal_enabled = false
	drag_vertical_enabled = false
	_snap_to_room()
	if has_method("force_update_scroll"):
		force_update_scroll()
	make_current()

func _process(_delta: float) -> void:
	_snap_to_room()

func _snap_to_room() -> void:
	var view := get_viewport().get_visible_rect().size / zoom
	if view.x < 8.0 or view.y < 8.0:
		return
	var half := view * 0.5
	# Drop the extra earth row RoomTileMap paints below the walkable floor.
	var visual_bottom := maxf(half.y * 2.0, _room_size.y - 48.0)
	var target := Vector2(_room_size.x * 0.5, visual_bottom * 0.5)
	var parent := get_parent() as Node2D
	if parent:
		if view.x < _room_size.x - 2.0:
			var facing := int(parent.get("facing")) if parent.get("facing") != null else 1
			target.x = parent.global_position.x + float(facing) * _look_ahead
		if view.y < visual_bottom - 2.0:
			var look_up := minf(96.0, (visual_bottom - view.y) * 0.25)
			target.y = parent.global_position.y - look_up
	if view.x < _room_size.x - 2.0:
		target.x = clampf(target.x, half.x, maxf(half.x, _room_size.x - half.x))
	else:
		target.x = _room_size.x * 0.5
	if view.y < visual_bottom - 2.0:
		target.y = clampf(target.y, half.y, maxf(half.y, visual_bottom - half.y))
	else:
		target.y = visual_bottom * 0.5
	global_position = target.round()
