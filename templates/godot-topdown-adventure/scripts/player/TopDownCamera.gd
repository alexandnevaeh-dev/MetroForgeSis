class_name TopDownCamera
extends Camera2D
## Smooth follow with map-boundary clamp. worldStyle continuous vs screen_by_screen.

@export var follow_smoothing: float = 8.0
@export var world_style: String = "continuous"

## Room-fill zoom bounds. Camera2D.zoom is a direct world-to-screen scale factor, not (as an
## earlier version of this fix assumed, then had to re-derive empirically via an isolated probe
## scene after the assumed direction produced the opposite of the intended result on a real
## screenshot) an inverse "how much world is visible" fraction — `zoom=0.5` renders every world
## unit at *half* size (shows MORE world, i.e. zooms OUT), `zoom=2.0` renders at *double* size
## (zooms IN). So filling a room smaller than the viewport needs zoom > 1 (magnify up), not < 1.
## A real dungeon room in this profile is 16x12 tiles at 32px (512x384px) against a 1920x1080
## design viewport, needing zoom = max(1920/512, 1080/384) = 3.75 to fill without exposing void
## on either axis (see _room_fill_zoom). MIN_ZOOM=1.0 means a room bigger than the viewport just
## pans within itself, same as before this fix — no reason to shrink it further. MAX_ZOOM=5.0 is
## a generous ceiling against a hypothetical, much smaller room feeling claustrophobically
## over-magnified; every real room in this pipeline needs at most ~3.75-4.2x.
const MIN_ZOOM := 1.0
const MAX_ZOOM := 5.0
## How long a zoom change takes to settle — matched to a typical position_smoothing_speed's own
## settle time so a room-size change doesn't visibly outrun or lag the camera's own pan.
const ZOOM_TWEEN_SEC := 0.35

var _bounds := Rect2()
var _has_bounds := false
var _screen_origin := Vector2.ZERO
var _screen_size := Vector2(320, 240)
var _zoom_tween: Tween
## A fresh Camera2D is instantiated for every room transition (OverworldManager destroys and
## recreates the Player, and the camera is one of its children) — there's no "previous room's
## zoom" for *this* camera instance to smoothly animate away from, so its very first
## set_map_bounds() call (arriving in a room) snaps zoom directly instead of tweening from the
## default 1.0 it would otherwise briefly flash at. A *second* call on the same camera — the
## boss-arena lock/clear-arena-lock path, which reuses the room's own already-placed camera — is
## a real in-room state change and tweens as normal.
var _zoom_initialized := false

func _ready() -> void:
	make_current()
	position_smoothing_enabled = true
	position_smoothing_speed = follow_smoothing

## Previously only clamped camera panning to the room's own bounds — with zoom left at its
## default 1:1, a room smaller than the design viewport (every dungeon room in a
## VISUAL_VERTICAL_SLICE profile: 16x12 tiles @ 32px = 512x384px, versus a 1920x1080 design
## viewport) left the camera unable to pan far enough to fill the screen, exposing plain
## background void on every side — not stretched pixels or outside-room geometry (the room's own
## content never extends past its real bounds either way), just a large area of nothing to look
## at. `world_style == "screen_by_screen"` is unused by OverworldManager (never invoked — every
## project's worldStyle is "continuous" per packages/procedural/src/topdown/world.ts) and is left
## untouched; this only affects the continuous path every real room actually uses.
func set_map_bounds(rect: Rect2) -> void:
	_bounds = rect
	_has_bounds = true
	limit_left = int(rect.position.x)
	limit_top = int(rect.position.y)
	limit_right = int(rect.end.x)
	limit_bottom = int(rect.end.y)
	if world_style != "screen_by_screen":
		if _zoom_initialized:
			_tween_zoom_to_fill(rect.size)
		else:
			zoom = Vector2(_room_fill_zoom(rect.size), _room_fill_zoom(rect.size))
			_zoom_initialized = true

func lock_to_arena(rect: Rect2) -> void:
	set_map_bounds(rect)

func clear_arena_lock() -> void:
	if _has_bounds:
		set_map_bounds(_bounds)

## The smallest uniform magnification that still shows the room's full extent on at least one
## axis without ever exposing space beyond it on the *other* axis. Visible world size on an axis
## is viewport_size/zoom (see the const comment above), so "never show more than room_size on
## either axis" means zoom >= viewport_size/room_size on *both* axes — taking the larger of the
## two per-axis ratios (not the smaller) guarantees both are satisfied simultaneously, so the void
## this fix targets can never reappear the other way (zoomed out too far because one axis's
## requirement was under-satisfied). A very long, narrow room crops some of its length on the
## unconstrained axis rather than exposing void on the constrained one — a deliberate, disclosed
## trade-off, not a bug: nothing here ever stretches pixels (zoom is always uniform, one float
## applied to both axes) or reveals off-room content.
func _room_fill_zoom(room_size: Vector2) -> float:
	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 0.0 or viewport_size.y <= 0.0 or room_size.x <= 0.0 or room_size.y <= 0.0:
		return 1.0
	var fill := maxf(viewport_size.x / room_size.x, viewport_size.y / room_size.y)
	return clampf(fill, MIN_ZOOM, MAX_ZOOM)

func _tween_zoom_to_fill(room_size: Vector2) -> void:
	var target := _room_fill_zoom(room_size)
	var target_zoom := Vector2(target, target)
	if zoom.is_equal_approx(target_zoom):
		return
	if _zoom_tween and _zoom_tween.is_valid():
		_zoom_tween.kill()
	_zoom_tween = create_tween()
	_zoom_tween.set_ease(Tween.EASE_OUT)
	_zoom_tween.set_trans(Tween.TRANS_SINE)
	_zoom_tween.tween_property(self, "zoom", target_zoom, ZOOM_TWEEN_SEC)

func apply_world_style(style: String, screen_size: Vector2) -> void:
	world_style = style
	_screen_size = screen_size

func _process(_delta: float) -> void:
	if world_style != "screen_by_screen":
		return
	var parent := get_parent() as Node2D
	if parent == null:
		return
	var cell := Vector2(
		floor(parent.global_position.x / _screen_size.x),
		floor(parent.global_position.y / _screen_size.y),
	)
	_screen_origin = cell * _screen_size
	limit_left = int(_screen_origin.x)
	limit_top = int(_screen_origin.y)
	limit_right = int(_screen_origin.x + _screen_size.x)
	limit_bottom = int(_screen_origin.y + _screen_size.y)
