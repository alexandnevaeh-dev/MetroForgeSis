extends PlayerAbility
class_name WallJumpAbility

func _init() -> void:
	super._init("wall_jump")

func try_jump(controller: AbilityController) -> bool:
	if not is_unlocked():
		return false
	if not controller.player.is_on_wall() or controller.player.is_on_floor():
		return false
	var wall_normal := controller.player.get_wall_normal()
	controller.player.velocity.x = wall_normal.x * controller.config.wall_jump_horizontal
	controller.player.velocity.y = controller.config.wall_jump_vertical
	controller.coyote_timer = 0.0
	controller.jump_buffer_timer = 0.0
	controller.is_wall_sliding = false
	if controller.has_ability("double_jump"):
		controller.air_jumps_remaining = 1
	AudioManager.play_sfx("jump")
	return true
