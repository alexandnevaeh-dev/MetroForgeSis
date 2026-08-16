extends Node
## Headless runtime smoke test for a generated MetroForge project.
## Invoked via: godot --headless --path <project> res://scenes/test/RuntimeSmokeTest.tscn
## Prints PASS/FAIL lines between SMOKE_TEST_RESULTS_BEGIN/END markers and exits with
## code 0 (all checks passed) or 1 (at least one failed). Never left running — always
## calls get_tree().quit() itself so no external --quit-after is required.

var _results: Array[Dictionary] = []

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
	_check_audio()
	await _check_boss_music(world)
	await _check_pause_menu(world)

	var player := get_tree().get_first_node_in_group("player")
	_check("player_exists", player != null)

	if player:
		var pos: Vector2 = player.global_position
		_check("player_spawns_at_valid_location", is_finite(pos.x) and is_finite(pos.y))
		_check("player_movement_controller_initialized", player.get("facing") != null)
		_check("player_has_health_component", player.get_node_or_null("HealthComponent") != null)
		_check("player_has_hurtbox", player.get_node_or_null("HurtboxComponent") != null)
		_check("player_has_attack_hitbox", player.get_node_or_null("AttackHitbox") != null)
		await _capture_named_screenshot("spawn")
		await _probe_and_capture_foot_isolates()

		var player_sprite: AnimatedSprite2D = player.get_node_or_null("Sprite")
		if player_sprite and player_sprite.sprite_frames:
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
	# Victory/combat instantiate extra Worlds + queue_free them; drain a couple of
	# frames so group lookups are not a previously-freed Player from those extras.
	await get_tree().process_frame
	await get_tree().process_frame
	player = get_tree().get_first_node_in_group("player")
	await _check_ability_gated_transition(player, world)

	# _check_ability_gated_transition may have navigated to a new room, which frees the
	# previous Player instance — re-fetch rather than reuse the now-possibly-stale reference.
	var current_player := get_tree().get_first_node_in_group("player")
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

	await GameManager._do_respawn()
	await get_tree().process_frame
	await get_tree().process_frame

	_check(
		"player_death_leaves_game_state_playing",
		GameManager.current_state == GameManager.GameState.PLAYING,
	)
	_check("player_death_respawns_at_checkpoint_room", GameManager.current_room_id == checkpoint_room)

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

	npc._on_body_entered(player)
	npc._begin_dialogue()

	var speaker_label: Label = dialogue_overlay.get_node_or_null("Panel/HBox/Content/SpeakerLabel")
	_check(
		"npc_interaction_can_be_triggered",
		dialogue_overlay.visible and speaker_label != null and speaker_label.text.length() > 0,
	)

	# The overlay belongs to World.tscn, not this check — close it rather than freeing a node
	# owned elsewhere, so it's left in a clean, closed state for anything that runs after this.
	if is_instance_valid(dialogue_overlay) and dialogue_overlay.has_method("close_dialogue"):
		dialogue_overlay.close_dialogue()

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

## Proves the HUD's currency label actually reflects real QuestManager state, not just that the
## node exists — by this point in the test both a quest completion and an item pickup have
## already added scrap, so the label must show a real, non-empty, matching amount.
func _check_currency_hud(world: Node) -> void:
	var hud := world.get_node_or_null("GameHUD")
	_check("game_hud_present_in_world", hud != null)
	if hud == null:
		return

	var currency_label: Label = hud.get_node_or_null("HUD/MarginContainer/VBox/CurrencyLabel")
	_check("currency_label_present", currency_label != null)
	if currency_label == null:
		return

	var scrap: int = int(QuestManager.currency.get("scrap", 0))
	_check("currency_hud_reflects_real_state", str(scrap) in currency_label.text)

	var collectible_label: Label = hud.get_node_or_null("HUD/MarginContainer/VBox/CollectibleLabel")
	_check("collectible_label_present", collectible_label != null)
	if collectible_label != null:
		var found := InventoryManager.get_collectible_found_count()
		var total := InventoryManager.get_collectible_total_count()
		_check(
			"collectible_hud_reflects_real_state",
			total > 0 and str(found) in collectible_label.text and str(total) in collectible_label.text,
		)

## Proves the always-visible corner minimap is wired into GameHUD and reads MapManager state.
func _check_hud_minimap(world: Node) -> void:
	var hud := world.get_node_or_null("GameHUD")
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
	_hide_endgame_overlays()
	_prepare_capture_window()
	_sync_visual_camera()
	await get_tree().process_frame
	var headless := DisplayServer.get_name() == "headless"
	if not headless:
		await RenderingServer.frame_post_draw
		await get_tree().process_frame
		RenderingServer.force_draw(true)
		await RenderingServer.frame_post_draw
	else:
		await get_tree().process_frame

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
	var world := get_tree().get_first_node_in_group("world_manager")
	if world:
		var room: Node = world.get("_current_room") as Node
		if room:
			var ground := room.get_node_or_null("Ground")
			if ground:
				size = Vector2(float(ground.get("room_width")), float(ground.get("room_height")))
	cam.apply_room_bounds(size)


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
	if sprite.sprite_frames.has_animation("attack"):
		sprite.play("attack")
		await get_tree().process_frame
		await get_tree().process_frame
		await _capture_named_screenshot("combat_action")
		_save_report_shot("combat_action", "03b-combat-action.png")
	if sprite.sprite_frames.has_animation("dash"):
		# Play the sheet only — unlocking dash here used to poison
		# ability_gated_transition (GameManager.has_ability ORs ProgressionManager).
		sprite.play("dash")
		if player is CharacterBody2D:
			(player as CharacterBody2D).velocity.x = 280
		await get_tree().process_frame
		await _capture_named_screenshot("dash")
		_save_report_shot("dash", "10-dash.png")
	if sprite.sprite_frames.has_animation("jump") or sprite.sprite_frames.has_animation("land"):
		if sprite.sprite_frames.has_animation("jump"):
			sprite.play("jump")
		if player is CharacterBody2D:
			(player as CharacterBody2D).velocity.y = -220
		await get_tree().process_frame
		await _capture_named_screenshot("jump")
		_save_report_shot("jump", "11-jump.png")
		if sprite.sprite_frames.has_animation("land"):
			sprite.play("land")
			if player is CharacterBody2D:
				(player as CharacterBody2D).velocity = Vector2.ZERO
			await get_tree().process_frame
			await _capture_named_screenshot("land")
			_save_report_shot("land", "12-land.png")
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
	DirAccess.make_dir_recursive_absolute(reports)
	var src := qa.path_join("screenshot_%s.png" % shot_id)
	if FileAccess.file_exists(src):
		DirAccess.copy_absolute(src, reports.path_join(dest_name))


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
		if _player == null:
			push_warning("visual slice capture: no player in %s" % String(room_id))
			continue
		var shot_id := "slice_%s" % tag
		await _capture_named_screenshot(shot_id)
		_save_report_shot(shot_id, String(mapping[tag]))
		if tag == "tutorial":
			_save_report_shot(shot_id, "hud.png")
		if tag == "boss":
			await get_tree().create_timer(0.35).timeout
			await _capture_named_screenshot("slice_boss_combat")
			_save_report_shot("slice_boss_combat", "09-boss-combat.png")
	if previous_room != "" and world.has_method("transition_to_room"):
		await world.transition_to_room(previous_room)
		await get_tree().process_frame
		await get_tree().process_frame


func _capture_gameplay_screenshot() -> void:
	_prepare_capture_window()
	await get_tree().process_frame
	await _capture_named_screenshot("gameplay", true)


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
				enemy.call("_play_attack_animation")
				await get_tree().process_frame
				_check("enemy_plays_attack_animation", enemy_sprite.animation == "attack")
			else:
				_check("enemy_plays_attack_animation", false)
		else:
			_check("player_attack_actually_damages_enemy", false)
			_check("enemy_plays_hurt_animation_on_hit", false)
			_check("enemy_has_attack_animation", false)
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
	var phases: Array = boss_def.get("phases", [])
	var has_telegraph := false
	if phases.size() > 0 and typeof(phases[0]) == TYPE_DICTIONARY:
		has_telegraph = float(phases[0].get("telegraphDuration", 0.0)) > 0.0
	_check("boss_phase_data_has_telegraph", has_telegraph)

	var boss := boss_scene.instantiate()
	boss.boss_id = boss_def.get("id", "")
	add_child(boss)
	await get_tree().process_frame

	var boss_attack_hitbox: HitboxComponent = boss.get_node("AttackHitbox")
	var before_melee: bool = boss_attack_hitbox.monitoring
	boss.call("_perform_melee_attack")
	_check(
		"boss_slam_activates_melee_hitbox",
		not before_melee and boss_attack_hitbox.monitoring,
	)
	var boss_sprite: AnimatedSprite2D = boss.get_node_or_null("Sprite")
	_check(
		"boss_has_attack_animation",
		boss_sprite != null and boss_sprite.sprite_frames.has_animation("attack"),
	)
	_check("boss_plays_attack_animation", boss_sprite != null and boss_sprite.animation == "attack")

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

	# BossController._on_died() now plays the death animation and awaits
	# sprite.animation_finished before emitting boss_defeated, so boss_defeated (and the
	# VICTORY transition it triggers) no longer lands within a fixed couple of frames —
	# poll for it instead, bounded so a genuine regression still fails fast.
	for i in range(120):
		if completed[0]:
			break
		await get_tree().process_frame

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

	var gate := _find_gated_transition(world)
	_check("ability_gate_node_present_after_navigation", gate != null)
	if gate == null:
		return

	var required: PackedStringArray = gate.required_abilities
	var ability: String = required[0]
	# Captured before the second _on_body_entered call below, which — if it succeeds —
	# triggers another room transition that frees `gate` itself along with its room.
	var expected_target_room: String = gate.target_room_id

	# Slice capture / shrine pickup / action shots may already have unlocked this
	# ability. The gate check must start from a known locked state, or the first
	# _on_body_entered actually transitions, frees the gate, and the second call
	# crashes on a previously-freed node (ability_gate_blocks_without_ability FAIL).
	_strip_ability(ability)
	if not is_instance_valid(current_player):
		current_player = get_tree().get_first_node_in_group("player")
	if current_player == null or not is_instance_valid(gate):
		_check("ability_gate_blocks_without_ability", false)
		_check("ability_gate_opens_after_unlock", false)
		return

	var room_before: String = GameManager.current_room_id
	gate._on_body_entered(current_player)
	await get_tree().process_frame
	var room_after_blocked: String = GameManager.current_room_id
	_check("ability_gate_blocks_without_ability", room_after_blocked == room_before)

	GameManager._on_ability_acquired(ability)
	gate._on_body_entered(current_player)
	# RoomTransition._on_body_entered fires WorldManager.transition_to_room() without awaiting it
	# (correctly, for real gameplay — a signal handler has nothing useful to block on) and that
	# coroutine now itself starts with an await get_tree().physics_frame() (see WorldManager.gd) to
	# avoid mutating physics state mid-flush. A single idle process_frame here isn't guaranteed to
	# land after that physics_frame resolves, so wait on the same signal type transition_to_room
	# actually awaits internally, not a different frame type that only usually lines up with it.
	await get_tree().physics_frame
	await get_tree().physics_frame
	var room_after_unlocked: String = GameManager.current_room_id
	_check("ability_gate_opens_after_unlock", room_after_unlocked == expected_target_room)

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
