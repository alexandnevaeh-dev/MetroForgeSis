extends Node
## Windowed stills of the opening pouring bay, courier, and ladle-mite (enemy_000).
## Not a feel verdict — visual identity check only.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/visual-polish/opening-identity"

func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(CaptureGuard.EXIT_DUMMY)
		return
	GameManager.start_new_game()
	await get_tree().process_frame
	var packed := load("res://scenes/world/World.tscn") as PackedScene
	if packed == null:
		print("OPENING_IDENTITY_FAIL world_missing")
		get_tree().quit(1)
		return
	add_child(packed.instantiate())
	if not await CaptureGuard.await_physics_frames(self, 4, 4.0):
		get_tree().quit(CaptureGuard.EXIT_TIMEOUT)
		return
	await get_tree().create_timer(0.35).timeout
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	if player:
		var health := player.get_node_or_null("HealthComponent")
		if health:
			health.set("invulnerable", true)
		Input.action_press("move_right")
		for _i in 20:
			await get_tree().physics_frame
		await _shot("opening_courier_walk")
		Input.action_release("move_right")
		Input.action_press("jump")
		await get_tree().physics_frame
		Input.action_release("jump")
		for _j in 16:
			await get_tree().physics_frame
		await _shot("opening_courier_jump")
	await _shot("opening_room_000")
	await _load_room("room_002")
	await get_tree().physics_frame
	await get_tree().physics_frame
	var mite := _find_enemy()
	if player and mite:
		player.global_position = mite.global_position + Vector2(-90, 0)
		player.velocity = Vector2.ZERO
		for _k in 8:
			await get_tree().physics_frame
	await _shot("combat_ladle_mite")
	print("OPENING_IDENTITY_OK")
	get_tree().quit(0)

func _load_room(room_id: String) -> void:
	var wm := get_tree().get_first_node_in_group("world_manager")
	if wm and wm.has_method("transition_to_room"):
		wm.transition_to_room(room_id, "left")
		await get_tree().create_timer(0.4).timeout

func _shot(name: String) -> void:
	if not await CaptureGuard.await_frames(self, 2, 2.0):
		print("OPENING_IDENTITY_SHOT_FAIL %s" % name)
		return
	var tex := get_viewport().get_texture()
	if tex == null:
		print("OPENING_IDENTITY_SHOT_FAIL %s texture=null" % name)
		return
	var img := tex.get_image()
	if img and not img.is_empty():
		img.save_png(ProjectSettings.globalize_path("%s/%s.png" % [QA, name]))
		print("OPENING_IDENTITY_SHOT %s" % name)
	else:
		print("OPENING_IDENTITY_SHOT_FAIL %s empty" % name)

func _find_enemy() -> Node2D:
	var grouped := get_tree().get_nodes_in_group("enemies")
	if grouped.size() > 0:
		return grouped[0] as Node2D
	var found := get_tree().root.find_children("*", "CharacterBody2D", true, false)
	for node in found:
		var body := node as CharacterBody2D
		if body == null or body.is_in_group("player"):
			continue
		var script: Script = body.get_script()
		if script != null and str(script.resource_path).ends_with("EnemyController.gd"):
			return body
	return null
