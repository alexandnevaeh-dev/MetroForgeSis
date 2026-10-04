extends Node
## Studio-only loopback client. Inert unless explicitly enabled by the preview launcher.
var _peer := StreamPeerTCP.new()
var _buffer := PackedByteArray()
var _authenticated := false
var _auth_sent := false
var _token := ""
## Last viewport pick (Ctrl+click or pick_at). Empty Dictionary means no selection.
var _selection: Dictionary = {}
const PICK_RADIUS_PX := 64.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not OS.is_debug_build() or OS.get_environment("METROFORGE_STUDIO_BRIDGE") != "1":
		set_process(false)
		set_process_unhandled_input(false)
		return
	_token = OS.get_environment("METROFORGE_BRIDGE_TOKEN")
	var port := int(OS.get_environment("METROFORGE_BRIDGE_PORT"))
	if _token.is_empty() or port < 1 or port > 65535:
		set_process(false)
		set_process_unhandled_input(false)
		return
	if _peer.connect_to_host("127.0.0.1", port) != OK:
		set_process(false)
		set_process_unhandled_input(false)

func _send(message: Dictionary) -> void:
	_peer.put_data((JSON.stringify(message) + "\n").to_utf8_buffer())

func _process(_delta: float) -> void:
	_peer.poll()
	if _peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		if _authenticated:
			# A Studio-owned preview must not survive its controlling session.
			set_process(false)
			var audio := get_node_or_null("/root/AudioManager")
			if audio and audio.has_method("request_quit"):
				audio.request_quit()
			else:
				get_tree().quit()
		return
	if not _auth_sent:
		_send({"cmd": "auth", "token": _token, "role": "runtime"})
		_auth_sent = true
	var available := _peer.get_available_bytes()
	if available > 0:
		var received := _peer.get_data(available)
		if received[0] != OK:
			return
		_buffer.append_array(received[1])
	if _buffer.size() > 1048576:
		_peer.disconnect_from_host()
		set_process(false)
		return
	while _buffer.has(10):
		var newline := _buffer.find(10)
		var line := _buffer.slice(0, newline).get_string_from_utf8()
		_buffer = _buffer.slice(newline + 1)
		var message: Variant = JSON.parse_string(line)
		if not message is Dictionary:
			continue
		if message.get("cmd") == "auth":
			_authenticated = message.get("ok", false) == true
			continue
		if _authenticated:
			var result := execute_command(message)
			result["cmd"] = message.get("cmd", "")
			result["requestId"] = message.get("requestId", "")
			_send(result)

## Ctrl+click in the Godot window selects the nearest editable Node2D for the studio inspector.
func _unhandled_input(event: InputEvent) -> void:
	if not _authenticated:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.ctrl_pressed:
		_pick_world(_screen_to_world(event.position))
		get_viewport().set_input_as_handled()

func execute_command(message: Dictionary) -> Dictionary:
	var command := str(message.get("cmd", ""))
	match command:
		"ping":
			return {"ok": true, "pong": true}
		"pause", "resume":
			get_tree().paused = command == "pause"
			return {"ok": true, "paused": get_tree().paused}
		"get_state":
			var scene := get_tree().current_scene
			var payload := {
				"ok": true,
				"paused": get_tree().paused,
				"scene": str(scene.scene_file_path) if scene else "",
				"objects": _objects(scene),
			}
			if not _selection.is_empty():
				payload["selection"] = _selection
			else:
				payload["selection"] = null
			return payload
		"pick_at":
			return _pick_at(message)
		"clear_selection":
			_selection = {}
			return {"ok": true, "selection": null}
		"set_entity_position":
			return _move_entity(message)
		"reload_current_room":
			return {"ok": false, "error": "Room reload is not a state-preserving live edit; restart preview to load recompiled geometry"}
	return {"ok": false, "error": "Unsupported runtime command"}

func _screen_to_world(screen: Vector2) -> Vector2:
	return get_viewport().get_canvas_transform().affine_inverse() * screen

func _pick_at(message: Dictionary) -> Dictionary:
	var x: Variant = message.get("x")
	var y: Variant = message.get("y")
	if not (x is float or x is int) or not (y is float or y is int):
		return {"ok": false, "error": "pick_at requires numeric x/y world coordinates"}
	if not is_finite(float(x)) or not is_finite(float(y)):
		return {"ok": false, "error": "pick_at coordinates must be finite"}
	return _pick_world(Vector2(float(x), float(y)))

func _pick_world(world: Vector2) -> Dictionary:
	var scene := get_tree().current_scene
	if scene == null:
		_selection = {}
		return {"ok": false, "error": "No current scene", "selection": null, "picked": false}
	var best: Node2D = null
	var best_key: Array = []
	var max_d2 := PICK_RADIUS_PX * PICK_RADIUS_PX
	var queue: Array[Node] = [scene]
	while not queue.is_empty():
		var node: Node = queue.pop_back()
		if node is Node2D and node != scene:
			var d2: float = node.global_position.distance_squared_to(world)
			if d2 <= max_d2:
				# Prefer nearer, then authored placements, then shallower paths (avoid Sprite children).
				var path := str(scene.get_path_to(node))
				var authored_rank := 0 if not _authored_identity(node).is_empty() else 1
				var key: Array = [d2, authored_rank, path.get_slice_count("/"), path]
				if best == null or _pick_key_better(key, best_key):
					best = node
					best_key = key
		for child in node.get_children():
			queue.append(child)
	if best == null:
		_selection = {}
		return {"ok": true, "selection": null, "picked": false}
	_selection = {
		"nodePath": str(scene.get_path_to(best)),
		"instanceId": str(best.get_instance_id()),
		"name": str(best.name),
		"x": best.position.x,
		"y": best.position.y,
	}
	return {"ok": true, "selection": _selection, "picked": true}

func _pick_key_better(candidate: Array, incumbent: Array) -> bool:
	for i in range(mini(candidate.size(), incumbent.size())):
		if candidate[i] < incumbent[i]:
			return true
		if candidate[i] > incumbent[i]:
			return false
	return false

func _objects(root: Node) -> Array:
	var result: Array = []
	if root == null:
		return result
	var queue: Array[Node] = [root]
	while not queue.is_empty() and result.size() < 2000:
		var node: Node = queue.pop_back()
		if node is Node2D:
			var record := {"nodePath": str(root.get_path_to(node)), "instanceId": str(node.get_instance_id()), "name": str(node.name), "x": node.position.x, "y": node.position.y}
			var authored := _authored_identity(node)
			if not authored.is_empty():
				record["authored"] = authored
			result.append(record)
		for child in node.get_children():
			queue.append(child)
	return result

func _move_entity(message: Dictionary) -> Dictionary:
	var path := str(message.get("nodePath", ""))
	var x: Variant = message.get("x")
	var y: Variant = message.get("y")
	if path.is_empty() or path.begins_with("/") or path.contains("..") or path.contains(":"):
		return {"ok": false, "error": "Invalid scene-relative node path"}
	if not (x is float or x is int) or not (y is float or y is int):
		return {"ok": false, "error": "Position must be numeric"}
	if not is_finite(float(x)) or not is_finite(float(y)):
		return {"ok": false, "error": "Position must be finite"}
	var root := get_tree().current_scene
	var node: Node = root.get_node_or_null(NodePath(path)) if root else null
	if not node is Node2D or node == root:
		return {"ok": false, "error": "Editable node not found in current scene"}
	if message.has("expectedInstanceId") and str(message.expectedInstanceId) != str(node.get_instance_id()):
		return {"ok": false, "error": "Object changed since inspection. Inspect the scene again."}
	var previous: Vector2 = node.position
	node.position = Vector2(float(x), float(y))
	return {"ok": true, "nodePath": path, "x": node.position.x, "y": node.position.y, "previous": {"x": previous.x, "y": previous.y}}

# Explicit node metadata only: descendants do not inherit a parent's save target.
func _authored_identity(node: Node) -> Dictionary:
	var room: Variant = node.get_meta("metroforge_room_id", "")
	var kind: Variant = node.get_meta("metroforge_entity_kind", "")
	var entity: Variant = node.get_meta("metroforge_entity_id", "")
	if not room is String or not kind is String or not entity is String:
		return {}
	if room.is_empty() or entity.is_empty() or not kind in ["player_spawn", "enemy", "boss", "npc", "ability_pickup", "item_pickup", "checkpoint"]:
		return {}
	return {"roomId": room, "kind": kind, "id": entity}
