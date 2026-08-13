class_name TopDownCamera
extends Camera2D
## Smooth follow with map-boundary clamp. worldStyle continuous vs screen_by_screen.

@export var follow_smoothing: float = 8.0
@export var world_style: String = "continuous"

var _bounds := Rect2()
var _has_bounds := false
var _screen_origin := Vector2.ZERO
var _screen_size := Vector2(320, 240)

func _ready() -> void:
	make_current()
	position_smoothing_enabled = true
	position_smoothing_speed = follow_smoothing

func set_map_bounds(rect: Rect2) -> void:
	_bounds = rect
	_has_bounds = true
	limit_left = int(rect.position.x)
	limit_top = int(rect.position.y)
	limit_right = int(rect.end.x)
	limit_bottom = int(rect.end.y)

func lock_to_arena(rect: Rect2) -> void:
	set_map_bounds(rect)

func clear_arena_lock() -> void:
	if _has_bounds:
		set_map_bounds(_bounds)

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
