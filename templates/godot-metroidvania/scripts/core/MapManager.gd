extends Node
## Tracks discovered rooms and loads world topology for the pause-menu map.

var _graph: Dictionary = {}
var _discovered: Dictionary = {}
var _room_positions: Dictionary = {}
var _room_archetypes: Dictionary = {}

func _ready() -> void:
	EventBus.room_entered.connect(_on_room_entered)
	_load_graph()
	_load_room_archetypes()
	_restore_discovered()

func _load_room_archetypes() -> void:
	_room_archetypes.clear()
	const rooms_path := "res://data/rooms/rooms.json"
	if not FileAccess.file_exists(rooms_path):
		return
	var file := FileAccess.open(rooms_path, FileAccess.READ)
	if file == null:
		return
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK or typeof(json.data) != TYPE_DICTIONARY:
		file.close()
		return
	file.close()
	var rooms: Dictionary = json.data.get("rooms", {})
	for room_id in rooms.keys():
		var room: Dictionary = rooms[room_id]
		if typeof(room) != TYPE_DICTIONARY:
			continue
		_room_archetypes[room_id] = room.get("archetype", "combat")

func _load_graph() -> void:
	for path in ["res://data/world/world_graph.json", "res://world_graph.json"]:
		if not FileAccess.file_exists(path):
			continue
		var file := FileAccess.open(path, FileAccess.READ)
		if file == null:
			continue
		var json := JSON.new()
		if json.parse(file.get_as_text()) == OK and typeof(json.data) == TYPE_DICTIONARY:
			_graph = json.data
		file.close()
		_compute_layout()
		return

func _compute_layout() -> void:
	_room_positions.clear()
	var nodes: Array = _graph.get("nodes", [])
	var col := 0
	var row := 0
	var cols := maxi(1, int(ceil(sqrt(float(nodes.size())))))
	for node in nodes:
		if typeof(node) != TYPE_DICTIONARY:
			continue
		if node.get("type", "") != "room":
			continue
		var id: String = node.get("id", "")
		if id.is_empty():
			continue
		_room_positions[id] = Vector2(col * 28, row * 28)
		col += 1
		if col >= cols:
			col = 0
			row += 1

func _on_room_entered(room_id: String) -> void:
	if room_id.is_empty():
		return
	var first_visit := not _discovered.has(room_id)
	_discovered[room_id] = true
	if first_visit:
		EventBus.room_discovered.emit(room_id)
	_persist_discovered()

func mark_discovered(room_id: String) -> void:
	_discovered[room_id] = true

func is_discovered(room_id: String) -> bool:
	return _discovered.has(room_id)

func get_current_room_id() -> String:
	return GameManager.current_room_id

func get_graph() -> Dictionary:
	return _graph

func get_room_positions() -> Dictionary:
	return _room_positions

func get_discovered_ids() -> Array:
	return _discovered.keys()

func get_room_archetype(room_id: String) -> String:
	return String(_room_archetypes.get(room_id, "combat"))

func _persist_discovered() -> void:
	var save_mgr := get_node_or_null("/root/SaveManager")
	if save_mgr and save_mgr.has_method("set_discovered_rooms"):
		save_mgr.set_discovered_rooms(_discovered.keys())

func _restore_discovered() -> void:
	var save_mgr := get_node_or_null("/root/SaveManager")
	if save_mgr and save_mgr.has_method("get_discovered_rooms"):
		for room_id in save_mgr.get_discovered_rooms():
			_discovered[room_id] = true

func reset_for_new_game() -> void:
	_discovered.clear()
	_persist_discovered()
