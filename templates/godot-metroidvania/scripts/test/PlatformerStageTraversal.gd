extends Node
## Full ordered-stage movement proof. Encounters are removed explicitly: this
## fixture proves stage routes/checkpoints, not combat or finished presentation.
var checks: Array = []
var jumps := 0

func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("PLATFORMER_ROUTE ","PASS " if passed else "FAIL ",label)

func _ready() -> void:
	var graph: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://world_graph.json"))
	var rooms: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/rooms/rooms.json")).rooms
	var ids: Array = []
	for node in graph.nodes:
		if node.type == "room":
			ids.append(String(node.id))
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.7).timeout
	for index in range(ids.size()-1):
		var id: String = ids[index]
		check(id+" entered in stage order",GameManager.current_room_id == id)
		for enemy in get_tree().get_nodes_in_group("enemies"):
			enemy.queue_free()
		await get_tree().physics_frame
		var elapsed := 0.0
		var pressed_jump := false
		Input.action_press("move_right")
		while GameManager.current_room_id == id and elapsed < 12.0:
			var player = get_tree().get_first_node_in_group("player")
			for pit in rooms[id].get("pits",[]):
				if player.is_on_floor() and player.position.x >= float(pit.x)-48.0 and player.position.x < float(pit.x):
					Input.action_press("jump")
					pressed_jump = true
					jumps += 1
			await get_tree().create_timer(0.05).timeout
			if pressed_jump:
				Input.action_release("jump")
				pressed_jump = false
			elapsed += 0.05
		Input.action_release("move_right")
		Input.action_release("jump")
		var current_player = get_tree().get_first_node_in_group("player")
		if is_instance_valid(current_player):
			print("PLATFORMER_ROUTE_STATE room=",GameManager.current_room_id," pos=",current_player.position," grounded=",current_player.is_on_floor()," velocity=",current_player.velocity)
			for collision_index in range(current_player.get_slide_collision_count()):
				var hit = current_player.get_slide_collision(collision_index)
				print("PLATFORMER_ROUTE_CONTACT ",hit.get_collider().name," normal=",hit.get_normal())
		check(id+" reaches "+String(ids[index+1])+" with native movement",GameManager.current_room_id == ids[index+1])
		if GameManager.current_room_id != ids[index+1]:
			break
		await get_tree().create_timer(0.4).timeout
	check("final encounter stage reached",GameManager.current_room_id == ids.back())
	check("final encounter music selected",AudioManager.get_current_music_id() == "boss" and AudioManager._music_player.playing)
	check("real gap jumps used",jumps > 0)
	check("save stage activates real checkpoint",SaveManager.get_checkpoint_room_id() == "room_003")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/platformer-route"))
	var passed := true
	for row in checks:
		passed = passed and row.passed
	var file := FileAccess.open("user://qa/platformer-route/proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"jumps":jumps,"scope":"Native ordered stage movement and checkpoint; enemies removed, combat and art acceptance separate."},"\t"))
	file.close()
	print("PLATFORMER_ROUTE_RESULT ",JSON.stringify({"passed":passed,"checks":checks.size(),"jumps":jumps}))
	AudioManager.request_quit(0 if passed else 1)
