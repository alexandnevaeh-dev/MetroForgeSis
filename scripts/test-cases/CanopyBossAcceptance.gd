extends Node

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().process_frame
	world.load_area("dungeon_000_r3")
	await get_tree().process_frame
	await get_tree().process_frame
	var agent := PlaytestAgent.new()
	agent._load_expected_speed()
	var route: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://playtest_route.json"))
	agent._apply_persona(route.get("persona",{}))
	var won: bool = await agent._defeat_final_boss(self,"boss_final")
	print("CANOPY_BOSS_END won=%s bossHealth=%s playerHealth=%s attacks=%s" % [won,agent._boss_final_health,agent._boss_player_final_health,agent.attacks_performed])
	get_tree().quit(0 if won else 1)
