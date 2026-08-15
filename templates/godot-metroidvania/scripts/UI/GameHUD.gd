extends CanvasLayer

@onready var health_bar: ProgressBar = $HUD/MarginContainer/VBox/HealthBar
@onready var ability_label: Label = $HUD/MarginContainer/VBox/AbilityLabel
@onready var currency_label: Label = $HUD/MarginContainer/VBox/CurrencyLabel
@onready var collectible_label: Label = $HUD/MarginContainer/VBox/CollectibleLabel

func _ready() -> void:
	EventBus.ability_acquired.connect(_on_ability_acquired)
	EventBus.game_completed.connect(_on_game_completed)
	EventBus.player_died.connect(_on_player_died)
	EventBus.player_respawned.connect(_on_player_respawned)
	if ability_label:
		ability_label.add_theme_color_override("font_color", Color(0.92, 0.93, 0.96))
		ability_label.add_theme_color_override("font_shadow_color", Color(0.05, 0.06, 0.08, 0.85))
	if currency_label:
		currency_label.add_theme_color_override("font_color", Color(0.86, 0.88, 0.92))
	if collectible_label:
		collectible_label.add_theme_color_override("font_color", Color(0.72, 0.82, 0.95))
	_update_abilities()

func _process(_delta: float) -> void:
	var player := get_tree().get_first_node_in_group("player")
	if player and player.has_node("HealthComponent"):
		var hp: HealthComponent = player.get_node("HealthComponent")
		health_bar.value = (hp.current_health / hp.max_health) * 100.0
	# Polled rather than signal-driven, same as the health bar above — QuestManager.currency
	# changes from two independent sources (quest rewards, item pickups) and neither needs to
	# know the HUD exists.
	_update_currency()
	_update_collectibles()

func _on_ability_acquired(ability_id: String) -> void:
	_update_abilities()

func _update_abilities() -> void:
	var abilities := ", ".join(GameManager.player_abilities)
	ability_label.text = "Abilities: " + (abilities if abilities else "None")

func _update_currency() -> void:
	var parts: Array[String] = []
	for currency_id in QuestManager.currency.keys():
		parts.append("%s: %d" % [String(currency_id).capitalize(), int(QuestManager.currency[currency_id])])
	currency_label.text = ", ".join(parts)

func _update_collectibles() -> void:
	if collectible_label == null:
		return
	var total := InventoryManager.get_collectible_total_count()
	if total <= 0:
		collectible_label.text = ""
		return
	collectible_label.text = "Echoes: %d/%d" % [
		InventoryManager.get_collectible_found_count(),
		total,
	]

func _on_game_completed() -> void:
	$VictoryOverlay.visible = true

## Gives GameManager's now-real GAME_OVER window (previously an unused enum value with nothing
## ever assigning it, and player_died/player_respawned had zero listeners) something the player
## can actually see, for the real duration GameManager pauses before respawning at the checkpoint.
func _on_player_died() -> void:
	$DeathOverlay.visible = true

func _on_player_respawned() -> void:
	$DeathOverlay.visible = false
