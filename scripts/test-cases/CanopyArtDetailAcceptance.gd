extends Node
var failures := 0
var checks := 0
var captures := "res://.qa/detail"

func check(label: String, ok: bool) -> void:
	checks += 1
	print(("PASS: " if ok else "FAIL: ") + label)
	if not ok: failures += 1

func screenshot(label: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(captures + "/" + label + ".png")

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(captures))
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().physics_frame
	var player: Node2D = get_tree().get_first_node_in_group("player")
	player.set_physics_process(false)
	player.global_position = Vector2(480,352)
	var actor: AnimatedSprite2D = player.get_node("Sprite")
	var camera: Camera2D = player.get_node("Camera2D")
	camera.zoom = Vector2(2.8,2.8)
	camera.reset_smoothing()
	print("CANOPY_DETAIL_BEGIN")
	for direction: String in ["N","NE","E","SE","S","SW","W","NW"]:
		for action: String in ["idle","walk","run","attack","hurt","death"]:
			var clip: String = action + "_" + direction
			var expected: int = 16 if action == "run" else 6 if action == "hurt" else 12
			check(clip+"_real_frame_count",actor.sprite_frames.has_animation(clip) and actor.sprite_frames.get_frame_count(clip)==expected)
	check("hero_run_24fps",is_equal_approx(actor.sprite_frames.get_animation_speed("run_S"),24.0))
	check("hero_attack_30fps",is_equal_approx(actor.sprite_frames.get_animation_speed("attack_S"),30.0))
	player.call("_apply_attack_timing_from_meta", "attack")
	check("attack_startup_preserved_120ms",is_equal_approx(float(player.get("_attack_startup")),0.12))
	check("attack_active_preserved_120ms",is_equal_approx(float(player.get("_attack_active")),0.12))
	check("attack_recovery_preserved_160ms",is_equal_approx(float(player.get("_attack_recovery")),0.16))
	actor.play("idle_S")
	await screenshot("hero-closeup")
	for effect_id: String in ["hit_spark","death_puff","dash_trail","pickup_spark","ability_unlock","boss_phase_shift","area_burst","slam_shock","attack_warning"]:
		VFXManager.play(effect_id,player.global_position+Vector2(48,-16),1.8)
		var effect: AnimatedSprite2D
		for child in get_children():
			if child is AnimatedSprite2D and child.get_meta("effect_id", "") == effect_id:
				effect = child
		check(effect_id+"_uses_animated_effect",effect != null)
		if effect == null: continue
		check(effect_id+"_10_authored_frames",effect.sprite_frames.get_frame_count("burst")==10)
		var first: int = effect.frame
		await get_tree().create_timer(0.12).timeout
		check(effect_id+"_advances_real_frame",is_instance_valid(effect) and effect.frame>first)
		await screenshot(effect_id)
		await get_tree().create_timer(0.45).timeout
		check(effect_id+"_cleans_up_after_animation",not is_instance_valid(effect))
	world.load_area("dungeon_000_r3")
	await get_tree().process_frame
	await get_tree().process_frame
	player = get_tree().get_first_node_in_group("player")
	player.set_physics_process(false)
	player.global_position = Vector2(540,320)
	camera = player.get_node("Camera2D")
	camera.zoom = Vector2(2.3,2.3)
	camera.reset_smoothing()
	for entity in world.get_current_entities().get_children():
		if entity is CharacterBody2D:
			entity.set_physics_process(false)
		if entity.scene_file_path.ends_with("Boss.tscn"):
			var sprite: AnimatedSprite2D = entity.get_node("Sprite")
			check("boss_run_16_frames",sprite.sprite_frames.get_frame_count("run")==16)
			check("boss_attack_12_frames",sprite.sprite_frames.get_frame_count("attack")==12)
	await screenshot("boss-closeup")
	print("CANOPY_DETAIL_END")
	FileAccess.open(captures+"/results.json",FileAccess.WRITE).store_string(JSON.stringify({"checks":checks,"failures":failures}))
	get_tree().quit(0 if failures == 0 else 1)
