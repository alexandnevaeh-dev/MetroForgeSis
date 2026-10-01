extends PlayerAbility

class_name PhaseAbility



func _init() -> void:

	super._init("phase")



func process_physics(controller: AbilityController, delta: float) -> bool:

	if controller.phase_timer > 0.0:

		controller.phase_timer = max(0.0, controller.phase_timer - delta)

		controller.is_phase_dashing = controller.phase_timer > 0.0

	return false



func on_dash_started(controller: AbilityController) -> void:

	if not is_unlocked():

		return

	controller.is_phase_dashing = true

	controller.phase_timer = controller.config.phase_duration

	VFXManager.play("ability_unlock", controller.player.global_position, 0.9)

