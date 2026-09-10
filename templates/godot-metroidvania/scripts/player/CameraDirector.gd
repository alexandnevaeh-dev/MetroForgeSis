extends Camera2D
## Room-aware camera: contain-zoom so the authored room stays fully visible,
## then clamp in world space. Built-in Camera2D limits do not hold when this
## node is a child of the player (screen center can walk past limit_right).

const PROFILE_PATH := "res://data/quality/camera_profile.json"

## Sixteenth-session fix: apply_room_bounds() used to compute a pure "contain the whole room"
## zoom with no floor. For a room whose aspect ratio doesn't match the viewport (any room taller
## or narrower than 16:9 relative to its width — i.e. most authored rooms, and especially
## "vertical"/"challenge" archetype rooms), the binding axis (usually height) forces a small zoom
## that then reveals far more of the non-binding axis (usually width) than the room actually has —
## e.g. a real measured case: an 800x900 room in a 1920x1080 viewport contained at zoom=1.2, whose
## view (1600x900) shows 640px of pure void beyond the room's 960px content width. That both makes
## the player/enemies read as tiny (independently verified against a dedicated visual assessment —
## docs/audit/MODERN_COHESION_TEST_PROJECT.md's sixteenth session) and produces a sparse, mostly-
## empty composition. MIN_GAMEPLAY_ZOOM floors the contain-fit at the scene's original hand-tuned
## default (Player.tscn's zoom=1.85) so no room can push sprites smaller than that baseline;
## MAX_GAMEPLAY_ZOOM keeps a very small room from zooming in so far that CameraDirector's own
## clamped scrolling (_snap_to_room's limit_left/right/top/bottom) has no play to work with.
## Rooms larger than the floor-zoom's view now rely on real clamped-scroll follow-cam (already
## implemented below) to reveal the rest of the room during actual play, instead of shrinking the
## whole room into one static frame.
const MIN_GAMEPLAY_ZOOM := 1.85
const MAX_GAMEPLAY_ZOOM := 3.0
## Native Foundry V3 backdrop height. Cover-zoom alone still letterboxes a tall room
## (960×900 contain-width zoom=2 leaves ~360px of navy above the plate).
const FOUNDRY_VIEW_HEIGHT := 360.0

var _room_size := Vector2(800, 600)
var _look_ahead := 28.0

func _ready() -> void:
	_load_profile()
	top_level = false
	position = Vector2.ZERO
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

## Foundry V3 skips RearWall architecture; contain-zoom + MIN_GAMEPLAY_ZOOM on a small
## visual-slice room (e.g. 720×520 in a 1920×1080 view) reveals the navy ColorRect
## around the 1920×320 corridor plate — the letterbox in foundry-visual-slice-20260909.
## Cover-zoom keeps that plate full-bleed, matching artifacts/.../captures/gameplay.png.
func apply_room_bounds(room_size: Vector2, visual_kit: String = "") -> void:
	_room_size = room_size
	top_level = false
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
	# Contain the whole room in the window when the room is small enough to do so without
	# shrinking sprites below the floor. Cover-zoom (max of the ratios) on an 800×600 room in a
	# 16:9 view cropped ~150px of height — exactly onto the RearWall lintel — so climbRows and
	# night openings never appeared in captures; clamped_scroll (below) is what actually restores
	# that visibility now, at a floor zoom that keeps the player/enemies readable, rather than
	# shrinking arbitrarily large or oddly-proportioned rooms into a single frame.
	var fit := minf(vp.x / maxf(room_size.x, 1.0), vp.y / maxf(room_size.y, 1.0))
	if visual_kit == "foundry":
		var cover := maxf(vp.x / maxf(room_size.x, 1.0), vp.y / maxf(room_size.y, 1.0))
		var band := vp.y / FOUNDRY_VIEW_HEIGHT
		fit = maxf(cover, band)
	fit = clampf(fit, MIN_GAMEPLAY_ZOOM, MAX_GAMEPLAY_ZOOM)
	zoom = Vector2(fit, fit)
	position_smoothing_enabled = false
	drag_horizontal_enabled = false
	drag_vertical_enabled = false
	_snap_to_room()
	if has_method("force_update_scroll"):
		force_update_scroll()
	make_current()

func _process(delta: float) -> void:
	_snap_to_room(delta)

func _snap_to_room(delta: float = 0.0) -> void:
	var view := get_viewport().get_visible_rect().size / zoom
	if view.x < 8.0 or view.y < 8.0:
		return
	# A room that fits in the viewport cannot both clamp and follow: clamping pins its
	# center, which leaves a moving player stranded at screen edge. Preserve follow in
	# that case; larger rooms use their authored world bounds.
	limit_enabled = view.x < _room_size.x or view.y < _room_size.y - 48.0
	limit_left = 0
	limit_top = 0
	limit_right = int(_room_size.x)
	limit_bottom = int(maxf(0.0, _room_size.y - 48.0))
	# Camera follows parent naturally; position stays at Vector2.ZERO (child relative to Player)
	# Smooth offset for minor look-ahead when moving
	var parent := get_parent() as Node2D
	var target_offset := Vector2.ZERO
	if parent:
		var velocity_x := 0.0
		var velocity_value = parent.get("velocity")
		if typeof(velocity_value) == TYPE_VECTOR2:
			velocity_x = float((velocity_value as Vector2).x)
		if abs(velocity_x) > 12.0:
			target_offset.x = signf(velocity_x) * _look_ahead
	var smooth_speed := 1200.0
	offset.x = move_toward(offset.x, target_offset.x, smooth_speed * delta)
	offset.y = move_toward(offset.y, target_offset.y, smooth_speed * delta)
