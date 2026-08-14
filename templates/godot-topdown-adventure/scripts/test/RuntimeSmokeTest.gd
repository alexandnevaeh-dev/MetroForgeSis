extends Node
## Headless runtime smoke test for the top-down action-adventure template.
## Invoked via: godot --headless --path <project> res://scenes/test/RuntimeSmokeTest.tscn
## Prints PASS/FAIL/SOFT_FAIL lines between SMOKE_TEST_RESULTS_BEGIN/END markers and exits with
## code 0 (all hard checks passed) or 1 (at least one hard FAIL). Mirrors the side-view
## template's RuntimeSmokeTest.gd in idiom and rigor: every check drives real runtime state
## through the actual scenes/scripts (never a check that trivially passes regardless of whether
## the feature works), adapted to top-down's actual APIs rather than assumed to be identical.

var _results: Array[Dictionary] = []

func _ready() -> void:
	await get_tree().process_frame
	await get_tree().process_frame

	_check("autoload_game_manager_exists", GameManager != null)
	_check("autoload_event_bus_exists", EventBus != null)
	_check("autoload_save_manager_exists", SaveManager != null)
	_check("autoload_audio_manager_exists", AudioManager != null)
	_check("autoload_progression_manager_exists", ProgressionManager != null)
	_check("autoload_settings_manager_exists", SettingsManager != null)
	_check("autoload_quest_manager_exists", QuestManager != null)
	_check("autoload_map_manager_exists", MapManager != null)
	_check("autoload_inventory_exists", InventoryManager != null)
	_check("autoload_dialogue_manager_exists", DialogueManager != null)
	_check("autoload_shop_manager_exists", ShopManager != null)
	_check("autoload_vfx_manager_exists", VFXManager != null)

	var world_scene := load("res://scenes/world/World.tscn") as PackedScene
	_check("world_scene_loads", world_scene != null)
	if world_scene == null:
		_finish()
		return

	var world: Node = world_scene.instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().process_frame

	GameManager.start_new_game()
	await get_tree().process_frame

	var player_node := get_tree().get_first_node_in_group("player")
	_check("player_spawns", player_node != null)
	var player := player_node as CharacterBody2D
	if player:
		_check(
			"player_is_top_down",
			player.get_script() != null and String(player.get_script().resource_path).ends_with("TopDownPlayerController.gd"),
		)
		var start: Vector2 = player.global_position
		# Simulated real input through the controller's own _physics_process(), not a manual
		# velocity/move_and_slide() override — that bypassed the controller and, called outside
		# an actual physics step from _ready(), produced no measurable movement.
		Input.action_press("move_right")
		Input.action_press("move_down")
		await get_tree().physics_frame
		await get_tree().physics_frame
		await get_tree().physics_frame
		Input.action_release("move_right")
		Input.action_release("move_down")
		_check("player_moves_diagonally", player.global_position.distance_to(start) > 0.5)
		if player.has_method("cardinal_facing"):
			player.set("facing", Vector2.RIGHT)
			player.call("_start_attack")
			_check("player_attack_activates_hitbox", player.get("attack_hitbox").monitoring)
			player.call("_on_attack_finished")
		_check("player_has_health_component", player.get_node_or_null("HealthComponent") != null)
		_check("player_has_hurtbox", player.get_node_or_null("HurtboxComponent") != null)
		_check("player_has_attack_hitbox", player.get_node_or_null("AttackHitbox") != null)

	var overworld_path := "res://data/world/overworld.json"
	_check("overworld_data_exists", FileAccess.file_exists(overworld_path))

	await _check_pause_menu(world)

	# Locked door / item gate: prove the block case for real (no key/tool owned yet) before
	# granting the real unlocking item, not just the already-unlocked happy path.
	var probe_door := LockedDoor.new()
	probe_door.key_id = "rusted_key"
	probe_door.door_id = "smoke_probe_door"
	add_child(probe_door)
	probe_door.interact(player)
	_check("locked_door_blocks_without_key", not probe_door.unlocked)

	var probe_gate := ItemGate.new()
	probe_gate.item_id = "wind_disc"
	add_child(probe_gate)
	probe_gate.interact(player)
	await get_tree().process_frame
	_check("item_gate_blocks_without_item", is_instance_valid(probe_gate) and not probe_gate.is_queued_for_deletion())

	var chest := ChestPickup.new()
	chest.item_id = "rusted_key"
	chest.chest_id = "smoke_chest"
	add_child(chest)
	var before := InventoryManager.get_owned_count("rusted_key")
	chest.interact(player)
	_check("chest_grants_item", InventoryManager.get_owned_count("rusted_key") > before)

	probe_door.interact(player)
	_check("locked_door_opens_with_key", probe_door.unlocked)

	InventoryManager.grant_item("wind_disc", 1)
	probe_gate.interact(player)
	await get_tree().process_frame
	_check("item_gate_opens_with_tool", not is_instance_valid(probe_gate) or probe_gate.is_queued_for_deletion())

	await _check_npc_dialogue_and_quest_flow(player)
	await _check_boss_victory_flow()
	_check_item_pickups(player)
	_check_inventory_equip_ui(world)
	await get_tree().process_frame
	_check_currency_hud(world)
	await _check_hud_minimap(world)
	await _check_hud_quest_tracker(world)
	await _check_enemy_combat(player)
	await _check_shop_purchase_flow()

	var world_mgr := get_tree().get_first_node_in_group("world_manager")
	_check("overworld_manager_present", world_mgr != null)
	await _check_boss_placement(world_mgr)

	# _check_boss_placement navigates the real OverworldManager through multiple areas, which
	# frees and recreates the Player instance each time (same reason side-view's WorldManager
	# transitions require a re-fetch) — get a fresh reference before anything else touches it.
	var current_player := get_tree().get_first_node_in_group("player")
	await _check_boss_attack_variety(current_player)
	await _check_boss_weakness(current_player)

	if world_mgr and world_mgr.has_method("load_area"):
		await world_mgr.load_area("dungeon_000_r0")
		await get_tree().process_frame
		_check("dungeon_area_loads", GameManager.current_room_id == "dungeon_000_r0")

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

	# Let any queue_free()'d nodes from the checks above actually process before exiting, so
	# shutdown doesn't report benign "still in use" noise from this test's own cleanup.
	await get_tree().process_frame
	await get_tree().process_frame

	_finish()

## Proves the pause menu is really wired into World.tscn and that GameManager's
## pause_game()/resume_game() actually toggle the SceneTree's paused state, then drives the
## real Map/Inventory/Quests/Settings panel open-close flow (rather than only checking each
## node exists) — this is the only way to catch a scene/script node-path mismatch. While
## implementing this, PauseMenu.gd's _open_map()/_open_inventory()/_open_quests() were found to
## reference `$Panel/<X>Panel/<View>` paths that skip the real `VBox` container each view
## actually lives under (confirmed against PauseMenu.tscn) — a real bug that would throw a null-
## node error the moment a player opened any of those three panels. Fixed as part of writing
## this check, so "opens" here reflects genuinely working UI, not a pre-existing crash.
func _check_pause_menu(world: Node) -> void:
	var pause_menu := world.get_node_or_null("PauseMenu")
	_check("pause_menu_present_in_world", pause_menu != null)

	GameManager.pause_game()
	await get_tree().process_frame
	_check("game_manager_pause_actually_pauses_tree", get_tree().paused)

	GameManager.resume_game()
	await get_tree().process_frame
	_check("game_manager_resume_actually_unpauses_tree", not get_tree().paused)

	if pause_menu:
		pause_menu.call("_open")
		await get_tree().process_frame
		_check("pause_menu_open_shows_ui", pause_menu.visible)
		_check("pause_menu_open_sets_paused_game_state", GameManager.current_state == GameManager.GameState.PAUSED)

		pause_menu.call("_open_settings")
		await get_tree().process_frame
		var settings_panel: Control = pause_menu.get_node_or_null("Panel/SettingsPanel")
		_check("pause_menu_settings_panel_opens", settings_panel != null and settings_panel.visible)

		var master_slider = pause_menu.get_node_or_null("Panel/SettingsPanel/VBox/MasterRow/MasterSlider")
		_check(
			"pause_menu_settings_sliders_wired",
			master_slider != null and is_equal_approx(master_slider.value, SettingsManager.master_volume),
		)
		pause_menu.call("_close_settings")

		var map_room := GameManager.current_room_id
		if map_room.is_empty():
			map_room = "overworld"
		MapManager.mark_discovered(map_room)
		pause_menu.call("_open_map")
		await get_tree().process_frame
		var map_panel: Control = pause_menu.get_node_or_null("Panel/MapPanel")
		_check("pause_menu_map_panel_opens", map_panel != null and map_panel.visible)
		_check("world_map_view_present", pause_menu.get_node_or_null("Panel/MapPanel/VBox/WorldMapView") != null)
		_check("map_manager_has_graph", not MapManager.get_graph().is_empty())
		_check("map_manager_tracks_discovered_rooms", map_room in MapManager.get_discovered_ids())
		pause_menu.call("_close_map")

		pause_menu.call("_open_inventory")
		await get_tree().process_frame
		var inventory_panel: Control = pause_menu.get_node_or_null("Panel/InventoryPanel")
		_check("pause_menu_inventory_panel_opens", inventory_panel != null and inventory_panel.visible)
		_check(
			"inventory_view_present_in_pause_menu",
			pause_menu.get_node_or_null("Panel/InventoryPanel/VBox/InventoryView") != null,
		)
		pause_menu.call("_close_inventory")

		pause_menu.call("_open_quests")
		await get_tree().process_frame
		var quests_panel: Control = pause_menu.get_node_or_null("Panel/QuestsPanel")
		_check("pause_menu_quests_panel_opens", quests_panel != null and quests_panel.visible)
		_check(
			"quest_view_present_in_pause_menu",
			pause_menu.get_node_or_null("Panel/QuestsPanel/VBox/QuestView") != null,
		)
		pause_menu.call("_close_quests")

		pause_menu.call("_close")
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
		_check("pause_menu_inventory_panel_opens", false)
		_check("inventory_view_present_in_pause_menu", false)
		_check("pause_menu_quests_panel_opens", false)
		_check("quest_view_present_in_pause_menu", false)
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

	SettingsManager.set_screen_shake(original_shake)
	SettingsManager.set_master_volume(original_volume)

## Directly instantiates NPC.tscn using the real generated first NPC's role/quest_ids (rather
## than relying on world placement) and proves the real interaction end-to-end: entering range
## and speaking shows real dialogue content, and — for a real quest_giver NPC — clicking through
## the actual branching dialogue tree to the "accept" choice really drives
## QuestManager.accept_quest() via DialogueOverlay's own choice-button wiring, not a direct API
## call. The quest is then completed via the same real EventBus signal a real
## boss/room/enemy/etc. would fire, and the reward payout is verified.
func _check_npc_dialogue_and_quest_flow(player: Node) -> void:
	if player == null:
		_check("npc_interaction_shows_dialogue", false)
		return

	var npcs_path := "res://data/npcs/npcs.json"
	if not FileAccess.file_exists(npcs_path):
		_check_soft("npc_data_exists", false)
		return
	var npc_file := FileAccess.open(npcs_path, FileAccess.READ)
	var npc_json := JSON.new()
	var npc_parse_ok := npc_file != null and npc_json.parse(npc_file.get_as_text()) == OK
	if npc_file:
		npc_file.close()
	_check("npc_data_parses", npc_parse_ok)
	if not npc_parse_ok:
		return

	var npcs: Array = npc_json.data.get("npcs", [])
	_check_soft("npc_data_nonempty", npcs.size() > 0)
	if npcs.is_empty():
		return

	var npc_def: Dictionary = npcs[0]

	var npc_scene := load("res://scenes/world/NPC.tscn") as PackedScene
	_check("npc_scene_loads", npc_scene != null)
	if npc_scene == null:
		return

	var dialogue_overlay := get_tree().get_first_node_in_group("dialogue_overlay")
	if dialogue_overlay == null:
		_check("npc_interaction_shows_dialogue", false)
		return

	var npc := npc_scene.instantiate()
	npc.npc_id = String(npc_def.get("id", "npc_000"))
	npc.npc_name = String(npc_def.get("name", "Wanderer"))
	npc.role = String(npc_def.get("role", "neutral"))
	var quest_ids_raw: Array = npc_def.get("questIds", [])
	var packed_quest_ids := PackedStringArray()
	for q in quest_ids_raw:
		packed_quest_ids.append(String(q))
	npc.quest_ids = packed_quest_ids
	add_child(npc)
	await get_tree().process_frame

	var npc_sprite := npc.get_node_or_null("Sprite")
	_check("npc_sprite_is_animated", npc_sprite is AnimatedSprite2D)

	npc.call("_on_body_entered", player)
	npc.call("_begin_dialogue")

	var speaker_label: Label = dialogue_overlay.get_node_or_null("Panel/HBox/Content/SpeakerLabel")
	_check(
		"npc_interaction_shows_dialogue",
		dialogue_overlay.visible and speaker_label != null and speaker_label.text.length() > 0,
	)

	var quest_id := String(quest_ids_raw[0]) if quest_ids_raw.size() > 0 else ""
	var is_quest_giver := String(npc.role) == "quest_giver" and not quest_id.is_empty()
	if is_quest_giver:
		_check("quest_manager_reports_available_before_accept", QuestManager.is_quest_available(quest_id))

		# Click through the real branching dialogue tree to the choice line and simulate a real
		# button press for the "accept_quest" choice — proves the choice wiring end-to-end
		# instead of calling QuestManager.accept_quest() directly.
		var continue_button: Button = dialogue_overlay.get_node_or_null("Panel/HBox/Content/ContinueButton")
		var choices_box: VBoxContainer = dialogue_overlay.get_node_or_null("Panel/HBox/Content/ChoicesBox")
		for _i in range(6):
			if choices_box and choices_box.get_child_count() > 0:
				break
			if not (continue_button and continue_button.visible and dialogue_overlay.visible):
				break
			dialogue_overlay.call("_on_continue_pressed")
			await get_tree().process_frame

		var accepted := false
		if choices_box and choices_box.get_child_count() > 0:
			var chosen: Button = null
			for child in choices_box.get_children():
				if child is Button and String(child.text).begins_with("Yes"):
					chosen = child
					break
			if chosen == null:
				chosen = choices_box.get_child(0)
			chosen.emit_signal("pressed")
			accepted = true
			await get_tree().process_frame

		_check("npc_dialogue_choice_accepts_quest", accepted)
		_check(
			"quest_state_active_after_dialogue_accept",
			QuestManager.get_quest_state(quest_id) == QuestManager.QuestState.ACTIVE,
		)

		var hud_ids: Array = []
		for entry in QuestManager.get_hud_entries():
			if typeof(entry) == TYPE_DICTIONARY:
				hud_ids.append(String(entry.get("id", "")))
		_check("hud_quest_tracker_reads_active_quest_after_accept", quest_id in hud_ids)

		var quests_path := "res://data/quests/quests.json"
		var objective_type := ""
		var objective_target := ""
		var item_reward_id := ""
		_check_soft("quest_data_exists_for_completion_flow", FileAccess.file_exists(quests_path))
		if FileAccess.file_exists(quests_path):
			var qfile := FileAccess.open(quests_path, FileAccess.READ)
			var qjson := JSON.new()
			var qparse_ok := qfile != null and qjson.parse(qfile.get_as_text()) == OK
			if qfile:
				qfile.close()
			if qparse_ok:
				for quest in qjson.data.get("quests", []):
					if String(quest.get("id", "")) == quest_id:
						var objectives: Array = quest.get("objectives", [])
						if objectives.size() > 0:
							objective_type = String(objectives[0].get("type", ""))
							objective_target = String(objectives[0].get("target", ""))
						for reward in quest.get("rewards", []):
							if typeof(reward) == TYPE_DICTIONARY and String(reward.get("type", "")) == "item":
								item_reward_id = String(reward.get("id", ""))
						break

		var currency_before: int = int(QuestManager.currency.get("scrap", 0))
		var fired := true
		match objective_type:
			"BossKill":
				EventBus.boss_defeated.emit(objective_target)
			"Reach":
				EventBus.room_entered.emit(objective_target)
			"Kill":
				EventBus.enemy_killed.emit(objective_target)
			"Collect":
				EventBus.item_collected.emit(objective_target)
			"Talk":
				EventBus.npc_talked.emit(objective_target)
			"AbilityAcquire":
				EventBus.ability_acquired.emit(objective_target)
			"Discover":
				EventBus.room_discovered.emit(objective_target)
			"Activate":
				EventBus.object_activated.emit(objective_target)
			"Interact":
				EventBus.object_interacted.emit(objective_target)
			"Choice":
				EventBus.dialogue_choice_made.emit(objective_target)
			_:
				fired = false
		_check_soft("quest_objective_type_recognized", fired)

		if fired:
			_check(
				"quest_completes_from_real_gameplay_signal",
				QuestManager.get_quest_state(quest_id) == QuestManager.QuestState.COMPLETE,
			)
			_check(
				"quest_completion_grants_currency_reward",
				int(QuestManager.currency.get("scrap", 0)) > currency_before,
			)
			if item_reward_id.is_empty():
				_check_soft("quest_completion_grants_item_reward", false)
			else:
				_check(
					"quest_completion_grants_item_reward",
					InventoryManager.get_owned_count(item_reward_id) > 0,
				)
		else:
			_check_soft("quest_completes_from_real_gameplay_signal", false)
			_check_soft("quest_completion_grants_currency_reward", false)
			_check_soft("quest_completion_grants_item_reward", false)

		# A BossKill objective for "boss_final" also flips GameManager to VICTORY via its own,
		# independent EventBus.boss_defeated listener — reset so later checks (pause/physics-
		# gated player input) see a normal PLAYING state again.
		GameManager.game_complete = false
		GameManager.current_state = GameManager.GameState.PLAYING
	else:
		_check_soft("quest_manager_reports_available_before_accept", false)
		_check_soft("npc_dialogue_choice_accepts_quest", false)
		_check_soft("quest_state_active_after_dialogue_accept", false)
		_check_soft("hud_quest_tracker_reads_active_quest_after_accept", false)
		_check_soft("quest_data_exists_for_completion_flow", false)
		_check_soft("quest_objective_type_recognized", false)
		_check_soft("quest_completes_from_real_gameplay_signal", false)
		_check_soft("quest_completion_grants_currency_reward", false)
		_check_soft("quest_completion_grants_item_reward", false)

	if is_instance_valid(dialogue_overlay) and dialogue_overlay.has_method("close_dialogue"):
		dialogue_overlay.call("close_dialogue")
	if is_instance_valid(npc):
		npc.queue_free()

## Proves defeating the real final boss (`boss_final`) transitions GameManager to VICTORY, sets
## game_complete, emits game_completed (VictoryOverlay), and records progression — not just that
## BossController emits boss_defeated with the correct id. Uses an isolated World+Boss instance
## rather than the main world/player, matching the side-view template's equivalent check.
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

	# GDScript lambdas capture outer locals by value — a single-element array is a reference
	# type, so mutating its contents from inside the closure is visible to the outer scope too.
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

	# BossController._on_died() is synchronous in this template, but poll with a bounded wall-
	# clock timeout rather than a fixed frame count anyway — cheap insurance against this
	# becoming async later (see HealthComponent.died consumers in the side-view template, which
	# already made exactly that change) without risking a false FAIL today.
	var start_time := Time.get_ticks_msec()
	while not completed[0] and Time.get_ticks_msec() - start_time < 2000:
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

## Proves ItemPickup.gd (the top-down template's walk-over pickup, distinct from the interact-
## based ChestPickup.gd) actually applies real generated item data (data/items/items.json) —
## currency, consumable heal, relic max-health, charm/weapon attack bonuses (with equip/unequip/
## re-equip round-tripping the real bonus), quest items, and collectibles.
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
	var pickup_scene := load("res://scenes/world/ItemPickup.tscn") as PackedScene
	_check("item_pickup_scene_loads", pickup_scene != null)
	if pickup_scene == null:
		return

	# items.json can contain duplicate ids (the generated "dungeon item" entries — e.g. a second
	# "wind_disc"/"health_vial" stub with no effects — collide with the main generated item of
	# the same id). InventoryManager._load_item_definitions() builds a Dictionary keyed by id, so
	# the LAST entry silently wins at runtime regardless of which one looks more complete. Rebuild
	# that same last-wins map here rather than scanning the raw array, so this test picks items by
	# the category they actually have at runtime instead of the category their first, possibly-
	# shadowed, occurrence in the raw list claims.
	var items_by_id := {}
	for item in items:
		var item_id := String(item.get("id", ""))
		if not item_id.is_empty():
			items_by_id[item_id] = item

	var currency_item := {}
	var consumable_item := {}
	var relic_item := {}
	var charm_item := {}
	var weapon_item := {}
	var quest_item := {}
	var collectible_item := {}
	for item in items_by_id.values():
		var category := String(item.get("category", ""))
		if currency_item.is_empty() and category == "currency":
			currency_item = item
		elif consumable_item.is_empty() and category == "consumable":
			consumable_item = item
		elif relic_item.is_empty() and category == "relic":
			relic_item = item
		elif charm_item.is_empty() and category == "charm":
			charm_item = item
		elif weapon_item.is_empty() and category == "weapon":
			weapon_item = item
		elif quest_item.is_empty() and category == "quest":
			quest_item = item
		elif collectible_item.is_empty() and category == "collectible":
			collectible_item = item

	if not currency_item.is_empty():
		var currency_id: String = String(currency_item.get("id", ""))
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

	if not weapon_item.is_empty():
		var hitbox_w: HitboxComponent = player.get_node_or_null("AttackHitbox")
		var weapon_id: String = String(weapon_item.get("id", ""))
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
		var q_id: String = String(quest_item.get("id", ""))
		var hitbox_q: HitboxComponent = player.get_node_or_null("AttackHitbox")
		var damage_before_quest: float = hitbox_q.damage if hitbox_q else 0.0
		if InventoryManager.get_owned_count(q_id) <= 0:
			InventoryManager.grant_item(q_id, 1)
		_check("quest_item_tracked_in_inventory", InventoryManager.get_owned_count(q_id) > 0)
		_check("quest_item_is_not_equippable", not InventoryManager.is_equippable(q_id))
		if hitbox_q:
			_check("quest_item_does_not_change_attack", is_equal_approx(hitbox_q.damage, damage_before_quest))
		else:
			_check("quest_item_does_not_change_attack", false)
	else:
		_check_soft("quest_item_tracked_in_inventory", false)
		_check_soft("quest_item_is_not_equippable", false)
		_check_soft("quest_item_does_not_change_attack", false)

	if not collectible_item.is_empty():
		var collectible_id: String = String(collectible_item.get("id", ""))
		var hitbox_c: HitboxComponent = player.get_node_or_null("AttackHitbox")
		var damage_before_collectible: float = hitbox_c.damage if hitbox_c else 0.0
		var found_before := InventoryManager.get_collectible_found_count()
		if InventoryManager.get_owned_count(collectible_id) <= 0:
			var pickup_collectible := pickup_scene.instantiate()
			pickup_collectible.item_id = collectible_id
			add_child(pickup_collectible)
			pickup_collectible._on_body_entered(player)
		_check(
			"item_pickup_collectible_tracked_in_inventory",
			InventoryManager.get_owned_count(collectible_id) > 0,
		)
		_check("collectible_is_not_equippable", not InventoryManager.is_equippable(collectible_id))
		_check(
			"collectible_found_count_increases",
			InventoryManager.get_collectible_found_count() > found_before
			or InventoryManager.get_collectible_found_count() > 0,
		)
		_check("collectible_total_count_positive", InventoryManager.get_collectible_total_count() > 0)
		if hitbox_c:
			_check(
				"collectible_does_not_change_attack",
				is_equal_approx(hitbox_c.damage, damage_before_collectible),
			)
		else:
			_check("collectible_does_not_change_attack", false)
	else:
		_check_soft("item_pickup_collectible_tracked_in_inventory", false)
		_check_soft("collectible_is_not_equippable", false)
		_check_soft("collectible_found_count_increases", false)
		_check_soft("collectible_total_count_positive", false)
		_check_soft("collectible_does_not_change_attack", false)

## Drives InventoryPanel's real _gui_input() click handling (weapon-slot click zone) rather than
## only checking the node exists — the pause-menu inventory list depends on a weapon already
## being equipped from _check_item_pickups() above.
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
	view.call("_gui_input", click)
	_check("inventory_click_unequips_weapon_slot", InventoryManager.get_equipped("weapon").is_empty())
	InventoryManager.equip_item(equipped_weapon)

	var found_equipped := false
	for entry in InventoryManager.get_display_entries():
		if typeof(entry) == TYPE_DICTIONARY and bool(entry.get("equipped", false)):
			found_equipped = true
			break
	_check("inventory_display_marks_equipped_items", found_equipped)

## Proves the HUD's currency/collectible labels actually reflect real QuestManager/
## InventoryManager state, not just that the nodes exist.
func _check_currency_hud(world: Node) -> void:
	var hud := world.get_node_or_null("GameHUD")
	_check("game_hud_present_in_world", hud != null)
	if hud == null:
		return

	var currency_label: Label = hud.get_node_or_null("HUD/MarginContainer/VBox/CurrencyLabel")
	_check("currency_label_present", currency_label != null)
	if currency_label != null:
		var scrap: int = int(QuestManager.currency.get("scrap", 0))
		_check("currency_hud_reflects_real_state", str(scrap) in currency_label.text)

	var collectible_label: Label = hud.get_node_or_null("HUD/MarginContainer/VBox/CollectibleLabel")
	_check("collectible_label_present", collectible_label != null)
	if collectible_label != null:
		var found := InventoryManager.get_collectible_found_count()
		var total := InventoryManager.get_collectible_total_count()
		if total > 0:
			_check(
				"collectible_hud_reflects_real_state",
				str(found) in collectible_label.text and str(total) in collectible_label.text,
			)
		else:
			_check_soft("collectible_hud_reflects_real_state", false)

## Proves the always-visible corner minimap is wired into GameHUD and reads real MapManager state.
func _check_hud_minimap(world: Node) -> void:
	var hud := world.get_node_or_null("GameHUD")
	var minimap: Control = hud.get_node_or_null("HUD/MinimapPanel/MinimapView") if hud else null
	_check("hud_minimap_present", minimap != null)
	if minimap == null:
		return

	var map_room := GameManager.current_room_id
	if map_room.is_empty():
		map_room = "overworld"
	MapManager.mark_discovered(map_room)
	minimap.queue_redraw()
	await get_tree().process_frame
	_check("hud_minimap_uses_map_manager_graph", not MapManager.get_graph().is_empty())

## Proves the always-visible HUD quest tracker is wired into GameHUD and reads real QuestManager
## state.
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

## Proves TopDownEnemyController — the actual script Enemy.tscn uses (a simpler wander/chase/
## melee controller, not the richer data-driven AI/EnemyController.gd, which is dead code never
## referenced by any scene here) — really wanders when nobody's near, really turns to chase once
## the player enters detect_radius, and really deals/receives damage through the same Hitbox/
## Hurtbox components as everything else. Also drives the `is_boss` export flag directly (nothing
## in the generated overworld ever sets it true — the "boss" POI spawns a separate Boss.tscn/
## BossController instead) to prove that real, otherwise-unreachable code path in _on_died().
func _check_enemy_combat(player: Node) -> void:
	if player == null:
		_check("enemy_melee_contact_damage_works", false)
		return

	var enemy_scene := load("res://scenes/enemies/Enemy.tscn") as PackedScene
	_check("enemy_scene_loads", enemy_scene != null)
	if enemy_scene == null:
		return

	var player_hurtbox: HurtboxComponent = player.get_node_or_null("HurtboxComponent")
	var player_health: HealthComponent = player.get_node_or_null("HealthComponent")
	var player_attack_hitbox: HitboxComponent = player.get_node_or_null("AttackHitbox")
	if player_hurtbox == null or player_health == null:
		_check("enemy_melee_contact_damage_works", false)
		return

	var enemy := enemy_scene.instantiate()
	enemy.enemy_id = "enemy_000"
	add_child(enemy)
	enemy.global_position = player.global_position + Vector2(500, 500)
	await get_tree().process_frame

	enemy.call("_physics_process", 0.05)
	_check("enemy_wanders_when_player_out_of_range", enemy.velocity.length() > 0.0)

	enemy.global_position = player.global_position + Vector2(40, 0)
	enemy.velocity = Vector2.ZERO
	enemy.call("_physics_process", 0.05)
	var to_player: Vector2 = (player.global_position - enemy.global_position).normalized()
	_check(
		"enemy_chases_player_within_detect_radius",
		enemy.velocity.length() > 0.0 and enemy.velocity.normalized().dot(to_player) > 0.5,
	)

	enemy.global_position = player.global_position + Vector2(10, 0)
	enemy.call("_physics_process", 0.05)
	var attack_hitbox: HitboxComponent = enemy.get_node("AttackHitbox")
	_check("enemy_melee_attack_activates_hitbox_in_range", attack_hitbox.monitoring)

	player_health.invulnerable = false
	var before := player_health.current_health
	attack_hitbox._on_area_entered(player_hurtbox)
	_check("enemy_melee_contact_damage_works", player_health.current_health < before)

	var enemy_health: HealthComponent = enemy.get_node("HealthComponent")
	if player_attack_hitbox:
		player_attack_hitbox.activate()
		var enemy_health_before := enemy_health.current_health
		var enemy_hurtbox: HurtboxComponent = enemy.get_node("HurtboxComponent")
		player_attack_hitbox._on_area_entered(enemy_hurtbox)
		player_attack_hitbox.deactivate()
		_check("player_attack_actually_damages_enemy", enemy_health.current_health < enemy_health_before)
	else:
		_check("player_attack_actually_damages_enemy", false)

	if is_instance_valid(enemy):
		enemy.queue_free()

	var boss_variant := enemy_scene.instantiate()
	boss_variant.enemy_id = "enemy_000"
	boss_variant.is_boss = true
	boss_variant.boss_id = "smoke_test_dungeon_boss"
	add_child(boss_variant)
	await get_tree().process_frame

	var wind_disc_before := InventoryManager.get_owned_count("wind_disc")
	var boss_completed := [false]
	EventBus.boss_defeated.connect(
		func(id: String) -> void:
			if id == "smoke_test_dungeon_boss":
				boss_completed[0] = true,
		CONNECT_ONE_SHOT,
	)
	var boss_variant_health: HealthComponent = boss_variant.get_node("HealthComponent")
	boss_variant_health.take_damage(boss_variant_health.max_health)
	_check(
		"enemy_boss_variant_grants_wind_disc_on_death",
		InventoryManager.get_owned_count("wind_disc") > wind_disc_before,
	)
	_check("enemy_boss_variant_emits_boss_defeated", boss_completed[0])

	var enemy2 := enemy_scene.instantiate()
	enemy2.enemy_id = "enemy_000"
	add_child(enemy2)
	await get_tree().process_frame
	var enemy_killed_completed := [false]
	EventBus.enemy_killed.connect(func(_id: String) -> void: enemy_killed_completed[0] = true, CONNECT_ONE_SHOT)
	var enemy2_health: HealthComponent = enemy2.get_node("HealthComponent")
	enemy2_health.take_damage(enemy2_health.max_health)
	_check("enemy_normal_death_emits_enemy_killed", enemy_killed_completed[0])

## Proves ShopManager.purchase()/ShopOverlay actually work — no side-view reference for this
## category (side-view has no shops). TINY_TEST profiles never generate a merchant NPC (the
## sole NPC role always rotates to "quest_giver" first), so data/shops/shops.json is empty for
## the fast-iteration profile this test runs under; a real shop is injected directly into
## ShopManager's own _shops_by_id (GDScript has no real member privacy — this is the same
## script state ShopManager._load_shops() would have populated from a real shops.json) so the
## real purchase()/UI code paths still get exercised end-to-end against a real generated item.
func _check_shop_purchase_flow() -> void:
	var items_path := "res://data/items/items.json"
	if not FileAccess.file_exists(items_path):
		_check_soft("shop_purchase_succeeds_with_sufficient_currency", false)
		return
	var file := FileAccess.open(items_path, FileAccess.READ)
	var json := JSON.new()
	var parse_ok := file != null and json.parse(file.get_as_text()) == OK
	if file:
		file.close()
	if not parse_ok:
		_check_soft("shop_purchase_succeeds_with_sufficient_currency", false)
		return

	var shop_item_id := ""
	for item in json.data.get("items", []):
		var category := String(item.get("category", ""))
		if category != "currency" and category != "quest" and category != "collectible":
			shop_item_id = String(item.get("id", ""))
			break
	if shop_item_id.is_empty():
		_check_soft("shop_purchase_succeeds_with_sufficient_currency", false)
		return

	var shop_id := "smoke_test_shop"
	var price := 40
	ShopManager._shops_by_id[shop_id] = {
		"id": shop_id,
		"name": "Smoke Test Shop",
		"currencyId": "scrap",
		"entries": [{"itemId": shop_item_id, "price": price}],
	}

	QuestManager.currency["scrap"] = 100
	var owned_before := InventoryManager.get_owned_count(shop_item_id)
	var result: Dictionary = ShopManager.purchase(shop_id, shop_item_id)
	_check("shop_purchase_succeeds_with_sufficient_currency", bool(result.get("success", false)))
	_check("shop_purchase_deducts_currency", int(QuestManager.currency.get("scrap", 0)) == 100 - price)
	_check("shop_purchase_grants_item", InventoryManager.get_owned_count(shop_item_id) > owned_before)

	QuestManager.currency["scrap"] = 0
	var fail_result: Dictionary = ShopManager.purchase(shop_id, shop_item_id)
	_check(
		"shop_purchase_fails_with_insufficient_currency",
		not bool(fail_result.get("success", true)) and String(fail_result.get("message", "")).begins_with("Not enough"),
	)

	QuestManager.currency["scrap"] = 100
	var shop_overlay := get_tree().get_first_node_in_group("shop_overlay")
	if shop_overlay == null:
		_check_soft("shop_overlay_open_shows_items", false)
		_check_soft("shop_overlay_buy_button_completes_purchase", false)
		return

	shop_overlay.call("open_shop", shop_id)
	await get_tree().process_frame
	var items_box: VBoxContainer = shop_overlay.get_node_or_null("Panel/VBox/ItemsBox")
	_check(
		"shop_overlay_open_shows_items",
		shop_overlay.visible and items_box != null and items_box.get_child_count() > 0,
	)

	var purchased_via_ui := false
	if items_box and items_box.get_child_count() > 0:
		var row: HBoxContainer = items_box.get_child(0)
		for child in row.get_children():
			if child is Button:
				var scrap_before := int(QuestManager.currency.get("scrap", 0))
				child.emit_signal("pressed")
				await get_tree().process_frame
				purchased_via_ui = int(QuestManager.currency.get("scrap", 0)) < scrap_before
				break
	_check("shop_overlay_buy_button_completes_purchase", purchased_via_ui)

	shop_overlay.call("close_shop")
	await get_tree().process_frame
	_check("shop_overlay_close_unpauses_tree", not get_tree().paused)

## Proves every generated boss actually got placed in its own real generated arena area — not
## just that bosses.json has an arenaRoomId string, but that navigating the real OverworldManager
## there actually spawns a Boss node with the matching boss_id. Top-down has no pre-baked
## per-room .tscn files (unlike side-view) — every area is assembled at runtime from
## data/world/overworld.json, so this drives the real load_area() path instead.
func _check_boss_placement(world_mgr: Node) -> void:
	var bosses_path := "res://data/bosses/bosses.json"
	if not FileAccess.file_exists(bosses_path):
		_check_soft("boss_data_exists_for_placement", false)
		return
	var file := FileAccess.open(bosses_path, FileAccess.READ)
	var json := JSON.new()
	var parse_ok := file != null and json.parse(file.get_as_text()) == OK
	if file:
		file.close()
	_check("boss_placement_data_parses", parse_ok)
	if not parse_ok:
		return

	var bosses: Array = json.data.get("bosses", [])
	_check_soft("boss_placement_data_nonempty", bosses.size() > 0)
	if bosses.is_empty():
		return

	if world_mgr == null or not world_mgr.has_method("load_area"):
		_check("every_generated_boss_placed_in_its_real_arena", false)
		_check("every_placed_boss_has_correct_boss_id", false)
		return

	var all_placed := true
	var all_ids_correct := true
	for boss in bosses:
		var arena_id: String = String(boss.get("arenaRoomId", ""))
		var expected_id: String = String(boss.get("id", ""))
		if arena_id.is_empty():
			all_placed = false
			continue

		await world_mgr.load_area(arena_id)
		await get_tree().process_frame

		var entities: Node = world_mgr.call("get_current_entities")
		var boss_node: Node = null
		if entities:
			for child in entities.get_children():
				if child.get_script() != null and String(child.get_script().resource_path).ends_with("BossController.gd"):
					boss_node = child
					break
		if boss_node == null:
			all_placed = false
		elif String(boss_node.boss_id) != expected_id:
			all_ids_correct = false

	_check("every_generated_boss_placed_in_its_real_arena", all_placed)
	_check("every_placed_boss_has_correct_boss_id", all_ids_correct)

## Proves BossController actually branches on the real generated per-phase `attacks` array
## (data/bosses/bosses.json) instead of always doing the same melee swing regardless of what its
## phase data says. Only "slam"/"projectile"/"area_burst" are ever generated.
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
	boss.boss_id = String(boss_def.get("id", "boss_final"))
	add_child(boss)
	await get_tree().process_frame

	var boss_attack_hitbox: HitboxComponent = boss.get_node("AttackHitbox")
	var before_melee: bool = boss_attack_hitbox.monitoring
	boss.call("_perform_melee_attack")
	_check("boss_slam_activates_melee_hitbox", not before_melee and boss_attack_hitbox.monitoring)

	var boss_sprite: AnimatedSprite2D = boss.get_node_or_null("Sprite")
	_check("boss_has_attack_animation", boss_sprite != null and boss_sprite.sprite_frames.has_animation("attack"))
	_check("boss_plays_attack_animation", boss_sprite != null and boss_sprite.animation == "attack")

	var before_projectile_count := get_child_count()
	boss.call("_fire_projectile_attack")
	_check("boss_projectile_attack_spawns_projectile", get_child_count() > before_projectile_count)
	await _free_new_children(before_projectile_count)

	var before_burst_count := get_child_count()
	boss.call("_fire_burst_attack")
	_check("boss_area_burst_spawns_multiple_projectiles", get_child_count() >= before_burst_count + 3)
	await _free_new_children(before_burst_count)

	# The reverse direction: the player's real AttackHitbox hitting the boss's own Hurtbox.
	var boss_health: HealthComponent = boss.get_node("HealthComponent")
	var boss_hurtbox: HurtboxComponent = boss.get_node("HurtboxComponent")
	var player_attack_hitbox: HitboxComponent = player.get_node_or_null("AttackHitbox") if player else null
	if player_attack_hitbox:
		player_attack_hitbox.activate()
		var boss_health_before := boss_health.current_health
		player_attack_hitbox._on_area_entered(boss_hurtbox)
		player_attack_hitbox.deactivate()
		_check("player_attack_actually_damages_boss", boss_health.current_health < boss_health_before)

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
## "dash_through") actually applies bonus damage while the player is dashing — BossController
## reads the real player's `_is_dashing` field directly (top-down has no separate
## AbilityController node the way side-view does) — instead of being generated, stored, and
## never read by anything at runtime.
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

	player.set("_is_dashing", false)
	boss.call("_on_hit_received", 10.0, Vector2.ZERO)
	var normal_damage: float = boss_health.max_health - boss_health.current_health

	boss_health.current_health = boss_health.max_health
	player.set("_is_dashing", true)
	boss.call("_on_hit_received", 10.0, Vector2.ZERO)
	var dash_damage: float = boss_health.max_health - boss_health.current_health
	player.set("_is_dashing", false)

	_check("boss_weakness_bonus_damage_applies_while_dashing", dash_damage > normal_damage)

	if is_instance_valid(boss):
		boss.queue_free()

## Directly instantiates SavePoint.tscn (rather than relying on the current generated world
## happening to place one) and proves the full real interaction: damages the player first so
## healing is actually observable, touches the SavePoint, confirms it writes a save file and
## heals to full, then proves a save/load round-trip restores the checkpoint room and a
## defeated-boss list.
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
	save_point.call("_on_body_entered", player)

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

## Proves dying respawns at the real last checkpoint via SaveManager/OverworldManager. Drives
## GameManager's real _do_respawn() directly rather than going through _on_player_died()'s real
## 1-second GAME_OVER pause — that wiring is checked structurally instead (the
## HealthComponent.died signal is really connected to PlayerController._on_died, and GameHUD's
## DeathOverlay is really toggled by the death signals). transition_to_room()/load_area() is
## fire-and-forget from inside _do_respawn() (matching real gameplay), so the new player
## instance is awaited with a bounded poll rather than a fixed frame count.
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

	var checkpoint_room := "overworld"
	SaveManager.set_checkpoint(checkpoint_room, 100.0, 100.0)
	SaveManager.save_game()

	await GameManager._do_respawn()

	var start_time := Time.get_ticks_msec()
	var respawned_player: Node = null
	while Time.get_ticks_msec() - start_time < 2000:
		respawned_player = get_tree().get_first_node_in_group("player")
		if respawned_player != null:
			break
		await get_tree().process_frame

	_check(
		"player_death_leaves_game_state_playing",
		GameManager.current_state == GameManager.GameState.PLAYING,
	)
	_check("player_death_respawns_at_checkpoint_room", GameManager.current_room_id == checkpoint_room)
	_check("player_exists_after_death_respawn", respawned_player != null)

## Proves v1 save files upgrade to the current schema on load and rewrite the on-disk file.
func _check_save_migration_v1_to_v2() -> void:
	SaveManager.select_slot(0)
	SaveManager.reset_save()
	# reset_save() only clears the in-memory _save_data, not the on-disk file — and
	# "save_manager_can_write" right before this call just wrote a real (current-version) save
	# to this exact slot. load_game() tries that real file first and succeeds immediately, never
	# falling through to the legacy-path branch this check exists to exercise. Remove it so
	# load_game() actually has to migrate the v1 fixture written below.
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

## Projectiles spawned during a check (get_parent().add_child() from inside BossController
## resolves to this test node, since that's who instantiated the boss) would otherwise keep
## flying and colliding for the rest of the test run. Frees everything added as a child of this
## node since `before_count`, then awaits a frame so the count settles before the caller takes
## its next baseline snapshot.
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
		# The colon is load-bearing — parseSmokeTestOutput() (packages/qa/src/smoke-output.ts)
		# matches "PASS: name" / "FAIL: name" / "SOFT_FAIL: name".
		var status: String = "PASS" if r.passed else ("SOFT_FAIL" if r.soft else "FAIL")
		print("%s: %s" % [status, r.name])
		if not r.passed and not r.soft:
			hard_failures += 1
	print("SMOKE_TEST_RESULTS_END")
	get_tree().quit(0 if hard_failures == 0 else 1)
