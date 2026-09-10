extends Camera2D
## Room-aware camera: contain-zoom so the authored room stays fully visible,
## then clamp in world space. Built-in Camera2D limits do not hold when this
## node is a child of the player (screen center can walk past limit_right).
## Wide cinematic plates (Foundry 1920×320 corridors, visual_kit=foundry) use
## a 360px-tall cover band instead of letterboxing the plate in a 16:9 window.

const PROFILE_PATH := "res://data/quality/camera_profile.json"
const MIN_GAMEPLAY_ZOOM := 1.85
const MAX_GAMEPLAY_ZOOM := 3.0
const FOUNDRY_VIEW_HEIGHT := 360.0

var _room_size := Vector2(800, 600)
var _look_ahead := 28.0
var _profile_zoom := 1.85
var _frame_top := 0.0
var _frame_bottom := 600.0
var _frame_playable := false

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
	_profile_zoom = float(parsed.get("zoom", 1.85))

## `playable_top`/`playable_bottom` are world Y of the reachable band. Used for
## ability_shrine and tutorial so the camera frames floor+platforms instead of empty sky.
## Other archetypes keep full-room contain-zoom. Does not change collision geometry.
func apply_room_bounds(
	room_size: Vector2,
	visual_kit: String = "",
	archetype: String = "",
	playable_top: float = -1.0,
	playable_bottom: float = -1.0,
) -> void:
	_room_size = room_size
	_frame_playable = (archetype == "ability_shrine" or archetype == "tutorial") and playable_top >= 0.0 and playable_bottom > playable_top
	_frame_top = playable_top
	_frame_bottom = playable_bottom
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
	var cover := maxf(vp.x / maxf(room_size.x, 1.0), vp.y / maxf(room_size.y, 1.0))
	var fit := contain
	if _frame_playable:
		# Ability shrine / tutorial: contain the playable rect (full room width × reachable
		# band). Takes precedence over foundry cover-zoom so empty sky is not the subject.
		# Does not stretch FarSky and does not crop climb platforms.
		var band_h := maxf(240.0, playable_bottom - playable_top)
		fit = minf(vp.x / maxf(room_size.x, 1.0), vp.y / band_h)
		fit = clampf(fit, contain, MAX_GAMEPLAY_ZOOM)
	elif visual_kit == "foundry" or room_size.x >= room_size.y * 2.5:
		# Foundry / cinematic plates are much wider than they are tall. Contain-zoom
		# leaves a navy ColorRect band above/below the plate; cover a 360px gameplay band.
		var floor_zoom := maxf(MIN_GAMEPLAY_ZOOM, _profile_zoom)
		fit = maxf(cover, vp.y / FOUNDRY_VIEW_HEIGHT)
		fit = clampf(fit, floor_zoom, MAX_GAMEPLAY_ZOOM)
	zoom = Vector2(fit, fit)
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
	var visual_top := 0.0
	if _frame_playable:
		visual_top = _frame_top
		visual_bottom = _frame_bottom
	var target := Vector2(_room_size.x * 0.5, visual_top + (visual_bottom - visual_top) * 0.5)
	var parent := get_parent() as Node2D
	if parent:
		if view.x < _room_size.x - 2.0:
			var facing := int(parent.get("facing")) if parent.get("facing") != null else 1
			target.x = parent.global_position.x + float(facing) * _look_ahead
		if view.y < (visual_bottom - visual_top) - 2.0:
			var look_up := minf(96.0, (visual_bottom - visual_top - view.y) * 0.25)
			target.y = parent.global_position.y - look_up
	if view.x < _room_size.x - 2.0:
		target.x = clampf(target.x, half.x, maxf(half.x, _room_size.x - half.x))
	else:
		target.x = _room_size.x * 0.5
	if view.y < (visual_bottom - visual_top) - 2.0:
		target.y = clampf(target.y, visual_top + half.y, maxf(visual_top + half.y, visual_bottom - half.y))
	else:
		# When the 16:9 view is taller than the reachable band, pin to the floor
		# so extra pixels show the furnace hood — not a navy gutter under the plate.
		if _frame_playable:
			target.y = visual_bottom - half.y
		else:
			target.y = visual_top + (visual_bottom - visual_top) * 0.5
	global_position = target.round()
