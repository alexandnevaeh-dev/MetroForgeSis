extends PlayerAbility

class_name SwimAbility



func _init() -> void:

	super._init("swim")



func process_physics(controller: AbilityController, _delta: float) -> bool:

	controller.swim_mode = is_unlocked() and controller.in_water

	return false

