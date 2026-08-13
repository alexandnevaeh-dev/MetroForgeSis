extends Node
## Save data is only ever written via EventBus.save_triggered (from a SavePoint touch, or
## the autosaves in GameManager after an ability pickup / boss defeat) — never on a timer
## or every frame. See scenes/world/SavePoint.tscn for the primary save interaction.

const SLOT_COUNT := 3
const SAVE_VERSION := 2
const LEGACY_SAVE_PATH := "user://savegame.json"
const LEGACY_BACKUP_PATH := "user://savegame.bak.json"
const ACTIVE_SLOT_PATH := "user://saves/active_slot.json"

var active_slot: int = 0
var _save_data: Dictionary = {}
var _playtime_accum: float = 0.0
## True only for the single room-load immediately following a load_game() call. WorldManager
## destroys and recreates the Player instance on every room transition, so without this,
## the saved health would incorrectly reapply on every subsequent transition too, overwriting
## real damage taken since the load.
var _health_restore_pending: bool = false

func _ready() -> void:
	EventBus.save_triggered.connect(_on_save_triggered)
	_ensure_save_dirs()
	_migrate_legacy_save()
	_restore_active_slot()
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
		"quests": {},
		# Placeholders for systems that don't exist at runtime yet (discovered-room map extras).
		"world_state": {"discovered_rooms": []},
		"collectibles": {},
		"playtime": 0.0,
	}
	_playtime_accum = 0.0
	ProgressionManager.reset()

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
	_save_data["quests"] = QuestManager.get_save_data()
	_save_data["collectibles"] = InventoryManager.get_save_data()
	var world_state: Dictionary = _save_data.get("world_state", {})
	if typeof(world_state) != TYPE_DICTIONARY:
		world_state = {}
	world_state["discovered_rooms"] = MapManager.get_discovered_ids()
	_save_data["world_state"] = world_state

	var json_text := JSON.stringify(_save_data)
	var tmp_path := get_tmp_path()
	var save_path := get_save_path()
	var backup_path := get_backup_path()
	DirAccess.make_dir_recursive_absolute(save_path.get_base_dir())

	var tmp := FileAccess.open(tmp_path, FileAccess.WRITE)
	if tmp == null:
		push_error("SaveManager: failed to open temp save file for writing")
		return false
	tmp.store_string(json_text)
	tmp.close()

	if FileAccess.file_exists(save_path):
		if FileAccess.file_exists(backup_path):
			DirAccess.remove_absolute(backup_path)
		var backup_err := DirAccess.copy_absolute(save_path, backup_path)
		if backup_err != OK:
			push_warning("SaveManager: could not back up previous save (%s)" % backup_err)
		DirAccess.remove_absolute(save_path)

	var rename_err := DirAccess.rename_absolute(tmp_path, save_path)
	if rename_err != OK:
		push_error("SaveManager: atomic save rename failed (%s)" % rename_err)
		if FileAccess.file_exists(backup_path):
			DirAccess.copy_absolute(backup_path, save_path)
		return false
	return true

func load_game() -> bool:
	var loaded := _load_save_file(get_save_path())
	if loaded:
		return true
	if active_slot == 0 and FileAccess.file_exists(LEGACY_SAVE_PATH):
		loaded = _load_save_file(LEGACY_SAVE_PATH)
		if loaded:
			save_game()
			return true
	var backup_path := get_backup_path()
	if FileAccess.file_exists(backup_path):
		push_warning("SaveManager: primary save unreadable — restoring backup")
		return _load_save_file(backup_path)
	if active_slot == 0 and FileAccess.file_exists(LEGACY_BACKUP_PATH):
		push_warning("SaveManager: primary save unreadable — restoring legacy backup")
		return _load_save_file(LEGACY_BACKUP_PATH)
	return false

func _load_save_file(path: String) -> bool:
	if not FileAccess.file_exists(path):
		return false
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return false
	var text := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		push_warning("SaveManager: save file is corrupt or unreadable")
		return false

	var raw_version := int(json.data.get("version", 1))
	if raw_version > SAVE_VERSION:
		push_warning(
			"SaveManager: save version %d is newer than supported %d" % [raw_version, SAVE_VERSION]
		)
		return false

	var migrated := _migrate_save_data(json.data)
	if migrated.is_empty():
		return false
	var needs_rewrite := raw_version < SAVE_VERSION
	_save_data = migrated
	_apply_loaded_save_data()

	if needs_rewrite:
		save_game()
	return true

func _apply_loaded_save_data() -> void:
	GameManager.player_abilities.assign(_save_data.get("abilities", []))
	ProgressionManager.restore_abilities(_save_data.get("abilities", []))
	ProgressionManager.restore_defeated_bosses(_save_data.get("defeated_bosses", []))
	QuestManager.restore_save_data(_save_data.get("quests", {}))
	InventoryManager.restore_save_data(_save_data.get("collectibles", {}))
	_playtime_accum = _save_data.get("playtime", 0.0)
	var world_state: Dictionary = _save_data.get("world_state", {})
	if typeof(world_state) == TYPE_DICTIONARY:
		for room_id in world_state.get("discovered_rooms", []):
			MapManager.mark_discovered(room_id)

	# Resume at the last touched SavePoint if there was one; otherwise fall back to
	# whatever room an autosave last recorded (e.g. a boss was defeated but no SavePoint
	# was reached yet).
	var checkpoint_room: String = _save_data.get("checkpoint_room_id", "")
	if checkpoint_room.is_empty():
		checkpoint_room = _save_data.get("player", {}).get("room_id", "")
	if not checkpoint_room.is_empty():
		GameManager.current_room_id = checkpoint_room

	_health_restore_pending = true

func _migrate_save_data(data: Dictionary) -> Dictionary:
	var version := int(data.get("version", 1))
	while version < SAVE_VERSION:
		match version:
			1:
				data = _migrate_v1_to_v2(data)
				version = 2
			_:
				push_error("SaveManager: no migration path from save version %d" % version)
				return {}
	return data

func _migrate_v1_to_v2(data: Dictionary) -> Dictionary:
	var player: Dictionary = data.get("player", {})
	if typeof(player) != TYPE_DICTIONARY:
		player = {}

	var health := float(player.get("health", 100.0))
	if not player.has("max_health"):
		player["max_health"] = health if health > 0.0 else 100.0
	player.erase("position")
	data["player"] = player

	if not data.has("checkpoint_room_id"):
		data["checkpoint_room_id"] = String(player.get("room_id", ""))

	if not data.has("defeated_bosses"):
		data["defeated_bosses"] = []

	var world_state: Dictionary = data.get("world_state", {})
	if typeof(world_state) != TYPE_DICTIONARY:
		world_state = {}
	if not world_state.has("discovered_rooms"):
		world_state["discovered_rooms"] = []
	data["world_state"] = world_state

	var collectibles = data.get("collectibles", {})
	if typeof(collectibles) == TYPE_ARRAY:
		collectibles = {"collected_counts": {}}
	elif typeof(collectibles) != TYPE_DICTIONARY:
		collectibles = {"collected_counts": {}}
	elif not collectibles.has("collected_counts"):
		collectibles = {"collected_counts": collectibles}
	data["collectibles"] = collectibles

	if not data.has("quests") or typeof(data["quests"]) != TYPE_DICTIONARY:
		data["quests"] = {}

	if not data.has("playtime"):
		data["playtime"] = 0.0

	data["version"] = 2
	return data

func has_save() -> bool:
	return FileAccess.file_exists(get_save_path()) or (
		active_slot == 0 and FileAccess.file_exists(LEGACY_SAVE_PATH)
	)

func has_save_in_slot(slot: int) -> bool:
	if not _valid_slot(slot):
		return false
	if FileAccess.file_exists(slot_save_path(slot)):
		return true
	return slot == 0 and FileAccess.file_exists(LEGACY_SAVE_PATH)

func has_any_save() -> bool:
	for slot in SLOT_COUNT:
		if has_save_in_slot(slot):
			return true
	return false

func select_slot(slot: int) -> bool:
	if not _valid_slot(slot):
		return false
	active_slot = slot
	_persist_active_slot()
	return true

func delete_slot(slot: int) -> void:
	if not _valid_slot(slot):
		return
	for path in [slot_save_path(slot), slot_tmp_path(slot), slot_backup_path(slot)]:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(path)
	if slot == 0:
		for path in [LEGACY_SAVE_PATH, LEGACY_BACKUP_PATH]:
			if FileAccess.file_exists(path):
				DirAccess.remove_absolute(path)

func slot_save_path(slot: int) -> String:
	return "user://saves/slot_%d/savegame.json" % slot

func slot_tmp_path(slot: int) -> String:
	return "user://saves/slot_%d/savegame.json.tmp" % slot

func slot_backup_path(slot: int) -> String:
	return "user://saves/slot_%d/savegame.bak.json" % slot

func get_save_path() -> String:
	return slot_save_path(active_slot)

func get_tmp_path() -> String:
	return slot_tmp_path(active_slot)

func get_backup_path() -> String:
	return slot_backup_path(active_slot)

func get_slot_summary(slot: int) -> Dictionary:
	var summary := {
		"slot": slot,
		"occupied": false,
		"room_id": "",
		"playtime": 0.0,
		"abilities": 0,
		"label": "Slot %d — Empty" % (slot + 1),
	}
	if not has_save_in_slot(slot):
		return summary
	var path := slot_save_path(slot)
	if not FileAccess.file_exists(path) and slot == 0:
		path = LEGACY_SAVE_PATH
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return summary
	var json := JSON.new()
	var ok := json.parse(file.get_as_text()) == OK and typeof(json.data) == TYPE_DICTIONARY
	file.close()
	if not ok:
		summary["label"] = "Slot %d — Unreadable" % (slot + 1)
		return summary
	var data: Dictionary = json.data
	var room_id := String(data.get("checkpoint_room_id", ""))
	if room_id.is_empty():
		room_id = String(data.get("player", {}).get("room_id", ""))
	var playtime := float(data.get("playtime", 0.0))
	var ability_count := 0
	var abilities = data.get("abilities", [])
	if typeof(abilities) == TYPE_ARRAY:
		ability_count = abilities.size()
	summary["occupied"] = true
	summary["room_id"] = room_id
	summary["playtime"] = playtime
	summary["abilities"] = ability_count
	summary["label"] = "Slot %d — %s (%s)" % [
		slot + 1,
		room_id if not room_id.is_empty() else "in progress",
		_format_playtime(playtime),
	]
	return summary

func get_slot_summaries() -> Array:
	var summaries: Array = []
	for slot in SLOT_COUNT:
		summaries.append(get_slot_summary(slot))
	return summaries

func _valid_slot(slot: int) -> bool:
	return slot >= 0 and slot < SLOT_COUNT

func _ensure_save_dirs() -> void:
	DirAccess.make_dir_recursive_absolute("user://saves")
	for slot in SLOT_COUNT:
		DirAccess.make_dir_recursive_absolute("user://saves/slot_%d" % slot)

func _migrate_legacy_save() -> void:
	if not FileAccess.file_exists(LEGACY_SAVE_PATH):
		return
	if FileAccess.file_exists(slot_save_path(0)):
		return
	DirAccess.copy_absolute(LEGACY_SAVE_PATH, slot_save_path(0))
	if FileAccess.file_exists(LEGACY_BACKUP_PATH) and not FileAccess.file_exists(slot_backup_path(0)):
		DirAccess.copy_absolute(LEGACY_BACKUP_PATH, slot_backup_path(0))

func _restore_active_slot() -> void:
	if not FileAccess.file_exists(ACTIVE_SLOT_PATH):
		return
	var file := FileAccess.open(ACTIVE_SLOT_PATH, FileAccess.READ)
	if file == null:
		return
	var json := JSON.new()
	if json.parse(file.get_as_text()) == OK and typeof(json.data) == TYPE_DICTIONARY:
		var slot := int(json.data.get("slot", 0))
		if _valid_slot(slot):
			active_slot = slot
	file.close()

func _persist_active_slot() -> void:
	_ensure_save_dirs()
	var file := FileAccess.open(ACTIVE_SLOT_PATH, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify({"slot": active_slot}))
	file.close()

func _format_playtime(seconds: float) -> String:
	var total := int(seconds)
	var mins := total / 60
	var secs := total % 60
	return "%d:%02d" % [mins, secs]

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

func set_discovered_rooms(room_ids: Array) -> void:
	var world_state: Dictionary = _save_data.get("world_state", {})
	if typeof(world_state) != TYPE_DICTIONARY:
		world_state = {}
	world_state["discovered_rooms"] = room_ids
	_save_data["world_state"] = world_state

func get_discovered_rooms() -> Array:
	var world_state: Dictionary = _save_data.get("world_state", {})
	if typeof(world_state) != TYPE_DICTIONARY:
		return []
	return world_state.get("discovered_rooms", [])
