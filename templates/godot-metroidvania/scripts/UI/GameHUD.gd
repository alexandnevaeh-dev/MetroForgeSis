extends CanvasLayer

@onready var health_bar: ProgressBar = $HUD/MarginContainer/VBox/HealthBar
@onready var ability_label: Label = $HUD/MarginContainer/VBox/AbilityLabel

func _ready() -> void:
	EventBus.ability_acquired.connect(_on_ability_acquired)
	EventBus.game_completed.connect(_on_game_completed)
	_update_abilities()

func _process(_delta: float) -> void:
	var player := get_tree().get_first_node_in_group("player")
	if player and player.has_node("HealthComponent"):
		var hp: HealthComponent = player.get_node("HealthComponent")
		health_bar.value = (hp.current_health / hp.max_health) * 100.0

func _on_ability_acquired(ability_id: String) -> void:
	_update_abilities()

func _update_abilities() -> void:
	var abilities := ", ".join(GameManager.player_abilities)
	ability_label.text = "Abilities: " + (abilities if abilities else "None")

func _on_game_completed() -> void:
	$VictoryOverlay.visible = true
