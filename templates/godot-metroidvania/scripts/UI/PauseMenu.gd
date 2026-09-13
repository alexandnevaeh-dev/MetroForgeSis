extends CanvasLayer
## The primary pause interaction — closes a real gap: GameManager.pause_game()/resume_game()
## existed but nothing ever called them, and the "pause" input action was defined in
## project.godot but no script ever read it.

@onready var main_panel: Control = $Panel/MainPanel
@onready var settings_panel: Control = $Panel/SettingsPanel
@onready var map_panel: Control = $Panel/MapPanel
@onready var inventory_panel: Control = $Panel/InventoryPanel
@onready var quests_panel: Control = $Panel/QuestsPanel

func _ready() -> void:
	# Must keep processing input/UI while get_tree().paused = true, or the player could
	# never un-pause.
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	main_panel.visible = true
	settings_panel.visible = false
	map_panel.visible = false
	inventory_panel.visible = false
	quests_panel.visible = false

	$Panel/MainPanel/VBox/ResumeButton.pressed.connect(_close)
	$Panel/MainPanel/VBox/MapButton.pressed.connect(_open_map)
	$Panel/MainPanel/VBox/InventoryButton.pressed.connect(_open_inventory)
	$Panel/MainPanel/VBox/QuestsButton.pressed.connect(_open_quests)
	$Panel/MainPanel/VBox/SettingsButton.pressed.connect(_open_settings)
	$Panel/MainPanel/VBox/TitleButton.pressed.connect(_return_to_title)

	$Panel/SettingsPanel/VBox/MasterRow/MasterSlider.value_changed.connect(SettingsManager.set_master_volume)
	$Panel/SettingsPanel/VBox/MusicRow/MusicSlider.value_changed.connect(SettingsManager.set_music_volume)
	$Panel/SettingsPanel/VBox/SfxRow/SfxSlider.value_changed.connect(SettingsManager.set_sfx_volume)
	$Panel/SettingsPanel/VBox/ScreenShakeRow/ScreenShakeCheck.toggled.connect(SettingsManager.set_screen_shake)
	$Panel/SettingsPanel/VBox/FullscreenRow/FullscreenCheck.toggled.connect(SettingsManager.set_fullscreen)
	$Panel/SettingsPanel/VBox/BackButton.pressed.connect(_close_settings)
	$Panel/MapPanel/VBox/BackButton.pressed.connect(_close_map)
	$Panel/InventoryPanel/VBox/BackButton.pressed.connect(_close_inventory)
	$Panel/QuestsPanel/VBox/BackButton.pressed.connect(_close_quests)

	_sync_settings_ui()
	_apply_foundry_theme()

func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed("pause"):
		return
	if GameManager.current_state == GameManager.GameState.PLAYING:
		_open()
		get_viewport().set_input_as_handled()
	elif GameManager.current_state == GameManager.GameState.PAUSED:
		if map_panel.visible:
			_close_map()
		elif inventory_panel.visible:
			_close_inventory()
		elif quests_panel.visible:
			_close_quests()
		elif not settings_panel.visible:
			_close()
		get_viewport().set_input_as_handled()

func _open() -> void:
	_sync_settings_ui()
	main_panel.visible = true
	settings_panel.visible = false
	map_panel.visible = false
	inventory_panel.visible = false
	quests_panel.visible = false
	visible = true
	GameManager.pause_game()
	$Panel/MainPanel/VBox/ResumeButton.grab_focus()

func _close() -> void:
	visible = false
	GameManager.resume_game()

func _open_map() -> void:
	main_panel.visible = false
	settings_panel.visible = false
	inventory_panel.visible = false
	quests_panel.visible = false
	map_panel.visible = true
	$Panel/MapPanel/VBox/WorldMapView.queue_redraw()

func _close_map() -> void:
	map_panel.visible = false
	main_panel.visible = true

func _open_inventory() -> void:
	main_panel.visible = false
	settings_panel.visible = false
	map_panel.visible = false
	quests_panel.visible = false
	inventory_panel.visible = true
	$Panel/InventoryPanel/VBox/InventoryView.queue_redraw()

func _close_inventory() -> void:
	inventory_panel.visible = false
	main_panel.visible = true

func _open_quests() -> void:
	main_panel.visible = false
	settings_panel.visible = false
	map_panel.visible = false
	inventory_panel.visible = false
	quests_panel.visible = true
	$Panel/QuestsPanel/VBox/QuestView.queue_redraw()

func _close_quests() -> void:
	quests_panel.visible = false
	main_panel.visible = true

func _open_settings() -> void:
	main_panel.visible = false
	settings_panel.visible = true
	map_panel.visible = false
	inventory_panel.visible = false
	quests_panel.visible = false

func _close_settings() -> void:
	settings_panel.visible = false
	main_panel.visible = true
	map_panel.visible = false
	inventory_panel.visible = false
	quests_panel.visible = false

func _return_to_title() -> void:
	get_tree().paused = false
	GameManager.current_state = GameManager.GameState.TITLE
	get_tree().change_scene_to_file("res://scenes/boot/Main.tscn")

func _sync_settings_ui() -> void:
	$Panel/SettingsPanel/VBox/MasterRow/MasterSlider.value = SettingsManager.master_volume
	$Panel/SettingsPanel/VBox/MusicRow/MusicSlider.value = SettingsManager.music_volume
	$Panel/SettingsPanel/VBox/SfxRow/SfxSlider.value = SettingsManager.sfx_volume
	$Panel/SettingsPanel/VBox/ScreenShakeRow/ScreenShakeCheck.button_pressed = SettingsManager.screen_shake_enabled
	$Panel/SettingsPanel/VBox/FullscreenRow/FullscreenCheck.button_pressed = SettingsManager.fullscreen_enabled


func _apply_foundry_theme() -> void:
	var panel_tex: Texture2D = null
	if ResourceLoader.exists("res://assets/ui/menu_panel.png"):
		panel_tex = load("res://assets/ui/menu_panel.png")
	var btn_tex: Texture2D = null
	if ResourceLoader.exists("res://assets/ui/menu_button.png"):
		btn_tex = load("res://assets/ui/menu_button.png")
	for panel in [main_panel, settings_panel, map_panel, inventory_panel, quests_panel]:
		if panel == null:
			continue
		if panel_tex:
			var box := StyleBoxTexture.new()
			box.texture = panel_tex
			box.texture_margin_left = 8
			box.texture_margin_top = 8
			box.texture_margin_right = 8
			box.texture_margin_bottom = 8
			panel.add_theme_stylebox_override("panel", box)
		else:
			var flat := StyleBoxFlat.new()
			flat.bg_color = Color(0.075, 0.118, 0.173, 0.96)
			flat.border_color = Color(0.39, 0.86, 0.88, 0.85)
			flat.border_width_left = 2
			flat.border_width_top = 2
			flat.border_width_right = 2
			flat.border_width_bottom = 2
			panel.add_theme_stylebox_override("panel", flat)
	if btn_tex:
		var btn_box := StyleBoxTexture.new()
		btn_box.texture = btn_tex
		btn_box.texture_margin_left = 6
		btn_box.texture_margin_top = 4
		btn_box.texture_margin_right = 6
		btn_box.texture_margin_bottom = 4
		for button in _menu_buttons():
			button.add_theme_stylebox_override("normal", btn_box)
			button.add_theme_color_override("font_color", Color(0.88, 0.93, 0.96))


func _menu_buttons() -> Array[Button]:
	var out: Array[Button] = []
	for path in [
		"Panel/MainPanel/VBox/ResumeButton",
		"Panel/MainPanel/VBox/MapButton",
		"Panel/MainPanel/VBox/InventoryButton",
		"Panel/MainPanel/VBox/QuestsButton",
		"Panel/MainPanel/VBox/SettingsButton",
		"Panel/MainPanel/VBox/TitleButton",
	]:
		var n := get_node_or_null(path)
		if n is Button:
			out.append(n)
	return out
