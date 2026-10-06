extends Node
var checks := 0
var failures := 0
const CAPTURES := "res://.qa/hd2d"
func check(label: String, ok: bool) -> void:
	checks += 1
	print(("PASS: " if ok else "FAIL: ")+label)
	if not ok: failures += 1
func capture(label: String) -> void:
	await RenderingServer.frame_post_draw
	check("capture_"+label,get_viewport().get_texture().get_image().save_png(CAPTURES+"/"+label+".png") == OK)
func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(CAPTURES))
	GameManager.start_new_game()
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/world/overworld.json"))
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.3).timeout
	var presenter = get_tree().get_first_node_in_group("hd2d_presenter")
	check("real_3d_presenter",presenter is Node3D)
	if presenter == null: get_tree().quit(1); return
	check("real_3d_camera_current",presenter.camera.is_current())
	var start: Dictionary = data.areas[0]
	check("floor_covers_authoritative_physical_grid",presenter.floor_cells == int(start.widthTiles)*int(start.heightTiles))
	check("lighting_has_shadowed_sun",presenter.get_node("CanopySun").shadow_enabled)
	check("sprite_mirrors_include_actors_and_props",presenter.mirrors.size() > 10)
	var nearest := true
	for sprite in presenter.mirrors.values():
		if sprite is Sprite3D: nearest = nearest and sprite.texture_filter == BaseMaterial3D.TEXTURE_FILTER_NEAREST
	check("all_sprite_edges_nearest_filtered",nearest)
	await capture("rootbound-hd2d")
	var player: CharacterBody2D = get_tree().get_first_node_in_group("player")
	player.global_position = Vector2(480,352)
	var before := player.global_position
	Input.action_press("move_right")
	await get_tree().create_timer(0.35).timeout
	Input.action_release("move_right")
	check("original_input_moves_3d_visible_actor",player.global_position.distance_to(before) > 25)
	await capture("moving-hd2d")
	var prior_builds: int = presenter.build_count
	world.load_area(String(data.victoryAreaId))
	await get_tree().create_timer(0.3).timeout
	print("HD2D_ROOM_SYNC ",presenter.room_id," builds=",presenter.build_count," game=",GameManager.current_room_id)
	check("3d_room_rebuild_follows_authoritative_world",presenter.room_id == data.victoryAreaId and presenter.build_count == prior_builds+1)
	await capture("hollow-crown-hd2d")
	for area: Dictionary in data.areas:
		world.load_area(String(area.id))
		await get_tree().create_timer(0.12).timeout
		check(String(area.id)+"_3d_geometry_ready",presenter.room_id==area.id and presenter.floor_cells==int(area.widthTiles)*int(area.heightTiles) and presenter.terrain.has_node("TexturedGround"))
		await capture(String(area.id))
	world.load_area("overworld")
	await get_tree().create_timer(0.12).timeout
	player = get_tree().get_first_node_in_group("player")
	var actor: AnimatedSprite2D = player.get_node("Sprite")
	var synchronized := true
	for state in ["idle_S","walk_S","run_S","attack_S","hurt_S","death_S","cast_S"]:
		actor.pause()
		actor.animation = state
		for frame in range(actor.sprite_frames.get_frame_count(state)):
			actor.frame = frame
			presenter.call("_process",0.0)
			var visible_actor: Sprite3D = presenter.mirrors[actor.get_instance_id()]
			synchronized = synchronized and visible_actor.texture==actor.sprite_frames.get_frame_texture(state,frame) and visible_actor.position==Vector3(player.global_position.x,0.2,player.global_position.y)
	check("every_hero_state_frame_and_ground_anchor_syncs_exactly",synchronized)
	var mirror: Sprite3D = presenter.mirrors[actor.get_instance_id()]
	player.hide()
	presenter.call("_process",0.0)
	check("hidden_actor_parent_hides_3d_mirror",not mirror.visible)
	player.show()
	var old_parent_tint := player.modulate
	var old_self_tint := actor.self_modulate
	player.modulate = Color(0.8,0.7,0.6,0.5)
	actor.self_modulate = Color(1.0,0.9,0.8,0.5)
	presenter.call("_process",0.0)
	check("actor_parent_and_self_tint_reach_3d_mirror",mirror.modulate.is_equal_approx(actor.modulate * player.modulate * actor.self_modulate))
	player.modulate = old_parent_tint
	actor.self_modulate = old_self_tint
	presenter.call("_process",0.0)
	check("intentional_hidden_2d_root_does_not_hide_3d_actors",mirror.visible and not world.get("_area_root").visible)
	var effect := Node2D.new()
	world.get_current_entities().add_child(effect)
	var text := Label.new()
	text.text = "Visibility fixture"
	effect.add_child(text)
	var line := Line2D.new()
	line.points = PackedVector2Array([Vector2.ZERO,Vector2(40,0)])
	line.default_color = Color(1.0,0.5,0.2,1.0)
	effect.add_child(line)
	presenter.call("_process",0.0)
	var text_id := text.get_instance_id()
	var line_id := line.get_instance_id()
	var text_mirror: Label3D = presenter.mirrors[text_id]
	var line_mirror: MeshInstance3D = presenter.mirrors[line_id]
	check("visible_effect_label_and_warning_are_mirrored",text_mirror.visible and line_mirror.visible)
	effect.hide()
	presenter.call("_process",0.0)
	check("hidden_effect_parent_hides_labels_and_warnings",not text_mirror.visible and not line_mirror.visible)
	effect.show()
	effect.modulate = Color(0.7,0.8,0.9,0.5)
	presenter.call("_process",0.0)
	check("effect_tint_preserves_label_and_warning_opacity",text_mirror.modulate.is_equal_approx(effect.modulate) and line_mirror.material_override.albedo_color.is_equal_approx(line.default_color * effect.modulate))
	effect.queue_free()
	await get_tree().process_frame
	presenter.call("_process",0.0)
	check("removed_effect_mirrors_are_discarded",not presenter.mirrors.has(text_id) and not presenter.mirrors.has(line_id))
	print("CANOPY_HD2D_END")
	FileAccess.open(CAPTURES+"/results.json",FileAccess.WRITE).store_string(JSON.stringify({"checks":checks,"failures":failures}))
	get_tree().quit(0 if failures == 0 else 1)
