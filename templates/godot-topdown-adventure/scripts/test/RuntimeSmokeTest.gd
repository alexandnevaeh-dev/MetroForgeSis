extends Node
## Headless smoke test for the top-down action-adventure template.

var _results: Array[Dictionary] = []

func _ready() -> void:
	await get_tree().process_frame
	await get_tree().process_frame

	_check("autoload_game_manager_exists", GameManager != null)
	_check("autoload_inventory_exists", InventoryManager != null)

	var world_scene := load("res://scenes/world/World.tscn") as PackedScene
	_check("world_scene_loads", world_scene != null)
	if world_scene == null:
		_finish()
		return

	var world: Node = world_scene.instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().process_frame

	GameManager.start_new_game()
	await get_tree().process_frame

	var player := get_tree().get_first_node_in_group("player")
	_check("player_spawns", player != null)
	if player:
		_check("player_is_top_down", player.get_script() != null and String(player.get_script().resource_path).ends_with("TopDownPlayerController.gd"))
		var start := player.global_position
		player.velocity = Vector2(80, 40)
		player.move_and_slide()
		_check("player_moves_diagonally", player.global_position.distance_to(start) > 0.5)
		if player.has_method("cardinal_facing"):
			player.facing = Vector2.RIGHT
			player._start_attack()
			_check("player_attack_activates_hitbox", player.attack_hitbox.monitoring)
			player._on_attack_finished()

	var overworld_path := "res://data/world/overworld.json"
	_check("overworld_data_exists", FileAccess.file_exists(overworld_path))

	var chest := ChestPickup.new()
	chest.item_id = "rusted_key"
	chest.chest_id = "smoke_chest"
	add_child(chest)
	var before := InventoryManager.get_owned_count("rusted_key")
	chest.interact(player)
	_check("chest_grants_item", InventoryManager.get_owned_count("rusted_key") > before)

	var door := LockedDoor.new()
	door.key_id = "rusted_key"
	door.door_id = "smoke_door"
	add_child(door)
	door.interact(player)
	_check("locked_door_opens_with_key", door.unlocked)

	InventoryManager.grant_item("wind_disc", 1)
	var gate := ItemGate.new()
	gate.item_id = "wind_disc"
	add_child(gate)
	gate.interact(player)
	await get_tree().process_frame
	_check("item_gate_opens_with_tool", not is_instance_valid(gate) or gate.is_queued_for_deletion())

	var world_mgr := get_tree().get_first_node_in_group("world_manager")
	_check("overworld_manager_present", world_mgr != null)
	if world_mgr and world_mgr.has_method("load_area"):
		world_mgr.load_area("dungeon_000_r0")
		await get_tree().process_frame
		await get_tree().process_frame
		_check("dungeon_area_loads", GameManager.current_room_id == "dungeon_000_r0")

	_finish()

func _check(name: String, passed: bool) -> void:
	_results.append({ "name": name, "passed": passed })

func _finish() -> void:
	print("SMOKE_TEST_RESULTS_BEGIN")
	for row in _results:
		print("%s %s" % ["PASS" if row.passed else "FAIL", row.name])
	print("SMOKE_TEST_RESULTS_END")
	var failed := false
	for row in _results:
		if not row.passed:
			failed = true
	get_tree().quit(1 if failed else 0)
