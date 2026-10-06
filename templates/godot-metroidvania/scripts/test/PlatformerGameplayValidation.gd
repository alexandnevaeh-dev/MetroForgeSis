extends Node
var checks := 0
var failures := 0

func check(label: String, passed: bool) -> void:
	checks += 1
	if not passed:
		failures += 1
	print("PLATFORMER_CHECK ","PASS " if passed else "FAIL ",label)

func _ready() -> void:
	var dna: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://game_dna.json"))
	check("project retains Platformer genre",dna.get("archetype") == "SIDE_VIEW_PLATFORMER")
	check("no mandatory ability upgrades",dna.get("abilities",[]).is_empty())
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.7).timeout
	check("stage music plays through native AudioManager",AudioManager.get_current_music_id() == "biome_0" and AudioManager._music_player.playing)
	var player = get_tree().get_first_node_in_group("player")
	check("native side-view player exists",player is CharacterBody2D)
	# Movement fixture isolates traversal from combat; enemy encounters remain a
	# separate acceptance scope rather than silently granting combat success.
	for enemy in get_tree().get_nodes_in_group("enemies"):
		enemy.queue_free()
	await get_tree().physics_frame
	var ground_y: float = player.position.y
	print("PLATFORMER_JUMP start=",player.position," grounded=",player.is_on_floor())
	Input.action_press("jump")
	await get_tree().physics_frame
	await get_tree().physics_frame
	Input.action_release("jump")
	await get_tree().create_timer(0.25).timeout
	print("PLATFORMER_JUMP airborne=",player.position," velocity=",player.velocity)
	check("basic jump rises without an upgrade",player.position.y < ground_y-20.0)
	await get_tree().create_timer(1.2).timeout
	check("lands back on built geometry",player.is_on_floor())
	var start_x: float = player.position.x
	Input.action_press("move_right")
	await get_tree().create_timer(0.5).timeout
	Input.action_release("move_right")
	check("runs horizontally under real input",player.position.x > start_x+50.0)
	var first_room := GameManager.current_room_id
	Input.action_press("move_right")
	var elapsed := 0.0
	while GameManager.current_room_id == first_room and elapsed < 10.0:
		await get_tree().create_timer(0.1).timeout
		elapsed += 0.1
	Input.action_release("move_right")
	var current_player = get_tree().get_first_node_in_group("player")
	print("PLATFORMER_EXIT room=",GameManager.current_room_id," position=",current_player.position if is_instance_valid(current_player) else Vector2.ZERO)
	check("walks through the first stage exit",GameManager.current_room_id == "room_001")
	await get_tree().create_timer(0.5).timeout
	var hud = world.get_node_or_null("GameHUD")
	var graph: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://world_graph.json"))
	check("HUD shows actual stage progression",hud != null and hud.ability_label.text == "Stage 2 / %d" % graph.nodes.size())
	check("Platformer HUD does not show exploration minimap",hud != null and not hud.minimap_panel.visible)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/platformer"))
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://qa/platformer/stage-transition.png")
	print("PLATFORMER_RESULT checks=",checks," failures=",failures)
	AudioManager.request_quit(0 if failures == 0 else 1)
