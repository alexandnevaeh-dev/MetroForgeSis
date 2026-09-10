class_name TopDownPlayerController
extends CharacterBody2D
## 8-direction top-down locomotion. Movement constants come from movement.json.

static var CARDINALS := {
	"N": Vector2(0, -1),
	"NE": Vector2(1, -1).normalized(),
	"E": Vector2(1, 0),
	"SE": Vector2(1, 1).normalized(),
	"S": Vector2(0, 1),
	"SW": Vector2(-1, 1).normalized(),
	"W": Vector2(-1, 0),
	"NW": Vector2(-1, -1).normalized(),
}

@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent
@onready var attack_hitbox: HitboxComponent = $AttackHitbox
@onready var sprite: AnimatedSprite2D = $Sprite
@onready var attack_timer: Timer = $AttackTimer
@onready var camera: Camera2D = $Camera2D

var facing: Vector2 = Vector2.DOWN
var facing_name: String = "S"
var knockback: Vector2 = Vector2.ZERO
var _stun_time: float = 0.0
var _attack_cooldown: float = 0.0
var _cfg: PlayerMovementConfig
enum AttackState { READY, STARTUP, ACTIVE, RECOVERY }
const ATTACK_STARTUP := 0.08
const ATTACK_ACTIVE := 0.10
const ATTACK_RECOVERY := 0.18
const ATTACK_MOVEMENT_MULTIPLIER := 0.55
const HURT_INVULNERABILITY := 0.65
var _attack_state: AttackState = AttackState.READY
var _attack_time := 0.0
var _invulnerability_time := 0.0
## Read by BossController._on_hit_received() for the "dash_through" weakness tag — bosses that
## carry it (see bosses.json) take double damage from a hit landed while this is true. There's no
## separate burst-dash ability in this template; holding "dash" is already the sprint-speed input
## below, so that's the state this reflects.
var _is_dashing: bool = false

func _ready() -> void:
	_cfg = PlayerMovementConfig.load_from_project()
	health.died.connect(_on_died)
	hurtbox.hit_received.connect(_on_hit_received)
	attack_hitbox.owner_node = self
	attack_timer.timeout.connect(_on_attack_finished)
	var pending: Dictionary = SaveManager.consume_pending_player_health()
	if float(pending.get("health", -1.0)) >= 0.0:
		if float(pending.get("max_health", -1.0)) > 0.0:
			health.max_health = float(pending.get("max_health"))
		health.current_health = float(pending.get("health"))
		health.health_changed.emit(health.current_health, health.max_health)
	InventoryManager.apply_stat_bonuses(false, self)

func _physics_process(delta: float) -> void:
	if GameManager.current_state != GameManager.GameState.PLAYING:
		return
	_attack_cooldown = max(0.0, _attack_cooldown - delta)
	_invulnerability_time = maxf(0.0, _invulnerability_time - delta)
	health.invulnerable = _invulnerability_time > 0.0
	_update_attack_state(delta)
	if _stun_time > 0.0:
		_stun_time -= delta
		knockback = knockback.move_toward(Vector2.ZERO, _knockback_decay() * delta)
		velocity = knockback
		move_and_slide()
		_update_sprite()
		return

	if Input.is_action_just_pressed("attack") and _attack_cooldown <= 0.0:
		_start_attack()
	if Input.is_action_just_pressed("interact"):
		_try_interact()

	_is_dashing = Input.is_action_pressed("dash")
	var axis := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if axis.length() > 0.2:
		axis = axis.normalized()
		facing = axis
		facing_name = _facing_name(axis)
		var speed := _cfg.run_speed if Input.is_action_pressed("dash") else _cfg.walk_speed
		if _attack_state != AttackState.READY:
			speed *= ATTACK_MOVEMENT_MULTIPLIER
		velocity = velocity.move_toward(axis * speed, _cfg.acceleration * delta)
	else:
		velocity = velocity.move_toward(Vector2.ZERO, _cfg.deceleration * delta)

	knockback = knockback.move_toward(Vector2.ZERO, _knockback_decay() * delta)
	velocity += knockback
	move_and_slide()
	_update_sprite()

## Genre-parity fix: TopDownPlayerController never called sprite.play() at all — only
## AnimatedAssetSprite.gd's own _ready() ever played anything (a single "walk" call, once, for the
## rest of the scene's life). The player's real, already-generated idle/walk/attack/hurt sheets
## existed on disk and were loaded into sprite_frames but never selected — every top-down player
## rendered as a permanently-looping walk-cycle regardless of standing still, attacking, or being
## hit. Mirrors the exact pattern BossController.gd (this same template) already gets right.
func _update_sprite() -> void:
	if sprite == null or sprite.sprite_frames == null:
		return
	if abs(facing.x) > 0.01:
		sprite.flip_h = facing.x < 0.0
	# Guard every non-looping play() call against re-triggering while already mid-playback — attack
	# and hurt are both loop=false (AnimatedAssetSprite.gd); calling play() again every physics
	# frame (60/sec) while the state persists would restart from frame 0 every tick instead of
	# letting the clip actually play through, exactly the mistake BossController.gd's own
	# `sprite.animation == "attack" and sprite.is_playing()` guard exists to avoid.
	match _attack_state:
		AttackState.STARTUP, AttackState.ACTIVE, AttackState.RECOVERY:
			if sprite.sprite_frames.has_animation("attack") and not (sprite.animation == "attack" and sprite.is_playing()):
				sprite.play("attack")
		_:
			if _stun_time > 0.0 and sprite.sprite_frames.has_animation("hurt"):
				if not (sprite.animation == "hurt" and sprite.is_playing()):
					sprite.play("hurt")
			elif velocity.length() > 1.0:
				if sprite.animation != "walk":
					sprite.play("walk")
			elif sprite.sprite_frames.has_animation("idle") and sprite.animation != "idle":
				sprite.play("idle")

func cardinal_facing() -> Vector2:
	if abs(facing.x) >= abs(facing.y):
		return Vector2.RIGHT if facing.x >= 0 else Vector2.LEFT
	return Vector2.DOWN if facing.y >= 0 else Vector2.UP

## Read by tests and diagnostics — returns the current attack state machine state.
func get_attack_state() -> AttackState:
	return _attack_state

func _facing_name(dir: Vector2) -> String:
	var best := "S"
	var best_dot := -2.0
	for key in CARDINALS.keys():
		var d: float = dir.dot(CARDINALS[key])
		if d > best_dot:
			best_dot = d
			best = key
	return best

func _start_attack() -> void:
	_attack_cooldown = ATTACK_STARTUP + ATTACK_ACTIVE + ATTACK_RECOVERY
	_attack_state = AttackState.STARTUP
	_attack_time = ATTACK_STARTUP
	AudioManager.play_sfx("attack")

func _update_attack_state(delta: float) -> void:
	if _attack_state == AttackState.READY:
		return
	_attack_time -= delta
	if _attack_time > 0.0:
		return
	match _attack_state:
		AttackState.STARTUP:
			var hit_dir := cardinal_facing()
			attack_hitbox.position = hit_dir * 22.0
			attack_hitbox.activate()
			_attack_state = AttackState.ACTIVE
			_attack_time = ATTACK_ACTIVE
		AttackState.ACTIVE:
			attack_hitbox.deactivate()
			_attack_state = AttackState.RECOVERY
			_attack_time = ATTACK_RECOVERY
		_:
			_attack_state = AttackState.READY
			_attack_time = 0.0

func _on_attack_finished() -> void:
	attack_hitbox.deactivate()
	_attack_state = AttackState.READY
	_attack_time = 0.0

func _try_interact() -> void:
	var space := get_world_2d().direct_space_state
	var query := PhysicsRayQueryParameters2D.create(global_position, global_position + cardinal_facing() * 28.0)
	query.collide_with_areas = true
	query.collision_mask = 32
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		var areas := get_tree().get_nodes_in_group("interactable")
		for node in areas:
			if node is Node2D and global_position.distance_to(node.global_position) <= 36.0:
				if node.has_method("interact"):
					node.interact(self)
					return
		return
	var collider = hit.get("collider")
	if collider and collider.has_method("interact"):
		collider.interact(self)

func _on_hit_received(damage: float, kb: Vector2) -> void:
	if health.invulnerable:
		return
	_on_attack_finished()
	health.take_damage(damage)
	knockback = kb
	_stun_time = 0.12
	_invulnerability_time = HURT_INVULNERABILITY
	health.invulnerable = true
	_shake_camera()

func _shake_camera() -> void:
	if camera == null:
		return
	var tween := create_tween()
	camera.offset = Vector2(4, -3)
	tween.tween_property(camera, "offset", Vector2.ZERO, 0.12)

func _on_died() -> void:
	# GameManager._on_player_died() (see core/GameManager.gd) already holds GAME_OVER for a real
	# 1.0s window before respawn — plenty of time for a short death clip to actually be seen, so
	# (unlike BossController.gd/TopDownEnemyController.gd, whose queue_free() had nothing else
	# holding the scene open) no extra delay is needed here, just actually playing the animation.
	# `_physics_process` has no is_alive() guard (never needed one before this) and would otherwise
	# overwrite "death" back to "idle"/"walk" on the very next physics tick via _update_sprite() —
	# stopping it here is safe because respawn always frees this instance and instantiates a fresh
	# Player (OverworldManager._ensure_player() / SaveManager.load_game()), never reuses it.
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("death"):
		sprite.play("death")
	set_physics_process(false)
	EventBus.player_died.emit()

func _knockback_decay() -> float:
	return _cfg.knockback_decay
