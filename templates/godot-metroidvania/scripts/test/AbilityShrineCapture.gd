extends Node
## Windowed review capture for the ability shrine only. Walks the authored
## platforms and collects the shrine pickup. Does not change other rooms.

func _ready() -> void:
	await get_tree().process_frame
	GameManager.start_new_game()
	var packed := load("res://scenes/world/World.tscn") as PackedScene
	if packed == null:
		get_tree().quit(1)
		return
	var world: Node = packed.instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().process_frame
	var shrine_id := _ability_shrine_room_id()
	if shrine_id != "" and world.has_method("transition_to_room"):
		world.transition_to_room(shrine_id)
		await get_tree().process_frame
		await get_tree().process_frame
		await get_tree().process_frame
	var player := get_tree().get_first_node_in_group("player") as Node2D
	if player == null:
		get_tree().quit(1)
		return
	# Traverse the shrine: collect the floor pickup, hop the two climbRows
	# platforms, stop before the right-edge ability_gate so the clip stays in room 05.
	# Hold jump across several frames — a one-frame tap does not clear the altar.
	for i in range(240):
		if player.global_position.x > 640.0:
			break
		Input.action_press("move_right")
		var hold_jump := (i >= 16 and i < 32) or (i >= 52 and i < 78)
		if hold_jump:
			Input.action_press("jump")
		else:
			Input.action_release("jump")
		await get_tree().process_frame
	Input.action_release("move_right")
	Input.action_release("jump")
	await get_tree().create_timer(0.8).timeout
	get_tree().quit(0)


func _ability_shrine_room_id() -> String:
	if not FileAccess.file_exists("res://data/rooms/rooms.json"):
		return ""
	var file := FileAccess.open("res://data/rooms/rooms.json", FileAccess.READ)
	if file == null:
		return ""
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return ""
	var rooms: Dictionary = parsed.get("rooms", {})
	for id in rooms.keys():
		var info = rooms[id]
		if typeof(info) != TYPE_DICTIONARY:
			continue
		if String(info.get("archetype", "")) == "ability_shrine":
			return String(id)
	return ""
