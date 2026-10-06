extends Node
## Controlled HUD layout states in the real castle; not earned-progression gameplay proof.
var checks: Array = []
var world: Node2D

func check(label: String, condition: bool) -> void:
	checks.append({"label": label, "passed": condition})

func _ready() -> void:
	GameManager.start_new_game()
	world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	for _i in range(12):
		await get_tree().process_frame
	var hud := world.get_node("GameHUD")
	var label := hud.get_node("HUD/MarginContainer/VBox/AbilityLabel") as Label
	var frame := hud.get_node("HUD/HUDFrame") as Control
	var quests := hud.get_node("HUD/QuestTrackerPanel") as Control
	var health := hud.get_node("HUD/MarginContainer/VBox/HealthBar") as Control
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://data/abilities/abilities.json"))
	var observations: Array = []
	for state in [0, 1, data.abilities.size()]:
		GameManager.player_abilities.clear()
		for index in range(state):
			GameManager.player_abilities.append(String(data.abilities[index].id))
		hud._update_abilities()
		for _i in range(8):
			await get_tree().process_frame
		var bounds := get_viewport().get_visible_rect()
		check("state %d health is entirely on screen" % state, bounds.encloses(health.get_global_rect()))
		check("state %d frame is entirely on screen" % state, bounds.encloses(frame.get_global_rect()))
		check("state %d frame width stays bounded" % state, frame.size.x <= 300)
		check("state %d quest panel sits below health stack" % state, quests.position.y >= frame.position.y + frame.size.y)
		check("state %d empty abilities do not reserve a line" % state, label.visible == (state > 0))
		if state > 0:
			check("state %d abilities are entirely on screen" % state, bounds.encloses(label.get_global_rect()))
			check("state %d names have no raw underscores" % state, not "_" in label.text)
		observations.append({"state": state, "abilities": label.text, "frame": {"x": frame.position.x, "y": frame.position.y, "width": frame.size.x, "height": frame.size.y}, "questTop": quests.position.y})
		await RenderingServer.frame_post_draw
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://qa/hud-layout"))
		get_viewport().get_texture().get_image().save_png("res://qa/hud-layout/state-%d.png" % state)
	var passed := checks.all(func(row): return row.passed)
	var file := FileAccess.open("res://qa/hud-layout/proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed": passed, "checks": checks, "observations": observations, "scope": "Real NVIDIA castle rendering; zero, one and all six abilities explicitly seeded for layout. Debug HUD remains visible. Dummy audio; not gameplay or art acceptance."}, "\t"))
	file.close()
	print("HUD_LAYOUT_RESULT ", JSON.stringify({"passed": passed, "checks": checks.size(), "failures": checks.filter(func(row): return not row.passed)}))
	world.queue_free()
	world = null
	await get_tree().process_frame
	AudioManager.request_quit(0 if passed else 1)
