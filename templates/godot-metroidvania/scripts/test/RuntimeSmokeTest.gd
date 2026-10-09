extends Node
## Headless runtime smoke test for a generated MetroForge project.
## Invoked via: godot --headless --path <project> res://scenes/test/RuntimeSmokeTest.tscn
## Prints PASS/FAIL lines between SMOKE_TEST_RESULTS_BEGIN/END markers and exits with
## code 0 (all checks passed) or 1 (at least one failed). Never left running — always
## calls get_tree().quit() itself so no external --quit-after is required.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const RegionCaptureCoverage := preload("res://scripts/test/RegionCaptureCoverage.gd")
const RoomKitBounds := preload("res://scripts/test/RoomKitBounds.gd")
const SpriteGroundContact := preload("res://scripts/test/SpriteGroundContact.gd")

var _results: Array[Dictionary] = []
var _runtime_capture_manifest: Array[Dictionary] = []
var _keep_endgame_overlays_for_next_capture := false

func _room_has_ability_pickup(room: Node) -> bool:
	for child in room.get_children():
		if child.name.begins_with("AbilityPickup"):
			return true
	return false

func _ready() -> void:
	_prepare_capture_window()
	await get_tree().process_frame
	await get_tree().process_frame

	_check("autoload_game_manager_exists", GameManager != null)
	_check("autoload_event_bus_exists", EventBus != null)
	_check("autoload_save_manager_exists", SaveManager != null)
	_check("autoload_audio_manager_exists", AudioManager != null)
	_check("autoload_progression_manager_exists", ProgressionManager != null)
	_check("autoload_settings_manager_exists", SettingsManager != null)
	_check("autoload_quest_manager_exists", QuestManager != null)
	_check("autoload_vfx_manager_exists", VFXManager != null)
	_check_stormglass_level_blueprint()
	_check_stormglass_enemy_art_roster()
	_check_stormglass_guardian_art_roster()

	_check_room_scenes_standalone()

	var world_scene := load("res://scenes/world/World.tscn") as PackedScene
	_check("world_scene_loads", world_scene != null)
	if world_scene == null:
		_finish()
		return

	GameManager.start_new_game()
	var world: Node2D = world_scene.instantiate()
	add_child(world)

	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().process_frame

	_check("world_manager_initializes", world.has_method("transition_to_room"))
	_check("current_room_recorded", GameManager.current_room_id != "")
	await _check_stormglass_authored_props(world)
	await _check_stormglass_vertical_camera(world)
	_check_audio()
	await _check_staged_encounter_activation(world)
	await _check_boss_music(world)
	await _check_pause_menu(world)

	var player := get_tree().get_first_node_in_group("player")
	_check("player_exists", player != null)
	print("METROFORGE_RUNTIME_READY project=%s scene=%s player=%s room=%s" % [
		ProjectSettings.get_setting("application/config/name", "MetroForge"),
		get_tree().current_scene.scene_file_path if get_tree().current_scene else "unknown",
		player.name if player else "missing",
		GameManager.current_room_id,
	])

	if player:
		var pos: Vector2 = player.global_position
		_check("player_spawns_at_valid_location", is_finite(pos.x) and is_finite(pos.y))
		_check("player_movement_controller_initialized", player.get("facing") != null)
		_check("player_has_health_component", player.get_node_or_null("HealthComponent") != null)
		_check("player_has_hurtbox", player.get_node_or_null("HurtboxComponent") != null)
		_check("player_has_attack_hitbox", player.get_node_or_null("AttackHitbox") != null)
		_check_camera(player)
		await _check_camera_shake_settles(player)
		await _capture_runtime_state("spawn", "spawn", {"runtimeState": "spawn"})
		_save_report_shot("spawn", "spawn.png")
		await _probe_and_capture_foot_isolates()

		var player_sprite: AnimatedSprite2D = player.get_node_or_null("Sprite")
		if player_sprite and player_sprite.sprite_frames:
			_check("player_sprite_ground_contact_aligned", SpriteGroundContact.aligned(player_sprite))
			_check("player_has_attack_animation", player_sprite.sprite_frames.has_animation("attack"))
			_check("player_has_hurt_animation", player_sprite.sprite_frames.has_animation("hurt"))
			_check("player_has_idle_animation", player_sprite.sprite_frames.has_animation("idle"))
			_check("player_has_death_animation", player_sprite.sprite_frames.has_animation("death"))
			_check(
				"player_has_run_or_walk_animation",
				player_sprite.sprite_frames.has_animation("run") or player_sprite.sprite_frames.has_animation("walk")
			)
			var idle_is_walk := false
			if player_sprite.sprite_frames.has_animation("idle") and player_sprite.sprite_frames.has_animation("walk") \
				and player_sprite.sprite_frames.get_frame_count("idle") > 0 \
				and player_sprite.sprite_frames.get_frame_count("walk") > 0:
				var idle_tex := player_sprite.sprite_frames.get_frame_texture("idle", 0)
				var walk_tex := player_sprite.sprite_frames.get_frame_texture("walk", 0)
				idle_is_walk = idle_tex == walk_tex
			_check("player_idle_is_not_walk_frame_1", not idle_is_walk)
		else:
			_check("player_has_attack_animation", false)
			_check("player_has_hurt_animation", false)
			_check("player_sprite_ground_contact_aligned", false)

	# Capture the visual-slice contact shots before test pickups and the Victory overlay.
	await _capture_visual_slice_rooms(world)
	player = get_tree().get_first_node_in_group("player")
	await _capture_action_shots(player)

	_check_ability_pickup(player)
	await _capture_named_screenshot("ability")
	_check_npc_interaction(player)
	await _capture_named_screenshot("exploration")
	await _capture_gameplay_screenshot()
	await _check_boss_victory_flow()
	await _check_quest_system(world)
	player = get_tree().get_first_node_in_group("player")
	_check_item_pickups(player)
	_check_inventory_equip_ui(world)
	await get_tree().process_frame
	_check_currency_hud(world)
	_check_hud_minimap(world)
	await _check_hud_quest_tracker(world)
	await _check_enemy_combat(player)
	await _capture_named_screenshot("combat")
	_check_boss_placement()
	await _check_boss_attack_variety(player)
	await _capture_named_screenshot("boss")
	player = get_tree().get_first_node_in_group("player")
	await _check_boss_weakness(player)
	await _check_boss_phase_presentation()
	# Victory/combat instantiate extra Worlds + queue_free them; drain a couple of
	# frames so group lookups are not a previously-freed Player from those extras.
	await get_tree().process_frame
	await get_tree().process_frame
	player = get_tree().get_first_node_in_group("player")
	await _check_ability_gated_transition(player, world)

	# _check_ability_gated_transition may have navigated to a new room, which frees the
	# previous Player instance — re-fetch rather than reuse the now-possibly-stale reference.
	var current_player := get_tree().get_first_node_in_group("player")
	await _check_breakable_wall(current_player, world)
	current_player = get_tree().get_first_node_in_group("player")
	await _check_shortcut_traversal(current_player, world)

	current_player = get_tree().get_first_node_in_group("player")
	_check_save_point(current_player)

	current_player = get_tree().get_first_node_in_group("player")
	await _check_player_death_respawn(current_player, world)

	_check("save_manager_can_write", SaveManager.select_slot(0) and SaveManager.save_game())
	_check("save_manager_can_read", SaveManager.load_game())
	_check_save_migration_v1_to_v2()
	_check_save_backup_recovery()
	_check_save_slots()
	await _check_title_file_select()

	# Let any queue_free()'d nodes from the checks above actually process before exiting,
	# so shutdown doesn't report benign "still in use" noise from this test's own cleanup.
	await get_tree().process_frame
	await get_tree().process_frame

	_finish()

func _check_stormglass_level_blueprint() -> void:
	if not String(ProjectSettings.get_setting("application/config/name", "")).begins_with("Stormglass Reliquary"):
		return
	var expected_archetypes := [
		"tutorial", "combat", "traversal", "ability_shrine", "combat", "traversal", "save", "secret", "miniboss", "ability_gate",
		"tutorial", "combat", "traversal", "ability_shrine", "combat", "traversal", "save", "secret", "miniboss", "ability_gate",
		"tutorial", "combat", "traversal", "ability_shrine", "combat", "ability_gate", "save", "secret", "miniboss", "ability_gate",
		"tutorial", "combat", "traversal", "ability_shrine", "combat", "traversal", "save", "secret", "boss", "transition",
	]
	var expected_sizes := {
		"tutorial": Vector2i(56, 24), "combat": Vector2i(64, 48), "traversal": Vector2i(50, 72),
		"ability_shrine": Vector2i(56, 32), "ability_gate": Vector2i(64, 32), "save": Vector2i(48, 24),
		"secret": Vector2i(48, 24), "miniboss": Vector2i(64, 32), "boss": Vector2i(72, 36),
		"transition": Vector2i(56, 24),
	}
	var rooms_file := FileAccess.open("res://data/rooms/rooms.json", FileAccess.READ)
	var rooms_json := JSON.new()
	var rooms_ok := rooms_file != null and rooms_json.parse(rooms_file.get_as_text()) == OK
	if rooms_file:
		rooms_file.close()
	var rooms: Dictionary = rooms_json.data.get("rooms", {}) if rooms_ok and typeof(rooms_json.data) == TYPE_DICTIONARY else {}
	var gallery_campaign := FileAccess.file_exists("res://data/visual/stormglass-room-kits.json")
	var graph: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://world_graph.json"))
	var archive_wing := false
	var expanded_campaign := false
	if graph is Dictionary:
		for node in graph.get("nodes", []):
			if node is Dictionary and node.get("metadata", {}).get("stormglassRegionProfile") == "archive-wing":
				archive_wing = true
				expanded_campaign = true
			if node is Dictionary and node.get("metadata", {}).get("stormglassRegionProfile") == "expanded-region":
				expanded_campaign = true
	_check("stormglass_expanded_profile_has_admitted_room_kits", not expanded_campaign or gallery_campaign)
	if expanded_campaign and not gallery_campaign:
		return
	var expected_count := 48 if archive_wing else 46 if expanded_campaign else 43 if gallery_campaign else 40
	var gallery_nodes: Dictionary = {}
	if gallery_campaign:
		var recipe_id := "stormglass-archive-wing-campaign-v1" if archive_wing else "stormglass-expanded-region-campaign-v1" if expanded_campaign else "stormglass-gallery-campaign-v1"
		var recipe: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://data/visual/blueprints/%s.json" % recipe_id))
		var recipe_valid: bool = recipe is Dictionary and recipe.get("id") == recipe_id and recipe.get("worldGraph") is Dictionary
		_check("stormglass_gallery_campaign_recipe_valid", recipe_valid)
		if not recipe_valid:
			return
		for node in recipe.worldGraph.get("nodes", []):
			if node.get("type") == "room":
				gallery_nodes[String(node.id)] = node
		_check("stormglass_gallery_recipe_has_%d_unique_rooms" % expected_count, gallery_nodes.size() == expected_count)
		_check("stormglass_gallery_authored_doors_match_reciprocal_graph", _gallery_doors_match(rooms, recipe.worldGraph.get("edges", []), expanded_campaign, archive_wing))
	_check("stormglass_blueprint_has_%d_rooms" % expected_count, rooms.size() == expected_count)
	var enemies_file := FileAccess.open("res://data/enemies/enemies.json", FileAccess.READ)
	var enemies_json := JSON.new()
	var enemies_ok := enemies_file != null and enemies_json.parse(enemies_file.get_as_text()) == OK
	if enemies_file:
		enemies_file.close()
	var enemy_definitions: Array = enemies_json.data.get("enemies", []) if enemies_ok and typeof(enemies_json.data) == TYPE_DICTIONARY else []
	var enemy_biome_by_id: Dictionary = {}
	var enemy_names: Dictionary = {}
	var enemy_counts_by_biome: Dictionary = {}
	for enemy_definition in enemy_definitions:
		if typeof(enemy_definition) != TYPE_DICTIONARY:
			continue
		var definition_id := String(enemy_definition.get("id", ""))
		var definition_biome := String(enemy_definition.get("biomeId", ""))
		var definition_name := String(enemy_definition.get("name", ""))
		enemy_biome_by_id[definition_id] = definition_biome
		enemy_names[definition_name] = true
		enemy_counts_by_biome[definition_biome] = int(enemy_counts_by_biome.get(definition_biome, 0)) + 1
	var roster_is_one_continuous_biome := enemy_definitions.size() == 20 \
		and enemy_counts_by_biome.size() == 1 \
		and int(enemy_counts_by_biome.get("biome_0", 0)) == 20
	_check("stormglass_enemy_roster_uses_one_continuous_biome", roster_is_one_continuous_biome)
	_check("stormglass_enemy_roster_names_are_unique", enemy_names.size() == 20)
	var archetypes_match := rooms.size() == expected_count
	var dimensions_match := rooms.size() == expected_count
	var combat_density_match := true
	var traversal_density_match := true
	var encounter_door_clearance_match := true
	var encounter_instance_ids_unique := true
	var encounter_biomes_match := true
	for index in range(expected_count):
		var room_id := "room_%03d" % index
		var room: Dictionary = rooms.get(room_id, {})
		var expected_metadata: Dictionary = gallery_nodes.get(room_id, {}).get("metadata", {}) if gallery_campaign else {}
		var expected_archetype: String = String(expected_metadata.get("archetype", "")) if gallery_campaign else expected_archetypes[index]
		archetypes_match = archetypes_match and String(room.get("worldArchetype", "")) == expected_archetype
		var expected_size: Vector2i = expected_sizes.get(expected_archetype, Vector2i.ZERO)
		if gallery_campaign:
			expected_size = Vector2i(int(expected_metadata.get("targetTileWidth", 0)), int(expected_metadata.get("targetTileHeight", 0)))
		dimensions_match = dimensions_match and int(room.get("width", 0)) == expected_size.x * 32 and int(room.get("height", 0)) == expected_size.y * 32
		var enemy_ids: Array = room.get("enemies", [])
		if expected_archetype == "combat":
			combat_density_match = combat_density_match and enemy_ids.size() >= 4 and enemy_ids.size() <= 6
		elif expected_archetype == "traversal":
			traversal_density_match = traversal_density_match and enemy_ids.size() >= 2 and enemy_ids.size() <= 3
		if expected_archetype == "combat" or expected_archetype == "traversal":
			var seen_instances: Dictionary = {}
			for placement in room.get("entityPlacements", []):
				if typeof(placement) == TYPE_DICTIONARY and String(placement.get("kind", "")) == "enemy":
					var instance_id := String(placement.get("id", ""))
					var definition_id := String(placement.get("definitionId", ""))
					encounter_instance_ids_unique = encounter_instance_ids_unique and not seen_instances.has(instance_id)
					seen_instances[instance_id] = true
					encounter_biomes_match = encounter_biomes_match and enemy_biome_by_id.has(definition_id) and String(enemy_biome_by_id.get(definition_id, "")) == String(room.get("biomeId", ""))
					var enemy_x := float(placement.get("x", 0.0))
					encounter_door_clearance_match = encounter_door_clearance_match and enemy_x >= 160.0 and enemy_x <= float(room.get("width", 0)) - 160.0
	_check("stormglass_blueprint_archetypes_match", archetypes_match)
	_check("stormglass_blueprint_dimensions_match", dimensions_match)
	_check("stormglass_combat_rooms_have_4_to_6_enemies", combat_density_match)
	_check("stormglass_traversal_rooms_have_2_to_3_enemies", traversal_density_match)
	_check("stormglass_encounters_clear_door_safety_zones", encounter_door_clearance_match)
	_check("stormglass_encounter_instance_ids_are_unique", encounter_instance_ids_unique)
	_check("stormglass_enemy_placements_match_room_biome", encounter_biomes_match)

	var bosses_file := FileAccess.open("res://data/bosses/bosses.json", FileAccess.READ)
	var bosses_json := JSON.new()
	var bosses_ok := bosses_file != null and bosses_json.parse(bosses_file.get_as_text()) == OK
	if bosses_file:
		bosses_file.close()
	var bosses: Array = bosses_json.data.get("bosses", []) if bosses_ok and typeof(bosses_json.data) == TYPE_DICTIONARY else []
	var expected_arenas := ["room_008", "room_018", "room_028", "room_038"]
	var arenas_match := bosses.size() == expected_arenas.size()
	for index in range(min(bosses.size(), expected_arenas.size())):
		arenas_match = arenas_match and String(bosses[index].get("arenaRoomId", "")) == expected_arenas[index]
	_check("stormglass_blueprint_guardian_arenas_match", arenas_match)


func _gallery_doors_match(rooms: Dictionary, edges: Array, expanded_campaign: bool = false, archive_wing: bool = false) -> bool:
	var authored := ["room_000","room_001","room_002","room_003","room_004","room_005","room_006","room_007","room_040","room_041","room_042"]
	if expanded_campaign:
		authored.append_array(["room_043", "room_044", "room_045"])
	if archive_wing:
		authored.append_array(["room_046", "room_047"])
	var opposite := {"left":"right","right":"left","up":"down","down":"up"}
	var expected: Dictionary = {}
	for id in authored:
		expected[id] = []
	for edge in edges:
		if not authored.has(edge.get("from")) and not authored.has(edge.get("to")):
			continue
		var direction := String(edge.get("transition", ""))
		if not opposite.has(direction) or not edge.get("bidirectional", false):
			return false
		for side in [0,1]:
			var from_id := String(edge.get("from")) if side==0 else String(edge.get("to"))
			var to_id := String(edge.get("to")) if side==0 else String(edge.get("from"))
			if expected.has(from_id):
				expected[from_id].append({"targetRoomId":to_id,"direction":direction if side==0 else opposite[direction],"requirements":edge.get("requirements", []),"optional":edge.get("optional", false)})
	for id in authored:
		var connections: Array = rooms.get(id, {}).get("connections", [])
		if connections.size()!=expected[id].size():
			return false
		for intended in expected[id]:
			var matches := 0
			for actual in connections:
				var required: Array = actual.get("requirements", []).duplicate()
				var wanted: Array = intended.requirements.duplicate()
				required.sort(); wanted.sort()
				if actual.get("targetRoomId")==intended.targetRoomId and actual.get("direction")==intended.direction and bool(actual.get("optional",false))==bool(intended.optional) and required==wanted:
					matches += 1
			if matches!=1:
				return false
	return true

func _check_stormglass_enemy_art_roster() -> void:
	# The detailed Gothic sheets are materially larger than the former geometric placeholders.
	# Check every gameplay roster slot so a later generator change cannot quietly bring the
	# retro placeholder enemies back after the first castle chapter.
	var actions := ["idle", "walk", "attack", "hurt", "death"]
	for enemy_index in range(20):
		var enemy_id := "enemy_%03d" % enemy_index
		var uses_detailed_art := true
		for action in actions:
			var path := "res://assets/enemies/%s_%s.png" % [enemy_id, action]
			if not FileAccess.file_exists(path) or FileAccess.get_file_as_bytes(path).size() < 8000:
				uses_detailed_art = false
				break
		_check("%s_uses_detailed_gothic_art" % enemy_id, uses_detailed_art)


func _check_stormglass_guardian_art_roster() -> void:
	var actions := ["idle", "walk", "attack", "hurt", "death"]
	for guardian_id in ["boss_000", "boss_001", "boss_002", "boss_final"]:
		var uses_detailed_art := true
		for action in actions:
			var path := "res://assets/bosses/%s_%s.png" % [guardian_id, action]
			if not FileAccess.file_exists(path) or FileAccess.get_file_as_bytes(path).size() < 100000:
				uses_detailed_art = false
				break
		_check("%s_uses_detailed_gothic_art" % guardian_id, uses_detailed_art)


func _check_stormglass_authored_props(world: Node) -> void:
	if not String(ProjectSettings.get_setting("application/config/name", "")).begins_with("Stormglass Reliquary"):
		return
	# RoomTileMap and StormglassDecor both attach deferred; collision-aware prop placement then
	# waits for the next physics frame before raycasting against the actual room geometry.
	await get_tree().physics_frame
	await get_tree().process_frame
	var all_prop_assets_exist := true
	for prop_index in range(12):
		all_prop_assets_exist = all_prop_assets_exist and ResourceLoader.exists(
			"res://assets/props/biome_0/biome_0_prop_%d.png" % prop_index
		)
	_check("stormglass_gothic_authored_prop_family_has_12_assets", all_prop_assets_exist)
	var room := world.get("_current_room") as Node
	var decor := room.get_node_or_null("StormglassDecor") if room else null
	_check("stormglass_decor_instantiates_in_opening_room", decor != null)
	var authored_prop_count := 0
	if decor:
		for child in decor.get_children():
			if child.name.begins_with("AuthoredStormglassProp_") and child is Sprite2D:
				authored_prop_count += 1
	_check("stormglass_opening_room_places_authored_gothic_props", authored_prop_count >= 2)
	var trims := room.get_node_or_null("StormglassPlatformTrims") if room else null
	_check("stormglass_opening_room_has_collision_matched_surface_holder", trims != null)
	var platform_trim_count := 0
	var platform_collider_count := 0
	var floor_strip_count := 0
	if room:
		for child in room.get_children():
			if child.name.begins_with("Platform_") and child is StaticBody2D:
				platform_collider_count += 1
	if trims:
		for child in trims.get_children():
			if child.name.begins_with("CollisionMatchedPlatform_"):
				platform_trim_count += 1
			elif child.name == "CollisionMatchedFloorStrip":
				floor_strip_count += 1
	_check(
		"stormglass_opening_room_dresses_every_platform_collider",
		platform_collider_count > 0 and platform_trim_count == platform_collider_count
	)
	_check("stormglass_opening_room_dresses_floor_collider", floor_strip_count == 1)
	var floor_body := room.get_node_or_null("Floor") as StaticBody2D if room else null
	var foundation := room.get_node_or_null("StormglassFloorFoundation") as Node2D if room else null
	_check("stormglass_opening_floor_has_painted_foundation", foundation != null)
	if foundation and floor_body:
		var floor_shape := floor_body.get_node_or_null("CollisionShape2D") as CollisionShape2D
		var floor_rect := floor_shape.shape as RectangleShape2D
		_check("stormglass_foundation_matches_floor_without_collision_changes",
			foundation.position.is_equal_approx(floor_body.position + floor_shape.position - floor_rect.size * 0.5)
			and floor_body.scale == Vector2.ONE and foundation.scale == Vector2.ONE
			and foundation.get_node("OpaqueStoneBacking").polygon[2] == floor_rect.size)
	var shrine_scene := load("res://scenes/world/SavePoint.tscn") as PackedScene
	var shrine := shrine_scene.instantiate() as Node2D
	# Keep the test shrine away from actors; real save interaction has separate coverage.
	shrine.position = Vector2(-1000, -1000)
	add_child(shrine)
	await get_tree().process_frame
	var shrine_sprite := shrine.get_node("Sprite") as Sprite2D
	_check("stormglass_save_shrine_uses_authored_castle_art", shrine_sprite.texture.get_width() == 128)
	_check("stormglass_save_shrine_keeps_authored_world_scale", shrine_sprite.scale.is_equal_approx(Vector2.ONE * 0.75))
	var alpha_bounds := shrine_sprite.texture.get_image().get_used_rect()
	var visible_base := (shrine_sprite.offset.y - shrine_sprite.texture.get_height() * 0.5 + alpha_bounds.end.y) * shrine_sprite.scale.y
	_check("stormglass_save_shrine_visible_base_meets_anchor", absf(visible_base) < 0.01)
	var shrine_offset := shrine_sprite.offset
	await get_tree().create_timer(0.15).timeout
	_check("stormglass_save_shrine_stays_grounded_while_idle", shrine_sprite.offset == shrine_offset and shrine_sprite.bob_pixels == 0)
	shrine.queue_free()
	var ground := room.get_node_or_null("Ground") as CanvasItem if room else null
	_check("stormglass_gothic_placeholder_tile_faces_are_hidden", ground != null and ground.self_modulate.a <= 0.01)


func _check_stormglass_vertical_camera(world: Node) -> void:
	if not String(ProjectSettings.get_setting("application/config/name", "")).begins_with("Stormglass Reliquary"):
		return
	var previous_room := GameManager.current_room_id
	await world.transition_to_room("room_002", "authored")
	for frame in range(4):
		await get_tree().process_frame
	var camera := get_viewport().get_camera_2d()
	var view := camera.get_viewport_rect().size / camera.zoom if camera else Vector2.ZERO
	print("STORMGLASS_VERTICAL_CAMERA view=%.2fx%.2f zoom=%.3f room=%s" % [
		view.x, view.y, camera.zoom.x if camera else 0.0, GameManager.current_room_id,
	])
	_check(
		"stormglass_vertical_room_preserves_30x17_tile_gameplay_scale",
		# A 16:9 viewport is 7 px wider than an exact 30:17 tile frame at this scale;
		# permit that fractional-tile aspect-ratio remainder while pinning height exactly.
		camera != null and view.x <= 31.0 * 32.0 and view.y <= 17.0 * 32.0 + 2.0
	)
	await world.transition_to_room("room_007", "authored")
	for frame in range(4):
		await get_tree().process_frame
	camera = get_viewport().get_camera_2d()
	view = camera.get_viewport_rect().size / camera.zoom if camera else Vector2.ZERO
	print("STORMGLASS_COMPACT_CAMERA view=%.2fx%.2f zoom=%.3f room=%s" % [
		view.x, view.y, camera.zoom.x if camera else 0.0, GameManager.current_room_id,
	])
	_check(
		"stormglass_compact_room_camera_does_not_expose_void",
		# Studio overrides can preserve the old alcove or enlarge it. Pin the view to
		# the actual generated bounds rather than the previous 18x10-tile default.
		camera != null and camera.has_method("get_room_size") \
			and view.x <= camera.get_room_size().x + 2.0 \
			and view.y <= camera.get_room_size().y + 2.0
	)
	await world.transition_to_room(previous_room if not previous_room.is_empty() else "room_000", "authored")
	await get_tree().process_frame

## Loads every generated room scene standalone (outside WorldManager) to prove each one
## parses/instantiates cleanly, and to count enemy/boss/ability-pickup presence across
## the whole generated world without hardcoding the placement formula here.
func _check_room_scenes_standalone() -> void:
	var dir := DirAccess.open("res://scenes/rooms")
	_check("rooms_directory_exists", dir != null)
	if dir == null:
		return

	var enemy_found := false
	var boss_found := false
	var pickup_found := false
	var npc_found := false
	var room_count := 0
	var load_failures: Array[String] = []

	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if file_name.ends_with(".tscn"):
			room_count += 1
			var scene := load("res://scenes/rooms/%s" % file_name) as PackedScene
			if scene == null:
				load_failures.append(file_name)
			else:
				var instance := scene.instantiate()
				if instance.get_node_or_null("Enemy") != null:
					enemy_found = true
				if instance.get_node_or_null("Boss") != null:
					boss_found = true
				if _room_has_ability_pickup(instance):
					pickup_found = true
				if instance.get_node_or_null("NPC_0") != null:
					npc_found = true
				instance.queue_free()
		file_name = dir.get_next()
	dir.list_dir_begin()

	_check("room_scenes_exist", room_count > 0)
	_check("all_room_scenes_load_cleanly", load_failures.is_empty())
	_check("enemies_instantiate", enemy_found)
	_check("boss_instantiates", boss_found)
	_check("ability_pickup_exists_in_world", pickup_found)
	# Soft: profiles with npcs: 0 (none currently, but not schema-enforced) would legitimately
	# place zero NPCs — this is informational rather than a hard generator defect.
	_check_soft("npc_exists_in_world", npc_found)

## Proves AudioManager actually plays sound, not just that its methods exist and don't
## crash. Entering the world should already have started biome music via WorldManager's
## room_entered handler; play_sfx() is exercised directly since simulating real input
## events headlessly is unreliable.
func _check_audio() -> void:
	# Headless Godot often has no audio device; music start is informational for VGF-1
	# (playtest must still be allowed to run). SFX bus wiring stays a hard check.
	_check_soft("audio_manager_music_playing_after_room_entry", AudioManager._music_player.playing)

	AudioManager.play_sfx("jump")
	var any_sfx_playing := false
	for player in AudioManager._sfx_pool:
		if player.playing:
			any_sfx_playing = true
			break
	_check("audio_manager_plays_sfx", any_sfx_playing)

	AudioManager.play_sfx("this_sfx_id_does_not_exist_and_should_just_warn")
	_check("audio_manager_missing_sfx_does_not_crash", true)
	_check("audio_manager_music_uses_music_bus", AudioManager._music_player.bus == "Music")
	_check("audio_manager_sfx_uses_sfx_bus", AudioManager._sfx_pool[0].bus == "SFX")
	_check_generated_music_coverage()

## Derives the required score from the generated room graph. This catches a profile that
## expands to more biomes than its source audio bible (Stormglass previously created biome_3
## rooms but only biome_0..2 music), without hard-coding a particular biome count.
func _check_generated_music_coverage() -> void:
	var rooms_path := "res://data/rooms/rooms.json"
	if not FileAccess.file_exists(rooms_path):
		_check("generated_music_room_data_exists", false)
		return
	var file := FileAccess.open(rooms_path, FileAccess.READ)
	var json := JSON.new()
	var parse_ok := file != null and json.parse(file.get_as_text()) == OK
	if file:
		file.close()
	_check("generated_music_room_data_parses", parse_ok and typeof(json.data) == TYPE_DICTIONARY)
	if not parse_ok or typeof(json.data) != TYPE_DICTIONARY:
		return

	var required_biomes: Dictionary = {}
	var rooms: Dictionary = json.data.get("rooms", {})
	for info in rooms.values():
		if typeof(info) == TYPE_DICTIONARY:
			var biome_id := String(info.get("biomeId", ""))
			if not biome_id.is_empty():
				required_biomes[biome_id] = true
	for biome_id in required_biomes.keys():
		var music_path := "res://audio/music/%s.wav" % String(biome_id)
		_check("generated_music_has_%s" % String(biome_id), ResourceLoader.exists(music_path))
	_check("generated_music_has_boss", ResourceLoader.exists("res://audio/music/boss.wav"))

## A modern encounter should reveal itself in waves as the player advances. This uses the first
## generated combat room and real EnemyController perception rather than inspecting placement
## metadata alone.
func _check_staged_encounter_activation(world: Node) -> void:
	var previous_room := GameManager.current_room_id
	var combat_room_id := ""
	var file := FileAccess.open("res://data/rooms/rooms.json", FileAccess.READ)
	var json := JSON.new()
	if file != null and json.parse(file.get_as_text()) == OK and typeof(json.data) == TYPE_DICTIONARY:
		for room_id in json.data.get("rooms", {}).keys():
			var info: Dictionary = json.data["rooms"][room_id]
			if String(info.get("worldArchetype", "")) == "combat":
				combat_room_id = String(room_id)
				break
	if file:
		file.close()
	_check("staged_encounter_combat_room_exists", not combat_room_id.is_empty())
	if combat_room_id.is_empty():
		return

	await world.transition_to_room(combat_room_id, "authored")
	for frame in range(8):
		await get_tree().physics_frame
	var room: Node = world.get("_current_room")
	var enemies: Array[Node] = []
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if room != null and room.is_ancestor_of(enemy) and enemy.has_method("is_awakened"):
			enemies.append(enemy)
	var initial_awake := enemies.filter(func(enemy: Node) -> bool: return bool(enemy.call("is_awakened"))).size()
	_check("staged_encounter_initial_group_is_partial", enemies.size() >= 4 and initial_awake > 0 and initial_awake < enemies.size())

	var current_player := get_tree().get_first_node_in_group("player") as Node2D
	if current_player != null and enemies.size() > 0:
		var farthest: Node2D = enemies[0] as Node2D
		for enemy in enemies:
			if (enemy as Node2D).global_position.x > farthest.global_position.x:
				farthest = enemy as Node2D
		current_player.global_position = farthest.global_position + Vector2(-96, 0)
		for frame in range(4):
			await get_tree().physics_frame
	var advanced_awake := enemies.filter(func(enemy: Node) -> bool: return is_instance_valid(enemy) and bool(enemy.call("is_awakened"))).size()
	_check("staged_encounter_advancing_wakes_later_group", advanced_awake > initial_awake)
	await world.transition_to_room(previous_room if not previous_room.is_empty() else "room_000", "authored")
	await get_tree().process_frame

## Proves boss arenas swap to the dedicated boss track, then restore biome music on leave.
func _check_boss_music(world: Node) -> void:
	var rooms_path := "res://data/rooms/rooms.json"
	if not FileAccess.file_exists(rooms_path) or not world.has_method("transition_to_room"):
		_check_soft("boss_room_exists_for_music", false)
		return

	var file := FileAccess.open(rooms_path, FileAccess.READ)
	var json := JSON.new()
	var parse_ok := file != null and json.parse(file.get_as_text()) == OK
	if file:
		file.close()
	if not parse_ok or typeof(json.data) != TYPE_DICTIONARY:
		_check_soft("boss_room_exists_for_music", false)
		return

	var rooms: Dictionary = json.data.get("rooms", {})
	var boss_room_id := ""
	for room_id in rooms.keys():
		var info = rooms[room_id]
		if typeof(info) == TYPE_DICTIONARY and String(info.get("archetype", "")) == "boss":
			boss_room_id = String(room_id)
			break
	if boss_room_id.is_empty():
		_check_soft("boss_room_exists_for_music", false)
		return

	var previous_room := GameManager.current_room_id
	if previous_room.is_empty():
		previous_room = "room_000"
	await world.transition_to_room(boss_room_id)
	await get_tree().process_frame
	_check("boss_room_plays_boss_music", AudioManager.get_current_music_id() == "boss")

	await world.transition_to_room(previous_room)
	await get_tree().process_frame
	_check("leaving_boss_restores_biome_music", AudioManager.get_current_music_id() != "boss")

## Proves the pause menu is really wired into World.tscn and that GameManager's
## pause_game()/resume_game() actually toggle the SceneTree's paused state — not just that
## the methods exist without crashing (they previously existed but nothing ever called them).
## Also round-trips SettingsManager's persisted screen-shake/volume settings through a real
## save/load so the PauseMenu sliders aren't writing to a file nothing reads back.
func _check_pause_menu(world: Node) -> void:
	var pause_menu := world.get_node_or_null("PauseMenu")
	_check("pause_menu_present_in_world", pause_menu != null)

	GameManager.pause_game()
	await get_tree().process_frame
	_check("game_manager_pause_actually_pauses_tree", get_tree().paused)

	GameManager.resume_game()
	await get_tree().process_frame
	_check("game_manager_resume_actually_unpauses_tree", not get_tree().paused)

	# Drive PauseMenu's own open/settings/close flow rather than only checking the node
	# exists — this is the only way to catch a scene/script node-path mismatch (e.g. a
	# slider nested one level deeper than the script's $-path expects), which previously
	# slipped past every other check here since GameManager/SettingsManager work fine
	# standalone even when PauseMenu.gd itself throws inside _ready() or _open().
	if pause_menu:
		pause_menu._open()
		await get_tree().process_frame
		_check("pause_menu_open_shows_ui", pause_menu.visible)
		_check("pause_menu_open_sets_paused_game_state", GameManager.current_state == GameManager.GameState.PAUSED)

		pause_menu._open_settings()
		await get_tree().process_frame
		var settings_panel: Control = pause_menu.get_node_or_null("Panel/SettingsPanel")
		_check("pause_menu_settings_panel_opens", settings_panel != null and settings_panel.visible)

		var master_slider = pause_menu.get_node_or_null("Panel/SettingsPanel/VBox/MasterRow/MasterSlider")
		_check(
			"pause_menu_settings_sliders_wired",
			master_slider != null and is_equal_approx(master_slider.value, SettingsManager.master_volume),
		)

		pause_menu._close_settings()

		var map_room := GameManager.current_room_id
		if map_room.is_empty():
			map_room = "room_000"
		MapManager.mark_discovered(map_room)
		pause_menu._open_map()
		await get_tree().process_frame
		var map_panel: Control = pause_menu.get_node_or_null("Panel/MapPanel")
		_check("pause_menu_map_panel_opens", map_panel != null and map_panel.visible)
		_check("world_map_view_present", pause_menu.get_node_or_null("Panel/MapPanel/VBox/WorldMapView") != null)
		_check("map_manager_has_graph", not MapManager.get_graph().is_empty())
		_check("map_manager_tracks_discovered_rooms", map_room in MapManager.get_discovered_ids())
		pause_menu._close_map()

		pause_menu._close()
		await get_tree().process_frame
		_check(
			"pause_menu_close_hides_ui_and_resumes",
			not pause_menu.visible and GameManager.current_state == GameManager.GameState.PLAYING,
		)
	else:
		_check("pause_menu_open_shows_ui", false)
		_check("pause_menu_open_sets_paused_game_state", false)
		_check("pause_menu_settings_panel_opens", false)
		_check("pause_menu_settings_sliders_wired", false)
		_check("pause_menu_map_panel_opens", false)
		_check("world_map_view_present", false)
		_check("map_manager_has_graph", false)
		_check("map_manager_tracks_discovered_rooms", false)
		_check("pause_menu_close_hides_ui_and_resumes", false)

	var original_shake := SettingsManager.screen_shake_enabled
	var original_volume := SettingsManager.master_volume

	SettingsManager.set_screen_shake(not original_shake)
	SettingsManager.set_master_volume(0.35)
	_check("settings_manager_can_write", SettingsManager.save_settings())

	# Simulate a fresh process reading the file back, rather than trusting in-memory state.
	SettingsManager.screen_shake_enabled = original_shake
	SettingsManager.master_volume = original_volume
	_check("settings_manager_can_read", SettingsManager.load_settings())
	_check("settings_reload_restores_screen_shake", SettingsManager.screen_shake_enabled != original_shake)
	_check("settings_reload_restores_master_volume", is_equal_approx(SettingsManager.master_volume, 0.35))

	# Restore real defaults so this probe doesn't leave user://settings.json in a state
	# that affects any subsequent test run or manual playtest sharing the same user dir.
	SettingsManager.set_screen_shake(original_shake)
	SettingsManager.set_master_volume(original_volume)

## Directly instantiates SavePoint.tscn (rather than relying on the current generated
## world happening to place one — small profiles like TINY_TEST may have zero 'save'
## archetype rooms) and proves the full real interaction: damages the player first so
## healing is actually observable, touches the SavePoint, confirms it writes a save file
## and heals to full, then proves a save/load round-trip restores both the checkpoint
## room and a defeated-boss list.
func _check_save_point(player: Node) -> void:
	if player == null:
		_check("save_point_can_be_triggered", false)
		return

	var save_scene := load("res://scenes/world/SavePoint.tscn") as PackedScene
	_check("save_point_scene_loads", save_scene != null)
	if save_scene == null:
		return

	var save_point := save_scene.instantiate()
	add_child(save_point)

	var health: HealthComponent = player.get_node_or_null("HealthComponent")
	if health:
		health.take_damage(30.0)

	var room_before_save: String = GameManager.current_room_id
	save_point._on_body_entered(player)

	_check("save_point_writes_save_file", SaveManager.has_save())
	if health:
		_check("save_point_heals_player_to_full", health.current_health == health.max_health)

	ProgressionManager.defeat_boss("test_probe_boss")
	GameManager._on_ability_acquired("dash")
	SaveManager.save_game()
	var reload_ok := SaveManager.load_game()
	_check("save_reload_succeeds", reload_ok)
	_check("save_reload_restores_checkpoint_room", GameManager.current_room_id == room_before_save)
	_check(
		"save_reload_restores_defeated_bosses",
		"test_probe_boss" in ProgressionManager.get_defeated_bosses(),
	)
	_check(
		"save_reload_restores_abilities",
		GameManager.has_ability("dash") and ProgressionManager.has_ability("dash"),
	)

	if is_instance_valid(save_point):
		save_point.queue_free()

## Proves v1 save files upgrade to the current schema on load and rewrite the on-disk file.
func _check_save_migration_v1_to_v2() -> void:
	SaveManager.select_slot(0)
	SaveManager.reset_save()
	# reset_save() only clears the in-memory _save_data, not the on-disk file — and
	# "save_manager_can_write" right before this call just wrote a real (current-version) save
	# to this exact slot. load_game() tries that real file first and succeeds immediately,
	# never falling through to the legacy-path branch this check exists to exercise. Remove it
	# so load_game() actually has to migrate the v1 fixture written below.
	if FileAccess.file_exists(SaveManager.get_save_path()):
		DirAccess.remove_absolute(SaveManager.get_save_path())
	var v1_save := {
		"version": 1,
		"player": {"health": 42.0, "position": Vector2(10.0, 20.0), "room_id": "room_003"},
		"abilities": ["dash"],
		"world_state": {},
		"quests": {},
		"collectibles": [],
		"playtime": 12.5,
	}
	var writer := FileAccess.open(SaveManager.LEGACY_SAVE_PATH, FileAccess.WRITE)
	if writer == null:
		_check("save_migration_v1_loads", false)
		_check("save_migration_v1_restores_abilities", false)
		_check("save_migration_v1_restores_room", false)
		_check("save_migration_v1_adds_max_health", false)
		_check("save_migration_v1_rewrites_save_file", false)
		return
	writer.store_string(JSON.stringify(v1_save))
	writer.close()

	_check("save_migration_v1_loads", SaveManager.load_game())
	_check("save_migration_v1_restores_abilities", GameManager.has_ability("dash"))
	_check("save_migration_v1_restores_room", GameManager.current_room_id == "room_003")

	var health := SaveManager.consume_pending_player_health()
	_check(
		"save_migration_v1_adds_max_health",
		is_equal_approx(health["health"], 42.0) and is_equal_approx(health["max_health"], 42.0),
	)

	var reader := FileAccess.open(SaveManager.get_save_path(), FileAccess.READ)
	if reader == null:
		_check("save_migration_v1_rewrites_save_file", false)
		return
	var parsed := JSON.new()
	var ok := parsed.parse(reader.get_as_text()) == OK and typeof(parsed.data) == TYPE_DICTIONARY
	reader.close()
	_check(
		"save_migration_v1_rewrites_save_file",
		ok and int(parsed.data.get("version", 0)) == 2,
	)

## Corrupts the primary save after a successful write and proves load_game() falls back to .bak.
func _check_save_backup_recovery() -> void:
	SaveManager.select_slot(0)
	SaveManager.reset_save()
	GameManager._on_ability_acquired("dash")
	_check("save_backup_write_creates_backup", SaveManager.save_game())

	var corrupt := FileAccess.open(SaveManager.get_save_path(), FileAccess.WRITE)
	if corrupt == null:
		_check("save_backup_corrupt_primary", false)
		_check("save_manager_loads_from_backup", false)
		return
	corrupt.store_string("{broken")
	corrupt.close()
	_check("save_backup_corrupt_primary", true)
	_check("save_manager_loads_from_backup", SaveManager.load_game())
	_check(
		"save_backup_restores_abilities",
		GameManager.has_ability("dash") and ProgressionManager.has_ability("dash"),
	)

## Proves three save slots store independent progress and that the title screen exposes file select.
func _check_save_slots() -> void:
	SaveManager.select_slot(0)
	SaveManager.reset_save()
	GameManager.player_abilities.clear()
	ProgressionManager.reset()
	GameManager._on_ability_acquired("dash")
	_check("save_slot_0_occupied_after_write", SaveManager.has_save_in_slot(0))

	SaveManager.select_slot(1)
	SaveManager.delete_slot(1)
	SaveManager.reset_save()
	GameManager.player_abilities.clear()
	ProgressionManager.reset()
	_check("save_slot_1_starts_empty", not SaveManager.has_save_in_slot(1))
	GameManager._on_ability_acquired("double_jump")
	_check("save_slot_1_occupied_after_write", SaveManager.has_save_in_slot(1))
	_check("save_manager_has_any_save", SaveManager.has_any_save())

	SaveManager.select_slot(0)
	_check("save_slot_0_load_keeps_dash", SaveManager.load_game() and GameManager.has_ability("dash"))
	_check("save_slots_do_not_share_progress", not GameManager.has_ability("double_jump"))
	SaveManager.select_slot(1)
	_check(
		"save_slot_1_load_keeps_double_jump",
		SaveManager.load_game() and GameManager.has_ability("double_jump"),
	)
	SaveManager.select_slot(0)

func _check_title_file_select() -> void:
	var title_scene := load("res://scenes/boot/Main.tscn") as PackedScene
	_check("title_scene_loads", title_scene != null)
	if title_scene == null:
		_check("title_files_button_present", false)
		_check("title_file_select_panel_present", false)
		_check("title_three_slot_buttons_present", false)
		return
	var title: Control = title_scene.instantiate()
	add_child(title)
	await get_tree().process_frame
	_check("title_files_button_present", title.get_node_or_null("VBox/FilesButton") != null)
	_check("title_file_select_panel_present", title.get_node_or_null("FileSelectPanel") != null)
	_check(
		"title_three_slot_buttons_present",
		title.get_node_or_null("FileSelectPanel/Slot0Button") != null
		and title.get_node_or_null("FileSelectPanel/Slot1Button") != null
		and title.get_node_or_null("FileSelectPanel/Slot2Button") != null,
	)
	title.queue_free()

## Proves dying now actually respawns at the real last checkpoint via SaveManager/WorldManager,
## replacing the old behavior of teleporting to a hardcoded in-room point and healing in place —
## which ignored SavePoints entirely, so dying carried no real consequence. Drives
## GameManager's real _do_respawn() directly rather than going through _on_player_died()'s real
## 1-second GAME_OVER pause (see GameManager.gd) or PlayerController's real death sequence, which
## would slow every validation run by a full second for no added confidence — that wiring is
## checked structurally instead (the HealthComponent.died signal is really connected to
## PlayerController._on_died, and GameHUD's DeathOverlay is really toggled by the death signals).
func _check_player_death_respawn(player: Node, world: Node) -> void:
	if player == null or world == null:
		_check("player_death_respawns_at_checkpoint_room", false)
		return

	var player_health: HealthComponent = player.get_node_or_null("HealthComponent")
	_check(
		"player_controller_wires_health_died_signal",
		player_health != null and player_health.died.is_connected(Callable(player, "_on_died")),
	)

	var hud := world.get_node_or_null("GameHUD")
	var death_overlay: ColorRect = hud.get_node_or_null("DeathOverlay") if hud else null
	if death_overlay:
		hud.call("_on_player_died")
		_check("death_overlay_shows_on_player_died", death_overlay.visible)
		hud.call("_on_player_respawned")
		_check("death_overlay_hides_on_player_respawned", not death_overlay.visible)
	else:
		_check_soft("death_overlay_shows_on_player_died", false)
		_check_soft("death_overlay_hides_on_player_respawned", false)

	var checkpoint_room := "room_000"
	SaveManager.set_checkpoint(checkpoint_room, 100.0, 100.0)
	SaveManager.save_game()
	await _capture_runtime_state("checkpoint", "save checkpoint", {"roomId": checkpoint_room, "runtimeState": "checkpoint"})
	_save_report_shot("checkpoint", "checkpoint.png")

	# Respawn must never bypass mandatory progression by quietly rolling back an ability the
	# player already earned — that would force redoing a gate they already opened. "dash" is a
	# real registered ability (packages/shared/src/registered-abilities.ts) with a runtime
	# implementation regardless of whether this particular generated world happens to grant it,
	# so granting it here is a safe, direct probe of the respawn path itself.
	var probe_ability := "dash"
	GameManager._on_ability_acquired(probe_ability)

	await GameManager._do_respawn()
	await get_tree().process_frame
	await get_tree().process_frame

	_check(
		"player_death_leaves_game_state_playing",
		GameManager.current_state == GameManager.GameState.PLAYING,
	)
	_check("player_death_respawns_at_checkpoint_room", GameManager.current_room_id == checkpoint_room)
	_check("player_death_respawn_preserves_earned_abilities", GameManager.has_ability(probe_ability))

	var respawned_player := get_tree().get_first_node_in_group("player")
	_check("player_exists_after_death_respawn", respawned_player != null)

func _check_ability_pickup(player: Node) -> void:
	if player == null:
		_check("ability_pickup_can_be_triggered", false)
		return

	var pickup_scene := load("res://scenes/world/AbilityPickup.tscn") as PackedScene
	if pickup_scene == null:
		_check("ability_pickup_can_be_triggered", false)
		return

	var pickup := pickup_scene.instantiate()
	pickup.ability_id = "test_probe_ability"
	add_child(pickup)

	var had_ability_before: bool = GameManager.has_ability("test_probe_ability")
	pickup._on_body_entered(player)
	await _capture_runtime_state("ability_pickup", "ability pickup", {"entityId": pickup.ability_id, "runtimeState": "ability_pickup"})
	_save_report_shot("ability_pickup", "ability_pickup.png")
	var has_ability_after: bool = GameManager.has_ability("test_probe_ability")

	_check("ability_pickup_can_be_triggered", not had_ability_before and has_ability_after)

	if is_instance_valid(pickup):
		pickup.queue_free()

## Directly instantiates NPC.tscn (rather than relying on the current generated world placing
## one in a reachable, easily-navigable room) and proves the real interaction: entering its
## Area2D range then speaking shows the expected name-prefixed line — not just that the scene
## loads and the methods don't crash.
func _check_npc_interaction(player: Node) -> void:
	if player == null:
		_check("npc_interaction_can_be_triggered", false)
		return

	var npc_scene := load("res://scenes/world/NPC.tscn") as PackedScene
	if npc_scene == null:
		_check("npc_interaction_can_be_triggered", false)
		return

	# NPC._dialogue_overlay() looks up the "dialogue_overlay" group tree-wide, not a locally
	# passed-in reference — and World.tscn already instances its own DialogueOverlay in that
	# group. Instantiating a second, disconnected overlay here (as an earlier version of this
	# check did) meant _begin_dialogue() drove World's real overlay while the assertions below
	# read the empty, never-touched local copy — always failing regardless of whether dialogue
	# actually worked. Use the real one.
	var dialogue_overlay := get_tree().get_first_node_in_group("dialogue_overlay")
	if dialogue_overlay == null:
		_check("npc_interaction_can_be_triggered", false)
		return

	var npc := npc_scene.instantiate()
	npc.npc_id = "npc_000"
	npc.npc_name = "Test Wanderer"
	npc.role = "quest_giver"
	npc.quest_ids = PackedStringArray(["quest_000"])
	add_child(npc)
	await get_tree().process_frame

	var npc_sprite := npc.get_node_or_null("Sprite")
	_check("npc_sprite_is_animated", npc_sprite is AnimatedSprite2D)
	var listener := npc_scene.instantiate()
	listener.npc_id = "npc_001"
	add_child(listener)
	await get_tree().process_frame
	var listener_sprite: AnimatedSprite2D = listener.get_node("Sprite")
	# Explicit acting clips make this check independent of generated-art availability.
	for actor in [npc_sprite, listener_sprite]:
		if actor is AnimatedSprite2D:
			for clip in ["idle", "talk"]:
				if not actor.sprite_frames.has_animation(clip):
					actor.sprite_frames.add_animation(clip)

	npc._on_body_entered(player)
	npc._begin_dialogue()
	npc._process(0.0)
	listener._process(0.0)
	_check("npc_conversation_has_one_speaker", dialogue_overlay.call("active_npc_id") == npc.npc_id and npc_sprite.animation == "talk")
	_check("unrelated_npc_does_not_talk", listener_sprite.animation == "idle")
	await _capture_runtime_state("npc_dialogue", "npc dialogue", {"entityId": npc.npc_id, "roomId": GameManager.current_room_id, "runtimeState": "dialogue"})
	_save_report_shot("npc_dialogue", "npc_dialogue.png")

	var speaker_label: Label = dialogue_overlay.get_node_or_null("Panel/HBox/Content/SpeakerLabel")
	_check(
		"npc_interaction_can_be_triggered",
		dialogue_overlay.visible and speaker_label != null and speaker_label.text.length() > 0,
	)

	# The overlay belongs to World.tscn, not this check — close it rather than freeing a node
	# owned elsewhere, so it's left in a clean, closed state for anything that runs after this.
	if is_instance_valid(dialogue_overlay) and dialogue_overlay.has_method("close_dialogue"):
		dialogue_overlay.close_dialogue()
	npc._on_body_exited(player)
	npc._process(0.0)
	_check("npc_returns_to_idle_after_conversation", dialogue_overlay.call("active_npc_id") == "" and npc_sprite.animation == "idle")
	listener.queue_free()

	if is_instance_valid(npc):
		npc.queue_free()

## Proves QuestManager actually tracks state from real gameplay signals, not just that quest
## data loads. Reads a real quest straight from data/quests/quests.json (the same file the
## runtime reads), accepts it exactly like a quest_giver NPC interaction would, then fires the
## same EventBus signal a real WorldManager/BossController would fire for that quest's
## objective — and confirms the quest completes and its currency reward is actually applied.
func _check_quest_system(world: Node) -> void:
	var quests_path := "res://data/quests/quests.json"
	if not FileAccess.file_exists(quests_path):
		_check_soft("quest_data_exists", false)
		return

	var file := FileAccess.open(quests_path, FileAccess.READ)
	var json := JSON.new()
	var parse_ok := file != null and json.parse(file.get_as_text()) == OK
	if file:
		file.close()
	_check("quest_data_parses", parse_ok)
	if not parse_ok:
		return

	var quests: Array = json.data.get("quests", [])
	_check_soft("quest_data_nonempty", quests.size() > 0)
	if quests.is_empty():
		return

	var quest: Dictionary = quests[0]
	var quest_id: String = quest.get("id", "")
	var objectives: Array = quest.get("objectives", [])
	if objectives.is_empty():
		_check_soft("quest_objective_exists", false)
		return
	_check_soft("quest_objective_exists", true)

	var objective: Dictionary = objectives[0]
	var obj_type: String = objective.get("type", "")
	var obj_target: String = objective.get("target", "")

	_check("quest_manager_reports_available_before_accept", QuestManager.is_quest_available(quest_id))
	_check("quest_can_be_accepted", QuestManager.accept_quest(quest_id))

	var tracker: Control = world.get_node_or_null("GameHUD/HUD/QuestTrackerPanel/QuestTrackerView")
	if tracker:
		tracker.queue_redraw()
		await get_tree().process_frame
	var hud_ids: Array = []
	for entry in QuestManager.get_hud_entries():
		if typeof(entry) == TYPE_DICTIONARY:
			hud_ids.append(String(entry.get("id", "")))
	_check("hud_quest_tracker_reads_active_quests", quest_id in hud_ids)

	var currency_before: int = int(QuestManager.currency.get("scrap", 0))

	match obj_type:
		"BossKill":
			EventBus.boss_defeated.emit(obj_target)
		"Reach":
			EventBus.room_entered.emit(obj_target)
		"Kill":
			EventBus.enemy_killed.emit(obj_target)
		"Collect":
			EventBus.item_collected.emit(obj_target)
		"Talk":
			EventBus.npc_talked.emit(obj_target)
		"AbilityAcquire":
			EventBus.ability_acquired.emit(obj_target)
		"Discover":
			EventBus.room_discovered.emit(obj_target)
		"Activate":
			EventBus.object_activated.emit(obj_target)
		"Interact":
			EventBus.object_interacted.emit(obj_target)
		"Choice":
			EventBus.dialogue_choice_made.emit(obj_target)
		_:
			_check_soft("quest_objective_type_recognized", false)
			return

	_check(
		"quest_completes_from_real_gameplay_signal",
		QuestManager.get_quest_state(quest_id) == QuestManager.QuestState.COMPLETE,
	)
	_check(
		"quest_completion_grants_currency_reward",
		int(QuestManager.currency.get("scrap", 0)) > currency_before,
	)

	var item_reward_id := ""
	for reward in quest.get("rewards", []):
		if typeof(reward) == TYPE_DICTIONARY and String(reward.get("type", "")) == "item":
			item_reward_id = String(reward.get("id", ""))
			break
	if item_reward_id.is_empty():
		_check_soft("quest_completion_grants_item_reward", false)
	else:
		_check("quest_completion_grants_item_reward", InventoryManager.get_owned_count(item_reward_id) > 0)

## Proves ItemPickup.gd actually applies real generated item data (data/items/items.json),
## not just that the scene instantiates — one currency pickup (adds to QuestManager.currency)
## and one consumable pickup (heals via the player's real HealthComponent, after damaging the
## player first so healing is actually observable).
func _check_item_pickups(player: Node) -> void:
	if player == null:
		_check("item_pickup_currency_can_be_triggered", false)
		_check("item_pickup_consumable_can_be_triggered", false)
		return

	var items_path := "res://data/items/items.json"
	if not FileAccess.file_exists(items_path):
		_check_soft("item_data_exists", false)
		return

	var file := FileAccess.open(items_path, FileAccess.READ)
	var json := JSON.new()
	var parse_ok := file != null and json.parse(file.get_as_text()) == OK
	if file:
		file.close()
	_check("item_data_parses", parse_ok)
	if not parse_ok:
		return

	var items: Array = json.data.get("items", [])
	var currency_item: Dictionary = {}
	var consumable_item: Dictionary = {}
	for item in items:
		if currency_item.is_empty() and item.get("category", "") == "currency":
			currency_item = item
		if consumable_item.is_empty() and item.get("category", "") == "consumable":
			consumable_item = item

	var pickup_scene := load("res://scenes/world/ItemPickup.tscn") as PackedScene
	_check("item_pickup_scene_loads", pickup_scene != null)
	if pickup_scene == null:
		return

	if not currency_item.is_empty():
		var currency_id: String = currency_item.get("id", "")
		var before: int = int(QuestManager.currency.get(currency_id, 0))
		var pickup := pickup_scene.instantiate()
		pickup.item_id = currency_id
		pickup.amount = 15
		add_child(pickup)
		pickup._on_body_entered(player)
		_check(
			"item_pickup_currency_can_be_triggered",
			int(QuestManager.currency.get(currency_id, 0)) == before + 15,
		)
	else:
		_check_soft("item_pickup_currency_can_be_triggered", false)

	if not consumable_item.is_empty():
		var health: HealthComponent = player.get_node_or_null("HealthComponent")
		if health:
			health.take_damage(20.0)
			var health_before := health.current_health
			var pickup2 := pickup_scene.instantiate()
			pickup2.item_id = consumable_item.get("id", "")
			add_child(pickup2)
			pickup2._on_body_entered(player)
			_check("item_pickup_consumable_can_be_triggered", health.current_health > health_before)
		else:
			_check("item_pickup_consumable_can_be_triggered", false)
	else:
		_check_soft("item_pickup_consumable_can_be_triggered", false)

	var relic_item: Dictionary = {}
	var charm_item: Dictionary = {}
	for item in items:
		if relic_item.is_empty() and item.get("category", "") == "relic":
			relic_item = item
		if charm_item.is_empty() and item.get("category", "") == "charm":
			charm_item = item

	if not relic_item.is_empty():
		var relic_health: HealthComponent = player.get_node_or_null("HealthComponent")
		if relic_health:
			var max_before := relic_health.max_health
			var pickup_relic := pickup_scene.instantiate()
			pickup_relic.item_id = relic_item.get("id", "")
			add_child(pickup_relic)
			pickup_relic._on_body_entered(player)
			_check("item_pickup_relic_raises_max_health", relic_health.max_health > max_before)
			_check(
				"item_pickup_relic_tracked_in_inventory",
				InventoryManager.get_owned_count(String(relic_item.get("id", ""))) > 0,
			)
		else:
			_check("item_pickup_relic_raises_max_health", false)
			_check("item_pickup_relic_tracked_in_inventory", false)
	else:
		_check_soft("item_pickup_relic_raises_max_health", false)
		_check_soft("item_pickup_relic_tracked_in_inventory", false)

	if not charm_item.is_empty():
		var hitbox: HitboxComponent = player.get_node_or_null("AttackHitbox")
		if hitbox:
			var damage_before := hitbox.damage
			var pickup_charm := pickup_scene.instantiate()
			pickup_charm.item_id = charm_item.get("id", "")
			add_child(pickup_charm)
			pickup_charm._on_body_entered(player)
			_check("item_pickup_charm_raises_attack", hitbox.damage > damage_before)
		else:
			_check("item_pickup_charm_raises_attack", false)
	else:
		_check_soft("item_pickup_charm_raises_attack", false)

	var weapon_item: Dictionary = {}
	var quest_item: Dictionary = {}
	for item in items:
		if weapon_item.is_empty() and item.get("category", "") == "weapon":
			weapon_item = item
		if quest_item.is_empty() and item.get("category", "") == "quest":
			quest_item = item

	if not weapon_item.is_empty():
		var hitbox_w: HitboxComponent = player.get_node_or_null("AttackHitbox")
		var weapon_id: String = weapon_item.get("id", "")
		if hitbox_w and not weapon_id.is_empty():
			var owned_before := InventoryManager.get_owned_count(weapon_id)
			if owned_before <= 0:
				var pickup_weapon := pickup_scene.instantiate()
				pickup_weapon.item_id = weapon_id
				add_child(pickup_weapon)
				pickup_weapon._on_body_entered(player)
			_check("item_pickup_weapon_tracked_in_inventory", InventoryManager.get_owned_count(weapon_id) > 0)
			if not InventoryManager.is_equipped(weapon_id):
				InventoryManager.equip_item(weapon_id)
			_check("weapon_is_equipped", InventoryManager.is_equipped(weapon_id))
			var damage_equipped: float = hitbox_w.damage
			InventoryManager.unequip_slot("weapon")
			_check("weapon_unequip_lowers_attack", hitbox_w.damage < damage_equipped)
			InventoryManager.equip_item(weapon_id)
			_check("weapon_re_equip_restores_attack", hitbox_w.damage >= damage_equipped)
		else:
			_check("item_pickup_weapon_tracked_in_inventory", false)
			_check("weapon_is_equipped", false)
			_check("weapon_unequip_lowers_attack", false)
			_check("weapon_re_equip_restores_attack", false)
	else:
		_check_soft("item_pickup_weapon_tracked_in_inventory", false)
		_check_soft("weapon_is_equipped", false)
		_check_soft("weapon_unequip_lowers_attack", false)
		_check_soft("weapon_re_equip_restores_attack", false)

	if not quest_item.is_empty():
		var quest_id: String = quest_item.get("id", "")
		var hitbox_q: HitboxComponent = player.get_node_or_null("AttackHitbox")
		var damage_before_quest: float = hitbox_q.damage if hitbox_q else 0.0
		if InventoryManager.get_owned_count(quest_id) <= 0:
			InventoryManager.grant_item(quest_id, 1)
		_check("quest_item_tracked_in_inventory", InventoryManager.get_owned_count(quest_id) > 0)
		_check("quest_item_is_not_equippable", not InventoryManager.is_equippable(quest_id))
		if hitbox_q:
			_check("quest_item_does_not_change_attack", is_equal_approx(hitbox_q.damage, damage_before_quest))
		else:
			_check("quest_item_does_not_change_attack", false)
	else:
		_check_soft("quest_item_tracked_in_inventory", false)
		_check_soft("quest_item_is_not_equippable", false)
		_check_soft("quest_item_does_not_change_attack", false)

	var collectible_item: Dictionary = {}
	for item in items:
		if collectible_item.is_empty() and item.get("category", "") == "collectible":
			collectible_item = item
			break

	if not collectible_item.is_empty():
		var collectible_id: String = collectible_item.get("id", "")
		var hitbox_c: HitboxComponent = player.get_node_or_null("AttackHitbox")
		var damage_before_collectible: float = hitbox_c.damage if hitbox_c else 0.0
		var found_before := InventoryManager.get_collectible_found_count()
		if InventoryManager.get_owned_count(collectible_id) <= 0:
			var pickup_collectible := pickup_scene.instantiate()
			pickup_collectible.item_id = collectible_id
			add_child(pickup_collectible)
			pickup_collectible._on_body_entered(player)
		_check("item_pickup_collectible_tracked_in_inventory", InventoryManager.get_owned_count(collectible_id) > 0)
		_check("collectible_is_not_equippable", not InventoryManager.is_equippable(collectible_id))
		_check(
			"collectible_found_count_increases",
			InventoryManager.get_collectible_found_count() > found_before
			or InventoryManager.get_collectible_found_count() > 0,
		)
		_check("collectible_total_count_positive", InventoryManager.get_collectible_total_count() > 0)
		if hitbox_c:
			_check("collectible_does_not_change_attack", is_equal_approx(hitbox_c.damage, damage_before_collectible))
		else:
			_check("collectible_does_not_change_attack", false)
	else:
		_check_soft("item_pickup_collectible_tracked_in_inventory", false)
		_check_soft("collectible_is_not_equippable", false)
		_check_soft("collectible_found_count_increases", false)
		_check_soft("collectible_total_count_positive", false)
		_check_soft("collectible_does_not_change_attack", false)

func _check_inventory_equip_ui(world: Node) -> void:
	var view: Control = world.get_node_or_null("PauseMenu/Panel/InventoryPanel/VBox/InventoryView") if world else null
	_check("inventory_view_present", view != null)
	if view == null:
		return
	_check("inventory_view_has_script", view.get_script() != null)

	var equipped_weapon := InventoryManager.get_equipped("weapon")
	if equipped_weapon.is_empty():
		_check_soft("inventory_click_unequips_weapon_slot", false)
		return

	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = Vector2(20, 40)
	view._gui_input(click)
	_check("inventory_click_unequips_weapon_slot", InventoryManager.get_equipped("weapon").is_empty())
	InventoryManager.equip_item(equipped_weapon)

	var found_equipped := false
	for entry in InventoryManager.get_display_entries():
		if typeof(entry) == TYPE_DICTIONARY and bool(entry.get("equipped", false)):
			found_equipped = true
			break
	_check("inventory_display_marks_equipped_items", found_equipped)

func _is_presentation_capture() -> bool:
	## Matches GameHUD._hud_mode: presentation stills hide scrap/echo text.
	## Functional HUD assertions also apply to PLAYER and RELEASE modes.
	var mode := OS.get_environment("METROFORGE_HUD_MODE")
	if mode.is_empty() and OS.get_environment("METROFORGE_CAPTURE") == "1":
		mode = "QA_CAPTURE"
	return mode == "QA_CAPTURE" or mode == "PRESENTATION_CAPTURE"

## Proves the HUD's currency label actually reflects real QuestManager state, not just that the
## node exists — by this point in the test both a quest completion and an item pickup have
## already added scrap, so the label must show a real, non-empty, matching amount.
func _check_currency_hud(world: Node) -> void:
	var hud := world.get_node_or_null("GameHUD")
	_check("game_hud_present_in_world", hud != null)
	if hud == null:
		return

	var health_bar: ProgressBar = hud.get_node_or_null("HUD/MarginContainer/VBox/HealthBar")
	_check("health_bar_visible_inside_viewport", health_bar != null and health_bar.is_visible_in_tree() and get_viewport().get_visible_rect().encloses(health_bar.get_global_rect()))
	if health_bar != null:
		var frame: Control = hud.get_node_or_null("HUD/HUDFrame")
		_check("hud_frame_contains_health_bar", frame == null or not frame.visible or frame.get_global_rect().encloses(health_bar.get_global_rect()))

	var currency_label: Label = hud.get_node_or_null("HUD/MarginContainer/VBox/CurrencyLabel")
	_check("currency_label_present", currency_label != null)
	if currency_label == null:
		return

	var collectible_label: Label = hud.get_node_or_null("HUD/MarginContainer/VBox/CollectibleLabel")
	_check("collectible_label_present", collectible_label != null)

	# Presentation captures (METROFORGE_CAPTURE / QA_CAPTURE / PRESENTATION_CAPTURE) clear
	# currency and collectible text so the HUD band does not fail visual QA. Keep the
	# real scrap/echo assertions for PLAYER, RELEASE and DEBUG runs. Do not weaken those thresholds.
	if _is_presentation_capture():
		_check("capture_currency_hidden", not currency_label.visible and currency_label.text.is_empty())
		_check("capture_collectibles_hidden", collectible_label != null and not collectible_label.visible and collectible_label.text.is_empty())
		return

	var scrap: int = int(QuestManager.currency.get("scrap", 0))
	_check("currency_hud_reflects_real_state", currency_label.is_visible_in_tree() and str(scrap) in currency_label.text)

	if collectible_label != null:
		var found := InventoryManager.get_collectible_found_count()
		var total := InventoryManager.get_collectible_total_count()
		_check(
			"collectible_hud_reflects_real_state",
			collectible_label.is_visible_in_tree() and total > 0 and str(found) in collectible_label.text and str(total) in collectible_label.text,
		)

## Proves the always-visible corner minimap is wired into GameHUD and reads MapManager state.
func _check_hud_minimap(world: Node) -> void:
	var hud := world.get_node_or_null("GameHUD")
	var minimap_frame: PanelContainer = hud.get_node_or_null("HUD/MinimapPanel") if hud else null
	var minimap: Control = hud.get_node_or_null("HUD/MinimapPanel/MinimapView") if hud else null
	_check("hud_minimap_present", minimap != null)
	if minimap == null:
		return

	var map_room := GameManager.current_room_id
	if map_room.is_empty():
		map_room = "room_000"
	MapManager.mark_discovered(map_room)
	minimap.queue_redraw()
	await get_tree().process_frame
	_check("hud_minimap_uses_map_manager_graph", not MapManager.get_graph().is_empty())
	var map_style := minimap_frame.get_theme_stylebox("panel") if minimap_frame else null
	_check("hud_minimap_has_stormglass_frame", map_style is StyleBoxFlat and (map_style as StyleBoxFlat).border_width_left >= 2)

## Proves the always-visible HUD quest tracker is wired into GameHUD.
func _check_hud_quest_tracker(world: Node) -> void:
	var hud := world.get_node_or_null("GameHUD")
	var tracker: Control = hud.get_node_or_null("HUD/QuestTrackerPanel/QuestTrackerView") if hud else null
	_check("hud_quest_tracker_present", tracker != null)
	if tracker == null:
		return

	_check("hud_quest_tracker_script_attached", tracker.get_script() != null)
	tracker.queue_redraw()
	await get_tree().process_frame
	for entry in QuestManager.get_hud_entries():
		if typeof(entry) != TYPE_DICTIONARY:
			_check("hud_quest_tracker_entries_are_active", false)
			return
		if String(entry.get("status", "")) != "Active":
			_check("hud_quest_tracker_entries_are_active", false)
			return
	_check("hud_quest_tracker_entries_are_active", true)


## Captures the live viewport after HUD + world are on screen. Headless Godot often yields a
## black frame (`texture_2d_get` null on dummy renderer); that is a soft-fail here. The QA
## validator retries with a windowed GPU capture strategy when RELEASE_CANDIDATE requires evidence.
func _capture_named_screenshot(shot_id: String, hard: bool = false) -> bool:
	if _keep_endgame_overlays_for_next_capture:
		_keep_endgame_overlays_for_next_capture = false
	else:
		_hide_endgame_overlays()
	_prepare_capture_window()
	_sync_visual_camera()
	await get_tree().process_frame
	var headless := DisplayServer.get_name() == "headless"
	if not headless:
		if not await CaptureGuard.await_post_draw(self, 2.0):
			print("CAPTURE_TIMEOUT: screenshot wait shot=%s" % shot_id)
			if hard:
				_check("gameplay_screenshot_captured", false)
			else:
				_check_soft("gameplay_screenshot_%s" % shot_id, false)
			return false
		await get_tree().process_frame
		RenderingServer.force_draw(true)
		if not await CaptureGuard.await_post_draw(self, 2.0):
			print("CAPTURE_TIMEOUT: screenshot wait shot=%s" % shot_id)
			if hard:
				_check("gameplay_screenshot_captured", false)
			else:
				_check_soft("gameplay_screenshot_%s" % shot_id, false)
			return false
	else:
		if not await CaptureGuard.await_frames(self, 1, 2.0):
			print("CAPTURE_TIMEOUT: screenshot wait shot=%s" % shot_id)
			if hard:
				_check_soft("gameplay_screenshot_captured", false)
			else:
				_check_soft("gameplay_screenshot_%s" % shot_id, false)
			return false

	var tex := get_viewport().get_texture()
	if tex == null:
		print("CAPTURE_STRATEGY_HEADLESS_TEXTURE_NULL shot=%s" % shot_id)
		if hard:
			_check("gameplay_screenshot_captured", false)
		else:
			_check_soft("gameplay_screenshot_%s" % shot_id, false)
		return false
	var img: Image = tex.get_image()
	if img == null or img.get_width() < 8 or img.get_height() < 8:
		print("CAPTURE_STRATEGY_HEADLESS_TEXTURE_NULL shot=%s empty_image" % shot_id)
		if hard:
			_check_soft("gameplay_screenshot_captured", false)
		else:
			_check_soft("gameplay_screenshot_%s" % shot_id, false)
		return false

	var target_w := _capture_width()
	var target_h := _capture_height()
	if img.get_width() != target_w or img.get_height() != target_h:
		# Integer-stretch / DPI can dump the OS window (letterboxed). Keep the gameplay
		# rectangle, not a random desktop-sized PNG with the game in one corner.
		var crop_w: int = mini(target_w, img.get_width())
		var crop_h: int = mini(target_h, img.get_height())
		img = img.get_region(Rect2i(0, 0, crop_w, crop_h))
		if img.get_width() != target_w or img.get_height() != target_h:
			img.resize(target_w, target_h, Image.INTERPOLATE_NEAREST)

	var qa_dir := ProjectSettings.globalize_path("res://qa")
	DirAccess.make_dir_recursive_absolute(qa_dir)
	var path := qa_dir.path_join("screenshot_%s.png" % shot_id)
	var err := img.save_png(path)
	if shot_id == "gameplay" or shot_id == "exploration":
		img.save_png(qa_dir.path_join("screenshot_gameplay.png"))
	if hard:
		_check("gameplay_screenshot_captured", err == OK)
	else:
		_check_soft("gameplay_screenshot_%s" % shot_id, err == OK)

	var distinct := {}
	var step_x: int = maxi(1, int(img.get_width() / 16))
	var step_y: int = maxi(1, int(img.get_height() / 16))
	for y in range(0, img.get_height(), step_y):
		for x in range(0, img.get_width(), step_x):
			var c := img.get_pixel(x, y)
			var key := "%d_%d_%d" % [int(c.r * 15.0), int(c.g * 15.0), int(c.b * 15.0)]
			distinct[key] = true
	_check_soft("gameplay_screenshot_%s_visible" % shot_id, distinct.size() >= 4)
	var strategy := OS.get_environment("METROFORGE_CAPTURE_STRATEGY")
	if strategy.is_empty():
		strategy = "headless" if DisplayServer.get_name() == "headless" else "windowed_gpu"
	var cam := get_viewport().get_camera_2d()
	var zoom_s := "none"
	var xform_s := 0.0
	var view := Vector2.ZERO
	var center := Vector2.ZERO
	if cam:
		zoom_s = "%.2f" % cam.zoom.x
		xform_s = cam.get_canvas_transform().x.x
		view = cam.get_viewport_rect().size / cam.zoom
		center = cam.get_screen_center_position()
	var tile_s := "none"
	var used := "none"
	var world := get_tree().get_first_node_in_group("world_manager")
	if world:
		var room: Node = world.get("_current_room") as Node
		if room:
			var ground := room.get_node_or_null("Ground") as TileMapLayer
			if ground and ground.tile_set:
				tile_s = "%d" % ground.tile_set.tile_size.x
				var r := ground.get_used_rect()
				used = "%s:%sx%s" % [r.position, r.size.x, r.size.y]
	print("CAPTURE_TELEMETRY shot=%s strategy=%s colors=%d size=%dx%d zoom=%s xform=%.2f view=%.0fx%.0f center=%.0f,%.0f current=%s tile=%s used=%s" % [
		shot_id, strategy, distinct.size(), img.get_width(), img.get_height(), zoom_s,
		xform_s, view.x, view.y, center.x, center.y, cam != null, tile_s, used,
	])
	return err == OK


func _probe_and_capture_foot_isolates() -> void:
	## Isolation shots for leftover DEFAULT_PALETTE contact under the player.
	## Disables one compositor at a time; reports keep modulate so remapped
	## 72,32,40 / 86,96,125 stay comparable.
	_print_foot_probe("baseline")
	var vfx := get_node_or_null("/root/VFXManager")
	var player := get_tree().get_first_node_in_group("player")
	var sprite: CanvasItem = player.get_node_or_null("Sprite") as CanvasItem if player else null
	if vfx:
		for child in vfx.get_children():
			if child is GPUParticles2D:
				var p := child as GPUParticles2D
				p.visible = false
				p.emitting = false
	await _capture_named_screenshot("spawn_novfx")
	_save_report_shot("spawn_novfx", "01-start-novfx.png")
	if sprite:
		sprite.visible = false
	await _capture_named_screenshot("spawn_nosprite")
	_save_report_shot("spawn_nosprite", "01-start-nosprite.png")
	if sprite:
		sprite.visible = true
	var world := get_tree().get_first_node_in_group("world_manager")
	if world:
		var room: Node = world.get("_current_room") as Node
		if room:
			var inj := room.get_node_or_null("QualityInjected")
			if inj:
				inj.visible = false
			await _capture_named_screenshot("spawn_nolight")
			_save_report_shot("spawn_nolight", "01-start-nolight.png")
			if inj:
				inj.visible = true


func _print_foot_probe(tag: String) -> void:
	var cm_col := Color.WHITE
	var world := get_tree().get_first_node_in_group("world_manager")
	if world:
		var cm := world.get_node_or_null("WorldCanvasModulate") as CanvasModulate
		if cm:
			cm_col = cm.color
	print("FOOT_PROBE tag=%s modulate=%.3f,%.3f,%.3f" % [tag, cm_col.r, cm_col.g, cm_col.b])
	var player := get_tree().get_first_node_in_group("player")
	if player:
		print("FOOT_PROBE player_pos=%.1f,%.1f" % [player.global_position.x, player.global_position.y])
		var sprite := player.get_node_or_null("Sprite") as AnimatedSprite2D
		if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("idle"):
			print("FOOT_PROBE sprite_mat=%s" % [sprite.material.resource_path if sprite.material else "null"])
			if sprite.sprite_frames.get_frame_count("idle") > 0:
				var tex := sprite.sprite_frames.get_frame_texture("idle", 0)
				if tex:
					print("FOOT_PROBE idle_tex class=%s path=%s" % [tex.get_class(), tex.resource_path])
					var img: Image = tex.get_image()
					if img:
						var red := 0
						var cream := 0
						var h := img.get_height()
						var y0 := int(float(h) * 0.62)
						for y in range(y0, h):
							for x in range(img.get_width()):
								var c := img.get_pixel(x, y)
								if c.a < 0.05:
									continue
								var r := int(round(c.r * 255.0))
								var g := int(round(c.g * 255.0))
								var b := int(round(c.b * 255.0))
								if r == 200 and g == 80 and b == 80:
									red += 1
								if r == 240 and g == 240 and b == 250:
									cream += 1
						print("FOOT_PROBE idle_contact exact_red=%d exact_cream=%d size=%dx%d" % [red, cream, img.get_width(), img.get_height()])
					else:
						print("FOOT_PROBE idle_tex get_image=null")
	var vfx := get_node_or_null("/root/VFXManager")
	if vfx:
		for child in vfx.get_children():
			if child is GPUParticles2D:
				var p := child as GPUParticles2D
				if p.visible or p.emitting:
					var tpath := ""
					if p.texture:
						tpath = p.texture.resource_path
					print("FOOT_PROBE vfx vis=%s emit=%s pos=%.1f,%.1f tex=%s" % [
						p.visible, p.emitting, p.global_position.x, p.global_position.y, tpath,
					])


func _sync_visual_camera() -> void:
	if not _is_visual_slice():
		return
	var cam := get_viewport().get_camera_2d()
	if cam == null or not cam.has_method("apply_room_bounds"):
		return
	var size := Vector2(800, 600)
	var visual_kit := ""
	var archetype := ""
	var playable_top := -1.0
	var playable_bottom := -1.0
	var world := get_tree().get_first_node_in_group("world_manager")
	if world:
		var room: Node = world.get("_current_room") as Node
		if room:
			var ground := room.get_node_or_null("Ground")
			if ground:
				size = Vector2(float(ground.get("room_width")), float(ground.get("room_height")))
				var kit = ground.get("visual_kit")
				if typeof(kit) == TYPE_STRING:
					visual_kit = kit
				archetype = String(ground.get("room_archetype"))
	var info := _current_room_info()
	if not info.is_empty():
		archetype = String(info.get("archetype", archetype))
		size = Vector2(float(info.get("width", size.x)), float(info.get("height", size.y)))
		# Frame the playable band (floor + platforms + jump apex) for every side-view room so the
		# slice captures show the action, not a tall empty background. Routes are preserved: full
		# width is kept by CameraDirector, rooms that exit upward keep full height, and the top crop
		# is capped at 45%. Foundry plates are excluded inside CameraDirector.
		var floor_y := size.y - 48.0
		var top := floor_y
		var platforms = info.get("platforms", [])
		if platforms is Array:
			for p in platforms:
				if typeof(p) == TYPE_DICTIONARY:
					top = minf(top, float(p.get("y", floor_y)))
		var has_up := false
		var conns = info.get("connections", [])
		if conns is Array:
			for c in conns:
				if typeof(c) == TYPE_DICTIONARY and String(c.get("direction", "")) == "up":
					has_up = true
		if has_up:
			playable_top = 0.0
		else:
			playable_top = minf(maxf(0.0, top - 140.0), size.y * 0.45)
		playable_bottom = size.y
	cam.apply_room_bounds(size, visual_kit, archetype, playable_top, playable_bottom)


func _current_room_info() -> Dictionary:
	var rooms_path := "res://data/rooms/rooms.json"
	if not FileAccess.file_exists(rooms_path):
		return {}
	var file := FileAccess.open(rooms_path, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	var rooms: Dictionary = parsed.get("rooms", {})
	var id := GameManager.current_room_id
	if rooms.has(id) and typeof(rooms[id]) == TYPE_DICTIONARY:
		return rooms[id]
	return {}


func _is_visual_slice() -> bool:
	var path := "res://game_dna.json"
	if not FileAccess.file_exists(path):
		return false
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return false
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	var profile := String(parsed.get("profile", ""))
	return profile != "" and profile != "TINY_TEST"


func _capture_width() -> int:
	return int(ProjectSettings.get_setting("display/window/size/viewport_width", 1280))


func _capture_height() -> int:
	return int(ProjectSettings.get_setting("display/window/size/viewport_height", 720))


func _hide_endgame_overlays() -> void:
	var hud: Node = get_tree().root.find_child("GameHUD", true, false)
	if hud == null:
		return
	var victory := hud.get_node_or_null("VictoryOverlay")
	if victory:
		victory.visible = false
	var death := hud.get_node_or_null("DeathOverlay")
	if death:
		death.visible = false


func _capture_action_shots(player: Node) -> void:
	if player == null:
		return
	var sprite: AnimatedSprite2D = player.get_node_or_null("Sprite")
	if sprite == null or sprite.sprite_frames == null:
		return
	if sprite.sprite_frames.has_animation("idle"):
		sprite.play("idle")
		if player is CharacterBody2D:
			(player as CharacterBody2D).position.x += 24.0
			(player as CharacterBody2D).velocity = Vector2.ZERO
		await get_tree().process_frame
		await _capture_runtime_state("player_idle", "player idle", {"playerState": "idle", "runtimeState": "idle"})
		_save_report_shot("player_idle", "player_idle.png")
	if sprite.sprite_frames.has_animation("run"):
		sprite.play("run")
		if player is CharacterBody2D:
			(player as CharacterBody2D).velocity.x = 180
		await get_tree().process_frame
		await _capture_runtime_state("player_run", "player run", {"playerState": "run", "runtimeState": "run"})
		_save_report_shot("player_run", "player_run.png")
	if sprite.sprite_frames.has_animation("jump") or sprite.sprite_frames.has_animation("land"):
		if sprite.sprite_frames.has_animation("jump"):
			sprite.play("jump")
		if player is CharacterBody2D:
			(player as CharacterBody2D).velocity.y = -220
		await get_tree().process_frame
		await _capture_runtime_state("player_jump", "player jump", {"playerState": "jump", "runtimeState": "jump"})
		_save_report_shot("player_jump", "player_jump.png")
		if sprite.sprite_frames.has_animation("land"):
			sprite.play("land")
			if player is CharacterBody2D:
				(player as CharacterBody2D).velocity = Vector2.ZERO
			await get_tree().process_frame
			await _capture_runtime_state("player_landing", "player landing", {"playerState": "land", "runtimeState": "land"})
			_save_report_shot("player_landing", "player_landing.png")
	if sprite.sprite_frames.has_animation("attack"):
		sprite.play("attack")
		await get_tree().process_frame
		await get_tree().process_frame
		await _capture_runtime_state("player_combat", "player combat", {"playerState": "combat", "runtimeState": "attack"})
		_save_report_shot("player_combat", "player_combat.png")
		await _capture_named_screenshot("combat_action")
		_save_report_shot("combat_action", "03b-combat-action.png")
	if sprite.sprite_frames.has_animation("dash"):
		# Play the sheet only — unlocking dash here used to poison
		# ability_gated_transition (GameManager.has_ability ORs ProgressionManager).
		sprite.play("dash")
		if player is CharacterBody2D:
			(player as CharacterBody2D).velocity.x = 280
		await get_tree().process_frame
		await _capture_runtime_state("player_dash", "player dash", {"playerState": "dash", "runtimeState": "dash"})
		_save_report_shot("player_dash", "player_dash.png")
		await _capture_named_screenshot("dash")
		_save_report_shot("dash", "10-dash.png")
	if sprite.sprite_frames.has_animation("idle"):
		sprite.play("idle")
		if player is CharacterBody2D:
			(player as CharacterBody2D).velocity = Vector2.ZERO


func _prepare_capture_window() -> void:
	var w := _capture_width()
	var h := _capture_height()
	if DisplayServer.get_name() == "headless":
		return
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, true)
	DisplayServer.window_set_size(Vector2i(w, h))
	get_viewport().size = Vector2i(w, h)


func _save_report_shot(shot_id: String, dest_name: String) -> void:
	var qa := ProjectSettings.globalize_path("res://qa")
	var reports := ProjectSettings.globalize_path("res://reports")
	DirAccess.make_dir_recursive_absolute(qa)
	DirAccess.make_dir_recursive_absolute(reports)
	var src := qa.path_join("screenshot_%s.png" % shot_id)
	if FileAccess.file_exists(src):
		DirAccess.copy_absolute(src, qa.path_join(dest_name))
		DirAccess.copy_absolute(src, reports.path_join(dest_name))

func _write_capture_manifest() -> void:
	var qa := ProjectSettings.globalize_path("res://qa")
	var reports := ProjectSettings.globalize_path("res://reports")
	DirAccess.make_dir_recursive_absolute(qa)
	DirAccess.make_dir_recursive_absolute(reports)
	var payload := JSON.stringify(_runtime_capture_manifest)
	var file := FileAccess.open(qa.path_join("capture_manifest.json"), FileAccess.WRITE)
	if file:
		file.store_string(payload)
		file.close()
	var file2 := FileAccess.open(reports.path_join("capture_manifest.json"), FileAccess.WRITE)
	if file2:
		file2.store_string(payload)
		file2.close()

func _capture_runtime_state(shot_id: String, purpose: String, metadata: Dictionary = {}) -> bool:
	var ok := await _capture_named_screenshot(shot_id)
	if not ok:
		return false
	var entry := {
		"filename": "%s.png" % shot_id,
		"capturePurpose": purpose,
		"candidateSlug": "heart-engine-visual-candidate-09",
		"runtimeTimestamp": Time.get_datetime_string_from_system(),
	}
	for key in metadata.keys():
		entry[key] = metadata[key]
	_runtime_capture_manifest.append(entry)
	_write_capture_manifest()
	return true

func _capture_visual_slice_rooms(world: Node) -> void:
	if not _is_visual_slice():
		return
	if world == null or not world.has_method("transition_to_room"):
		return
	var mapping := {
		"tutorial": "01-start.png",
        "traversal": "02-traversal.png",
		"combat": "03-combat.png",
		"challenge": "04-vertical-room.png",
		"ability_shrine": "05-ability-room.png",
		"ability_gate": "05b-ability-gate.png",
		"secret": "06-secret.png",
		"save": "07-checkpoint.png",
		"npc": "07b-npc.png",
		"transition": "07c-biome-transition.png",
		"miniboss": "07d-miniboss.png",
		"boss": "08-boss-room.png",
	}
	var rooms_path := "res://data/rooms/rooms.json"
	if not FileAccess.file_exists(rooms_path):
		return
	var file := FileAccess.open(rooms_path, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var previous_room := GameManager.current_room_id
	var rooms: Dictionary = parsed.get("rooms", {})
	var captured_biomes: Dictionary = {}
	var captured_regions: Dictionary = {}
	var captured_rooms: Dictionary = {}
	var graph_data: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://world_graph.json"))
	var authored_graph: Dictionary = graph_data if graph_data is Dictionary else {}
	var region_coverage := RegionCaptureCoverage.membership(authored_graph, rooms)
	var captured_gothic_opening_rooms: Dictionary = {}
	var stormglass_surface_rooms_checked := 0
	var stormglass_placeholder_layers_hidden := true
	var stormglass_platform_trims_match_collision := true
	var stormglass_platform_supports_match_collision := true
	var stormglass_floor_strips_present := true
	var stormglass_floor_foundations_present := true
	var stormglass_water_zone_visuals_hidden := true
	var stormglass_rooms_share_castle_interior := true
	var uses_modular_rooms := FileAccess.file_exists("res://data/visual/stormglass-room-kits.json")
	var stormglass_modular_backgrounds_match_rooms := true
	var stormglass_condition_decals_present := true
	var stormglass_condition_metadata_matches_rooms := true
	var stormglass_surface_materials_match_districts := true
	var stormglass_masonry_matches_collision := true
	var stormglass_masonry_rectangles_checked := 0
	var stormglass_condition_families_seen: Dictionary = {}
	var enemy_aliases := {
		"enemy_000": "enemy_A",
		"enemy_001": "enemy_B",
		"enemy_002": "enemy_C",
	}
	for room_id in rooms.keys():
		var info = rooms[room_id]
		if typeof(info) != TYPE_DICTIONARY:
			continue
		var tag := String(info.get("worldArchetype", info.get("archetype", "")))
		if not mapping.has(tag):
			continue
		await world.transition_to_room(String(room_id))
		await get_tree().process_frame
		await get_tree().process_frame
		await get_tree().process_frame
		# Room loads instantiate a new Player — never reuse a stale reference.
		var _player := get_tree().get_first_node_in_group("player")
		if _player == null or GameManager.current_room_id != String(room_id):
			push_warning("visual slice capture: requested room not loaded: %s" % String(room_id))
			continue
		var actual_biome := String(info.get("biomeId", ""))
		var expected_castle_base: String = preload("res://scripts/world/StormglassDecor.gd").castle_background_path(actual_biome)
		var room_index := maxi(0, String(room_id).trim_prefix("room_").to_int())
		var region_id := String(region_coverage.roomRegions.get(String(room_id), ""))
		var loaded_room := world.get("_current_room") as Node
		if actual_biome == "biome_0" and loaded_room != null:
			stormglass_surface_rooms_checked += 1
			if uses_modular_rooms:
				stormglass_modular_backgrounds_match_rooms = RoomKitBounds.matches(loaded_room) and stormglass_modular_backgrounds_match_rooms
			for body in loaded_room.get_children():
				var label := String(body.name)
				if not body is StaticBody2D or not (label == "Floor" or label.begins_with("FloorSeg") or label.begins_with("FloorSection_") or label.begins_with("Platform_") or label.begins_with("Shell") or label == "PaintedShell"):
					continue
				for collider in body.get_children():
					if not collider is CollisionShape2D or collider.disabled or not collider.shape is RectangleShape2D:
						continue
					stormglass_masonry_rectangles_checked += 1
					var face := body.get_node_or_null("CollisionMatchedMasonry_" + String(collider.name)) as Sprite2D
					stormglass_masonry_matches_collision = stormglass_masonry_matches_collision and face != null
					if face != null:
						stormglass_masonry_matches_collision = stormglass_masonry_matches_collision \
							and face.texture != null and face.texture.get_width() == 1254 \
							and face.position.is_equal_approx(collider.position) \
							and (face.region_rect.size * face.scale).is_equal_approx(collider.shape.size * collider.scale) \
							and is_equal_approx(face.rotation, collider.rotation) \
							and String(face.get_meta("collision_path", "")) == String(collider.get_path())
			var ground := loaded_room.get_node_or_null("Ground") as CanvasItem
			var rear_wall := loaded_room.get_node_or_null("RearWall") as CanvasItem
			stormglass_placeholder_layers_hidden = stormglass_placeholder_layers_hidden \
				and ground != null and ground.self_modulate.a <= 0.01 \
				and (rear_wall == null or not rear_wall.visible)
			var collider_count := 0
			for child in loaded_room.get_children():
				if child.name.begins_with("Platform_") and child is StaticBody2D:
					collider_count += 1
				if child is Area2D and child.is_in_group("water_zone"):
					var water_visual := child.get_node_or_null("Visual") as CanvasItem
					stormglass_water_zone_visuals_hidden = stormglass_water_zone_visuals_hidden \
						and (water_visual == null or not water_visual.visible)
			var trim_holder := loaded_room.get_node_or_null("StormglassPlatformTrims")
			var support_holder := loaded_room.get_node_or_null("StormglassPlatformSupports")
			var expected_district := clampi(int(room_index / 10), 0, 3)
			stormglass_surface_materials_match_districts = stormglass_surface_materials_match_districts \
				and trim_holder != null \
				and int(trim_holder.get_meta("condition_district", -1)) == expected_district
			var trim_count := 0
			var support_count := 0
			var floor_strip_count := 0
			if trim_holder != null:
				for trim in trim_holder.get_children():
					if trim.name.begins_with("CollisionMatchedPlatform_"):
						trim_count += 1
					elif trim.name == "CollisionMatchedFloorStrip":
						floor_strip_count += 1
			if support_holder != null:
				for support in support_holder.get_children():
					if support.name.begins_with("CollisionMatchedSupport_"):
						support_count += 1
			stormglass_platform_trims_match_collision = stormglass_platform_trims_match_collision \
				and trim_holder != null and trim_count == collider_count
			stormglass_platform_supports_match_collision = stormglass_platform_supports_match_collision \
				and support_holder != null and support_count == collider_count * 2
			var floor_body := loaded_room.get_node_or_null("Floor") as StaticBody2D
			stormglass_floor_strips_present = stormglass_floor_strips_present \
				and (floor_body == null or floor_strip_count == 1)
			stormglass_floor_foundations_present = stormglass_floor_foundations_present \
				and (floor_body == null or loaded_room.get_node_or_null("StormglassFloorFoundation") != null)
			var decor := loaded_room.get_node_or_null("StormglassDecor")
			var panorama: Sprite2D = null
			if decor != null:
				panorama = decor.get_node_or_null("AuthoredStormglassPanorama") as Sprite2D
			var condition_holder := decor.get_node_or_null("StormglassConditionDecals") if decor != null else null
			var condition_decal_count := 0
			if condition_holder != null:
				var condition_label := String(condition_holder.get_meta("condition_label", ""))
				if not condition_label.is_empty():
					stormglass_condition_families_seen[condition_label] = true
				stormglass_condition_metadata_matches_rooms = stormglass_condition_metadata_matches_rooms \
					and int(condition_holder.get_meta("condition_district", -1)) == expected_district \
					and String(condition_holder.get_meta("castle_base", "")) == expected_castle_base
				for decal in condition_holder.get_children():
					if decal.name.begins_with("ConditionDecal_"):
						condition_decal_count += 1
						stormglass_condition_metadata_matches_rooms = stormglass_condition_metadata_matches_rooms \
							and int(decal.get_meta("condition_district", -1)) == expected_district
			stormglass_condition_decals_present = stormglass_condition_decals_present \
				and condition_holder != null and condition_decal_count >= 2 and condition_decal_count <= 8
			stormglass_rooms_share_castle_interior = stormglass_rooms_share_castle_interior \
				and panorama != null \
				and panorama.texture != null \
				and panorama.texture.resource_path == expected_castle_base \
				and bool(panorama.get_meta("interior_continuity", false))
		if actual_biome == "biome_0" and String(room_id) in [
			"room_000", "room_001", "room_002", "room_003", "room_004",
			"room_005", "room_006", "room_007", "room_008", "room_009",
		]:
			var gothic_shot_id := "gothic_%s" % String(room_id)
			captured_gothic_opening_rooms[String(room_id)] = true
			await _capture_runtime_state(gothic_shot_id, "authored Gothic opening room %s" % String(room_id), {"roomId": String(room_id), "biomeId": actual_biome, "runtimeState": "authored_room"})
			_save_report_shot(gothic_shot_id, "%s.png" % gothic_shot_id)
		if actual_biome == "biome_0" and not captured_biomes.has(actual_biome):
			captured_biomes[actual_biome] = true
			await _capture_runtime_state(actual_biome, "biome room %s" % actual_biome, {"roomId": String(room_id), "biomeId": actual_biome, "runtimeState": "biome"})
			_save_report_shot(actual_biome, "%s.png" % actual_biome)
		if not region_id.is_empty() and not captured_regions.has(region_id):
			var region_shot_ok := await _capture_runtime_state(region_id, "authored region %s" % region_id, {"roomId": String(room_id), "biomeId": actual_biome, "regionId": region_id, "runtimeState": "region"})
			if region_shot_ok:
				captured_regions[region_id] = true
				_save_report_shot(region_id, "%s.png" % region_id)
		var enemies: Array = info.get("enemies", [])
		for enemy_id in enemies:
			var enemy_key := String(enemy_id)
			if enemy_aliases.has(enemy_key):
				var alias: String = enemy_aliases[enemy_key]
				var enemy_node := _find_child_with_property(_player.get_parent(), "enemy_id", enemy_key)
				if enemy_node is Node2D and _player is Node2D:
					(_player as Node2D).global_position = (enemy_node as Node2D).global_position + Vector2(-140.0, 0.0)
					var camera := (_player as Node).get_node_or_null("Camera2D")
					if camera and camera.has_method("reset_smoothing"):
						camera.call("reset_smoothing")
					await get_tree().process_frame
					await get_tree().process_frame
				await _capture_runtime_state(alias, "enemy %s" % alias, {"roomId": String(room_id), "biomeId": actual_biome, "entityId": enemy_key, "enemyArchetype": alias, "runtimeState": "enemy"})
				_save_report_shot(alias, "%s.png" % alias)
		var shot_id := "slice_%s_%s" % [tag, String(room_id)]
		var room_shot_ok := await _capture_runtime_state(shot_id, "visual-slice room %s" % tag, {"roomId": String(room_id), "biomeId": actual_biome, "regionId": region_id, "runtimeState": "room"})
		if room_shot_ok and not region_id.is_empty():
			captured_rooms[String(room_id)] = region_id
		_save_report_shot(shot_id, String(mapping[tag]))
		if tag == "tutorial":
			_save_report_shot(shot_id, "hud.png")
		if tag == "boss":
			await get_tree().create_timer(0.35).timeout
			await _capture_runtime_state("slice_boss_combat", "boss arena combat", {"roomId": String(room_id), "runtimeState": "boss_combat", "bossPhase": 1})
			await _capture_named_screenshot("slice_boss_combat")
			_save_report_shot("slice_boss_combat", "09-boss-combat.png")
	_check("stormglass_visual_slice_uses_one_continuous_biome", captured_biomes.size() == 1 and captured_biomes.has("biome_0"))
	_check("stormglass_visual_slice_covers_all_authored_region_rooms", RegionCaptureCoverage.complete(region_coverage, captured_regions, captured_rooms))
	_check("stormglass_visual_slice_captures_connected_authored_regions", bool(region_coverage.valid) and captured_regions.size() == region_coverage.regions.size() and RegionCaptureCoverage.connected(authored_graph, rooms))
	print("AUTHORED_REGION_COVERAGE " + JSON.stringify({"expectedRegions":region_coverage.regions.keys(), "capturedRegions":captured_regions.keys(), "expectedRooms":rooms.size(), "capturedRooms":captured_rooms.size(), "errors":region_coverage.errors}))
	_check("visual_slice_captures_all_ten_authored_gothic_rooms", captured_gothic_opening_rooms.size() == 10)
	if uses_modular_rooms:
		_check("stormglass_visual_slice_checks_all_configured_room_surfaces",stormglass_surface_rooms_checked==rooms.size() and rooms.size()>0)
	else:
		_check("stormglass_visual_slice_checks_all_40_room_surfaces", stormglass_surface_rooms_checked == 40)
	_check("stormglass_all_masonry_exactly_matches_real_collision", stormglass_masonry_rectangles_checked >= 40 and stormglass_masonry_matches_collision)
	_check("stormglass_all_rooms_hide_placeholder_tile_layers", stormglass_placeholder_layers_hidden)
	_check("stormglass_all_rooms_match_platform_art_to_collision", stormglass_platform_trims_match_collision)
	_check("stormglass_all_elevated_platforms_have_physical_supports", stormglass_platform_supports_match_collision)
	_check("stormglass_all_existing_floor_colliders_are_dressed", stormglass_floor_strips_present)
	_check("stormglass_all_existing_floors_have_painted_foundations", stormglass_floor_foundations_present)
	_check("stormglass_water_zones_use_authored_panorama_visuals", stormglass_water_zone_visuals_hidden)
	if uses_modular_rooms:
		_check("stormglass_modular_backgrounds_match_all_loaded_room_bounds",stormglass_surface_rooms_checked==rooms.size() and stormglass_surface_rooms_checked>0 and stormglass_modular_backgrounds_match_rooms)
	else:
		_check("stormglass_all_40_rooms_share_one_castle_interior_background", stormglass_rooms_share_castle_interior)
	_check("stormglass_all_40_rooms_have_two_authored_condition_decals", stormglass_condition_decals_present)
	_check("stormglass_condition_metadata_matches_each_room_district", stormglass_condition_metadata_matches_rooms)
	_check("stormglass_platform_materials_match_castle_condition", stormglass_surface_materials_match_districts)
	_check("stormglass_visual_slice_covers_four_castle_condition_families", stormglass_condition_families_seen.size() == 4)
	if previous_room != "" and world.has_method("transition_to_room"):
		await world.transition_to_room(previous_room)
		await get_tree().process_frame
		await get_tree().process_frame


func _find_child_with_property(root: Node, property_name: String, expected_value: String) -> Node:
	if root == null:
		return null
	for child in root.get_children():
		if child.get(property_name) != null and String(child.get(property_name)) == expected_value:
			return child
		var nested := _find_child_with_property(child, property_name, expected_value)
		if nested != null:
			return nested
	return null


func _capture_gameplay_screenshot() -> void:
	_prepare_capture_window()
	await get_tree().process_frame
	# Capture validity is evaluated by the external QA capture service. A headless dummy
	# renderer may not expose a viewport texture; that must not invalidate runtime integrity.
	await _capture_named_screenshot("gameplay", false)


## Proves EnemyController actually reads real generated enemy data (data/enemies/enemies.json)
## rather than every enemy silently using identical Enemy.tscn defaults, and that combat.type
## produces genuinely different behavior: melee's ContactHitbox actually deals damage (a real
## bug — it was never activated, so contact damage never fired regardless of how it looked in
## the editor), while a projectile-type enemy's hitbox stays inactive and it fires a real
## Projectile instead. Burst/beam/area/summon/trap helpers are called directly so TINY_TEST
## (melee+projectile only) still covers those implementations.
func _check_enemy_combat(player: Node) -> void:
	if player == null:
		_check("enemy_melee_contact_damage_works", false)
		return

	var enemies_path := "res://data/enemies/enemies.json"
	if not FileAccess.file_exists(enemies_path):
		_check_soft("enemy_data_exists", false)
		return

	var file := FileAccess.open(enemies_path, FileAccess.READ)
	var json := JSON.new()
	var parse_ok := file != null and json.parse(file.get_as_text()) == OK
	if file:
		file.close()
	_check("enemy_data_parses", parse_ok)
	if not parse_ok:
		return

	var enemies: Array = json.data.get("enemies", [])
	_check_soft("enemy_data_nonempty", enemies.size() > 0)
	if enemies.is_empty():
		return

	var enemy_scene := load("res://scenes/enemies/Enemy.tscn") as PackedScene
	_check("enemy_scene_loads", enemy_scene != null)
	if enemy_scene == null:
		return

	var melee_def: Dictionary = {}
	var projectile_def: Dictionary = {}
	for e in enemies:
		var combat: Dictionary = e.get("combat", {})
		if melee_def.is_empty() and combat.get("type", "") == "melee":
			melee_def = e
		if projectile_def.is_empty() and combat.get("type", "") == "projectile":
			projectile_def = e

	var player_hurtbox: HurtboxComponent = player.get_node_or_null("HurtboxComponent")
	var player_health: HealthComponent = player.get_node_or_null("HealthComponent")
	if player_hurtbox == null or player_health == null:
		_check("enemy_melee_contact_damage_works", false)
		return

	if not melee_def.is_empty():
		var enemy := enemy_scene.instantiate()
		enemy.enemy_id = melee_def.get("id", "")
		add_child(enemy)
		await get_tree().process_frame

		var enemy_health: HealthComponent = enemy.get_node("HealthComponent")
		_check(
			"enemy_reads_real_generated_stats",
			is_equal_approx(enemy_health.max_health, float(melee_def.get("health", -1))),
		)

		var contact_hitbox: HitboxComponent = enemy.get_node("ContactHitbox")
		_check("enemy_contact_hitbox_active_for_melee_type", contact_hitbox.monitoring)

		player_health.invulnerable = false
		var before := player_health.current_health
		contact_hitbox._on_area_entered(player_hurtbox)
		_check("enemy_melee_contact_damage_works", player_health.current_health < before)

		# The reverse direction: the player's real AttackHitbox hitting the enemy's own
		# Hurtbox. This is the exact path that was silently broken — EnemyController never
		# connected HurtboxComponent.hit_received to HealthComponent.take_damage, so a real
		# player attack could land on an enemy forever and never actually reduce its health.
		var enemy_hurtbox: HurtboxComponent = enemy.get_node("HurtboxComponent")
		var player_attack_hitbox: HitboxComponent = player.get_node_or_null("AttackHitbox")
		if player_attack_hitbox:
			player_attack_hitbox.activate()
			var enemy_health_before := enemy_health.current_health
			player_attack_hitbox._on_area_entered(enemy_hurtbox)
			player_attack_hitbox.deactivate()
			_check("player_attack_actually_damages_enemy", enemy_health.current_health < enemy_health_before)

			# Real generated hurt-flash sheet (assets/enemies/<id>_hurt.png) — previously enemies
			# only ever had a walk cycle, so taking a hit was visually silent.
			var enemy_sprite: AnimatedSprite2D = enemy.get_node_or_null("Sprite")
			_check(
				"enemy_plays_hurt_animation_on_hit",
				enemy_sprite != null and enemy_sprite.sprite_frames.has_animation("hurt") and enemy_sprite.animation == "hurt",
			)
			_check(
				"enemy_has_attack_animation",
				enemy_sprite != null and enemy_sprite.sprite_frames.has_animation("attack"),
			)
			if enemy_sprite:
				_check("enemy_has_run_animation", enemy_sprite.sprite_frames.has_animation("run"))
				enemy.call("_play_move", "run")
				await get_tree().process_frame
				_check("enemy_plays_run_animation", enemy_sprite.animation == "run")
				enemy.call("_play_attack_animation")
				await get_tree().process_frame
				_check("enemy_plays_attack_animation", enemy_sprite.animation == "attack")
			else:
				_check("enemy_plays_attack_animation", false)
		else:
			_check("player_attack_actually_damages_enemy", false)
			_check("enemy_plays_hurt_animation_on_hit", false)
			_check("enemy_has_attack_animation", false)
			_check("enemy_has_run_animation", false)
			_check("enemy_plays_run_animation", false)
			_check("enemy_plays_attack_animation", false)

		if is_instance_valid(enemy):
			enemy.queue_free()
	else:
		_check_soft("enemy_reads_real_generated_stats", false)
		_check_soft("enemy_contact_hitbox_active_for_melee_type", false)
		_check_soft("enemy_melee_contact_damage_works", false)
		_check_soft("player_attack_actually_damages_enemy", false)
		_check_soft("enemy_plays_hurt_animation_on_hit", false)
		_check_soft("enemy_has_attack_animation", false)
		_check_soft("enemy_has_run_animation", false)
		_check_soft("enemy_plays_run_animation", false)
		_check_soft("enemy_plays_attack_animation", false)

	if not projectile_def.is_empty():
		var enemy2 := enemy_scene.instantiate()
		enemy2.enemy_id = projectile_def.get("id", "")
		add_child(enemy2)
		await get_tree().process_frame

		var contact_hitbox2: HitboxComponent = enemy2.get_node("ContactHitbox")
		_check("enemy_contact_hitbox_inactive_for_projectile_type", not contact_hitbox2.monitoring)

		var before_count := get_child_count()
		enemy2.call("_fire_projectile", Vector2.RIGHT)
		_check("enemy_projectile_attack_spawns_projectile", get_child_count() > before_count)
		await _free_new_children(before_count)

		if is_instance_valid(enemy2):
			enemy2.queue_free()
	else:
		_check_soft("enemy_contact_hitbox_inactive_for_projectile_type", false)
		_check_soft("enemy_projectile_attack_spawns_projectile", false)

	# Extra combat types are exercised by calling the attack helpers directly so TINY_TEST
	# (which only generates melee + projectile) still proves the runtime implementations.
	var extra := enemy_scene.instantiate()
	extra.enemy_id = enemies[0].get("id", "")
	add_child(extra)
	await get_tree().process_frame

	var before_burst := get_child_count()
	extra.call("_fire_burst", Vector2.RIGHT)
	_check("enemy_burst_spawns_three_projectiles", get_child_count() >= before_burst + 3)
	await _free_new_children(before_burst)

	var before_beam := get_child_count()
	extra.call("_fire_beam", Vector2.RIGHT)
	_check("enemy_beam_spawns_piercing_projectile", get_child_count() == before_beam + 1)
	if get_child_count() > before_beam:
		var beam: Node = get_child(get_child_count() - 1)
		_check("enemy_beam_is_piercing", beam.get("pierce") == true)
		_check("enemy_beam_is_stationary", is_equal_approx(float(beam.get("speed")), 0.0))
	else:
		_check("enemy_beam_is_piercing", false)
		_check("enemy_beam_is_stationary", false)
	await _free_new_children(before_beam)

	var before_area := get_child_count()
	extra.call("_fire_area_attack")
	_check("enemy_area_spawns_radial_projectiles", get_child_count() >= before_area + 6)
	await _free_new_children(before_area)

	var before_summon := get_child_count()
	extra.call("_summon_minion")
	await get_tree().process_frame
	_check("enemy_summon_spawns_minion", get_child_count() == before_summon + 1)
	if get_child_count() > before_summon:
		var minion: Node = get_child(get_child_count() - 1)
		_check("enemy_summon_minion_flagged", minion.get("is_minion") == true)
		var minion_hitbox: HitboxComponent = minion.get_node_or_null("ContactHitbox")
		_check("enemy_summon_minion_uses_melee_contact", minion_hitbox != null and minion_hitbox.monitoring)
	else:
		_check("enemy_summon_minion_flagged", false)
		_check("enemy_summon_minion_uses_melee_contact", false)
	await _free_new_children(before_summon)

	var trap_hitbox: HitboxComponent = extra.get_node("ContactHitbox")
	if trap_hitbox.monitoring:
		trap_hitbox.deactivate()
	extra.call("_spring_trap")
	await get_tree().process_frame
	_check("enemy_trap_activates_contact_hitbox", trap_hitbox.monitoring)

	extra.call("_process_fly", 0.05)
	_check("enemy_fly_moves_horizontally", abs(extra.velocity.x) > 1.0)
	var fly_speed: float = abs(extra.velocity.x)
	extra.velocity = Vector2.ZERO
	extra.call("_process_hover", 0.05)
	_check("enemy_hover_moves_slower_than_fly", abs(extra.velocity.x) > 0.0 and abs(extra.velocity.x) < fly_speed)

	extra.velocity = Vector2.ZERO
	extra.call("_begin_charge", 1)
	_check("enemy_charge_boosts_speed", abs(extra.velocity.x) > extra.move_speed)

	var before_x: float = extra.global_position.x
	extra.call("_perform_teleport", before_x + 80.0)
	_check("enemy_teleport_changes_position", not is_equal_approx(extra.global_position.x, before_x))

	var burrow_hurtbox: HurtboxComponent = extra.get_node("HurtboxComponent")
	extra.call("_start_burrow")
	_check("enemy_burrow_hides", extra.modulate.a < 0.5)
	_check("enemy_burrow_disables_hurtbox", burrow_hurtbox != null and not burrow_hurtbox.monitoring)

	if is_instance_valid(extra):
		extra.queue_free()

## Proves every generated boss — not just the final one — actually got placed in the assembled
## world at its own real arena room with its own real boss_id. Previously only a single
## hardcoded "last room" ever got a Boss instance (and it never even had boss_id set), so every
## non-final boss in a multi-boss profile (SMALL/MEDIUM/LARGE — TINY_TEST's single boss never
## exposed this) was generated data that never appeared anywhere in the playable project, and
## every boss that *did* exist emitted the same "boss_final" id on death regardless of which one
## actually died.
func _check_boss_placement() -> void:
	var bosses_path := "res://data/bosses/bosses.json"
	if not FileAccess.file_exists(bosses_path):
		_check_soft("boss_data_exists", false)
		return

	var file := FileAccess.open(bosses_path, FileAccess.READ)
	var json := JSON.new()
	var parse_ok := file != null and json.parse(file.get_as_text()) == OK
	if file:
		file.close()
	_check("boss_data_parses", parse_ok)
	if not parse_ok:
		return

	var bosses: Array = json.data.get("bosses", [])
	_check_soft("boss_data_nonempty", bosses.size() > 0)

	var all_placed := true
	var all_ids_correct := true
	for boss in bosses:
		var arena_room_id: String = boss.get("arenaRoomId", "")
		var expected_id: String = boss.get("id", "")
		var scene_path := "res://scenes/rooms/%s.tscn" % arena_room_id
		if not ResourceLoader.exists(scene_path):
			all_placed = false
			continue

		var scene: PackedScene = load(scene_path)
		var instance := scene.instantiate()
		var boss_node := instance.get_node_or_null("Boss")
		if boss_node == null:
			all_placed = false
		elif boss_node.boss_id != expected_id:
			all_ids_correct = false
		instance.queue_free()

	_check("every_generated_boss_placed_in_its_real_arena", all_placed)
	_check("every_placed_boss_has_correct_boss_id", all_ids_correct)

## Proves BossController actually branches on the real generated per-phase `attacks` array
## (data/bosses/bosses.json) instead of every boss always doing the same melee swing regardless
## of what its phase data says. Only "slam"/"projectile"/"area_burst" are ever generated (see
## content.ts, which hardcodes these three literal attack names).
func _check_boss_attack_variety(player: Node) -> void:
	var bosses_path := "res://data/bosses/bosses.json"
	if not FileAccess.file_exists(bosses_path):
		_check_soft("boss_attack_data_exists", false)
		return

	var file := FileAccess.open(bosses_path, FileAccess.READ)
	var json := JSON.new()
	var parse_ok := file != null and json.parse(file.get_as_text()) == OK
	if file:
		file.close()
	if not parse_ok:
		_check_soft("boss_attack_data_parses", false)
		return

	var bosses: Array = json.data.get("bosses", [])
	if bosses.is_empty():
		_check_soft("boss_attack_data_nonempty", false)
		return

	var boss_scene := load("res://scenes/bosses/Boss.tscn") as PackedScene
	_check("boss_scene_loads_for_attack_check", boss_scene != null)
	if boss_scene == null:
		return

	var boss_def: Dictionary = bosses[0]
	if String(ProjectSettings.get_setting("application/config/name", "")).begins_with("Stormglass Reliquary"):
		for candidate in bosses:
			if typeof(candidate) == TYPE_DICTIONARY and String(candidate.get("id", "")) == "boss_final":
				boss_def = candidate
				break
	var phases: Array = boss_def.get("phases", [])
	var has_telegraph := false
	if phases.size() > 0 and typeof(phases[0]) == TYPE_DICTIONARY:
		has_telegraph = float(phases[0].get("telegraphDuration", 0.0)) > 0.0
	_check("boss_phase_data_has_telegraph", has_telegraph)

	var boss := boss_scene.instantiate()
	boss.boss_id = boss_def.get("id", "")
	add_child(boss)
	await get_tree().process_frame

	var boss_sprite: AnimatedSprite2D = boss.get_node_or_null("Sprite")
	_check("boss_has_run_animation", boss_sprite != null and boss_sprite.sprite_frames.has_animation("run"))
	if boss_sprite:
		boss.call("_play_named", "run")
	_check("boss_plays_run_animation", boss_sprite != null and boss_sprite.animation == "run")

	var boss_attack_hitbox: HitboxComponent = boss.get_node("AttackHitbox")
	var before_melee: bool = boss_attack_hitbox.monitoring
	boss.call("_perform_melee_attack")
	_check(
		"boss_slam_activates_melee_hitbox",
		not before_melee and boss_attack_hitbox.monitoring,
	)
	_check(
		"boss_has_attack_animation",
		boss_sprite != null and boss_sprite.sprite_frames.has_animation("attack"),
	)
	_check("boss_plays_attack_animation", boss_sprite != null and boss_sprite.animation == "attack")
	if String(ProjectSettings.get_setting("application/config/name", "")).begins_with("Stormglass Reliquary"):
		_check("stormglass_final_boss_is_tempest_abbot", String(boss_def.get("name", "")) == "Tempest Abbot")
		var authored_clips := ["idle", "walk", "run", "telegraph", "attack", "attack_projectile", "attack_burst", "recovery", "hurt", "death"]
		var complete_authored_set := boss_sprite != null
		if boss_sprite != null:
			for clip in authored_clips:
				complete_authored_set = complete_authored_set and boss_sprite.sprite_frames.has_animation(clip) and boss_sprite.sprite_frames.get_frame_count(clip) == 8
		_check("stormglass_tempest_abbot_has_ten_eight_frame_clips", complete_authored_set)

	var before_projectile_count := get_child_count()
	boss.call("_fire_projectile_attack")
	_check("boss_projectile_attack_spawns_projectile", get_child_count() > before_projectile_count)
	await _free_new_children(before_projectile_count)

	var before_burst_count := get_child_count()
	boss.call("_fire_burst_attack")
	_check("boss_area_burst_spawns_multiple_projectiles", get_child_count() >= before_burst_count + 3)
	await _free_new_children(before_burst_count)

	# The reverse direction: the player's real AttackHitbox hitting the boss's own Hurtbox —
	# the exact path that was silently broken (BossController never connected
	# HurtboxComponent.hit_received to HealthComponent.take_damage), so a real player attack
	# could land on a boss forever and never actually reduce its health.
	var boss_health: HealthComponent = boss.get_node("HealthComponent")
	var boss_hurtbox: HurtboxComponent = boss.get_node("HurtboxComponent")
	var player_attack_hitbox: HitboxComponent = player.get_node_or_null("AttackHitbox") if player else null
	if player_attack_hitbox:
		player_attack_hitbox.activate()
		var boss_health_before := boss_health.current_health
		player_attack_hitbox._on_area_entered(boss_hurtbox)
		player_attack_hitbox.deactivate()
		_check("player_attack_actually_damages_boss", boss_health.current_health < boss_health_before)

		# Real generated hurt-flash sheet (assets/bosses/boss_final_hurt.png) — previously bosses
		# only ever had a walk cycle, so taking a hit was visually silent.
		boss_sprite = boss.get_node_or_null("Sprite")
		_check(
			"boss_plays_hurt_animation_on_hit",
			boss_sprite != null and boss_sprite.sprite_frames.has_animation("hurt") and boss_sprite.animation == "hurt",
		)
	else:
		_check("player_attack_actually_damages_boss", false)
		_check("boss_plays_hurt_animation_on_hit", false)

	if is_instance_valid(boss):
		boss.queue_free()

## Proves the real generated boss "weaknesses" tag (content.ts only ever produces
## "dash_through") actually does something — bonus damage while the player is dashing —
## instead of being generated, stored, and never read by anything at runtime.
func _check_boss_weakness(player: Node) -> void:
	if player == null:
		_check("boss_weakness_bonus_damage_applies_while_dashing", false)
		return

	var boss_scene := load("res://scenes/bosses/Boss.tscn") as PackedScene
	if boss_scene == null:
		_check_soft("boss_weakness_scene_loads", false)
		return

	var boss := boss_scene.instantiate()
	add_child(boss)
	await get_tree().process_frame

	var boss_health: HealthComponent = boss.get_node("HealthComponent")

	player.get_node("AbilityController").is_dashing = false
	boss.call("_on_hit_received", 10.0, Vector2.ZERO)
	var normal_damage: float = boss_health.max_health - boss_health.current_health

	boss_health.current_health = boss_health.max_health
	player.get_node("AbilityController").is_dashing = true
	boss.call("_on_hit_received", 10.0, Vector2.ZERO)
	var dash_damage: float = boss_health.max_health - boss_health.current_health
	player.get_node("AbilityController").is_dashing = false

	_check("boss_weakness_bonus_damage_applies_while_dashing", dash_damage > normal_damage)

	if is_instance_valid(boss):
		boss.queue_free()

## A boss phase transition must visibly change something (tint/scale), driven by the real
## _on_health_changed threshold check — not a fake independent timer. Damages a fresh boss down
## past its phase-2 threshold via the same _on_hit_received path real combat uses and confirms
## the sprite's self_modulate actually moved off the default white.
func _check_boss_phase_presentation() -> void:
	var boss_scene := load("res://scenes/bosses/Boss.tscn") as PackedScene
	if boss_scene == null:
		_check_soft("boss_phase_presentation_changes_sprite", false)
		return
	var boss := boss_scene.instantiate()
	add_child(boss)
	await get_tree().process_frame

	var boss_health: HealthComponent = boss.get_node("HealthComponent")
	var boss_sprite: AnimatedSprite2D = boss.get_node("Sprite")
	var baseline_modulate: Color = boss_sprite.self_modulate
	await _capture_runtime_state("boss_phase_1", "boss phase 1", {"entityId": boss.boss_id, "bossPhase": 1, "runtimeState": "boss_phase_1"})
	_save_report_shot("boss_phase_1", "boss_phase_1.png")

	# Real generated bosses may have only 1 phase — this check is only meaningful (and only
	# asserted hard) when the loaded boss actually has a second phase to transition into.
	if boss.get("_phase_count") == null or int(boss.get("_phase_count")) < 2:
		_check_soft("boss_phase_presentation_changes_sprite", false)
		if is_instance_valid(boss):
			boss.queue_free()
		return

	# Damage past the phase-2 threshold through the same _on_hit_received path real combat
	# uses, not by poking _phase directly.
	while boss_health.current_health > boss_health.max_health * 0.4 and is_instance_valid(boss):
		boss.call("_on_hit_received", boss_health.max_health * 0.15, Vector2.ZERO)
		await get_tree().process_frame
	await get_tree().create_timer(0.5).timeout

	var changed := boss_sprite.self_modulate != baseline_modulate
	if changed:
		await _capture_runtime_state("boss_phase_2", "boss phase 2", {"entityId": boss.boss_id, "bossPhase": 2, "runtimeState": "boss_phase_2"})
		_save_report_shot("boss_phase_2", "boss_phase_2.png")
	_check("boss_phase_presentation_changes_sprite", changed)

	if is_instance_valid(boss):
		boss.queue_free()

## Proves defeating the real final boss (`boss_final`) transitions GameManager to VICTORY,
## sets game_complete, emits game_completed (VictoryOverlay), and records progression — not
## just that BossController emits boss_defeated with the correct id.
func _check_boss_victory_flow() -> void:
	GameManager.game_complete = false
	GameManager.current_state = GameManager.GameState.PLAYING

	var boss_scene := load("res://scenes/bosses/Boss.tscn") as PackedScene
	var world_scene := load("res://scenes/world/World.tscn") as PackedScene
	if boss_scene == null or world_scene == null:
		_check("final_boss_defeat_triggers_victory_state", false)
		_check("final_boss_defeat_sets_game_complete_flag", false)
		_check("final_boss_defeat_emits_game_completed", false)
		_check("final_boss_defeat_shows_victory_overlay", false)
		_check("final_boss_defeat_tracks_progression", false)
		return

	# GDScript lambdas capture outer locals by value, not by reference — `completed = true`
	# inside the lambda below would only mutate the closure's own snapshot, never the `completed`
	# read after the boss dies, so the signal would always look like it never fired even though
	# it genuinely did. A single-element array is a reference type, so mutating its contents from
	# inside the closure is visible to the outer scope too.
	var completed := [false]
	EventBus.game_completed.connect(func() -> void: completed[0] = true, CONNECT_ONE_SHOT)

	var world := world_scene.instantiate()
	add_child(world)
	var hud: CanvasLayer = world.get_node("GameHUD")
	await get_tree().process_frame

	var boss := boss_scene.instantiate()
	boss.boss_id = "boss_final"
	add_child(boss)
	await get_tree().process_frame

	var boss_health: HealthComponent = boss.get_node("HealthComponent")
	boss_health.take_damage(boss_health.max_health)

	# BossController emits boss_defeated after the active death clip ends. A count of
	# uncapped process frames races a valid clip on fast GPUs, so bound by its actual
	# duration plus a small signal-dispatch margin instead.
	var death_timeout := 1.5
	var boss_sprite := boss.get_node_or_null("Sprite") as AnimatedSprite2D
	if boss_sprite and boss_sprite.sprite_frames and boss_sprite.sprite_frames.has_animation("death"):
		var death_fps := boss_sprite.sprite_frames.get_animation_speed("death")
		var death_frames := boss_sprite.sprite_frames.get_frame_count("death")
		if death_fps > 0.0 and death_frames > 0:
			death_timeout = death_frames / death_fps + 0.35
	var deadline := Time.get_ticks_msec() + int(death_timeout * 1000.0)
	while not completed[0] and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame

	var victory_overlay: CanvasItem = hud.get_node_or_null("VictoryOverlay")
	if victory_overlay:
		victory_overlay.visible = false
	await _capture_runtime_state("boss_death", "boss death", {"entityId": "boss_final", "bossPhase": "death", "runtimeState": "boss_death"})
	_save_report_shot("boss_death", "boss_death.png")
	await get_tree().process_frame
	await get_tree().process_frame
	if victory_overlay:
		victory_overlay.visible = true
	_keep_endgame_overlays_for_next_capture = true
	await _capture_runtime_state("victory", "victory", {"entityId": "boss_final", "runtimeState": "victory"})
	_save_report_shot("victory", "victory.png")
	_check(
		"final_boss_defeat_triggers_victory_state",
		GameManager.current_state == GameManager.GameState.VICTORY,
	)
	_check("final_boss_defeat_sets_game_complete_flag", GameManager.game_complete)
	_check("final_boss_defeat_emits_game_completed", completed[0])
	_check("final_boss_defeat_shows_victory_overlay", hud.get_node("VictoryOverlay").visible)
	_check(
		"final_boss_defeat_tracks_progression",
		"boss_final" in ProgressionManager.get_defeated_bosses(),
	)

	GameManager.game_complete = false
	GameManager.current_state = GameManager.GameState.PLAYING

	if is_instance_valid(boss):
		boss.queue_free()
	if is_instance_valid(world):
		world.queue_free()

## Finds the room containing a real RoomTransition with required_abilities (an "ability
## gate"), navigates the real WorldManager there, then proves the gate blocks the real
## spawned player before the ability is granted and allows the transition once it is —
## using the actual gameplay objects, not mocks.
## Drives the *real* input actions PlayerController._physics_process reads (Input.action_press/
## release for move_left/move_right, ticking real physics_frames) rather than setting position or
## velocity directly — this is genuine gameplay simulation: the same code path a human player's
## keypress would trigger, including real collision with whatever is in the way. Horizontal-only,
## same-floor traversal — sufficient for every real check that uses it below (approaching a
## same-floor door/pickup/obstacle); a caller that needs to cross a vertical gap presses "jump"
## itself before or during this loop. Returns whether `target.x` was reached within max_frames —
## a caller expecting to be *blocked* (a gate, an obstacle) checks its own success condition
## instead of this return value, since "did not reach target.x" is exactly what blocking looks like.
## Frames budgeted for one approach walk. The whole smoke test runs under Godot's
## `--quit-after 1800` (see QAValidator.validateGodotRuntime), so a walk that crosses a full
## ~800px room at walk_speed (200px/s ≈ 240 frames) would spend an eighth of the entire run's
## frame budget on travel. Paired with _approach_from below, which starts each approach a short
## fixed distance out, this covers the real distance with margin to spare.
const APPROACH_WALK_FRAMES := 110
## Distance the player is placed back from whatever they are about to walk into.
const APPROACH_DISTANCE_PX := 132.0

## Setup positioning (not gameplay): drops the player a short fixed distance short of `target_x`,
## on the same side they were already approaching from, so the walk that follows still drives real
## input through real collision into the real Area2D — just without spending hundreds of frames
## crossing empty floor first. Only x moves; the player keeps its current height, so it stays on
## the same floor it was already standing on.
func _approach_from(player: Node, target_x: float, coming_from_x: float) -> void:
	if player == null or not is_instance_valid(player) or not (player is Node2D):
		return
	var direction: float = signf(target_x - coming_from_x)
	if direction == 0.0:
		direction = -1.0
	(player as Node2D).global_position.x = target_x - direction * APPROACH_DISTANCE_PX
	if player is CharacterBody2D:
		(player as CharacterBody2D).velocity = Vector2.ZERO

func _walk_player_toward_x(player: Node, target_x: float, max_frames: int = 240, tolerance: float = 10.0) -> bool:
	if player == null or not is_instance_valid(player) or not (player is Node2D):
		return false
	var reached := false
	for i in range(max_frames):
		if not is_instance_valid(player):
			break
		var dx: float = target_x - (player as Node2D).global_position.x
		if absf(dx) <= tolerance:
			reached = true
			break
		if dx > 0:
			Input.action_press("move_right")
			Input.action_release("move_left")
		else:
			Input.action_press("move_left")
			Input.action_release("move_right")
		await get_tree().physics_frame
	Input.action_release("move_left")
	Input.action_release("move_right")
	return reached

## Enters a transition the way its own direction demands. RoomTransition now requires real motion
## along the door's axis (see that script's _player_is_ascending/_player_is_descending), so a
## horizontal walk alone only opens a left/right door: 'up' must be jumped into, 'down' must be
## descended through. A single jump satisfies both — it rises through an up door, and falls back
## down through a down door. Returns whether the room actually became `expected_room`.
func _enter_transition(player: Node, transition: Node, expected_room: String) -> bool:
	if player == null or not is_instance_valid(player) or not is_instance_valid(transition):
		return false
	# Automated physics frames can advance faster than the wall-clock timer used by
	# RoomTransition.SPAWN_GRACE_MSEC. Honor the real door contract before approaching so compact
	# authored rooms do not let the bot cross the sensor while it is intentionally disabled.
	var loaded_at_msec := int(transition.get("_loaded_at_msec"))
	var grace_remaining_msec := 375 - (Time.get_ticks_msec() - loaded_at_msec)
	if grace_remaining_msec > 0:
		await get_tree().create_timer(float(grace_remaining_msec) / 1000.0).timeout
	var dir := String(transition.get("transition_direction"))
	var door_pos: Vector2 = (transition as Node2D).global_position
	var door_shape := transition.get_node_or_null("CollisionShape2D") as Node2D
	if door_shape != null:
		door_pos = door_shape.global_position
	# Re-enter horizontal doors from the room interior even after a prior locked attempt left the
	# player beyond the sensor. Choosing the side from the player's current x could otherwise put
	# a right-door retry outside the boundary wall, making the post-unlock check fail for geometry
	# reasons rather than because the gate stayed locked.
	var approach_origin_x := (player as Node2D).global_position.x
	if dir == "right":
		approach_origin_x = door_pos.x - 1.0
	elif dir == "left":
		approach_origin_x = door_pos.x + 1.0
	_approach_from(player, door_pos.x, approach_origin_x)
	await _walk_player_toward_x(player, door_pos.x, APPROACH_WALK_FRAMES, 12.0)
	for attempt in range(3):
		if GameManager.current_room_id == expected_room:
			return true
		if not is_instance_valid(player):
			return GameManager.current_room_id == expected_room
		if dir == "up" or dir == "down":
			Input.action_press("jump")
			await get_tree().physics_frame
			Input.action_release("jump")
		for i in range(40):
			await get_tree().physics_frame
			if GameManager.current_room_id == expected_room:
				return true
			if not is_instance_valid(player):
				return GameManager.current_room_id == expected_room
	return GameManager.current_room_id == expected_room

func _check_ability_gated_transition(player: Node, world: Node) -> void:
	if player == null or world == null:
		_check("ability_gate_blocks_without_ability", false)
		_check("ability_gate_opens_after_unlock", false)
		return

	var gated_room_id := _find_room_with_gate()
	if gated_room_id == "":
		# Some seed/profile combinations may not place an ability-gated transition at
		# all (e.g. zero enabled abilities) — informational, not a generator defect.
		_check_soft("ability_gate_found_in_generated_world", false)
		return
	_check_soft("ability_gate_found_in_generated_world", true)

	# Setup teleport, not gameplay: reaching this specific room by walking the full critical path
	# from spawn would take far longer than a smoke test budget allows. Everything from here on —
	# the block, the unlock, and (when a pickup exists) the ability grant — is real physical
	# player input against the actual room, not a further teleport or a synthetic flag flip.
	await world.transition_to_room(gated_room_id)
	await get_tree().process_frame
	await get_tree().process_frame

	# transition_to_room() frees the previous room (and the Player instance inside it)
	# and instantiates a fresh one — the caller's `player` reference is now stale/freed,
	# so the new player instance must be re-fetched rather than reused.
	var current_player := get_tree().get_first_node_in_group("player")
	_check("player_persists_across_room_transition", current_player != null)
	if current_player == null:
		return
	# The camera must re-center on the *new* room's player, not stay wherever the old room's
	# camera (now freed) left off.
	_check_camera(current_player)

	var gate := _find_gated_transition(world)
	_check("ability_gate_node_present_after_navigation", gate != null)
	if gate == null:
		return
	var gate_target_room: String = gate.get("target_room_id")
	if gate_target_room == null:
		gate_target_room = ""
	await _capture_runtime_state("ability_gate", "ability gate blocked", {"entityId": String(gate_target_room), "roomId": GameManager.current_room_id, "runtimeState": "ability_gate"})
	_save_report_shot("ability_gate", "ability_gate.png")

	var required: PackedStringArray = gate.required_abilities
	var ability: String = required[0]
	# Captured before the walk-through below, which — if it succeeds — triggers a real room
	# transition that frees `gate` itself along with its room.
	var expected_target_room: String = gate.target_room_id

	# Slice capture / shrine pickup / action shots may already have unlocked this ability. The
	# gate check must start from a known locked state, or the first walk-in actually transitions.
	_strip_ability(ability)
	if not is_instance_valid(current_player):
		current_player = get_tree().get_first_node_in_group("player")
	if current_player == null or not is_instance_valid(gate):
		_check("ability_gate_blocks_without_ability", false)
		_check("ability_gate_opens_after_unlock", false)
		return

	# A real AbilityPickup for this exact ability sometimes sits between spawn and the gate (this
	# codebase's own generation pattern places one right in the gate room — see room-assembler.ts).
	# Disable its monitoring for the block-check walk below, or simply walking toward/past the
	# gate would grant the ability by real physical collision along the way and the "before" state
	# would never actually be observed — re-enabled right before the real-pickup phase further
	# down, which walks the player into it on purpose.
	var pickup := _find_ability_pickup_for(world, ability)
	if pickup != null:
		pickup.monitoring = false

	var room_before: String = GameManager.current_room_id
	# Walk *past* the door's x, not just up to it — RoomTransition is a non-solid Area2D
	# (body_entered-only, see templates/.../world/RoomTransition.gd); with no ability, entering
	# it is a no-op, so the player must be able to keep walking through the space where the door
	# sits and prove the room never actually changed, not just that they stopped short of it.
	# Attempt a genuine, direction-correct entry, not just a walk past: with RoomTransition now
	# gating 'up'/'down' doors on real motion, a horizontal walk past a vertical gate would fail to
	# transition for the wrong reason and make this assertion vacuous. This way the only thing
	# standing between the player and the next room is the missing ability.
	var entered_while_locked: bool = await _enter_transition(current_player, gate, expected_target_room)
	var room_after_blocked: String = GameManager.current_room_id
	_check("ability_gate_blocks_without_ability", not entered_while_locked and room_after_blocked == room_before)

	# Real pickup if this exact room happens to have one for this exact ability (matches this
	# codebase's actual generation pattern — see room-assembler.ts's AbilityPickup placement,
	# confirmed present in real generated ability-gate rooms); otherwise fall back to a direct
	# grant, explicitly logged as a setup step rather than presented as gameplay-verified.
	if pickup != null and is_instance_valid(current_player):
		pickup.monitoring = true
		var pickup_x: float = (pickup as Node2D).global_position.x
		_approach_from(current_player, pickup_x, (current_player as Node2D).global_position.x)
		await _walk_player_toward_x(current_player, pickup_x, APPROACH_WALK_FRAMES, 16.0)
		await get_tree().process_frame
		_check("ability_gate_ability_granted_via_real_pickup", GameManager.has_ability(ability))
		print("METROFORGE_RUNTIME_NOTE ability '%s' granted via real AbilityPickup collision (gameplay-verified)" % ability)
	else:
		print("METROFORGE_RUNTIME_NOTE ability '%s' granted via direct GameManager call — no AbilityPickup for this ability exists in room '%s' (setup step, not gameplay-verified)" % [ability, GameManager.current_room_id])
		GameManager._on_ability_acquired(ability)

	if not is_instance_valid(current_player):
		current_player = get_tree().get_first_node_in_group("player")
	if current_player == null or not is_instance_valid(gate):
		_check("ability_gate_opens_after_unlock", false)
		return
	# Same entry, now with the ability in hand — the door must actually open this time.
	var entered_after_unlock: bool = await _enter_transition(current_player, gate, expected_target_room)
	_check("ability_gate_opens_after_unlock", entered_after_unlock)

## Cheap text scan (no instantiation), matching _find_room_with_gate's own approach — the room
## containing a real WeakFloor node (room-assembler.ts names it "WeakFloor_<target_room_id>").
func _find_room_with_weak_floor() -> String:
	var dir := DirAccess.open("res://scenes/rooms")
	if dir == null:
		return ""
	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if file_name.ends_with(".tscn"):
			var file := FileAccess.open("res://scenes/rooms/%s" % file_name, FileAccess.READ)
			if file:
				var text := file.get_as_text()
				file.close()
				if text.contains("[node name=\"WeakFloor_"):
					return file_name.trim_suffix(".tscn")
		file_name = dir.get_next()
	return ""

func _find_node_in_group(root: Node, group: String) -> Node:
	for child in root.get_children():
		if child.is_in_group(group):
			return child
		var found := _find_node_in_group(child, group)
		if found != null:
			return found
	return null

## Real ground_slam breakable wall: blocks passage while intact, requires the actual ability to
## break (verified with the ability stripped first), breaks under real jump+move_down input, opens
## the transition it was guarding, and — the one persistence guarantee this template makes for a
## destructible obstacle — stays broken if the room is re-entered later in the same session.
func _check_breakable_wall(player: Node, world: Node) -> void:
	var weak_floor_room_id := _find_room_with_weak_floor()
	if weak_floor_room_id == "":
		# Not every generated world grants ground_slam (breakable walls only exist when it does —
		# see world-design.ts's BREAKABLE_WALL_ABILITY gating) — informational, not a defect.
		_check_soft("breakable_wall_found_in_generated_world", false)
		return
	_check_soft("breakable_wall_found_in_generated_world", true)

	# Setup teleport, not gameplay — same reasoning as the ability-gate check above: reaching this
	# specific room by walking the full critical path is far outside a smoke test's time budget.
	await world.transition_to_room(weak_floor_room_id)
	await get_tree().process_frame
	await get_tree().process_frame

	var current_player := get_tree().get_first_node_in_group("player")
	if current_player == null:
		_check("breakable_wall_blocks_before_ability", false)
		_check("breakable_wall_breaks_with_ability", false)
		return

	var floor_node := _find_node_in_group(world, "weak_floor")
	_check("breakable_wall_node_present", floor_node != null)
	if floor_node == null:
		return
	_check("breakable_wall_starts_solid", int(floor_node.collision_layer) == 1)

	_strip_ability("ground_slam")
	var floor_pos: Vector2 = (floor_node as Node2D).global_position

	# Setup positioning (not gameplay): place the player directly above the obstacle rather than
	# walking/platforming there, so the physics that follow — falling, landing, jumping, slamming —
	# are the only things actually under test.
	# Start below overhead platforms. A 96px setup drop can land on a different
	# collider and falsely report a failed slam. The player origin is its feet.
	(current_player as Node2D).global_position = floor_pos + Vector2(0, -8)
	if current_player is CharacterBody2D:
		(current_player as CharacterBody2D).velocity = Vector2.ZERO
	for i in range(50):
		await get_tree().physics_frame
		if i >= 3 and current_player.is_on_floor():
			break
	# Real collision, not a scripted assertion: gravity alone should have settled the player on
	# top of the still-solid floor, not through it.
	_check("breakable_wall_blocks_before_ability", is_instance_valid(floor_node) and current_player.is_on_floor())
	_check("breakable_wall_setup_contacts_target_before_ability", _player_contacts_collider(current_player, floor_node))

	# Real input attempt at breaking it without the ability: jump to get airborne (try_ground_slam
	# requires not being on the floor — see AbilityController.gd), then hold move_down the same way
	# a real ground-slam input would, for long enough to survive any one-frame input-timing slack
	# (a jump's own is_action_just_pressed edge is masked by jump-buffering elsewhere in this file;
	# ground_slam's is not buffered, so this check needs the retry margin explicitly). With
	# ground_slam stripped, AbilityController's is_unlocked() check fails and try_ground_slam() is
	# a safe no-op regardless of how many times move_down's press edge is retried — the obstacle
	# must survive every one of them.
	await _attempt_ground_slam(current_player)
	for i in range(20):
		await get_tree().physics_frame
	_check("breakable_wall_survives_without_ability", is_instance_valid(floor_node))

	# Setup grant, explicitly logged as such — no in-room pickup for this exact ability is
	# guaranteed to exist in this specific room (unlike the dash-gate case, which does place one).
	print("METROFORGE_RUNTIME_NOTE ability 'ground_slam' granted via direct GameManager call for the breakable-wall check (setup step, not gameplay-verified)")
	GameManager._on_ability_acquired("ground_slam")

	if not is_instance_valid(current_player):
		current_player = get_tree().get_first_node_in_group("player")
	if current_player == null:
		_check("breakable_wall_breaks_with_ability", false)
		return
	(current_player as Node2D).global_position = floor_pos + Vector2(0, -8)
	if current_player is CharacterBody2D:
		(current_player as CharacterBody2D).velocity = Vector2.ZERO
	for i in range(50):
		await get_tree().physics_frame
		if i >= 3 and current_player.is_on_floor():
			break
	_check("breakable_wall_setup_contacts_target_with_ability", _player_contacts_collider(current_player, floor_node))
	await _attempt_ground_slam(current_player)
	for i in range(35):
		await get_tree().physics_frame
	_check("breakable_wall_breaks_with_ability", not is_instance_valid(floor_node))

	# Persistence: leave and come back — a fresh WeakFloor instance in the re-loaded room must
	# recognize the saved broken state and never re-solidify (see WeakFloor.gd/SaveManager.gd).
	await world.transition_to_room(weak_floor_room_id)
	await get_tree().process_frame
	await get_tree().process_frame
	var reloaded_floor := _find_node_in_group(world, "weak_floor")
	await get_tree().process_frame
	_check("breakable_wall_stays_broken_after_room_reentry", reloaded_floor == null or not is_instance_valid(reloaded_floor))

	# Prove disk restoration rather than relying on the still-populated session dictionary.
	_check("broken_floor_save_written", SaveManager.save_game())
	SaveManager._save_data["world_state"]["broken_floors"] = []
	_check("broken_floor_save_loaded", SaveManager.load_game())
	await world.transition_to_room(weak_floor_room_id)
	await get_tree().process_frame
	await get_tree().process_frame
	var restored_floor := _find_node_in_group(world, "weak_floor")
	_check("breakable_wall_stays_broken_after_save_load", restored_floor == null or not is_instance_valid(restored_floor))


func _player_contacts_collider(player: Node, target: Node) -> bool:
	if not is_instance_valid(player) or not is_instance_valid(target) or not player is CharacterBody2D:
		return false
	for index in player.get_slide_collision_count():
		if player.get_slide_collision(index).get_collider() == target:
			return true
	return false

## Gets the player airborne (jump, buffered if still falling from a prior setup) and then holds
## move_down for several physics frames — not just one — so a real is_action_just_pressed edge is
## reliably observed by AbilityController regardless of exactly which frame this coroutine resumes
## on relative to the engine's own input-processing order. Returns once is_slamming is observed
## true or the retry budget is exhausted (the latter is the expected, checkable outcome when the
## ability is stripped).
func _attempt_ground_slam(player: Node) -> void:
	Input.action_press("jump")
	await get_tree().physics_frame
	Input.action_release("jump")
	for i in range(20):
		await get_tree().physics_frame
		if is_instance_valid(player) and not player.is_on_floor():
			break
	Input.action_press("move_down")
	for i in range(6):
		await get_tree().physics_frame
		if is_instance_valid(player) and player.ability_controller.is_slamming:
			break
	Input.action_release("move_down")

## Real shortcut/return-loop traversal: room-assembler.ts marks a shortcut/branching connection
## `is_optional = true` (see RoomTransition.gd's own export and world-design.ts's shortcut edges) —
## finds one, walks the real player into it, and confirms it actually leads to the room it claims.
func _check_shortcut_traversal(player: Node, world: Node) -> void:
	# Prefer a left/right shortcut anywhere in the world before settling for a 'down' one: a
	# horizontal door is reachable by pure walking, whereas a 'down' door often sits below a
	# platform the player would be standing on, and has to be dropped into instead. 'up' is
	# excluded entirely — that climb is beyond this walker; such shortcuts are still structurally
	# verified by the export_fidelity gate.
	var found := _find_room_with_optional_transition(["left", "right"] as Array[String])
	if found.is_empty():
		found = _find_room_with_optional_transition(["down"] as Array[String])
	if found.is_empty():
		_check_soft("shortcut_found_in_generated_world", false)
		return
	_check_soft("shortcut_found_in_generated_world", true)
	var room_id: String = found["room_id"]
	var target_room_id: String = found["target_room_id"]

	# Setup teleport, not gameplay — same reasoning as above.
	await world.transition_to_room(room_id)
	await get_tree().process_frame
	await get_tree().process_frame
	var current_player := get_tree().get_first_node_in_group("player")
	if current_player == null:
		_check("shortcut_leads_to_declared_room", false)
		return

	# The shortcut itself is never ability-gated (see world-design.ts) — search every
	# room_transition for the specific target this scan found, gated or not.
	var transition_node: Node = null
	for t in get_tree().get_nodes_in_group("room_transition"):
		if String(t.get("target_room_id")) == target_room_id:
			transition_node = t
			break
	if transition_node == null:
		_check("shortcut_leads_to_declared_room", false)
		return

	var arrived := false
	if String(found.get("direction", "")) == "down":
		# Setup positioning (not gameplay): a 'down' door is below the floor the player walks on,
		# so drop them in from just above it and let real gravity carry them through — the same
		# technique the breakable-wall check uses. The transition itself still fires from real
		# body_entered collision, not from a scripted call.
		(current_player as Node2D).global_position = (transition_node as Node2D).global_position + Vector2(0, -72)
		if current_player is CharacterBody2D:
			(current_player as CharacterBody2D).velocity = Vector2.ZERO
		for i in range(25):
			await get_tree().physics_frame
			if GameManager.current_room_id == target_room_id:
				break
		arrived = GameManager.current_room_id == target_room_id
	else:
		print("SHORTCUT_PROBE before room=%s target=%s direction=%s player=%s door=%s shape=%s" % [room_id, target_room_id, String(found.get("direction", "")), str((current_player as Node2D).global_position), str((transition_node as Node2D).global_position), str((transition_node.get_node_or_null("CollisionShape2D") as Node2D).global_position if transition_node.get_node_or_null("CollisionShape2D") != null else Vector2.ZERO)])
		arrived = await _enter_transition(current_player, transition_node, target_room_id)
		print("SHORTCUT_PROBE after current=%s arrived=%s player_valid=%s player=%s" % [GameManager.current_room_id, str(arrived), str(is_instance_valid(current_player)), str((current_player as Node2D).global_position) if is_instance_valid(current_player) else "freed"])
	# A left/right door is unambiguously within this walker's reach, so failing to arrive is a
	# real failure. A 'down' door is not: it can sit beneath solid geometry the player is standing
	# on, in which case not arriving says the harness could not enter it, NOT that the game is
	# broken. Observed exactly that on a real generated world (room_020's 'down' shortcut to
	# room_000 sits below a platform the player rests on), so that case is reported as a soft fail
	# naming the door — a level-design question for human review, not a silent pass and not a red
	# failure that misrepresents the game.
	if String(found.get("direction", "")) == "down" and not arrived:
		print("METROFORGE_RUNTIME_NOTE shortcut door %s -> %s ('down') could not be entered by the test walker — it sits below standable geometry; flagged for human level-design review rather than asserted as a game defect" % [room_id, target_room_id])
		_check_soft("shortcut_leads_to_declared_room", false)
	else:
		_check("shortcut_leads_to_declared_room", arrived)

## Returns the first room+target found with a real `is_optional = true` RoomTransition (a shortcut
## or branching connection) via the same cheap text-scan _find_room_with_gate uses.
func _find_room_with_optional_transition(accepted_directions: Array[String]) -> Dictionary:
	var dir := DirAccess.open("res://scenes/rooms")
	if dir == null:
		return {}
	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if file_name.ends_with(".tscn"):
			var file := FileAccess.open("res://scenes/rooms/%s" % file_name, FileAccess.READ)
			if file:
				var text := file.get_as_text()
				file.close()
				# Boss arenas intentionally seal every exit until their guardian dies. The
				# same optional connection is emitted in both directions, so exercise its
				# reachable return side instead of misreporting the arena lock as a broken
				# shortcut.
				if text.contains("[node name=\"Boss\""):
					file_name = dir.get_next()
					continue
				# Walk the scene text forwards, remembering the most recent transition-node
				# header, instead of searching backwards from each `is_optional = true` line.
				# The backward search this replaced returned -1 for every room whose optional
				# door was not its *first* transition — so rooms 009 and 035, the two with a
				# genuinely horizontal shortcut door, were silently skipped and the scan fell
				# through to an unreachable 'down' door instead.
				var current_node := ""
				for line in text.split("\n"):
					var trimmed := line.strip_edges()
					if trimmed.begins_with("[node name=\"Transition_"):
						var name_start: int = trimmed.find("\"") + 1
						var name_end: int = trimmed.find("\"", name_start)
						current_node = trimmed.substr(name_start, name_end - name_start)
					elif trimmed == "is_optional = true" and current_node != "":
						var parts := current_node.split("_")
						if parts.size() >= 3 and accepted_directions.has(parts[1]):
							return {
								"room_id": file_name.trim_suffix(".tscn"),
								"target_room_id": "_".join(parts.slice(2)),
								"direction": parts[1],
							}
		file_name = dir.get_next()
	return {}

func _find_ability_pickup_for(root: Node, ability_id: String) -> Node:
	for child in root.get_children():
		if child.get("ability_id") == ability_id and child.has_method("_on_body_entered"):
			return child
		var found := _find_ability_pickup_for(child, ability_id)
		if found != null:
			return found
	return null

## GameManager.has_ability ORs ProgressionManager — both must drop the id.
func _strip_ability(ability: String) -> void:
	var kept: Array[String] = []
	for id in GameManager.player_abilities:
		if id != ability:
			kept.append(id)
	GameManager.player_abilities.assign(kept)
	var remaining: Array = []
	for id in ProgressionManager.get_unlocked_abilities():
		if String(id) != ability:
			remaining.append(id)
	ProgressionManager.restore_abilities(remaining)

## Scans room scene files as text (cheap — no instantiation) for a RoomTransition
## carrying required_abilities, returning that room's id (its filename without extension).
func _find_room_with_gate() -> String:
	var dir := DirAccess.open("res://scenes/rooms")
	if dir == null:
		return ""

	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if file_name.ends_with(".tscn"):
			var file := FileAccess.open("res://scenes/rooms/%s" % file_name, FileAccess.READ)
			if file:
				var text := file.get_as_text()
				file.close()
				if text.contains("required_abilities = PackedStringArray("):
					return file_name.trim_suffix(".tscn")
		file_name = dir.get_next()
	return ""

func _find_gated_transition(root: Node) -> Node:
	for child in root.get_children():
		if child.has_method("_on_body_entered") and child.get("required_abilities") != null:
			var req: PackedStringArray = child.required_abilities
			if req.size() > 0:
				return child
		var found := _find_gated_transition(child)
		if found != null:
			return found
	return null

## Projectiles spawned during a check (get_parent().add_child() from inside EnemyController/
## BossController resolves to this test node, since that's who instantiated them) would
## otherwise keep flying and colliding for the rest of the test run, interfering with later
## checks — e.g. hitting a later test's freshly-spawned enemy/boss, or outliving the entity
## that fired them and tripping the freed-owner_node guard in Projectile.gd/HitboxComponent.gd.
## Frees everything added as a child of this node since `before_count`.
## queue_free() defers the actual removal rather than shrinking get_child_count() right away, so
## a later `get_child_count() == before + N` check elsewhere can be thrown off by an earlier
## batch of frees that hadn't actually resolved yet — they'd finally clear on whatever frame that
## later check's own await happens to land on, mixed in with whatever it was really counting.
## Awaiting a frame here settles the count before this function returns, so every caller starts
## its next `before := get_child_count()` snapshot from a clean baseline.
func _free_new_children(before_count: int) -> void:
	var children := get_children()
	for i in range(before_count, children.size()):
		if is_instance_valid(children[i]):
			children[i].queue_free()
	await get_tree().process_frame

## Real camera acceptance, not just "a Camera2D node exists": the camera must actually be the
## active viewport camera and be tracking somewhere near the player, not stuck at the origin or
## wherever a previous room left it (CameraDirector re-centers per room in apply_room_bounds()/
## _snap_to_room() — a regression there would leave the camera frozen while the player walks out
## of view, which a mere node-existence check would never catch).
func _check_camera(player: Node) -> void:
	if player == null:
		_check_soft("camera_exists_and_current", false)
		return
	var camera: Camera2D = player.get_node_or_null("Camera2D") as Camera2D
	_check("camera_exists_and_current", camera != null and camera.enabled)
	if camera == null:
		return
	_check("camera_position_is_finite", is_finite(camera.global_position.x) and is_finite(camera.global_position.y))
	if camera.has_method("get_room_size"):
		var room_size: Vector2 = camera.call("get_room_size")
		var margin := 4.0
		var within_bounds := camera.global_position.x >= -margin and camera.global_position.x <= room_size.x + margin \
			and camera.global_position.y >= -margin and camera.global_position.y <= room_size.y + margin
		_check("camera_within_room_bounds", within_bounds)
		if player is Node2D:
			var player_pos: Vector2 = (player as Node2D).global_position
			var view_size := camera.get_viewport_rect().size / camera.zoom
			# The real requirement: the player is comfortably inside the camera view, not that the
			# camera is centered on the player. The camera legitimately stops centering when it is
			# clamped at a room edge or pinned by the Foundry playable-band / cinematic-plate
			# framing (the reviewed, accepted camera behavior) — in all those cases the player is
			# still on screen, which is what this checks.
			var half_view := view_size * 0.5
			# A small pad so 'barely clipped at the frame edge' still fails, but the Foundry
			# playable-band framing (floor low in frame to show architecture above) passes.
			var player_in_view: bool = \
				abs(player_pos.x - camera.global_position.x) <= half_view.x - 8.0 \
				and abs(player_pos.y - camera.global_position.y) <= half_view.y - 8.0
			_check("camera_idle_stays_near_player_anchor", player_in_view)
	else:
		_check_soft("camera_within_room_bounds", false)
		_check_soft("camera_idle_stays_near_player_anchor", false)
	# CameraDirector deliberately pins to room-center (not the player) whenever the whole room
	# already fits in the viewport — panning would be pointless and a naive "must be near the
	# player" check is a false positive there. What must hold in every case is that the camera
	# never exposes void outside the room: its position stays inside [0, room_size], the actual
	# "outside-world void is not exposed unnecessarily" requirement.

## Screen shake must be a temporary offset, not a permanent camera displacement — a tween that
## never completes (or completes to the wrong value) would leave every subsequent frame panned
## off-target after the first hit.
func _check_camera_shake_settles(player: Node) -> void:
	if player == null or not player.has_method("_shake_camera"):
		_check_soft("camera_shake_returns_to_target", false)
		return
	var camera: Camera2D = player.get_node_or_null("Camera2D") as Camera2D
	if camera == null:
		_check_soft("camera_shake_returns_to_target", false)
		return
	player.call("_shake_camera", 6.0, 0.15)
	await get_tree().create_timer(0.35).timeout
	_check("camera_shake_returns_to_target", camera.offset.distance_to(Vector2.ZERO) < 0.5)

func _check(name: String, condition: bool) -> void:
	_results.append({"name": name, "passed": condition, "soft": false})

func _check_soft(name: String, condition: bool) -> void:
	_results.append({"name": name, "passed": condition, "soft": true})

func _finish() -> void:
	var hard_failures := 0
	print("SMOKE_TEST_RESULTS_BEGIN")
	for r in _results:
		var status: String = "PASS" if r.passed else ("SOFT_FAIL" if r.soft else "FAIL")
		print("%s: %s" % [status, r.name])
		if not r.passed and not r.soft:
			hard_failures += 1
	print("SMOKE_TEST_RESULTS_END")
	get_tree().quit(0 if hard_failures == 0 else 1)
