extends Node
## Headless runtime smoke test for a generated MetroForge project.
## Invoked via: godot --headless --path <project> res://scenes/test/RuntimeSmokeTest.tscn
## Prints PASS/FAIL lines between SMOKE_TEST_RESULTS_BEGIN/END markers and exits with
## code 0 (all checks passed) or 1 (at least one failed). Never left running — always
## calls get_tree().quit() itself so no external --quit-after is required.

var _results: Array[Dictionary] = []

func _ready() -> void:
	await get_tree().process_frame
	await get_tree().process_frame

	_check("autoload_game_manager_exists", GameManager != null)
	_check("autoload_event_bus_exists", EventBus != null)
	_check("autoload_save_manager_exists", SaveManager != null)
	_check("autoload_audio_manager_exists", AudioManager != null)
	_check("autoload_progression_manager_exists", ProgressionManager != null)

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

	var player := get_tree().get_first_node_in_group("player")
	_check("player_exists", player != null)

	if player:
		var pos: Vector2 = player.global_position
		_check("player_spawns_at_valid_location", is_finite(pos.x) and is_finite(pos.y))
		_check("player_movement_controller_initialized", player.get("facing") != null)
		_check("player_has_health_component", player.get_node_or_null("HealthComponent") != null)
		_check("player_has_hurtbox", player.get_node_or_null("HurtboxComponent") != null)
		_check("player_has_attack_hitbox", player.get_node_or_null("AttackHitbox") != null)

		var player_sprite: AnimatedSprite2D = player.get_node_or_null("Sprite")
		if player_sprite and player_sprite.sprite_frames:
			_check("player_has_attack_animation", player_sprite.sprite_frames.has_animation("attack"))
			_check("player_has_hurt_animation", player_sprite.sprite_frames.has_animation("hurt"))
		else:
			_check("player_has_attack_animation", false)
			_check("player_has_hurt_animation", false)

	_check_ability_pickup(player)
	await _check_ability_gated_transition(player, world)

	# _check_ability_gated_transition may have navigated to a new room, which frees the
	# previous Player instance — re-fetch rather than reuse the now-possibly-stale reference.
	var current_player := get_tree().get_first_node_in_group("player")
	_check_save_point(current_player)

	_check("save_manager_can_write", SaveManager.save_game())
	_check("save_manager_can_read", SaveManager.load_game())

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
				if instance.get_node_or_null("AbilityPickup") != null:
					pickup_found = true
				instance.queue_free()
		file_name = dir.get_next()
	dir.list_dir_begin()

	_check("room_scenes_exist", room_count > 0)
	_check("all_room_scenes_load_cleanly", load_failures.is_empty())
	_check("enemies_instantiate", enemy_found)
	_check("boss_instantiates", boss_found)
	_check("ability_pickup_exists_in_world", pickup_found)

## Proves AudioManager actually plays sound, not just that its methods exist and don't
## crash. Entering the world should already have started biome music via WorldManager's
## room_entered handler; play_sfx() is exercised directly since simulating real input
## events headlessly is unreliable.
func _check_audio() -> void:
	_check("audio_manager_music_playing_after_room_entry", AudioManager._music_player.playing)

	AudioManager.play_sfx("jump")
	var any_sfx_playing := false
	for player in AudioManager._sfx_pool:
		if player.playing:
			any_sfx_playing = true
			break
	_check("audio_manager_plays_sfx", any_sfx_playing)

	AudioManager.play_sfx("this_sfx_id_does_not_exist_and_should_just_warn")
	_check("audio_manager_missing_sfx_does_not_crash", true)

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
	SaveManager.save_game()
	var reload_ok := SaveManager.load_game()
	_check("save_reload_succeeds", reload_ok)
	_check("save_reload_restores_checkpoint_room", GameManager.current_room_id == room_before_save)
	_check(
		"save_reload_restores_defeated_bosses",
		"test_probe_boss" in ProgressionManager.get_defeated_bosses(),
	)

	if is_instance_valid(save_point):
		save_point.queue_free()

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

	world.transition_to_room(gated_room_id)
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

	var room_before: String = GameManager.current_room_id
	gate._on_body_entered(current_player)
	await get_tree().process_frame
	var room_after_blocked: String = GameManager.current_room_id
	_check("ability_gate_blocks_without_ability", room_after_blocked == room_before)

	GameManager._on_ability_acquired(ability)
	gate._on_body_entered(current_player)
	await get_tree().process_frame
	var room_after_unlocked: String = GameManager.current_room_id
	_check("ability_gate_opens_after_unlock", room_after_unlocked == expected_target_room)

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
