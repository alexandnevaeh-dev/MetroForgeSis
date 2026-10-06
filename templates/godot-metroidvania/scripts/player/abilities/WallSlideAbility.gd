extends PlayerAbility
class_name WallSlideAbility

func _init() -> void:
	super._init("wall_slide")

func process_physics(controller: AbilityController, _delta: float) -> bool:
	if not is_unlocked():
		controller.is_wall_sliding = false
		return false
	var on_wall := controller.player.is_on_wall() and not controller.player.is_on_floor()
	controller.is_wall_sliding = on_wall and controller.player.velocity.y > 0.0
	if controller.is_wall_sliding:
		controller.player.velocity.y = min(
			controller.player.velocity.y,
			controller.config.wall_slide_speed
		)
	return false
