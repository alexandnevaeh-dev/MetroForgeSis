extends CharacterBody2D

@export var walk_speed: float = 200.0
@export var run_speed: float = 350.0
@export var jump_velocity: float = -400.0
@export var gravity: float = 980.0
@export var coyote_time: float = 0.12
@export var jump_buffer_time: float = 0.1
@export var dash_speed: float = 500.0
@export var dash_duration: float = 0.15
@export var dash_cooldown: float = 0.5

var facing: int = 1
var _coyote_timer: float = 0.0
var _jump_buffer_timer: float = 0.0
var _is_dashing: bool = false
var _dash_timer: float = 0.0
var _dash_cooldown_timer: float = 0.0
var _can_dash: bool = false
var _attack_cooldown: float = 0.0

@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent
@onready var attack_hitbox: HitboxComponent = $AttackHitbox
@onready var sprite: AnimatedSprite2D = $Sprite
@onready var attack_timer: Timer = $AttackTimer

func _ready() -> void:
	health.died.connect(_on_died)
	hurtbox.hit_received.connect(_on_hit_received)
	attack_hitbox.owner_node = self
	attack_timer.timeout.connect(_on_attack_finished)
	_can_dash = GameManager.has_ability("dash")
	EventBus.ability_acquired.connect(_on_ability_acquired)

	var restored := SaveManager.consume_pending_player_health()
	if restored.health >= 0.0:
		if restored.max_health > 0.0:
			health.max_health = restored.max_health
		health.current_health = restored.health
		health.health_changed.emit(health.current_health, health.max_health)

func _physics_process(delta: float) -> void:
	if _is_dashing:
		_process_dash(delta)
		return

	if not is_on_floor():
		velocity.y += gravity * delta
		_coyote_timer -= delta
	else:
		_coyote_timer = coyote_time

	_jump_buffer_timer = max(0, _jump_buffer_timer - delta)
	_dash_cooldown_timer = max(0, _dash_cooldown_timer - delta)
	_attack_cooldown = max(0, _attack_cooldown - delta)

	var input_dir := Input.get_axis("move_left", "move_right")
	var speed := run_speed if Input.is_action_pressed("move_down") else walk_speed
	velocity.x = input_dir * speed

	if input_dir != 0:
		facing = sign(input_dir)
		sprite.scale.x = abs(sprite.scale.x) * facing

	# Let the one-shot attack/hurt animations play out instead of the per-frame walk/idle
	# logic below immediately overriding them (this loop runs every physics frame).
	var animation_locked := sprite.sprite_frames \
		and (sprite.animation == "attack" or sprite.animation == "hurt") \
		and sprite.is_playing()
	if not animation_locked:
		if input_dir != 0 and sprite.sprite_frames and sprite.sprite_frames.has_animation("walk"):
			sprite.play("walk")
		elif sprite.sprite_frames and sprite.sprite_frames.has_animation("idle"):
			sprite.play("idle")

	if Input.is_action_just_pressed("jump"):
		_jump_buffer_timer = jump_buffer_time

	if _jump_buffer_timer > 0 and _coyote_timer > 0:
		velocity.y = jump_velocity
		_jump_buffer_timer = 0
		_coyote_timer = 0
		AudioManager.play_sfx("jump")

	if Input.is_action_just_pressed("attack") and _attack_cooldown <= 0:
		_perform_attack()

	if Input.is_action_just_pressed("dash") and _can_dash and _dash_cooldown_timer <= 0:
		_start_dash()

	move_and_slide()

func _process_dash(delta: float) -> void:
	_dash_timer -= delta
	velocity = Vector2(facing * dash_speed, 0)
	move_and_slide()
	if _dash_timer <= 0:
		_is_dashing = false
		_dash_cooldown_timer = dash_cooldown

func _start_dash() -> void:
	_is_dashing = true
	_dash_timer = dash_duration
	AudioManager.play_sfx("dash")

func _perform_attack() -> void:
	_attack_cooldown = 0.4
	attack_hitbox.position.x = 30 * facing
	attack_hitbox.activate()
	attack_timer.start(0.15)
	if sprite.sprite_frames and sprite.sprite_frames.has_animation("attack"):
		sprite.play("attack")

func _on_attack_finished() -> void:
	attack_hitbox.deactivate()

func _on_hit_received(damage: float, knockback: Vector2) -> void:
	health.take_damage(damage)
	velocity = knockback
	health.invulnerable = true
	if sprite.sprite_frames and sprite.sprite_frames.has_animation("hurt"):
		sprite.play("hurt")
	await get_tree().create_timer(0.5).timeout
	health.invulnerable = false

func _on_died() -> void:
	EventBus.player_died.emit()
	visible = false
	set_physics_process(false)
	await get_tree().create_timer(1.0).timeout
	global_position = Vector2(100, 300)
	health.reset_health()
	visible = true
	set_physics_process(true)
	EventBus.player_respawned.emit()

func _on_ability_acquired(ability_id: String) -> void:
	if ability_id == "dash":
		_can_dash = true

func enable_dash() -> void:
	_can_dash = true
