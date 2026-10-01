extends CanvasLayer
const HUD_THEME = preload("res://scripts/UI/AdventureHUDTheme.gd")

@onready var health_bar: ProgressBar = $HUD/MarginContainer/VBox/HealthBar
@onready var ability_label: Label = $HUD/MarginContainer/VBox/AbilityLabel
@onready var currency_label: Label = $HUD/MarginContainer/VBox/CurrencyLabel
@onready var collectible_label: Label = $HUD/MarginContainer/VBox/CollectibleLabel
@onready var quest_tracker_panel: PanelContainer = $HUD/MarginContainer/VBox/QuestTrackerPanel
@onready var health_readout: Label = $HUD/MarginContainer/VBox/HealthReadout
@onready var location_label: Label = $HUD/MarginContainer/VBox/LocationLabel
var _ability_names: Dictionary = {}
var _last_room := ""
var _health_fill: StyleBoxFlat
var _spell_panel: PanelContainer
var _mana_label: Label
var _spell_labels: Dictionary = {}

func _ready() -> void:
	$HUD.theme = HUD_THEME.make_theme()
	$HUD.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for control in $HUD.find_children("*", "Control", true, false):
		control.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_health_fill = HUD_THEME.box(HUD_THEME.HEALTH, false)
	health_bar.add_theme_stylebox_override("fill", _health_fill)
	location_label.add_theme_color_override("font_color", HUD_THEME.GOLD)
	currency_label.add_theme_color_override("font_color", HUD_THEME.MUTED)
	collectible_label.add_theme_color_override("font_color", HUD_THEME.MUTED)
	if FileAccess.file_exists("res://game_dna.json"):
		var dna: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://game_dna.json"))
		if dna is Dictionary:
			for ability: Dictionary in dna.get("abilities", []):
				_ability_names[String(ability.get("id", ""))] = String(ability.get("name", ""))
	EventBus.ability_acquired.connect(_on_ability_acquired)
	EventBus.game_completed.connect(_on_game_completed)
	EventBus.player_died.connect(_on_player_died)
	EventBus.player_respawned.connect(_on_player_respawned)
	_update_abilities()
	$VictoryOverlay/VictoryLabel.add_theme_color_override("font_color", HUD_THEME.TEXT)
	$DeathOverlay/DeathLabel.add_theme_color_override("font_color", HUD_THEME.TEXT)
	if FileAccess.file_exists("res://data/abilities/spells.json"): _build_spell_hud()

func _process(_delta: float) -> void:
	$HUD/StatusBackground.size = $HUD/MarginContainer.size
	var player := get_tree().get_first_node_in_group("player")
	if player and player.has_node("HealthComponent"):
		var hp: HealthComponent = player.get_node("HealthComponent")
		var maximum := maxf(1.0, hp.max_health)
		health_bar.value = clampf(hp.current_health / maximum, 0.0, 1.0) * 100.0
		var low := health_bar.value <= 25.0
		_health_fill.bg_color = HUD_THEME.DANGER if low else HUD_THEME.HEALTH
		health_readout.text = "VITALITY  %d / %d%s" % [ceili(maxf(0.0, hp.current_health)), ceili(maximum), "  · LOW" if low else ""]
		health_readout.add_theme_color_override("font_color", HUD_THEME.DANGER if low else HUD_THEME.TEXT)
	# Polled rather than signal-driven, same as the health bar above — QuestManager.currency
	# changes from two independent sources (quest rewards, item pickups) and neither needs to
	# know the HUD exists.
	_update_currency()
	_update_collectibles()
	_update_abilities()
	_update_location()
	_update_spell_hud(player)
	quest_tracker_panel.visible = not QuestManager.get_hud_entries().is_empty()

func _on_ability_acquired(ability_id: String) -> void:
	_update_abilities()

func _update_abilities() -> void:
	var ids: Array[String] = GameManager.player_abilities.duplicate()
	# Dungeon tools are inventory items; acquiring one need not emit ability_acquired.
	for id: String in _ability_names.keys():
		if InventoryManager.get_owned_count(id) > 0 and id not in ids:
			ids.append(id)
	var names: Array[String] = []
	for id in ids:
		var definition := InventoryManager.get_item_definition(id)
		var display := String(definition.get("name", _ability_names.get(id, id.replace("_", " ").capitalize())))
		names.append(display if not display.is_empty() else id.replace("_", " ").capitalize())
	var abilities := " · ".join(names)
	ability_label.text = "Tools: " + (abilities if abilities else "—")
	ability_label.tooltip_text = abilities

func _update_location() -> void:
	var room := GameManager.current_room_id
	if room == _last_room and not location_label.text.is_empty(): return
	_last_room = room
	location_label.text = "Exploring"
	for node: Dictionary in MapManager.get_graph().get("nodes", []):
		if String(node.get("id", "")) == room:
			location_label.text = String(node.get("label", "Exploring"))
			break
	location_label.tooltip_text = location_label.text

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

func _build_spell_hud() -> void:
	_spell_panel = PanelContainer.new()
	_spell_panel.name = "SpellHotbar"
	_spell_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_spell_panel.offset_left = -282
	_spell_panel.offset_right = 282
	_spell_panel.offset_top = -90
	_spell_panel.offset_bottom = -16
	_spell_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	$HUD.add_child(_spell_panel)
	var margin := MarginContainer.new()
	for side in ["left","right","top","bottom"]: margin.add_theme_constant_override("margin_"+side,8)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spell_panel.add_child(margin)
	var stack := VBoxContainer.new()
	stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(stack)
	_mana_label = Label.new()
	_mana_label.add_theme_color_override("font_color",HUD_THEME.CYAN)
	_mana_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stack.add_child(_mana_label)
	var slots := HBoxContainer.new()
	slots.add_theme_constant_override("separation",16)
	slots.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stack.add_child(slots)
	for id in ["seedflare","rootward","bloomstep"]:
		var label := Label.new()
		label.custom_minimum_size = Vector2(168,32)
		label.add_theme_font_size_override("font_size",13)
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slots.add_child(label)
		_spell_labels[id] = label

func _update_spell_hud(player: Node) -> void:
	if _spell_panel == null: return
	var spells := player.get_node_or_null("Spells") if player else null
	_spell_panel.visible = spells != null
	if spells == null: return
	_mana_label.text = "ESSENCE  %d / %d" % [floori(spells.mana),floori(spells.maximum_mana)]
	for id in _spell_labels:
		var spec: Dictionary = spells.definitions.get(id,{})
		var label: Label = _spell_labels[id]
		var key := "Q" if id=="seedflare" else "R" if id=="rootward" else "F"
		var learned: bool = spells.is_learned(id)
		var cooldown: float = spells.get_cooldown(id)
		var state := "Not learned" if not learned else "%.1fs" % cooldown if cooldown>0 else "%d essence" % int(spec.get("cost",0))
		label.text = "%s  %s\n%s" % [key,spec.get("name",id.capitalize()),state]
		label.add_theme_color_override("font_color",HUD_THEME.TEXT if learned else HUD_THEME.MUTED)
