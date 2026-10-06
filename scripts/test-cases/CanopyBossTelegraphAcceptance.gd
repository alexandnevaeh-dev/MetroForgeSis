extends Node
var failures := 0
func check(label: String, ok: bool) -> void:
	print(("PASS: " if ok else "FAIL: ")+label)
	if not ok: failures += 1

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().process_frame
	world.load_area("dungeon_000_r3")
	await get_tree().process_frame
	await get_tree().process_frame
	var player: Node2D = get_tree().get_first_node_in_group("player")
	var entities: Node2D = world.get_current_entities()
	var boss: Node2D
	for child in entities.get_children():
		if child.scene_file_path.ends_with("Boss.tscn"): boss = child
	check("boss_and_player_present",boss != null and player != null)
	if boss == null or player == null:
		get_tree().quit(1)
		return
	player.set_physics_process(false)
	boss.set("_planned_attack","projectile")
	boss.set("_planned_direction",Vector2.RIGHT)
	boss.call("_set_telegraph_visual",true)
	var warning: Line2D = boss.get("_warning_line")
	var presenter = get_tree().get_first_node_in_group("hd2d_presenter")
	if presenter: presenter.call("_process",0.0)
	var rendered_warning: Node3D = presenter.mirrors.get(warning.get_instance_id()) if presenter and warning else null
	check("projectile_warning_visible",warning != null and (rendered_warning != null and rendered_warning.visible if presenter else warning.is_visible_in_tree()))
	if presenter:
		check("warning_3d_mesh_has_committed_length",rendered_warning is MeshInstance3D and is_equal_approx(rendered_warning.mesh.size.x,180))
		await RenderingServer.frame_post_draw
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://.qa/hd2d"))
		check("capture_visible_3d_boss_warning",get_viewport().get_texture().get_image().save_png("res://.qa/hd2d/boss-warning.png")==OK)
	check("warning_shows_committed_aim",warning != null and warning.points[1] == Vector2(180,0))
	var projectile_color: Color = boss.get_node("Sprite").modulate
	player.global_position = boss.global_position+Vector2(0,80)
	boss.call("_fire_projectile_attack")
	var shot: Node2D
	for child in entities.get_children():
		if child.scene_file_path.ends_with("Projectile.tscn"): shot = child
	check("shot_follows_warning_after_player_moves",shot != null and shot.get("direction") == Vector2.RIGHT)
	check("projectile_uses_new_art",shot != null and shot.has_node("RealSprite"))
	boss.call("_set_telegraph_visual",false)
	boss.set("_planned_attack","slam")
	boss.call("_set_telegraph_visual",true)
	var slam_color: Color = boss.get_node("Sprite").modulate
	boss.call("_set_telegraph_visual",false)
	boss.set("_planned_attack","area_burst")
	boss.call("_set_telegraph_visual",true)
	var burst_color: Color = boss.get_node("Sprite").modulate
	check("three_attack_tells_have_distinct_colors",projectile_color != slam_color and projectile_color != burst_color and slam_color != burst_color)
	boss.call("_set_telegraph_visual",false)
	check("warning_end_restores_actor_color",boss.get_node("Sprite").modulate == Color.WHITE)
	print("CANOPY_TELEGRAPH_END")
	get_tree().quit(0 if failures == 0 else 1)
