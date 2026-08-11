extends Node

const SAVE_PATH := "user://savegame.json"
const SAVE_VERSION := 1

var _save_data: Dictionary = {}

func _ready() -> void:
	EventBus.save_triggered.connect(_on_save_triggered)

func reset_save() -> void:
	_save_data = {
		"version": SAVE_VERSION,
		"player": {"health": 100, "position": Vector2.ZERO, "room_id": ""},
		"abilities": [],
		"world_state": {},
		"quests": {},
		"collectibles": [],
		"playtime": 0.0,
	}

func save_game() -> bool:
	_save_data["abilities"] = GameManager.player_abilities.duplicate()
	_save_data["player"]["room_id"] = GameManager.current_room_id
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_error("Failed to open save file for writing")
		return false
	file.store_string(JSON.stringify(_save_data))
	file.close()
	return true

func load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return false
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return false
	_save_data = json.data
	file.close()
	GameManager.player_abilities.assign(_save_data.get("abilities", []))
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

func _on_save_triggered() -> void:
	save_game()
