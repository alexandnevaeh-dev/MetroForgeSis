extends Node
## Direct arena setup followed by unmodified combat through Input only.
## No enemy removal, health grants, damage calls, or forced victory signals.
func capture(label: String) -> void:
	if DisplayServer.get_name()=="headless":
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/platformer-boss"))
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://qa/platformer-boss/"+label+".png")

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world.transition_to_room("room_007","left")
	await get_tree().create_timer(0.5).timeout
	var agent := PlaytestAgent.new()
	await capture("arena-entry")
	var defeated: bool = await agent._defeat_final_boss(self,"boss_final")
	var passed: bool = defeated and GameManager.game_complete and GameManager.current_state==GameManager.GameState.VICTORY
	await capture("arena-result")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/platformer-boss"))
	var proof := {"passed":passed,"bossDefeated":defeated,"victory":GameManager.game_complete,"attacks":agent.attacks_performed,"failure":agent._fail_stage,"combatEvents":agent._combat_events,"scope":"Direct arena setup, ordinary AI and input combat; not full campaign traversal or visual acceptance."}
	var file := FileAccess.open("user://qa/platformer-boss/proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(proof,"\t"))
	file.close()
	print("PLATFORMER_BOSS_RESULT ",JSON.stringify(proof))
	AudioManager.request_quit(0 if passed else 1)
