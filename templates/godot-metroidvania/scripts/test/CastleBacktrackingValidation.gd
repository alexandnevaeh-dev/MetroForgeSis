extends Node
## Controlled save/room-loading regression; not ordinary-input traversal proof.
var checks: Array = []
var world: Node2D
func check(label: String, condition: bool) -> void:
	checks.append({"label":label,"passed":condition})
func _ready() -> void:
	GameManager.start_new_game()
	world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	for _i in range(8):
		await get_tree().physics_frame
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://data/bosses/bosses.json"))
	for row in data.bosses:
		var id := String(row.id)
		var room := String(row.arenaRoomId)
		ProgressionManager.reset()
		await world._load_room(room, "left")
		check(id + " fresh encounter exists", world._current_room.get_node_or_null("Boss") != null)
		var doors: Array = world._room_transitions(world._current_room)
		check(id + " fresh exits sealed", not doors.is_empty() and doors.all(func(door): return not door.monitoring))
		ProgressionManager.defeat_boss(id)
		SaveManager.set_checkpoint(room, 100, 100)
		check(id + " save succeeds", SaveManager.save_game())
		ProgressionManager.reset()
		check(id + " reload succeeds", SaveManager.load_game())
		check(id + " saved defeat restored", id in ProgressionManager.get_defeated_bosses())
		await world._load_room("room_000", "left")
		await world._load_room(room, "left")
		for _i in range(3):
			await get_tree().physics_frame
		check(id + " defeated boss absent on return", world._current_room.get_node_or_null("Boss") == null)
		doors = world._room_transitions(world._current_room)
		check(id + " return exits open", not doors.is_empty() and doors.all(func(door): return door.monitoring))
		check(id + " return uses exploration music", AudioManager.get_current_music_id() != "boss")
	GameManager.start_new_game()
	await world._load_room("room_008", "left")
	check("new game restores first guardian", world._current_room.get_node_or_null("Boss") != null)
	check("new game clears defeated progression", ProgressionManager.get_defeated_bosses().is_empty())
	var passed := checks.all(func(row): return row.passed)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://qa/backtracking"))
	var file := FileAccess.open("res://qa/backtracking/proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled actual save/load and WorldManager room instantiation for all four guardians. Progression is explicitly seeded; not input-driven combat or backtracking evidence."}, "\t"))
	file.close()
	print("BACKTRACKING_RESULT ", JSON.stringify({"passed":passed,"checks":checks.size(),"failures":checks.filter(func(row): return not row.passed)}))
	world.queue_free()
	world = null
	# Let canceled encounter timer coroutines finish before tree teardown.
	await get_tree().create_timer(2.0).timeout
	AudioManager.request_quit(0 if passed else 1)
