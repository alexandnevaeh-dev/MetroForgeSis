extends CharacterBody2D



@onready var health: HealthComponent = $HealthComponent

@onready var hurtbox: HurtboxComponent = $HurtboxComponent

@onready var attack_hitbox: HitboxComponent = $AttackHitbox

@onready var sprite: AnimatedSprite2D = $Sprite

@onready var attack_timer: Timer = $AttackTimer

@onready var camera: Camera2D = $Camera2D

@onready var ability_controller: AbilityController = $AbilityController

@onready var sockets: Node2D = get_node_or_null("Sockets")



var facing: int = 1
var _loco_facing: int = 1

var _attack_cooldown: float = 0.0
var _was_on_floor: bool = true
var _land_timer: float = 0.0
var _land_vfx_armed: bool = false
var _air_phase: StringName = &""

## Minimal 3-hit combo: attack_2/attack_3 are real generated clips (player animation production
## pass), not dead assets sitting unused next to "attack" — pressing attack again while
## _combo_window_timer is still open advances the combo instead of restarting attack_1.
var _combo_step: int = 0
var _combo_window_timer: float = 0.0
## Last grounded position inside the current room. Used to recover from missing
## containment (jump/dash through a visual wall) and from pit falls with no down exit.
var _last_safe: Vector2 = Vector2.ZERO
var _contain_width: float = 0.0
var _contain_height: float = 0.0
var _contain_has_down: bool = false
var _contain_armed: bool = false
## Per-clip combat sync from assets/characters/player_animations.json (AttackTiming).
var _anim_meta: Dictionary = {}
var _attack_seq: int = 0



func _ready() -> void:

	ability_controller.setup(self)

	health.died.connect(_on_died)

	hurtbox.hit_received.connect(_on_hit_received)

	attack_hitbox.owner_node = self

	attack_timer.timeout.connect(_on_attack_finished)

	EventBus.ability_acquired.connect(_on_ability_acquired)
	call_deferred("_arm_land_vfx")
	_anim_meta = _load_animation_meta()



	var restored := SaveManager.consume_pending_player_health()

	if restored.health >= 0.0:

		if restored.max_health > 0.0:

			health.max_health = restored.max_health

		health.current_health = restored.health

		health.health_changed.emit(health.current_health, health.max_health)

	InventoryManager.apply_stat_bonuses(false, self)



	ability_controller._sync_unlocked_abilities()
	if sprite:
		sprite.animation_finished.connect(_on_sprite_animation_finished)


func _arm_land_vfx() -> void:
	## Room loads leave the body airborne for one physics tick. That must not
	## fire slam/dust on spawn or every door — wait until grounded is stable.
	await get_tree().physics_frame
	await get_tree().physics_frame
	_was_on_floor = is_on_floor()
	_land_vfx_armed = true



func _physics_process(delta: float) -> void:

	ability_controller.tick_timers(delta)

	_attack_cooldown = max(0, _attack_cooldown - delta)

	_combo_window_timer = max(0.0, _combo_window_timer - delta)

	ability_controller.update_passive_abilities(delta)

	_update_phase_collision_mask()



	if ability_controller.movement_locked():
		if ability_controller.process_abilities(delta):
			move_and_slide()
			_update_room_containment()
			return



	if ability_controller.swim_mode:

		var swim_input := Input.get_axis("move_left", "move_right")

		var swim_vertical := Input.get_axis("move_up", "move_down")

		ability_controller.apply_swim_physics(swim_input, swim_vertical, delta)

	elif not is_on_floor():

		ability_controller.apply_gravity(delta)

	else:
		# Ground jumps consume coyote_timer before gravity runs; refresh it while grounded
		# so the existing buffered-jump path can initiate a normal takeoff.
		ability_controller.coyote_timer = ability_controller.config.coyote_time

		if _land_vfx_armed and not _was_on_floor:

			_land_timer = 0.22
			if has_node("/root/VFXManager"):
				VFXManager.play("landing_dust", global_position + Vector2(0, 8), 0.55)

		ability_controller.on_landed()


	_land_timer = max(0.0, _land_timer - delta)
	_was_on_floor = is_on_floor()



	for ability in ability_controller._abilities:

		if ability is WallSlideAbility:

			ability.process_physics(ability_controller, delta)



	var input_dir := Input.get_axis("move_left", "move_right")

	var cfg := ability_controller.config

	var is_running := Input.is_action_pressed("move_down") and is_on_floor()
	var speed := cfg.run_speed if is_running else cfg.walk_speed

	ability_controller.apply_horizontal_movement(input_dir, speed, delta)



	if input_dir != 0:

		facing = sign(input_dir)

		sprite.scale.x = abs(sprite.scale.x) * facing

		_sync_sockets_facing()



	_update_locomotion_animation(input_dir, is_running)



	if Input.is_action_just_pressed("jump"):

		if not ability_controller.try_grapple():

			ability_controller.buffer_jump()



	if ability_controller.consume_buffered_jump():

		pass

	# Advanced jumps must consume an actual buffered Jump press. Calling try_jump()
	# unconditionally made DoubleJump fire as soon as the player became airborne and
	# WallJump repeatedly launch the player while merely walking against a wall.
	elif ability_controller.jump_buffer_timer > 0.0 and ability_controller.try_jump():

		pass



	if Input.is_action_just_pressed("attack") and _attack_cooldown <= 0:

		_perform_attack()



	if Input.is_action_just_pressed("dash"):

		ability_controller.try_dash()

	elif Input.is_action_just_pressed("move_down"):

		ability_controller.try_ground_slam()



	move_and_slide()
	_update_room_containment()


func _play_clip(anim: StringName, restart: bool = false) -> void:
	if sprite == null or sprite.sprite_frames == null:
		return
	if not sprite.sprite_frames.has_animation(anim):
		return
	var loco := anim == &"walk" or anim == &"run"
	if not loco:
		sprite.speed_scale = 1.0
	if not restart and sprite.animation == anim:
		if sprite.is_playing():
			return
		if not sprite.sprite_frames.get_animation_loop(anim):
			return
	sprite.play(anim)


func _on_sprite_animation_finished() -> void:
	if sprite.animation == "jump_start" and not is_on_floor() and velocity.y < 0.0:
		_air_phase = &"jump"
		_play_clip(&"jump", true)


func _update_locomotion_animation(input_dir: float, is_running: bool = false) -> void:
	var animation_locked := sprite.sprite_frames \
		and (sprite.animation == "attack" or sprite.animation == "attack_2" or sprite.animation == "attack_3" or sprite.animation == "hurt" or sprite.animation == "death") \
		and sprite.is_playing()
	if animation_locked:
		sprite.speed_scale = 1.0
		return
	if not sprite.sprite_frames:
		return

	if ability_controller.swim_mode and sprite.sprite_frames.has_animation("swim"):
		_air_phase = &""
		_play_clip(&"swim")
		return

	if ability_controller.is_wall_sliding and sprite.sprite_frames.has_animation("wall_slide"):
		_air_phase = &"wall"
		_play_clip(&"wall_slide")
		return

	if ability_controller.is_dashing:
		_air_phase = &"dash"
		if not is_on_floor() and sprite.sprite_frames.has_animation("air_dash"):
			_play_clip(&"air_dash")
		else:
			_play_clip(&"dash")
		return

	if ability_controller.wall_jump_timer > 0.0 and sprite.sprite_frames.has_animation("wall_jump"):
		_air_phase = &"wall_jump"
		_play_clip(&"wall_jump")
		return

	if not is_on_floor():
		if velocity.y < 0.0:
			if _air_phase == &"" or _air_phase == &"land" or _air_phase == &"fall":
				_air_phase = &"jump_start"
				_play_clip(&"jump_start", true)
			elif _air_phase == &"jump_start":
				if sprite.animation != "jump_start" or not sprite.is_playing():
					_air_phase = &"jump"
					_play_clip(&"jump", true)
			else:
				_play_clip(&"jump")
		else:
			_air_phase = &"fall"
			_play_clip(&"fall")
		return

	if _land_timer > 0.0 and sprite.sprite_frames.has_animation("land"):
		_air_phase = &"land"
		_play_clip(&"land")
		return

	_air_phase = &""
	if input_dir != 0:
		var reversed := facing != _loco_facing
		_loco_facing = facing
		if is_running and sprite.sprite_frames.has_animation("run"):
			_play_clip(&"run", reversed)
		elif not is_running and sprite.sprite_frames.has_animation("walk"):
			_play_clip(&"walk", reversed)
		elif sprite.sprite_frames.has_animation("run"):
			_play_clip(&"run", reversed)
		elif sprite.sprite_frames.has_animation("walk"):
			_play_clip(&"walk", reversed)
		var expected := ability_controller.config.run_speed if is_running else ability_controller.config.walk_speed
		if sprite.animation == "run" or sprite.animation == "walk":
			# Deadband 32–48 avoids flipping 1.0 ↔ scaled every frame at the threshold.
			if abs(velocity.x) < 32.0:
				sprite.speed_scale = 1.0
			elif abs(velocity.x) >= 48.0:
				sprite.speed_scale = clampf(abs(velocity.x) / maxf(expected, 1.0), 0.72, 1.25)
	else:
		sprite.speed_scale = 1.0
		_play_clip(&"idle")



func _perform_attack() -> void:

	if _combo_window_timer > 0.0 and _combo_step > 0 and _combo_step < 3:
		_combo_step += 1
	else:
		_combo_step = 1

	var anim_name := "attack"
	if _combo_step == 2 and sprite.sprite_frames and sprite.sprite_frames.has_animation("attack_2"):
		anim_name = "attack_2"
	elif _combo_step == 3 and sprite.sprite_frames and sprite.sprite_frames.has_animation("attack_3"):
		anim_name = "attack_3"
	elif _combo_step > 1:
		# This combo step has no generated sheet (older project, no attack_2/attack_3) — fall
		# back to attack_1 and reset the combo instead of getting stuck on a missing animation.
		_combo_step = 1

	# Cooldown/combo-window now tracks the real clip length instead of a fixed 0.4s guess — a
	# real per-clip duration only exists now that attacks carry actual FPS/frame-count metadata.
	var clip_duration := 0.4
	var fps := 18.0
	var clip_frame_count := 12
	if sprite.sprite_frames and sprite.sprite_frames.has_animation(anim_name):
		fps = maxf(1.0, sprite.sprite_frames.get_animation_speed(anim_name))
		clip_frame_count = sprite.sprite_frames.get_frame_count(anim_name)
		if fps > 0.0 and clip_frame_count > 0:
			clip_duration = max(0.25, clip_frame_count / fps)

	var sync: Dictionary = _combat_sync_for(anim_name, clip_frame_count)
	var hit_on_frame: int = int(sync.get("hitboxOnFrame", int(clip_frame_count * 0.55)))
	var hit_off_frame: int = int(sync.get("hitboxOffFrame", mini(clip_frame_count, hit_on_frame + 2)))
	var vfx_frame: int = int(sync.get("vfxFrame", hit_on_frame))
	var cancel_frame: int = int(sync.get("comboCancelOpenFrame", hit_off_frame))
	var hit_on_sec := float(hit_on_frame) / fps
	var hit_off_sec := float(hit_off_frame) / fps
	var vfx_sec := float(vfx_frame) / fps
	var cancel_sec := float(cancel_frame) / fps

	# Cooldown opens at combo-cancel frame so chaining matches authored AttackTiming.
	_attack_cooldown = maxf(0.12, cancel_sec)
	_combo_window_timer = clip_duration * 1.4

	_place_attack_hitbox()
	attack_hitbox.deactivate()

	if sprite.sprite_frames and sprite.sprite_frames.has_animation(anim_name):
		sprite.speed_scale = 1.0
		sprite.play(anim_name)

	_attack_seq += 1
	var seq := _attack_seq
	# Safety: always clear hitbox if timers are interrupted by a new attack / death.
	attack_timer.start(maxf(hit_off_sec + 0.02, clip_duration))

	get_tree().create_timer(hit_on_sec).timeout.connect(func () -> void:
		if seq != _attack_seq:
			return
		_place_attack_hitbox()
		attack_hitbox.activate()
	)
	get_tree().create_timer(hit_off_sec).timeout.connect(func () -> void:
		if seq != _attack_seq:
			return
		attack_hitbox.deactivate()
	)
	get_tree().create_timer(vfx_sec).timeout.connect(func () -> void:
		if seq != _attack_seq:
			return
		_spawn_attack_vfx()
	)


func _sync_sockets_facing() -> void:
	if sockets != null and sockets.has_method("set_facing"):
		sockets.call("set_facing", Vector2(float(facing), 0.0))


func _place_attack_hitbox() -> void:
	_sync_sockets_facing()
	if sockets != null and sockets.has_method("global_socket"):
		var tip: Vector2 = sockets.call("global_socket", "weapon_tip", global_position + Vector2(30.0 * float(facing), -20.0))
		attack_hitbox.position = tip - global_position
	else:
		attack_hitbox.position.x = 30 * facing
		attack_hitbox.position.y = -20


func _spawn_attack_vfx() -> void:
	if not has_node("/root/VFXManager"):
		return
	_sync_sockets_facing()
	if VFXManager.has_method("play_at_socket"):
		VFXManager.play_at_socket(self, "weapon_tip", "hit_spark", 0.7, Vector2(28.0 * float(facing), -6.0))
	else:
		var tip := global_position + Vector2(28.0 * float(facing), -6.0)
		VFXManager.play("hit_spark", tip, 0.7)


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


func _combat_sync_for(anim_name: String, frame_count: int) -> Dictionary:
	if _anim_meta.has(anim_name) and typeof(_anim_meta[anim_name]) == TYPE_DICTIONARY:
		var entry: Dictionary = _anim_meta[anim_name]
		if entry.has("combatSync") and typeof(entry["combatSync"]) == TYPE_DICTIONARY:
			return entry["combatSync"]
		if entry.has("attackTiming") and typeof(entry["attackTiming"]) == TYPE_DICTIONARY:
			var t: Dictionary = entry["attackTiming"]
			return {
				"hitboxOnFrame": int(t.get("activeStart", 0)),
				"hitboxOffFrame": int(t.get("activeEnd", frame_count)),
				"vfxFrame": int(t.get("vfxTriggerFrame", t.get("activeStart", 0))),
				"sfxFrame": int(t.get("sfxTriggerFrame", t.get("activeStart", 0))),
				"comboCancelOpenFrame": int(t.get("comboCancelOpenFrame", t.get("activeEnd", 0))),
			}
	# Deterministic fallback when sidecar lacks sync (older projects).
	var on_f := maxi(1, int(frame_count * 0.55))
	return {
		"hitboxOnFrame": on_f,
		"hitboxOffFrame": mini(frame_count, on_f + 2),
		"vfxFrame": on_f + 1,
		"sfxFrame": maxi(0, on_f - 1),
		"comboCancelOpenFrame": mini(frame_count - 1, on_f + 2),
	}



func _on_attack_finished() -> void:

	attack_hitbox.deactivate()



func _on_hit_received(damage: float, knockback: Vector2) -> void:

	health.take_damage(damage)

	velocity = knockback

	health.invulnerable = true

	if sprite.sprite_frames and sprite.sprite_frames.has_animation("hurt"):
		sprite.speed_scale = 1.0
		sprite.play("hurt")

	_shake_camera()

	await get_tree().create_timer(0.5).timeout

	health.invulnerable = false



func _shake_camera(intensity: float = 6.0, duration: float = 0.2) -> void:

	if not SettingsManager.screen_shake_enabled or camera == null:

		return

	var tween := create_tween()

	var steps := 6

	for i in range(steps):

		var offset := Vector2(randf_range(-intensity, intensity), randf_range(-intensity, intensity))

		tween.tween_property(camera, "offset", offset, duration / float(steps))

	tween.tween_property(camera, "offset", Vector2.ZERO, duration / float(steps))



func _on_died() -> void:

	set_physics_process(false)

	if sprite.sprite_frames and sprite.sprite_frames.has_animation("death"):

		sprite.play("death")

	# Health-continuity-milestone fix: this previously awaited `sprite.animation_finished` before
	# ever emitting EventBus.player_died, which GameManager's entire respawn flow depends on.
	# Directly reproduced and isolated (HealthContinuityMicroTest.gd, a real death triggered by a
	# direct take_damage() call): neither `await sprite.animation_finished`,
	# `await get_tree().create_timer(...).timeout`, nor a `.timeout.connect(...)` on the same timer
	# ever fired in that real test run — only `call_deferred()` with no wait at all reliably ran.
	# Rather than leave the single most consequential signal in the entire respawn chain dependent
	# on a wait mechanism with a real, reproduced failure mode, this emits via a deferred call
	# instead (end of the current frame, not delayed further) — GameManager's own real 1-second
	# GAME_OVER window, which runs before it actually respawns the player, already gives the death
	# animation real time to play out on screen regardless of this change.
	call_deferred("_finish_death_sequence")

func _finish_death_sequence() -> void:
	visible = false
	EventBus.player_died.emit()



func _on_ability_acquired(ability_id: String) -> void:

	ability_controller.on_ability_acquired(ability_id)



func enable_dash() -> void:

	ability_controller.on_ability_acquired("dash")



## Used by boss weakness checks — dash state lives on AbilityController now.

var _is_dashing: bool:

	get:

		return ability_controller.is_dashing



func enter_water() -> void:

	ability_controller.in_water = true



func exit_water() -> void:

	ability_controller.in_water = false



func _update_phase_collision_mask() -> void:

	set_collision_mask_value(7, not ability_controller.is_phase_dashing)


func set_room_containment(width: float, height: float, has_down_exit: bool) -> void:
	_contain_width = width
	_contain_height = height
	_contain_has_down = has_down_exit
	_contain_armed = width > 0.0 and height > 0.0
	_last_safe = global_position


func _update_room_containment() -> void:
	if not _contain_armed:
		return
	var inside_x := position.x >= 8.0 and position.x <= _contain_width - 8.0
	var inside_y := position.y >= 0.0 and position.y <= _contain_height
	if is_on_floor() and inside_x and inside_y:
		_last_safe = global_position
		return
	var fall_limit := _contain_height + (80.0 if _contain_has_down else 48.0)
	var escaped := position.y > fall_limit or position.y < -24.0 \
		or position.x < -20.0 or position.x > _contain_width + 20.0
	if not escaped:
		return
	global_position = _last_safe
	velocity = Vector2.ZERO

