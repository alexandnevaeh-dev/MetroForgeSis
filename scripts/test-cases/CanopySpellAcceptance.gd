extends Node
var checks := 0
var failures := 0
var world: Node2D
const CAPTURES := "res://.qa/spells"
func check(label: String, ok: bool) -> void:
	checks += 1
	print(("PASS: " if ok else "FAIL: ")+label)
	if not ok: failures += 1
func capture(label: String) -> void:
	await RenderingServer.frame_post_draw
	check("capture_"+label,get_viewport().get_texture().get_image().save_png(CAPTURES+"/"+label+".png") == OK)
func enter(id: String) -> Node:
	world.load_area(id)
	await get_tree().create_timer(0.15).timeout
	return get_tree().get_first_node_in_group("player")
func learn(id: String) -> void:
	for entity in world.get_current_entities().get_children():
		if entity is ChestPickup and entity.item_id == id: entity.interact(get_tree().get_first_node_in_group("player")); return
	check("chest_exists_"+id,false)
func talk_and_accept(quest_id: String) -> void:
	for entity in world.get_current_entities().get_children():
		if entity.get("quest_ids") != null and quest_id in entity.quest_ids:
			entity.call("_begin_dialogue")
			var overlay = get_tree().get_first_node_in_group("dialogue_overlay")
			check(quest_id+"_real_dialogue",overlay.is_active())
			await capture(quest_id+"-dialogue")
			var choice: Dictionary = DialogueManager.get_line_data(quest_id+"_offer",0).choices[0]
			overlay.call("_on_choice_pressed",choice)
			check(quest_id+"_accepted_from_choice",QuestManager.get_quest_state(quest_id)==QuestManager.QuestState.ACTIVE)
			return
	check("quest_npc_exists_"+quest_id,false)
func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(CAPTURES))
	GameManager.start_new_game()
	world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.2).timeout
	var player = get_tree().get_first_node_in_group("player")
	var spells = player.get_node("Spells")
	check("three_real_spell_definitions",spells.definitions.size()==3)
	check("unlearned_spell_cannot_cast",not spells.cast("seedflare") and spells.mana==100)
	check("return_seed_story_active",QuestManager.get_quest_state("story_return_seed")==QuestManager.QuestState.ACTIVE)
	player = await enter("canopy_hamlet")
	check("two_real_3d_houses",get_tree().get_first_node_in_group("hd2d_presenter").terrain.has_node("lastlight_house") and get_tree().get_first_node_in_group("hd2d_presenter").terrain.has_node("keeper_house"))
	await capture("lastlight-hamlet")
	await talk_and_accept("story_living_words")
	player = await enter("canopy_archive")
	await talk_and_accept("story_oath_memory")
	learn("memory_bell")
	check("first_testimony_is_owned",InventoryManager.get_owned_count("memory_bell")==1)
	player = await enter("canopy_observatory")
	learn("seedflare")
	learn("memory_crown")
	check("testimony_quest_completes",QuestManager.get_quest_state("story_oath_memory")==QuestManager.QuestState.COMPLETE)
	check("testimony_text_preserved",InventoryManager.get_item_definition("memory_crown").description.contains("promise"))
	player = await enter("overworld")
	spells = player.get_node("Spells")
	player.global_position = Vector2(480,352)
	player.facing = Vector2.RIGHT
	player.facing_name = "E"
	var enemy = load("res://scenes/enemies/Enemy.tscn").instantiate()
	world.get_current_entities().add_child(enemy)
	enemy.global_position = player.global_position+Vector2(85,0)
	enemy.set_physics_process(false)
	var before: float = enemy.health.current_health
	Input.action_press("spell_seedflare")
	await get_tree().physics_frame
	await get_tree().physics_frame
	Input.action_release("spell_seedflare")
	check("real_input_casts_spell",spells.cast_serial==1)
	check("spell_spends_actual_essence",spells.mana<84 and spells.mana>80)
	var sprite: AnimatedSprite2D = player.get_node("Sprite")
	check("crisp_cast_strip_12_frames",sprite.animation=="cast_E" and sprite.sprite_frames.get_frame_count("cast_E")==12)
	check("cast_authored_24fps",sprite.sprite_frames.get_animation_speed("cast_E")==24)
	check("cooldown_rejects_repeat",not spells.cast("seedflare"))
	await capture("seedflare-cast")
	await get_tree().create_timer(0.35).timeout
	check("spell_projectile_deals_18_real_damage",enemy.health.current_health==before-18)
	enemy.queue_free()
	player = await enter("canopy_cistern")
	learn("rootward")
	spells = player.get_node("Spells")
	check("essence_and_cooldown_survive_room_change",spells.mana<100 and spells.get_cooldown("seedflare")>0)
	check("rootward_casts",spells.cast("rootward"))
	player.health.invulnerable = false
	var hp_before: float = player.health.current_health
	player.health.take_damage(14)
	check("rootward_reduces_actual_damage",is_equal_approx(hp_before-player.health.current_health,8))
	await capture("rootward-protection")
	player = await enter("canopy_moonwell")
	learn("bloomstep")
	spells = player.get_node("Spells")
	check("three_spell_story_completes",QuestManager.get_quest_state("story_living_words")==QuestManager.QuestState.COMPLETE)
	check("quest_currency_rewards_real",int(QuestManager.currency.scrap)>=80)
	await get_tree().process_frame
	var pause_menu = world.get_node("PauseMenu")
	pause_menu.call("_open")
	pause_menu.call("_open_inventory")
	var inventory = pause_menu.get_node("Panel/InventoryPanel/VBox/InventoryView")
	inventory.call("_rebuild_item_rows")
	var wanted: int = inventory.get("_item_rows").find("memory_crown")
	var scroll := InputEventMouseButton.new()
	scroll.button_index = MOUSE_BUTTON_WHEEL_DOWN
	scroll.pressed = true
	for i in range(wanted): inventory.call("_gui_input",scroll)
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = Vector2(20,96+(wanted-int(inventory.get("_scroll_row")))*18)
	inventory.call("_gui_input",click)
	check("inventory_click_selects_readable_testimony",inventory.get("_selected_item_id")=="memory_crown")
	check("inventory_list_stays_above_description",106+int(inventory.call("_visible_rows"))*18<=inventory.size.y-80)
	await capture("testimony-inventory")
	pause_menu.call("_close")
	await get_tree().create_timer(0.6).timeout
	player.global_position = Vector2(160,352)
	player.facing = Vector2.RIGHT
	var start: Vector2 = player.global_position
	check("bloomstep_casts",spells.cast("bloomstep"))
	await get_tree().create_timer(0.25).timeout
	check("bloomstep_moves_real_body",player.global_position.distance_to(start)>50)
	check("bloomstep_invulnerable_during_dash",player.health.invulnerable)
	await capture("moonwell-bloomstep")
	spells.mana = 0
	check("insufficient_essence_cannot_cast",not spells.cast("seedflare"))
	GameManager.current_state = GameManager.GameState.PAUSED
	spells.mana = 100
	check("paused_game_cannot_cast",not spells.cast("seedflare"))
	GameManager.current_state = GameManager.GameState.PLAYING
	spells.mana = 37
	spells.cooldowns["seedflare"] = 0.9
	check("real_save_succeeds",SaveManager.save_game())
	spells.mana = 99
	InventoryManager.reset_for_new_game()
	check("real_load_succeeds",SaveManager.load_game())
	check("learned_spells_restore_from_real_save",InventoryManager.get_owned_count("seedflare")==1 and InventoryManager.get_owned_count("rootward")==1 and InventoryManager.get_owned_count("bloomstep")==1)
	player = await enter("overworld")
	spells = player.get_node("Spells")
	check("saved_essence_overrides_outgoing_body",spells.mana>=37 and spells.mana<39)
	check("saved_cooldowns_restore_once",spells.get_cooldown("seedflare")>0.65 and spells.get_cooldown("seedflare")<0.9)
	spells.mana = 21
	player = await enter("canopy_clearing")
	check("ordinary_room_does_not_reapply_saved_essence",player.get_node("Spells").mana>=21 and player.get_node("Spells").mana<23)
	player = await enter("overworld")
	spells = player.get_node("Spells")
	player.global_position = Vector2(480,352)
	player.facing = Vector2.RIGHT
	spells.mana = 100
	spells.cooldowns.clear()
	var wall := StaticBody2D.new()
	wall.collision_layer = 1
	var collision := CollisionShape2D.new()
	var rectangle := RectangleShape2D.new()
	rectangle.size = Vector2(20,100)
	collision.shape = rectangle
	wall.add_child(collision)
	world.get_current_entities().add_child(wall)
	wall.global_position = player.global_position+Vector2(60,0)
	enemy = load("res://scenes/enemies/Enemy.tscn").instantiate()
	world.get_current_entities().add_child(enemy)
	enemy.global_position = player.global_position+Vector2(110,0)
	enemy.set_physics_process(false)
	before = enemy.health.current_health
	await get_tree().physics_frame
	check("seedflare_wall_test_casts",spells.cast("seedflare"))
	await get_tree().create_timer(0.7).timeout
	check("seedflare_cannot_damage_through_solid_wall",enemy.health.current_health==before)
	var remaining_shots := 0
	for node in world.get_current_entities().get_children():
		if node.has_meta("player_spell") and not node.is_queued_for_deletion(): remaining_shots += 1
	check("wall_impact_removes_spell_projectile",remaining_shots==0)
	check("bloomstep_wall_test_casts",spells.cast("bloomstep"))
	start = player.global_position
	await get_tree().create_timer(0.4).timeout
	check("bloomstep_stops_before_solid_wall",player.global_position.x-start.x>20 and player.global_position.x-start.x<45)
	enemy.queue_free()
	wall.queue_free()
	await get_tree().create_timer(0.2).timeout
	spells.cooldowns["rootward"] = 0
	check("rootward_expiry_test_casts",spells.cast("rootward"))
	await get_tree().create_timer(2.6).timeout
	check("rootward_armor_expires",spells.ward_time==0 and player.health.ward_armor==0)
	QuestManager.reset_for_new_game()
	check("quest_acceptance_backfills_owned_testimonies",QuestManager.accept_quest("story_oath_memory") and QuestManager.get_quest_state("story_oath_memory")==QuestManager.QuestState.COMPLETE)
	var reward_before: int = QuestManager.currency.scrap
	QuestManager.accept_quest("story_oath_memory")
	check("quest_backfill_rewards_only_once",int(QuestManager.currency.scrap)==reward_before)
	GameManager.start_new_game()
	check("new_game_clears_spell_items_and_quests",InventoryManager.get_owned_count("seedflare")==0 and QuestManager.get_quest_state("story_oath_memory")==QuestManager.QuestState.AVAILABLE and QuestManager.currency.scrap==0)
	print("CANOPY_SPELL_END")
	FileAccess.open(CAPTURES+"/results.json",FileAccess.WRITE).store_string(JSON.stringify({"checks":checks,"failures":failures}))
	get_tree().quit(0 if failures==0 else 1)
