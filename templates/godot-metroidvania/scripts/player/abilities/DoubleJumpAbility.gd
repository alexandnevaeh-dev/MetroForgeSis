extends PlayerAbility
class_name DoubleJumpAbility

func _init() -> void:
	super._init("double_jump")

func try_jump(controller: AbilityController) -> bool:
	if not is_unlocked():
		return false
	if controller.player.is_on_floor() or controller.coyote_timer > 0.0:
		return false
	if controller.air_jumps_remaining <= 0:
		return false
	controller.air_jumps_remaining -= 1
	controller.player.velocity.y = controller.config.jump_velocity
	AudioManager.play_sfx("jump")
	return true

func on_landed(controller: AbilityController) -> void:
	controller.air_jumps_remaining = 1 if is_unlocked() else 0

func on_unlocked(controller: AbilityController) -> void:
	if not controller.player.is_on_floor():
		controller.air_jumps_remaining = 1
