extends Node
func _ready() -> void:
	var world = load("res://scripts/world/WorldManager.gd").new()
	add_child(world)
	for i in range(10):
		await get_tree().process_frame
	var original = world._current_room
	assert(is_instance_valid(original))
	await world._load_room("missing_test_destination")
	await get_tree().process_frame
	var passed = is_instance_valid(original) and world._current_room == original and original.is_inside_tree() and original.visible
	print("PASS: missing destination preserves active room" if passed else "FAIL: missing destination destroyed active room")
	get_tree().quit(0 if passed else 1)
