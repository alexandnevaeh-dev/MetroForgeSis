extends Node
## Native, graphical inspection of the fresh ten-room set. Direct room loads are
## inspection, not evidence of a complete input-driven playthrough.
var results: Array[Dictionary] = []
var capture_dir := "res://.qa/canopy"
var frame_number := 0

func check(label: String, passed: bool) -> void:
	results.append({"name":label,"passed":passed})

func capture(name: String) -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	check("capture_" + name, image.save_png(capture_dir + "/" + name + ".png") == OK)

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(capture_dir))
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().process_frame
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/world/overworld.json"))
	check("sixteen_physical_rooms", data.areas.size() == 16)
	for area: Dictionary in data.areas:
		world.load_area(String(area.id))
		await get_tree().process_frame
		await get_tree().process_frame
		var player: CharacterBody2D = get_tree().get_first_node_in_group("player")
		var entities: Node2D = world.get_current_entities()
		check(String(area.id)+"_loaded", GameManager.current_room_id == area.id and player != null)
		check(String(area.id)+"_depth_sort_at_feet", entities.y_sort_enabled)
		var placements := 0
		for entity in entities.get_children():
			if entity.scene_file_path.ends_with("ItemPickup.tscn"):
				check(String(area.id)+"_pickup_uses_new_icon_"+entity.name, entity.has_node("RealIconSprite") and not entity.has_node("Sprite"))
			if entity.has_meta("placement_id"):
				placements += 1
				for placement: Dictionary in area.propPlacements:
					if placement.id == entity.get_meta("placement_id"):
						var anchor: Array = placement.layout.anchorPx
						check(String(placement.id)+"_ground_anchor", entity.get_node("Artwork").position == -Vector2(float(anchor[0]),float(anchor[1])))
						if String(placement.id).ends_with("_landmark"):
							var art_bounds: Rect2 = entity.get_node("Artwork").get_rect()
							var art_top: float = entity.global_position.y + entity.get_node("Artwork").position.y + art_bounds.position.y
							check(String(placement.id)+"_inside_level",art_top >= 0.0)
			if entity.has_node("Sprite") and entity.get_node("Sprite") is AnimatedSprite2D:
				var actor: AnimatedSprite2D = entity.get_node("Sprite")
				if not actor.sprite_frames:
					check(entity.name+"_frames", false)
					continue
				var image := actor.sprite_frames.get_frame_texture("idle",0).get_image()
				var last_opaque := -1
				for y in range(image.get_height()-1,-1,-1):
					for x in range(image.get_width()):
						if image.get_pixel(x,y).a > 0.5:
							last_opaque = y
							break
					if last_opaque >= 0: break
				var ground_error: float = absf((last_opaque + 1 - image.get_height()/2.0 + actor.offset.y) * actor.scale.y)
				check(String(area.id)+"_"+entity.name+"_painted_ground_contact", last_opaque >= 0 and ground_error <= 2.0)
				var actions: Array = ["idle","walk","run"] if entity.scene_file_path.ends_with("NPC.tscn") else ["idle","walk","run","attack","hurt","death"]
				for action in actions:
					check(String(area.id)+"_"+entity.name+"_"+action, actor.sprite_frames.has_animation(action) and actor.sprite_frames.get_frame_count(action) >= 4)
		check(String(area.id)+"_all_authored_props_visible", placements == area.propPlacements.size())
		if area.id == "overworld":
			for entity in entities.get_children():
				if entity.has_meta("placement_id") and String(entity.get_meta("placement_id")).contains("_tree_"):
					player.set_physics_process(false)
					player.global_position = entity.global_position + Vector2(0,-35)
					await get_tree().process_frame
					await get_tree().process_frame
					check("tall_foliage_reveals_occluded_hero", is_equal_approx(entity.get_node("Artwork").modulate.a,0.72))
					player.global_position = entity.global_position + Vector2(0,35)
					await get_tree().process_frame
					await get_tree().process_frame
					check("foreground_hero_restores_foliage", is_equal_approx(entity.get_node("Artwork").modulate.a,1.0))
					player.set_physics_process(true)
				if entity.scene_file_path.ends_with("NPC.tscn"):
					var identity: Dictionary = {}
					var catalog: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/npcs/npcs.json"))
					for definition: Dictionary in catalog.get("npcs",[]):
						if String(definition.id)==entity.npc_id: identity = definition
					check("npc_uses_generated_identity_and_role", entity.npc_name == String(identity.get("name","")) and entity.role == String(identity.get("role","")) and not entity.npc_name.is_empty())
					entity.call("_begin_dialogue")
					var overlay := get_tree().get_first_node_in_group("dialogue_overlay")
					check("original_lore_opens_dialogue", overlay != null and overlay.is_active())
					if overlay: overlay.call("close_dialogue")
		var cam: Camera2D = player.get_node("Camera2D")
		var vertical_tiles: float = get_viewport().get_visible_rect().size.y / cam.zoom.y / 32.0
		check(String(area.id)+"_camera_12_to_16_tiles", vertical_tiles >= 12 and vertical_tiles <= 16)
		# Show the northern landmark and adjacent walkable space at runtime camera size.
		# Direct positioning here is controlled inspection; the separate route uses input.
		player.global_position = Vector2(480,240)
		player.velocity = Vector2.ZERO
		cam.reset_smoothing()
		await get_tree().process_frame
		await capture(String(area.id))
		if area.id == "dungeon_000_r2":
			var gate: LockedDoor = null
			for child in entities.get_children():
				if child is LockedDoor and child.target_area_id == "canopy_approach": gate = child
			check("mandatory_vine_gate_present", gate != null)
			if gate:
				gate.interact(player)
				check("vine_gate_rejects_missing_disc", not gate.unlocked)
		if area.id == "dungeon_000_r1":
			for child in entities.get_children():
				if child is ChestPickup and child.item_id == "wind_disc":
					player.global_position = child.global_position + Vector2(0,24)
					Input.action_press("interact")
					player.call("_try_interact")
					Input.action_release("interact")
					check("real_shrine_chest_grants_disc", child.opened and InventoryManager.get_owned_count("wind_disc") > 0)
	# Revisit the real gate after the real chest interaction.
	world.load_area("dungeon_000_r2")
	await get_tree().process_frame
	await get_tree().process_frame
	var gate_player: CharacterBody2D = get_tree().get_first_node_in_group("player")
	for child in world.get_current_entities().get_children():
		if child is LockedDoor and child.target_area_id == "canopy_approach":
			child.interact(gate_player)
			check("vine_gate_accepts_collected_disc", child.unlocked)
	# Start-area locomotion and attack montage uses the actual controller inputs.
	world.load_area("overworld")
	await get_tree().process_frame
	await get_tree().process_frame
	var player: CharacterBody2D = get_tree().get_first_node_in_group("player")
	var sprite: AnimatedSprite2D = player.get_node("Sprite")
	for facing: String in ["N","NE","E","SE","S","SW","W","NW"]:
		for action: String in ["idle","walk","run","attack","hurt","death"]:
			check("hero_"+action+"_"+facing, sprite.sprite_frames.has_animation(action+"_"+facing))
	player.global_position = Vector2(480,352)
	player.get_node("Camera2D").reset_smoothing()
	for direction: String in ["move_right","move_down","move_left","move_up"]:
		var start := player.global_position
		Input.action_press(direction)
		for i in range(30):
			await get_tree().physics_frame
			await movie_frame()
		Input.action_release(direction)
		check("live_input_"+direction, player.global_position.distance_to(start) > 25)
		Input.action_press("attack")
		await get_tree().physics_frame
		await get_tree().process_frame
		Input.action_release("attack")
		check("directional_attack_"+direction, String(sprite.animation).begins_with("attack_"))
		for i in range(26):
			await get_tree().physics_frame
			await movie_frame()
	await capture("hero-grounded")
	# Real transition remembers the reciprocal passage, rather than a generic spawn.
	player.global_position = Vector2(810,352)
	Input.action_press("move_right")
	for i in range(50):
		await get_tree().physics_frame
		await get_tree().process_frame
		if GameManager.current_room_id == "dungeon_000_r0": break
	Input.action_release("move_right")
	await get_tree().process_frame
	await get_tree().process_frame
	player = get_tree().get_first_node_in_group("player")
	check("real_portal_contact_reciprocal_entry_spawn", GameManager.current_room_id == "dungeon_000_r0" and player.global_position.distance_to(Vector2(64,352)) < 65)
	var failures := 0
	print("CANOPY_ACCEPTANCE_BEGIN")
	for result in results:
		print(("PASS: " if result.passed else "FAIL: ") + result.name)
		if not result.passed: failures += 1
	print("CANOPY_ACCEPTANCE_END")
	FileAccess.open(capture_dir+"/results.json",FileAccess.WRITE).store_string(JSON.stringify({"checks":results,"failures":failures,"movieFrames":frame_number}))
	get_tree().quit(0 if failures == 0 else 1)

func movie_frame() -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(capture_dir+"/frame_%04d.png" % frame_number)
	frame_number += 1
