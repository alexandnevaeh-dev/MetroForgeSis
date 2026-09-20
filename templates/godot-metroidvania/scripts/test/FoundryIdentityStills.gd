extends Node
## Windowed stills of biome_0/1/2 rooms. phase = before|after via env.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
var QA := "res://qa/visual-polish/foundry-pass/before"

func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(CaptureGuard.EXIT_DUMMY)
		return
	var phase := OS.get_environment("FOUNDRY_STILL_PHASE")
	if phase == "after":
		QA = "res://qa/visual-polish/foundry-pass/after"
	GameManager.start_new_game()
	await get_tree().process_frame
	var packed := load("res://scenes/world/World.tscn") as PackedScene
	if packed == null:
		print("FOUNDRY_STILLS_FAIL world")
		get_tree().quit(1)
		return
	add_child(packed.instantiate())
	if not await CaptureGuard.await_physics_frames(self, 4, 4.0):
		get_tree().quit(CaptureGuard.EXIT_TIMEOUT)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	if player:
		var health := player.get_node_or_null("HealthComponent")
		if health:
			health.set("invulnerable", true)
	await _shot("biome_0_pouring_bay")
	await _load_room("room_001")
	await _shot("biome_1_quench_tunnels")
	await _load_room("room_002")
	var mite := _find_enemy()
	if player and mite:
		player.global_position = mite.global_position + Vector2(-96, 0)
		player.velocity = Vector2.ZERO
		for _i in 10:
			await get_tree().physics_frame
	await _shot("biome_2_cooling_yards")
	print("FOUNDRY_STILLS_OK %s" % phase)
	get_tree().quit(0)

func _load_room(room_id: String) -> void:
	var wm := get_tree().get_first_node_in_group("world_manager")
	if wm and wm.has_method("transition_to_room"):
		wm.transition_to_room(room_id, "left")
		await get_tree().create_timer(0.45).timeout

func _shot(name: String) -> void:
	if not await CaptureGuard.await_frames(self, 2, 2.0):
		print("FOUNDRY_STILLS_SHOT_FAIL %s" % name)
		return
	var tex := get_viewport().get_texture()
	if tex == null:
		return
	var img := tex.get_image()
	if img and not img.is_empty():
		img.save_png(ProjectSettings.globalize_path("%s/%s.png" % [QA, name]))
		print("FOUNDRY_STILLS_SHOT %s" % name)

func _find_enemy() -> Node2D:
	var grouped := get_tree().get_nodes_in_group("enemies")
	if grouped.size() > 0:
		return grouped[0] as Node2D
	return null
