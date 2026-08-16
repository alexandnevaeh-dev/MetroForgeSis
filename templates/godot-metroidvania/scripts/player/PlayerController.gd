extends CharacterBody2D



@onready var health: HealthComponent = $HealthComponent

@onready var hurtbox: HurtboxComponent = $HurtboxComponent

@onready var attack_hitbox: HitboxComponent = $AttackHitbox

@onready var sprite: AnimatedSprite2D = $Sprite

@onready var attack_timer: Timer = $AttackTimer

@onready var camera: Camera2D = $Camera2D

@onready var ability_controller: AbilityController = $AbilityController



var facing: int = 1

var _attack_cooldown: float = 0.0



func _ready() -> void:

	ability_controller.setup(self)

	health.died.connect(_on_died)

	hurtbox.hit_received.connect(_on_hit_received)

	attack_hitbox.owner_node = self

	attack_timer.timeout.connect(_on_attack_finished)

	EventBus.ability_acquired.connect(_on_ability_acquired)



	var restored := SaveManager.consume_pending_player_health()

	if restored.health >= 0.0:

		if restored.max_health > 0.0:

			health.max_health = restored.max_health

		health.current_health = restored.health

		health.health_changed.emit(health.current_health, health.max_health)

	InventoryManager.apply_stat_bonuses(false, self)



	ability_controller._sync_unlocked_abilities()



func _physics_process(delta: float) -> void:

	ability_controller.tick_timers(delta)

	_attack_cooldown = max(0, _attack_cooldown - delta)

	ability_controller.update_passive_abilities(delta)

	_update_phase_collision_mask()



	if ability_controller.movement_locked():

		if ability_controller.process_abilities(delta):

			move_and_slide()

			return



	if ability_controller.swim_mode:

		var swim_input := Input.get_axis("move_left", "move_right")

		var swim_vertical := Input.get_axis("move_up", "move_down")

		ability_controller.apply_swim_physics(swim_input, swim_vertical, delta)

	elif not is_on_floor():

		ability_controller.apply_gravity(delta)

	else:

		ability_controller.on_landed()



	for ability in ability_controller._abilities:

		if ability is WallSlideAbility:

			ability.process_physics(ability_controller, delta)



	var input_dir := Input.get_axis("move_left", "move_right")

	var cfg := ability_controller.config

	var speed := cfg.run_speed if Input.is_action_pressed("move_down") and is_on_floor() else cfg.walk_speed

	ability_controller.apply_horizontal_movement(input_dir, speed, delta)



	if input_dir != 0:

		facing = sign(input_dir)

		sprite.scale.x = abs(sprite.scale.x) * facing



	_update_locomotion_animation(input_dir)



	if Input.is_action_just_pressed("jump"):

		if not ability_controller.try_grapple():

			ability_controller.buffer_jump()



	if ability_controller.consume_buffered_jump():

		pass

	elif ability_controller.try_jump():

		pass



	if Input.is_action_just_pressed("attack") and _attack_cooldown <= 0:

		_perform_attack()



	if Input.is_action_just_pressed("dash"):

		ability_controller.try_dash()

	elif Input.is_action_just_pressed("move_down"):

		ability_controller.try_ground_slam()



	move_and_slide()



func _update_locomotion_animation(input_dir: float) -> void:

	var animation_locked := sprite.sprite_frames \

		and (sprite.animation == "attack" or sprite.animation == "hurt" or sprite.animation == "death") \

		and sprite.is_playing()

	if animation_locked:

		return

	if not sprite.sprite_frames:

		return

	if ability_controller.is_dashing and sprite.sprite_frames.has_animation("dash"):

		sprite.play("dash")

		return

	if not is_on_floor():

		if velocity.y < 0.0 and sprite.sprite_frames.has_animation("jump"):

			sprite.play("jump")

		elif sprite.sprite_frames.has_animation("fall"):

			sprite.play("fall")

		return

	if input_dir != 0:

		if sprite.sprite_frames.has_animation("run"):

			sprite.play("run")

		elif sprite.sprite_frames.has_animation("walk"):

			sprite.play("walk")

	elif sprite.sprite_frames.has_animation("idle"):

		sprite.play("idle")



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

		await sprite.animation_finished

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


