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
	EventBus.player_died.connect(_on_player_died)

func _on_game_started() -> void:
	current_state = GameState.PLAYING
	player_abilities.clear()
	game_complete = false

func _on_ability_acquired(ability_id: String) -> void:
	if ability_id not in player_abilities:
		player_abilities.append(ability_id)
	ProgressionManager.unlock_ability(ability_id)
	# Autosave: an ability is a major, hard-won progression milestone — losing it to an
	# unrelated crash before the next manual save would be a real loss for the player.
	EventBus.save_triggered.emit()

func _on_boss_defeated(boss_id: String) -> void:
	ProgressionManager.defeat_boss(boss_id)
	if boss_id.begins_with("final") or boss_id == "boss_final":
		game_complete = true
		current_state = GameState.VICTORY
		EventBus.game_completed.emit()
	# Autosave after every boss kill, not just the final one — re-fighting an optional
	# boss because of a crash immediately afterward would be an even worse experience.
	EventBus.save_triggered.emit()

## Sets the GAME_OVER window (GameHUD shows a "You Died" overlay for its real duration — see
## GameHUD._on_player_died()) then hands off to _do_respawn(). Split into two functions so
## tests can drive the actual respawn logic directly without waiting through the real pause.
func _on_player_died() -> void:
	current_state = GameState.GAME_OVER
	await get_tree().create_timer(1.0).timeout
	_do_respawn()

## Reuses the existing save/load system to respawn at the real last checkpoint (or the start
## room, for a fresh game with no save yet) rather than the previous behavior of teleporting the
## player to a hardcoded in-room point and healing in place — which ignored SavePoints entirely
## and meant dying carried no real consequence. Player.tscn reads its restored health the same
## way a manual "Continue" load already does, via SaveManager.consume_pending_player_health().
func _do_respawn() -> void:
	if SaveManager.has_save():
		SaveManager.load_game()
	else:
		current_room_id = ""

	var world_manager := get_tree().get_first_node_in_group("world_manager")
	if world_manager and world_manager.has_method("transition_to_room"):
		var respawn_room := current_room_id if current_room_id != "" else "room_000"
		await world_manager.transition_to_room(respawn_room, "left")

	current_state = GameState.PLAYING
	EventBus.player_respawned.emit()

func has_ability(ability_id: String) -> bool:
	return ability_id in player_abilities or ProgressionManager.has_ability(ability_id)

func start_new_game() -> void:
	player_abilities.clear()
	game_complete = false
	current_state = GameState.PLAYING
	ProgressionManager.reset()
	SaveManager.reset_save()
	MapManager.reset_for_new_game()
	InventoryManager.reset_for_new_game()
	EventBus.game_started.emit()

func pause_game() -> void:
	if current_state == GameState.PLAYING:
		current_state = GameState.PAUSED
		get_tree().paused = true

func resume_game() -> void:
	if current_state == GameState.PAUSED:
		current_state = GameState.PLAYING
		get_tree().paused = false
