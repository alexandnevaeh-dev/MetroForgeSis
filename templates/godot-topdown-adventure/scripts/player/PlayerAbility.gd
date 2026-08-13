class_name PlayerAbility
extends RefCounted
## Base contract for modular player abilities. Each concrete ability lives in
## scripts/player/abilities/ and is registered by AbilityRegistry.

var id: String = ""

func _init(ability_id: String) -> void:
	id = ability_id

func is_unlocked() -> bool:
	return GameManager.has_ability(id)

## Return true when this ability owns movement for the frame (dash, slam, etc.).
func process_physics(_controller: AbilityController, _delta: float) -> bool:
	return false

func try_jump(_controller: AbilityController) -> bool:
	return false

func on_landed(_controller: AbilityController) -> void:
	pass

func on_unlocked(_controller: AbilityController) -> void:
	pass
