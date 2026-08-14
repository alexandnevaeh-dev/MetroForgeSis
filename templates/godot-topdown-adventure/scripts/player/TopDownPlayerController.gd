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
	if _stun_time > 0.0:
		_stun_time -= delta
		knockback = knockback.move_toward(Vector2.ZERO, _knockback_decay() * delta)
		velocity = knockback
		move_and_slide()
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
		velocity = velocity.move_toward(axis * speed, _cfg.acceleration * delta)
		if sprite:
			sprite.flip_h = facing.x < 0
	else:
		velocity = velocity.move_toward(Vector2.ZERO, _cfg.deceleration * delta)

	knockback = knockback.move_toward(Vector2.ZERO, _knockback_decay() * delta)
	velocity += knockback
	move_and_slide()

func cardinal_facing() -> Vector2:
	if abs(facing.x) >= abs(facing.y):
		return Vector2.RIGHT if facing.x >= 0 else Vector2.LEFT
	return Vector2.DOWN if facing.y >= 0 else Vector2.UP

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
	_attack_cooldown = 0.35
	var hit_dir := cardinal_facing()
	attack_hitbox.position = hit_dir * 22.0
	attack_hitbox.activate()
	attack_timer.start(0.18)
	AudioManager.play_sfx("attack")

func _on_attack_finished() -> void:
	attack_hitbox.deactivate()

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
	health.take_damage(damage)
	knockback = kb
	_stun_time = 0.12
	_shake_camera()

func _shake_camera() -> void:
	if camera == null:
		return
	var tween := create_tween()
	camera.offset = Vector2(4, -3)
	tween.tween_property(camera, "offset", Vector2.ZERO, 0.12)

func _on_died() -> void:
	EventBus.player_died.emit()

func _knockback_decay() -> float:
	return _cfg.knockback_decay
