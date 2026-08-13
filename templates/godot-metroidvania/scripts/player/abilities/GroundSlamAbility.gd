extends PlayerAbility
class_name GroundSlamAbility

func _init() -> void:
	super._init("ground_slam")

func process_physics(controller: AbilityController, _delta: float) -> bool:
	if not controller.is_slamming:
		return false
	controller.player.velocity = Vector2(0.0, controller.config.ground_slam_speed)
	var was_airborne := not controller.player.is_on_floor()
	controller.player.move_and_slide()
	if controller.player.is_on_floor() and was_airborne:
		_break_weak_floors_from_collision(controller)
		VFXManager.play("slam_shock", controller.player.global_position + Vector2(0, 16), 1.4)
		controller.is_slamming = false
		AudioManager.play_sfx("hit")
	elif controller.player.is_on_floor():
		controller.is_slamming = false
	return true

func _break_weak_floors_from_collision(controller: AbilityController) -> void:
	for i in controller.player.get_slide_collision_count():
		var collider = controller.player.get_slide_collision(i).get_collider()
		if collider != null and collider.is_in_group("weak_floor") and collider.has_method("break_from_slam"):
			collider.break_from_slam()

func try_activate(controller: AbilityController) -> bool:
	if not is_unlocked() or controller.is_slamming or controller.is_dashing:
		return false
	if controller.player.is_on_floor():
		return false
	if not Input.is_action_pressed("move_down"):
		return false
	controller.is_slamming = true
	return true
