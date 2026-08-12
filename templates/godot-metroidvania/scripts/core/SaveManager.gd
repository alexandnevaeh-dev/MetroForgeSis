extends Node
## Save data is only ever written via EventBus.save_triggered (from a SavePoint touch, or
## the autosaves in GameManager after an ability pickup / boss defeat) — never on a timer
## or every frame. See scenes/world/SavePoint.tscn for the primary save interaction.

const SAVE_PATH := "user://savegame.json"
const SAVE_VERSION := 2

var _save_data: Dictionary = {}
var _playtime_accum: float = 0.0
## True only for the single room-load immediately following a load_game() call. WorldManager
## destroys and recreates the Player instance on every room transition, so without this,
## the saved health would incorrectly reapply on every subsequent transition too, overwriting
## real damage taken since the load.
var _health_restore_pending: bool = false

func _ready() -> void:
	EventBus.save_triggered.connect(_on_save_triggered)
	reset_save()

func _process(delta: float) -> void:
	if GameManager.current_state == GameManager.GameState.PLAYING:
		_playtime_accum += delta

func reset_save() -> void:
	_save_data = {
		"version": SAVE_VERSION,
		"player": {"health": 100.0, "max_health": 100.0, "room_id": ""},
		"checkpoint_room_id": "",
		"abilities": [],
		"defeated_bosses": [],
		# Placeholders for systems that don't exist at runtime yet (quests, inventory,
		# discovered-room map) — kept as empty structures rather than removed, so the save
		# format doesn't need another breaking version bump the moment those ship, but
		# nothing here is actually populated or read yet. Not a claim those systems work.
		"world_state": {},
		"quests": {},
		"collectibles": [],
		"playtime": 0.0,
	}
	_playtime_accum = 0.0

## Called by a SavePoint on touch: records the room to resume in and the player's current
## health, distinct from whatever room an autosave might later happen to fire in.
func set_checkpoint(room_id: String, health: float, max_health: float) -> void:
	_save_data["checkpoint_room_id"] = room_id
	_save_data["player"]["health"] = health
	_save_data["player"]["max_health"] = max_health

func save_game() -> bool:
	_save_data["abilities"] = GameManager.player_abilities.duplicate()
	_save_data["defeated_bosses"] = ProgressionManager.get_defeated_bosses()
	_save_data["player"]["room_id"] = GameManager.current_room_id
	_save_data["playtime"] = _playtime_accum

	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_error("SaveManager: failed to open save file for writing")
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
	var text := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		push_warning("SaveManager: save file is corrupt or unreadable")
		return false
	_save_data = json.data

	GameManager.player_abilities.assign(_save_data.get("abilities", []))
	ProgressionManager.restore_defeated_bosses(_save_data.get("defeated_bosses", []))
	_playtime_accum = _save_data.get("playtime", 0.0)

	# Resume at the last touched SavePoint if there was one; otherwise fall back to
	# whatever room an autosave last recorded (e.g. a boss was defeated but no SavePoint
	# was reached yet).
	var checkpoint_room: String = _save_data.get("checkpoint_room_id", "")
	if checkpoint_room.is_empty():
		checkpoint_room = _save_data.get("player", {}).get("room_id", "")
	if not checkpoint_room.is_empty():
		GameManager.current_room_id = checkpoint_room

	_health_restore_pending = true
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

## Read by PlayerController on spawn to restore saved health — but only immediately after
## a load_game() call. Returns -1 for both fields (meaning "nothing to restore, use
## defaults") on every call after the first, and on a fresh (non-loaded) game.
func consume_pending_player_health() -> Dictionary:
	if not _health_restore_pending:
		return {"health": -1.0, "max_health": -1.0}
	_health_restore_pending = false

	var player_data: Dictionary = _save_data.get("player", {})
	var health: float = player_data.get("health", -1.0)
	var max_health: float = player_data.get("max_health", -1.0)
	return {"health": health, "max_health": max_health}

func _on_save_triggered() -> void:
	save_game()
