extends Node

enum GameState { TITLE, PLAYING, PAUSED, GAME_OVER, VICTORY }

var current_state: GameState = GameState.TITLE
var current_room_id: String = ""
var player_abilities: Array[String] = []
var game_complete: bool = false

func _ready() -> void:
	EventBus.game_started.connect(_on_game_started)
	EventBus.ability_acquired.connect(_on_ability_acquired)
	EventBus.boss_defeated.connect(_on_boss_defeated)

func _on_game_started() -> void:
	current_state = GameState.PLAYING
	player_abilities.clear()
	game_complete = false

func _on_ability_acquired(ability_id: String) -> void:
	if ability_id not in player_abilities:
		player_abilities.append(ability_id)
	ProgressionManager.unlock_ability(ability_id)

func _on_boss_defeated(boss_id: String) -> void:
	if boss_id.begins_with("final") or boss_id == "boss_final":
		game_complete = true
		current_state = GameState.VICTORY
		EventBus.game_completed.emit()

func has_ability(ability_id: String) -> bool:
	return ability_id in player_abilities or ProgressionManager.has_ability(ability_id)

func start_new_game() -> void:
	player_abilities.clear()
	game_complete = false
	current_state = GameState.PLAYING
	SaveManager.reset_save()
	EventBus.game_started.emit()

func pause_game() -> void:
	if current_state == GameState.PLAYING:
		current_state = GameState.PAUSED
		get_tree().paused = true

func resume_game() -> void:
	if current_state == GameState.PAUSED:
		current_state = GameState.PLAYING
		get_tree().paused = false
