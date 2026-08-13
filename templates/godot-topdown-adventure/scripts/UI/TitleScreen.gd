extends Control

var _file_mode: String = "load"

func _ready() -> void:
	$VBox/NewGameButton.pressed.connect(_on_new_game)
	$VBox/ContinueButton.pressed.connect(_on_continue)
	$VBox/FilesButton.pressed.connect(_on_open_files)
	$FileSelectPanel/BackButton.pressed.connect(_close_file_select)
	$FileSelectPanel/Slot0Button.pressed.connect(_on_slot_pressed.bind(0))
	$FileSelectPanel/Slot1Button.pressed.connect(_on_slot_pressed.bind(1))
	$FileSelectPanel/Slot2Button.pressed.connect(_on_slot_pressed.bind(2))
	$FileSelectPanel.visible = false
	_refresh_continue()
	$VBox/NewGameButton.grab_focus()

func _refresh_continue() -> void:
	$VBox/ContinueButton.visible = SaveManager.has_any_save()

func _on_new_game() -> void:
	AudioManager.play_sfx("ui_click")
	_open_file_select("new")

func _on_continue() -> void:
	AudioManager.play_sfx("ui_click")
	if SaveManager.has_save() and SaveManager.load_game():
		get_tree().change_scene_to_file("res://scenes/world/World.tscn")
		return
	_open_file_select("load")

func _on_open_files() -> void:
	AudioManager.play_sfx("ui_click")
	_open_file_select("load")

func _open_file_select(mode: String) -> void:
	_file_mode = mode
	$VBox.visible = false
	$FileSelectPanel.visible = true
	$FileSelectPanel/Heading.text = "New Game — Choose Slot" if mode == "new" else "Load Game — Choose Slot"
	_refresh_slot_buttons()
	$FileSelectPanel/Slot0Button.grab_focus()

func _close_file_select() -> void:
	$FileSelectPanel.visible = false
	$VBox.visible = true
	_refresh_continue()
	$VBox/NewGameButton.grab_focus()

func _refresh_slot_buttons() -> void:
	var buttons := [$FileSelectPanel/Slot0Button, $FileSelectPanel/Slot1Button, $FileSelectPanel/Slot2Button]
	var summaries: Array = SaveManager.get_slot_summaries()
	for i in buttons.size():
		var summary: Dictionary = summaries[i]
		buttons[i].text = String(summary.get("label", "Slot %d" % (i + 1)))
		if _file_mode == "load":
			buttons[i].disabled = not bool(summary.get("occupied", false))
		else:
			buttons[i].disabled = false

func _on_slot_pressed(slot: int) -> void:
	AudioManager.play_sfx("ui_click")
	SaveManager.select_slot(slot)
	if _file_mode == "new":
		SaveManager.delete_slot(slot)
		GameManager.start_new_game()
		get_tree().change_scene_to_file("res://scenes/world/World.tscn")
		return
	if SaveManager.load_game():
		get_tree().change_scene_to_file("res://scenes/world/World.tscn")
