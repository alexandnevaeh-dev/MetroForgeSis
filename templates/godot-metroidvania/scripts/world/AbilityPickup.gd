extends Area2D

@export var ability_id: String = "dash"
@export var display_name: String = "Dash"

func _ready() -> void:
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player") and not GameManager.has_ability(ability_id):
		GameManager._on_ability_acquired(ability_id)
		EventBus.ability_acquired.emit(ability_id)
		queue_free()
