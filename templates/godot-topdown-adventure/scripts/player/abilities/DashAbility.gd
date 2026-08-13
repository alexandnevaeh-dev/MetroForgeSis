extends PlayerAbility
class_name DashAbility

func _init() -> void:
	super._init("dash")

func process_physics(controller: AbilityController, delta: float) -> bool:
	if not controller.is_dashing or controller.dash_kind != "ground":
		return false
	controller.dash_timer -= delta
	controller.player.velocity = Vector2(controller.player.facing * controller.config.dash_speed, 0)
	controller.player.move_and_slide()
	if controller.dash_timer <= 0.0:
		controller.is_dashing = false
		controller.dash_cooldown_timer = controller.config.dash_cooldown
	return true

func try_activate(controller: AbilityController) -> bool:
	if not is_unlocked() or controller.is_dashing or controller.dash_cooldown_timer > 0.0:
		return false
	if not controller.player.is_on_floor():
		return false
	controller.is_dashing = true
	controller.dash_kind = "ground"
	controller.dash_timer = controller.config.dash_duration
	AudioManager.play_sfx("dash")
	VFXManager.play("dash_trail", controller.player.global_position, 1.2)
	return true
