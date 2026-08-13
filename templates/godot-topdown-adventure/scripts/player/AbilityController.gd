class_name AbilityController
extends Node
## Modular ability dispatch — PlayerController owns core locomotion; abilities plug in here.

var player: CharacterBody2D
var config: PlayerMovementConfig

var coyote_timer: float = 0.0
var jump_buffer_timer: float = 0.0
var dash_cooldown_timer: float = 0.0
var is_dashing: bool = false
var dash_kind: String = ""
var dash_timer: float = 0.0
var is_slamming: bool = false
var is_wall_sliding: bool = false
var is_grappling: bool = false
var grapple_target: Vector2 = Vector2.ZERO
var in_water: bool = false
var swim_mode: bool = false
var is_phase_dashing: bool = false
var phase_timer: float = 0.0
var air_jumps_remaining: int = 0

var _abilities: Array = []
var _dash_ability: DashAbility
var _double_jump: DoubleJumpAbility
var _wall_slide: WallSlideAbility
var _wall_jump: WallJumpAbility
var _air_dash: AirDashAbility
var _ground_slam: GroundSlamAbility
var _grapple: GrappleAbility
var _swim: SwimAbility
var _phase: PhaseAbility

func setup(owner_body: CharacterBody2D) -> void:
	player = owner_body
	config = PlayerMovementConfig.load_from_project()
	for ability in AbilityRegistry.create_all():
		_abilities.append(ability)
		match ability.id:
			"dash":
				_dash_ability = ability
			"double_jump":
				_double_jump = ability
			"wall_slide":
				_wall_slide = ability
			"wall_jump":
				_wall_jump = ability
			"air_dash":
				_air_dash = ability
			"ground_slam":
				_ground_slam = ability
			"grapple":
				_grapple = ability
			"swim":
				_swim = ability
			"phase":
				_phase = ability
	_sync_unlocked_abilities()

func _sync_unlocked_abilities() -> void:
	if _double_jump and _double_jump.is_unlocked():
		air_jumps_remaining = 1

func has_ability(ability_id: String) -> bool:
	return GameManager.has_ability(ability_id)

func on_ability_acquired(ability_id: String) -> void:
	if not AbilityRegistry.is_supported(ability_id):
		return
	for ability in _abilities:
		if ability.id == ability_id:
			ability.on_unlocked(self)
			break

func movement_locked() -> bool:
	return is_dashing or is_slamming or is_grappling

func process_abilities(delta: float) -> bool:
	for ability in _abilities:
		if ability is SwimAbility or ability is PhaseAbility:
			continue
		if ability.process_physics(self, delta):
			return true
	return false

func update_passive_abilities(delta: float) -> void:
	for ability in _abilities:
		if ability is SwimAbility or ability is PhaseAbility:
			ability.process_physics(self, delta)

func try_grapple() -> bool:
	return _grapple != null and _grapple.try_activate(self)

func notify_dash_started() -> void:
	if _phase:
		_phase.on_dash_started(self)

func apply_swim_physics(input_dir: float, vertical: float, delta: float) -> void:
	if abs(vertical) > 0.1:
		var target_y := vertical * config.swim_speed
		var diff := target_y - player.velocity.y
		player.velocity.y += clamp(diff, -config.acceleration * delta, config.acceleration * delta)
	else:
		player.velocity.y += config.gravity * delta * 0.25
		player.velocity.y = clamp(player.velocity.y, -config.swim_speed, config.swim_speed)
	apply_horizontal_movement(input_dir, config.swim_speed, delta)

func try_dash() -> bool:
	if _dash_ability and _dash_ability.try_activate(self):
		notify_dash_started()
		return true
	if _air_dash and _air_dash.try_activate(self):
		notify_dash_started()
		return true
	return false

func try_ground_slam() -> bool:
	return _ground_slam != null and _ground_slam.try_activate(self)

func try_jump() -> bool:
	if _wall_jump and _wall_jump.try_jump(self):
		return true
	if _double_jump and _double_jump.try_jump(self):
		return true
	return false

func on_landed() -> void:
	if _double_jump:
		_double_jump.on_landed(self)

func apply_horizontal_movement(input_dir: float, speed: float, delta: float) -> void:
	var target_x := input_dir * speed
	var accel := config.acceleration if player.is_on_floor() else config.air_acceleration
	if input_dir == 0.0:
		accel = config.deceleration
	var diff := target_x - player.velocity.x
	player.velocity.x += clamp(diff, -accel * delta, accel * delta)

func apply_gravity(delta: float) -> void:
	if player.is_on_floor():
		coyote_timer = config.coyote_time
	else:
		coyote_timer -= delta
		player.velocity.y += config.gravity * delta
		player.velocity.y = min(player.velocity.y, config.max_fall_speed)

func tick_timers(delta: float) -> void:
	jump_buffer_timer = max(0.0, jump_buffer_timer - delta)
	dash_cooldown_timer = max(0.0, dash_cooldown_timer - delta)

func buffer_jump() -> void:
	jump_buffer_timer = config.jump_buffer_time

func consume_buffered_jump() -> bool:
	if jump_buffer_timer <= 0.0 or coyote_timer <= 0.0:
		return false
	player.velocity.y = config.jump_velocity
	jump_buffer_timer = 0.0
	coyote_timer = 0.0
	AudioManager.play_sfx("jump")
	return true
