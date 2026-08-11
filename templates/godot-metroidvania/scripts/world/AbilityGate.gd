extends Area2D

@export var required_ability: String = ""
@export var gate_id: String = ""
@export var target_room: String = ""

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	if required_ability.is_empty() or ProgressionManager.is_gate_open(gate_id):
		visible = false
		set_deferred("monitoring", false)

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	if required_ability.is_empty() or GameManager.has_ability(required_ability):
		ProgressionManager.open_gate(gate_id)
		if not target_room.is_empty():
			get_tree().call_group("world_manager", "transition_to_room", target_room)
