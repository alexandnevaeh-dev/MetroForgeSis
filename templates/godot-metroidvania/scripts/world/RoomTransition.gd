extends Area2D

@export var target_room_id: String = ""
@export var spawn_side: String = "left"
@export var transition_direction: String = "right"
@export var is_optional: bool = false
@export var required_abilities: PackedStringArray = PackedStringArray()

func _ready() -> void:
	match transition_direction:
		"up":
			$Visual.color = Color(0.9, 0.75, 0.3, 0.45)
		"down":
			$Visual.color = Color(0.85, 0.5, 0.3, 0.45)
		_:
			if is_optional:
				$Visual.color = Color(0.45, 0.65, 1.0, 0.4)
	if not required_abilities.is_empty():
		$Visual.color = Color(0.95, 0.45, 0.25, 0.65)
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player") or target_room_id.is_empty():
		return
	for ability in required_abilities:
		if not GameManager.has_ability(ability):
			return
	var world_manager := get_tree().get_first_node_in_group("world_manager")
	if world_manager and world_manager.has_method("transition_to_room"):
		world_manager.transition_to_room(target_room_id, spawn_side)
