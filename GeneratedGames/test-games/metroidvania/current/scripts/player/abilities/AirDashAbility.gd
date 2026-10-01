extends PlayerAbility
class_name AirDashAbility

func _init() -> void:
	super._init("air_dash")

func process_physics(controller: AbilityController, delta: float) -> bool:
	if not controller.is_dashing or controller.dash_kind != "air":
		return false
	controller.dash_timer -= delta
	controller.player.velocity = Vector2(controller.player.facing * controller.config.air_dash_speed, 0)
	controller.player.move_and_slide()
	if controller.dash_timer <= 0.0:
		controller.is_dashing = false
		controller.dash_cooldown_timer = controller.config.dash_cooldown
	return true

func try_activate(controller: AbilityController) -> bool:
	if not is_unlocked() or controller.is_dashing or controller.dash_cooldown_timer > 0.0:
		return false
	if controller.player.is_on_floor():
		return false
	controller.is_dashing = true
	controller.dash_kind = "air"
	controller.dash_timer = controller.config.dash_duration
	AudioManager.play_sfx("dash")
	VFXManager.play("dash_trail", controller.player.global_position, 1.0)
	return true
