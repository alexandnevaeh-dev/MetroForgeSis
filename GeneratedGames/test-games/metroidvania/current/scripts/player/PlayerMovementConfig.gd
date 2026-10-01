class_name PlayerMovementConfig
extends RefCounted
## Loads movement tuning from generated data/player/movement.json when present.

var walk_speed: float = 200.0
var run_speed: float = 350.0
var jump_velocity: float = -400.0
var gravity: float = 980.0
var coyote_time: float = 0.12
var jump_buffer_time: float = 0.1
var acceleration: float = 1800.0
var deceleration: float = 2200.0
var air_acceleration: float = 900.0
var max_fall_speed: float = 650.0
var dash_speed: float = 500.0
var dash_duration: float = 0.15
var dash_cooldown: float = 0.5
var air_dash_speed: float = 450.0
var wall_slide_speed: float = 80.0
var wall_jump_horizontal: float = 280.0
var wall_jump_vertical: float = -320.0
var ground_slam_speed: float = 900.0
var grapple_speed: float = 620.0
var swim_speed: float = 180.0
var phase_duration: float = 0.22

static func load_from_project() -> PlayerMovementConfig:
	var cfg := PlayerMovementConfig.new()
	var path := "res://data/player/movement.json"
	if not FileAccess.file_exists(path):
		return cfg
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return cfg
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return cfg
	var d: Dictionary = parsed
	cfg.walk_speed = float(d.get("walkSpeed", cfg.walk_speed))
	cfg.run_speed = float(d.get("runSpeed", cfg.run_speed))
	cfg.gravity = float(d.get("gravity", cfg.gravity))
	var jump_height := float(d.get("jumpHeight", 120.0))
	cfg.jump_velocity = -sqrt(2.0 * cfg.gravity * jump_height)
	cfg.coyote_time = float(d.get("coyoteTime", cfg.coyote_time))
	cfg.jump_buffer_time = float(d.get("jumpBufferTime", cfg.jump_buffer_time))
	cfg.acceleration = float(d.get("acceleration", cfg.acceleration))
	cfg.deceleration = float(d.get("deceleration", cfg.deceleration))
	cfg.air_acceleration = float(d.get("airAcceleration", cfg.air_acceleration))
	cfg.max_fall_speed = float(d.get("maxFallSpeed", cfg.max_fall_speed))
	cfg.dash_speed = float(d.get("dashSpeed", cfg.dash_speed))
	cfg.dash_duration = float(d.get("dashDuration", cfg.dash_duration))
	cfg.dash_cooldown = float(d.get("dashCooldown", cfg.dash_cooldown))
	cfg.air_dash_speed = float(d.get("airDashSpeed", cfg.air_dash_speed))
	cfg.wall_slide_speed = float(d.get("wallSlideSpeed", cfg.wall_slide_speed))
	cfg.wall_jump_horizontal = float(d.get("wallJumpHorizontal", cfg.wall_jump_horizontal))
	cfg.wall_jump_vertical = float(d.get("wallJumpVertical", cfg.wall_jump_vertical))
	cfg.ground_slam_speed = float(d.get("groundSlamSpeed", cfg.ground_slam_speed))
	cfg.grapple_speed = float(d.get("grappleSpeed", cfg.grapple_speed))
	cfg.swim_speed = float(d.get("swimSpeed", cfg.swim_speed))
	cfg.phase_duration = float(d.get("phaseDuration", cfg.phase_duration))
	return cfg
