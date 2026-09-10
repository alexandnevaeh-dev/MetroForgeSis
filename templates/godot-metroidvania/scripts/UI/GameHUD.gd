extends CanvasLayer

@onready var hud_frame_panel: Panel = $HUD/HUDFrame
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
	_style_hud()
	_apply_hud_mode()

## Real UI-foundry textures (assets/ui/hud_frame.png, assets/ui/health_meter.png) are generated
## from this game's actual biome palette by generateUiPanel() in packages/assets/src/ui-foundry.ts
## (see asset-pipeline.ts ~L1591-1624), but generation there is gated on `options.visualDNA` being
## present for the run, not guaranteed for every profile (e.g. TINY_TEST) — so both textures are
## loaded defensively and the original hardcoded StyleBoxFlat look is kept as the fallback when a
## file is missing, same ResourceLoader.exists()-then-load() convention AnimatedAssetSprite.gd uses
## for its animation sheets.
func _style_hud() -> void:
	_apply_hud_frame()
	if health_bar:
		health_bar.custom_minimum_size = Vector2(280, 22)
		_apply_health_bar_style()
	if ability_label:
		ability_label.add_theme_font_size_override("font_size", 14)
	if currency_label:
		currency_label.add_theme_font_size_override("font_size", 13)
	if collectible_label:
		collectible_label.add_theme_font_size_override("font_size", 13)

## Backs the whole health/ability/currency/collectible stack with the generated 320x48 framed
## panel instead of leaving the labels floating bare over the game world. Hidden (its scene
## default) when the texture wasn't generated for this run.
func _apply_hud_frame() -> void:
	if hud_frame_panel == null:
		return
	var tex := _load_ui_texture("res://assets/ui/hud_frame.png")
	if tex == null:
		hud_frame_panel.visible = false
		return
	var panel_box := StyleBoxTexture.new()
	panel_box.texture = tex
	panel_box.texture_margin_left = 4
	panel_box.texture_margin_top = 4
	panel_box.texture_margin_right = 4
	panel_box.texture_margin_bottom = 4
	hud_frame_panel.add_theme_stylebox_override("panel", panel_box)
	hud_frame_panel.visible = true

## health_meter.png is the generated bordered meter frame (128x16) — used as the bar's
## background/track so the border reflects the game's real palette instead of a hardcoded
## dark-with-tan-border box. The fill stays a flat color (no separate fill asset is generated)
## so bar value is still readable at a glance.
func _apply_health_bar_style() -> void:
	var frame_tex := _load_ui_texture("res://assets/ui/health_meter.png")
	if frame_tex:
		var bg := StyleBoxTexture.new()
		bg.texture = frame_tex
		bg.texture_margin_left = 3
		bg.texture_margin_top = 3
		bg.texture_margin_right = 3
		bg.texture_margin_bottom = 3
		health_bar.add_theme_stylebox_override("background", bg)
	else:
		var bg := StyleBoxFlat.new()
		bg.bg_color = Color(0.06, 0.07, 0.10, 0.94)
		bg.border_color = Color(0.32, 0.28, 0.22, 1)
		bg.set_border_width_all(2)
		bg.content_margin_top = 2
		bg.content_margin_bottom = 2
		health_bar.add_theme_stylebox_override("background", bg)
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color(0.78, 0.22, 0.26, 1)
	fill.set_corner_radius_all(2)
	health_bar.add_theme_stylebox_override("fill", fill)
	health_bar.show_percentage = false

## No boss health bar UI element exists anywhere in this template (HealthComponent tracks boss
## HP in code — see RuntimeSmokeTest.gd's boss damage checks — but nothing ever renders it), so
## the generated assets/ui/boss_bar.png has no current consumer. Out of scope here: adding a
## boss health bar is a separate feature, not a wiring fix.
func _load_ui_texture(res_path: String) -> Texture2D:
	if not ResourceLoader.exists(res_path):
		return null
	return load(res_path)

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
	var raw: Array = []
	for id in GameManager.player_abilities:
		var sid := String(id)
		if sid.begins_with("test_"):
			continue
		raw.append(sid)
	var abilities := ", ".join(raw)
	ability_label.text = abilities if abilities else ""

func _hud_mode() -> String:
	var env := OS.get_environment("METROFORGE_HUD_MODE")
	if env != "":
		return env
	if OS.get_environment("METROFORGE_CAPTURE") == "1":
		return "QA_CAPTURE"
	return "DEBUG"

func _is_presentation_hud() -> bool:
	var mode := _hud_mode()
	return mode == "PLAYER" or mode == "RELEASE" or mode == "QA_CAPTURE"

func _apply_hud_mode() -> void:
	if not _is_presentation_hud():
		return
	var tracker := get_node_or_null("HUD/QuestTrackerPanel")
	if tracker:
		tracker.visible = false
	var mini := get_node_or_null("HUD/MinimapPanel")
	if mini:
		mini.visible = false
	# Presentation stills hide scrap/echo/ability text. Size the backing panel
	# to the health bar only — the 276×136 frame was filling the HUD critic band.
	if ability_label:
		ability_label.visible = false
		ability_label.text = ""
	if currency_label:
		currency_label.visible = false
		currency_label.text = ""
	if collectible_label:
		collectible_label.visible = false
		collectible_label.text = ""
	if health_bar:
		health_bar.custom_minimum_size = Vector2(148, 12)
	var margin := get_node_or_null("HUD/MarginContainer") as Control
	if margin:
		margin.offset_left = 16.0
		margin.offset_top = 16.0
		margin.offset_right = 176.0
		margin.offset_bottom = 36.0
	if hud_frame_panel:
		hud_frame_panel.offset_left = 10.0
		hud_frame_panel.offset_top = 10.0
		hud_frame_panel.offset_right = 178.0
		hud_frame_panel.offset_bottom = 40.0

func _update_currency() -> void:
	if currency_label == null:
		return
	if _is_presentation_hud():
		currency_label.text = ""
		currency_label.visible = false
		return
	var parts: Array[String] = []
	for currency_id in QuestManager.currency.keys():
		var amount := int(QuestManager.currency[currency_id])
		if amount <= 0:
			continue
		parts.append("%s: %d" % [String(currency_id).capitalize(), amount])
	currency_label.text = ", ".join(parts)
	currency_label.visible = not parts.is_empty()

func _update_collectibles() -> void:
	if collectible_label == null:
		return
	if _is_presentation_hud():
		collectible_label.text = ""
		collectible_label.visible = false
		return
	var total := InventoryManager.get_collectible_total_count()
	if total <= 0:
		collectible_label.text = ""
		collectible_label.visible = false
		return
	collectible_label.visible = true
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
