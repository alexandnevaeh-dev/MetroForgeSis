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
@onready var sockets: Node2D = get_node_or_null("Sockets")

var facing: Vector2 = Vector2.DOWN
var facing_name: String = "S"
## Movement direction can differ from facing when independent aim / attack lock is active.
var move_dir: Vector2 = Vector2.ZERO
var knockback: Vector2 = Vector2.ZERO
var _stun_time: float = 0.0
var _attack_cooldown: float = 0.0
var _cfg: PlayerMovementConfig
enum AttackState { READY, STARTUP, ACTIVE, RECOVERY }
const ATTACK_MOVEMENT_MULTIPLIER := 0.55
const HURT_INVULNERABILITY := 0.65
var _attack_state: AttackState = AttackState.READY
var _attack_time := 0.0
var _attack_direction := Vector2.DOWN
var _invulnerability_time := 0.0
## Read by BossController._on_hit_received() for the "dash_through" weakness tag — bosses that
## carry it (see bosses.json) take double damage from a hit landed while this is true.
var _is_dashing: bool = false
var _dodge_time := 0.0
var _dodge_cooldown := 0.0
var _dodge_dir := Vector2.DOWN
var _anim_meta: Dictionary = {}
var _attack_startup := 0.08
var _attack_active := 0.10
var _attack_recovery := 0.18
var _cast_pose_time := 0.0

func _ready() -> void:
	_cfg = PlayerMovementConfig.load_from_project()
	_anim_meta = _load_animation_meta()
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
	if FileAccess.file_exists("res://data/abilities/spells.json"):
		var spells := Node.new()
		spells.set_script(load("res://scripts/player/PlayerSpellController.gd"))
		add_child(spells)

func _physics_process(delta: float) -> void:
	_is_dashing = false
	if GameManager.current_state != GameManager.GameState.PLAYING:
		return
	_attack_cooldown = max(0.0, _attack_cooldown - delta)
	_cast_pose_time = maxf(0.0,_cast_pose_time-delta)
	_dodge_cooldown = maxf(0.0, _dodge_cooldown - delta)
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

	if _dodge_time > 0.0:
		_is_dashing = true
		_dodge_time -= delta
		velocity = _dodge_dir * _cfg.dodge_speed
		move_and_slide()
		_update_sprite()
		if _dodge_time <= 0.0:
			_is_dashing = false
		return

	if Input.is_action_just_pressed("attack") and _attack_cooldown <= 0.0 and _cast_pose_time <= 0:
		_start_attack()
	if Input.is_action_just_pressed("interact"):
		_try_interact()

	var axis := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var deadzone := _cfg.analog_deadzone
	if axis.length() > deadzone:
		if _cfg.diagonal_normalization:
			axis = axis.normalized()
		if _cfg.movement_directions == 4:
			axis = cardinal_facing_from(axis)
		move_dir = axis
		# Facing follows movement unless attacking (locked) or independent aim is enabled.
		if _attack_state == AttackState.READY and _cast_pose_time <= 0 and not _cfg.independent_aim:
			facing = axis
			facing_name = _facing_name(axis)
			_sync_sockets_facing()
		var speed := _cfg.walk_speed
		_is_dashing = Input.is_action_pressed("dash") and _dodge_cooldown <= 0.0
		if _is_dashing:
			speed = _cfg.run_speed
		if _attack_state != AttackState.READY or _cast_pose_time > 0:
			speed *= ATTACK_MOVEMENT_MULTIPLIER
		velocity = velocity.move_toward(axis * speed, _cfg.acceleration * delta)
	else:
		move_dir = Vector2.ZERO
		_is_dashing = false
		velocity = velocity.move_toward(Vector2.ZERO, _cfg.deceleration * delta)

	# Just-pressed dash while moving = dodge/roll (not a teleport). Hold after = sprint above.
	if Input.is_action_just_pressed("dash") and _dodge_cooldown <= 0.0 and move_dir.length() > 0.1:
		_start_dodge(move_dir)
		return

	knockback = knockback.move_toward(Vector2.ZERO, _knockback_decay() * delta)
	velocity += knockback
	move_and_slide()
	_update_sprite()

func _start_dodge(dir: Vector2) -> void:
	_dodge_dir = dir.normalized()
	_dodge_time = _cfg.dodge_duration
	_dodge_cooldown = _cfg.dodge_cooldown
	_invulnerability_time = maxf(_invulnerability_time, _cfg.dodge_invulnerability)
	_is_dashing = true
	facing = _dodge_dir
	facing_name = _facing_name(_dodge_dir)
	_sync_sockets_facing()
	_play_facing_animation("walk", true)
	if has_node("/root/VFXManager"):
		if VFXManager.has_method("play_at_socket"):
			VFXManager.play_at_socket(self, "feet", "dash_trail", 0.6)
		else:
			VFXManager.play("dash_trail", global_position, 0.6)

## Directional strips are optional; existing generated characters keep their generic clips.
func _update_sprite() -> void:
	var action := "idle"
	if _stun_time > 0.0:
		action = "hurt"
	elif _cast_pose_time > 0:
		action = "cast"
	elif _attack_state != AttackState.READY:
		action = "attack"
	elif _stun_time > 0.0:
		action = "hurt"
	elif _dodge_time > 0.0 or velocity.length() > _cfg.walk_speed * 1.1:
		action = "run"
	elif velocity.length() > 1.0:
		action = "walk"
	_play_facing_animation(action)

func _play_facing_animation(action: String, restart: bool = false) -> void:
	if sprite == null or sprite.sprite_frames == null:
		return
	var target := StringName(action)
	if sprite.has_method("resolve_animation"):
		target = sprite.call("resolve_animation", action, facing_name)
	if not sprite.sprite_frames.has_animation(target):
		return
	var previous_action := String(sprite.animation).get_slice("_", 0)
	# Finish the current attack/hurt pose even if facing changes during recovery.
	if not restart and action in ["attack", "hurt", "death", "cast"] and previous_action == action:
		return
	var directional := String(target) != action
	sprite.flip_h = false if directional else facing.x < -0.01
	if sprite.animation == target and not restart:
		return
	var phase := 0.0
	var preserve_phase := not restart and action in ["walk", "run"] and previous_action in ["walk", "run"]
	if preserve_phase:
		var old_count := sprite.sprite_frames.get_frame_count(sprite.animation)
		if old_count > 0:
			phase = (float(sprite.frame) + sprite.frame_progress) / float(old_count)
	if restart:
		sprite.stop()
	sprite.play(target)
	if preserve_phase:
		var position := phase * sprite.sprite_frames.get_frame_count(target)
		sprite.set_frame_and_progress(int(position), position - floor(position))

func cardinal_facing() -> Vector2:
	return cardinal_facing_from(facing)

func cardinal_facing_from(dir: Vector2) -> Vector2:
	if abs(dir.x) >= abs(dir.y):
		return Vector2.RIGHT if dir.x >= 0 else Vector2.LEFT
	return Vector2.DOWN if dir.y >= 0 else Vector2.UP

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
	_attack_direction = facing.normalized() if not facing.is_zero_approx() else Vector2.DOWN
	facing = _attack_direction
	facing_name = _facing_name(_attack_direction)
	_sync_sockets_facing()
	_apply_attack_timing_from_meta("attack")
	_attack_cooldown = _attack_startup + _attack_active + _attack_recovery
	_attack_state = AttackState.STARTUP
	_attack_time = _attack_startup
	_play_facing_animation("attack", true)
	AudioManager.play_sfx("player_attack")

func _apply_attack_timing_from_meta(anim_name: String) -> void:
	## Prefer authored AttackTiming in player_animations.json; fall back to legacy constants.
	_attack_startup = 0.08
	_attack_active = 0.10
	_attack_recovery = 0.18
	if not _anim_meta.has(anim_name) or typeof(_anim_meta[anim_name]) != TYPE_DICTIONARY:
		return
	var entry: Dictionary = _anim_meta[anim_name]
	var fps := float(entry.get("fps", 18.0))
	if fps <= 0.0:
		fps = 18.0
	var timing: Dictionary = {}
	if entry.has("attackTiming") and typeof(entry["attackTiming"]) == TYPE_DICTIONARY:
		timing = entry["attackTiming"]
		var active_start := float(timing.get("activeStart", 7))
		var active_end := float(timing.get("activeEnd", 9))
		var recovery_end := float(timing.get("recoveryEnd", 11))
		_attack_startup = maxf(0.04, active_start / fps)
		_attack_active = maxf(0.05, (active_end - active_start) / fps)
		_attack_recovery = maxf(0.08, (recovery_end - active_end) / fps)
	elif entry.has("combatSync") and typeof(entry["combatSync"]) == TYPE_DICTIONARY:
		var sync: Dictionary = entry["combatSync"]
		var on_f := float(sync.get("hitboxOnFrame", 7))
		var off_f := float(sync.get("hitboxOffFrame", 9))
		var frames := float(entry.get("frameCount", 12))
		_attack_startup = maxf(0.04, on_f / fps)
		_attack_active = maxf(0.05, (off_f - on_f) / fps)
		_attack_recovery = maxf(0.08, (frames - off_f) / fps)

func _load_animation_meta() -> Dictionary:
	var path := "res://assets/characters/player_animations.json"
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed

func _update_attack_state(delta: float) -> void:
	if _attack_state == AttackState.READY:
		return
	_attack_time -= delta
	if _attack_time > 0.0:
		return
	match _attack_state:
		AttackState.STARTUP:
			var hit_dir := _attack_direction
			_sync_sockets_facing()
			if sockets != null and sockets.has_method("global_socket"):
				var tip: Vector2 = sockets.call("global_socket", "weapon_tip", global_position + hit_dir * 22.0)
				attack_hitbox.position = tip - global_position
				attack_hitbox.rotation = hit_dir.angle()
			else:
				attack_hitbox.position = hit_dir * 22.0
				attack_hitbox.rotation = hit_dir.angle()
			attack_hitbox.activate()
			_attack_state = AttackState.ACTIVE
			_attack_time = _attack_active
			if has_node("/root/VFXManager"):
				if VFXManager.has_method("play_at_socket"):
					VFXManager.play_at_socket(self, "weapon_tip", "hit_spark", 0.65, hit_dir * 20.0)
				else:
					VFXManager.play("hit_spark", global_position + hit_dir * 20.0, 0.65)
		AttackState.ACTIVE:
			attack_hitbox.deactivate()
			_attack_state = AttackState.RECOVERY
			_attack_time = _attack_recovery
		_:
			_attack_state = AttackState.READY
			_attack_time = 0.0

func _sync_sockets_facing() -> void:
	if sockets != null and sockets.has_method("set_facing"):
		var dir := facing if not facing.is_zero_approx() else Vector2.DOWN
		sockets.call("set_facing", dir)

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
	_play_facing_animation("death")
	set_physics_process(false)
	EventBus.player_died.emit()

func _knockback_decay() -> float:
	return _cfg.knockback_decay
