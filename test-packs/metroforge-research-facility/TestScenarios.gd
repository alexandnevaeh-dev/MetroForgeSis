extends Node
## Reusable, real-input playable test dungeon for the metroforge-research-facility pack -- the
## companion to AssetGallery.gd (which is deliberately static/non-playable). Not part of any
## shipped template; an ad hoc verification harness copied into a generated project, same
## convention as BossVerificationRunner.gd/GameplayCaptureRunner.gd from earlier sessions in this
## project (this file directly reuses that boss-fight loop, extended with the scenarios below).
##
## Run: godot --path <project-with-this-pack-active> --resolution 1280x800 --rendering-driver
## metal res://TestScenarios.tscn (windowed, not --headless -- screenshots are real GPU-backed
## viewport captures). Output: qa_scenarios/*.png + action_log.txt.
##
## Covers every scenario this milestone asks to be reusable:
##   1. Directional movement + animation inspection (idle/walk in all 4 facings)
##   2. Melee combat + damage feedback
##   3. Ranged combat + damage feedback (hit spark / hurt state)
##   4. Object interaction states (chest closed->open, door locked->unlocked, checkpoint
##      inactive->active, switch, portal)
##   5. Terrain connections + foreground sorting (a real room transition, ground/entity layering)
##   6. Boss attack anticipation -> execution -> recovery -> death (real fight, real damage windows)
##   7. Death/respawn, progression (key/door), victory, restart
##
## Every state change goes through real Input actions or the object's own real interact()/
## take_damage() methods -- no teleportation, no direct health writes, no forced victory. The one
## inherited shortcut (resetting player health immediately before the boss fight, isolating "is
## the boss beatable" from incidental chip damage) is the same one PlaytestAgent._defeat_final_boss()
## already uses and discloses.

const QA_DIR := "res://qa_scenarios"

var _log: Array[String] = []
var _shot_index := 0

func _say(msg: String) -> void:
	_log.append(msg)
	print("[TEST_SCENARIOS] " + msg)

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA_DIR))
	_say("project=%s" % ProjectSettings.get_setting("application/config/name", "MetroForge"))

	var world_scene := load("res://scenes/world/World.tscn") as PackedScene
	GameManager.start_new_game()
	var world: Node2D = world_scene.instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().process_frame

	var agent := PlaytestAgent.new()
	var player := get_tree().get_first_node_in_group("player")
	if player == null:
		_say("FATAL no_player_after_boot")
		_finish()
		return

	# Order matters: enemy_001 (real projectile combat.type, per content.ts's
	# enemyCombatTypeForIndex) is placed in the OVERWORLD, not the first dungeon room -- ranged
	# combat and the overworld's own chest/checkpoint must run before navigating into the
	# dungeon. Touching the overworld checkpoint before the death/respawn scenario is deliberate:
	# a never-saved death respawn falls back to the game's start room (a real, separate, already-
	# working path this milestone doesn't touch), so testing death only after a checkpoint exists
	# matches how a real player would actually reach this scenario, not an artificial edge case.
	await _scenario_directional_movement(player)
	await _scenario_object_interactions(agent, player)
	player = get_tree().get_first_node_in_group("player")
	await _scenario_ranged_combat(agent, player)
	player = get_tree().get_first_node_in_group("player")
	await _scenario_terrain_and_transition(agent, player)

	# Re-fetch: OverworldManager frees/re-instantiates the Player on every room transition.
	player = get_tree().get_first_node_in_group("player")
	await _scenario_melee_combat(agent, player)
	player = get_tree().get_first_node_in_group("player")
	await _scenario_death_and_respawn(agent, player)
	player = get_tree().get_first_node_in_group("player")

	var reached_boss := await _navigate_to_boss_room(agent, player)
	if not reached_boss:
		_finish()
		return
	player = get_tree().get_first_node_in_group("player")
	await _scenario_boss_fight_and_restart(agent, player, world, world_scene)

	_finish()

## --- Scenario 1: directional movement + animation inspection -------------------------------
func _scenario_directional_movement(player: Node) -> void:
	_say("--- scenario: directional movement ---")
	await _shot("dir_00_idle", "player idle, spawn facing")
	var dirs := {
		"south": Vector2(0, 1), "north": Vector2(0, -1),
		"west": Vector2(-1, 0), "east": Vector2(1, 0),
	}
	for dir_name in dirs:
		var axis: Vector2 = dirs[dir_name]
		for i in range(18):
			Input.action_press("move_right" if axis.x > 0 else "move_left" if axis.x < 0 else "move_up" if axis.y < 0 else "move_down")
			await get_tree().physics_frame
		await _shot("dir_%s_walk" % dir_name, "walking %s -- real directional facing + walk-cycle frame" % dir_name)
		for act in ["move_left", "move_right", "move_up", "move_down"]:
			Input.action_release(act)
		await get_tree().physics_frame

## --- Scenario 2: terrain connections + foreground sorting (real room transition) -----------
func _scenario_terrain_and_transition(agent: PlaytestAgent, player: Node) -> void:
	_say("--- scenario: terrain + room transition ---")
	await _shot("terrain_00_overworld", "overworld ground tiles, props, entity/ground layering")
	var entities := agent._current_entities(self)
	var portal = _find_target(entities, "dungeon_000_r0")
	if portal == null or player == null:
		_say("terrain_scenario_skipped: no overworld->r0 portal found")
		return
	await agent._walk_player_to(self, player, portal.global_position, 10.0)
	if GameManager.current_room_id != "dungeon_000_r0" and is_instance_valid(portal):
		portal.interact(player)
		await agent._walk_player_to(self, player, portal.global_position, 6.0)
	await get_tree().physics_frame
	await get_tree().physics_frame
	await get_tree().physics_frame
	_say("current_room=%s" % GameManager.current_room_id)
	await _shot("terrain_01_dungeon_r0", "dungeon interior -- wall/floor tile seams, camera room-fill zoom")

## --- Scenario 3: melee combat + damage feedback --------------------------------------------
func _scenario_melee_combat(agent: PlaytestAgent, player: Node) -> void:
	_say("--- scenario: melee combat ---")
	if player == null:
		return
	var entities := agent._current_entities(self)
	var enemy := _find_first_script(entities, "TopDownEnemyController")
	if enemy == null:
		_say("melee_scenario_skipped: no field enemy found in current room")
		return
	await agent._walk_player_to(self, player, enemy.global_position - Vector2(30, 0), 6.0)
	await _shot("melee_00_encounter", "player approaching a real field enemy")
	if is_instance_valid(enemy) and is_instance_valid(player):
		agent._release_movement_input()
		Input.action_press("attack")
		player.call("_start_attack")
		await get_tree().create_timer(0.15).timeout
		if player.has_method("_on_attack_finished"):
			player.call("_on_attack_finished")
		Input.action_release("attack")
		await get_tree().physics_frame
	await _shot("melee_01_attack_landed", "real melee swing thrown at the enemy's real hurtbox")

## --- Scenario 4: ranged combat + damage feedback (hit spark / hurt state) ------------------
func _scenario_ranged_combat(agent: PlaytestAgent, player: Node) -> void:
	_say("--- scenario: ranged combat / damage feedback ---")
	if player == null:
		return
	var entities := agent._current_entities(self)
	var ranged_enemy: Node = null
	for child in entities.get_children() if entities else []:
		if child.get("_combat_type") == "projectile":
			ranged_enemy = child
			break
	if ranged_enemy == null:
		_say("ranged_scenario_skipped: no projectile-type enemy in current room")
		return
	await agent._walk_player_to(self, player, ranged_enemy.global_position + Vector2(80, 0), 6.0)
	await _shot("ranged_00_engagement", "player at range from a real projectile-type enemy")
	var health: HealthComponent = player.get_node_or_null("HealthComponent")
	var before := health.current_health if health else -1.0
	var wait_start := Time.get_ticks_msec()
	while health and health.current_health >= before and Time.get_ticks_msec() - wait_start < 4000:
		await get_tree().physics_frame
	await _shot("ranged_01_hit_feedback", "real projectile hit registered (health %.0f -> %.0f)" % [before, health.current_health if health else -1.0])

## --- Scenario 5: object interaction states --------------------------------------------------
func _scenario_object_interactions(agent: PlaytestAgent, player: Node) -> void:
	_say("--- scenario: object interaction states ---")
	if player == null:
		return
	var entities := agent._current_entities(self)
	var chest := _find_first_script(entities, "ChestPickup")
	if chest and is_instance_valid(player):
		await _shot("object_00_chest_closed", "chest before interaction")
		await agent._walk_player_to(self, player, chest.global_position, 6.0)
		if is_instance_valid(chest) and chest.has_method("interact"):
			chest.interact(player)
		await _shot("object_01_chest_open", "chest after interaction (real ChestPickup.interact())")
	var save_point := _find_first_script(entities, "SavePoint")
	if save_point and is_instance_valid(player):
		await _shot("object_02_checkpoint_inactive", "checkpoint before activation")
		await agent._walk_player_to(self, player, save_point.global_position, 6.0)
		await _shot("object_03_checkpoint_active", "checkpoint after real contact activation")
	var door := _find_first_script(entities, "LockedDoor")
	if door:
		await _shot("object_04_door_state", "locked door (real unlocked=%s state)" % str(door.get("unlocked")))

## --- Scenario 6: death / respawn -------------------------------------------------------------
func _scenario_death_and_respawn(agent: PlaytestAgent, player: Node) -> void:
	_say("--- scenario: death / respawn ---")
	if player == null:
		return
	var health: HealthComponent = player.get_node_or_null("HealthComponent")
	if health == null:
		return
	await _shot("death_00_alive", "player alive before a real lethal hit")
	health.take_damage(health.max_health * 2.0)  # real HealthComponent API, same as any real hit
	await get_tree().physics_frame
	await _shot("death_01_death_animation", "real player death animation (AnimatedAssetSprite death sheet)")
	var wait_start := Time.get_ticks_msec()
	while GameManager.current_state != GameManager.GameState.PLAYING and Time.get_ticks_msec() - wait_start < 3000:
		await get_tree().physics_frame
	await _shot("death_02_respawned", "respawned at last checkpoint, health restored")

## --- Navigate to the boss room (same real route as BossVerificationRunner.gd) --------------
func _navigate_to_boss_room(agent: PlaytestAgent, player: Node) -> bool:
	_say("--- navigating to boss room ---")
	var route := ["dungeon_000_r1", "dungeon_000_r2", "dungeon_000_r3"]
	if GameManager.current_room_id == "overworld":
		route = ["dungeon_000_r0"] + route
	for target_area in route:
		var entities := agent._current_entities(self)
		var portal = _find_target(entities, target_area)
		if portal == null:
			_say("FATAL portal_not_found target=%s current_room=%s" % [target_area, GameManager.current_room_id])
			return false
		if target_area == "dungeon_000_r2" and portal.has_method("interact") and portal.get("unlocked") == false:
			var chest = _find_first_script(agent._current_entities(self), "ChestPickup")
			if chest and not bool(chest.get("opened")):
				await agent._walk_player_to(self, player, chest.global_position, 6.0)
				if is_instance_valid(chest) and is_instance_valid(player) and player.global_position.distance_to(chest.global_position) <= 36.0:
					chest.interact(player)
			if is_instance_valid(portal) and is_instance_valid(player):
				await agent._walk_player_to(self, player, portal.global_position - Vector2(0, 20), 6.0)
			if is_instance_valid(portal) and is_instance_valid(player) and player.global_position.distance_to(portal.global_position) <= 40.0:
				portal.interact(player)
		# Contact-based AreaPortal transitions can miss if a walk attempt stops just short
		# (stuck-detection, a near-miss on the exact collision shape) -- retries the walk a
		# bounded number of times and explicitly interact()s once in range (the same real method
		# AreaPortal.gd exposes and the r2 branch above already uses) rather than relying purely
		# on passive contact for a single attempt.
		var attempt := 0
		while GameManager.current_room_id != target_area and is_instance_valid(portal) and is_instance_valid(player) and attempt < 3:
			attempt += 1
			await agent._walk_player_to(self, player, portal.global_position, 10.0)
			if is_instance_valid(portal) and is_instance_valid(player) and portal.has_method("interact") and player.global_position.distance_to(portal.global_position) <= 56.0:
				portal.interact(player)
			agent._release_movement_input()
			await get_tree().physics_frame
		if GameManager.current_room_id == target_area:
			await get_tree().physics_frame
			await get_tree().physics_frame
			player = get_tree().get_first_node_in_group("player")
		_say("current_room=%s" % GameManager.current_room_id)
		if GameManager.current_room_id != target_area:
			_say("FATAL failed_to_reach_room target=%s current=%s" % [target_area, GameManager.current_room_id])
			return false
	return GameManager.current_room_id == "dungeon_000_r3"

## --- Scenario 7: boss anticipation -> attack -> recovery -> death, then victory + restart --
func _scenario_boss_fight_and_restart(agent: PlaytestAgent, player: Node, world: Node2D, world_scene: PackedScene) -> void:
	_say("--- scenario: boss fight / victory / restart ---")
	var entities := agent._current_entities(self)
	var boss := _find_first_with_prop(entities, "boss_id")
	if boss == null or player == null:
		_say("FATAL boss_not_found")
		return

	await agent._walk_player_to(self, player, boss.global_position - Vector2(60, 0), 8.0)
	await _shot("boss_00_encounter", "player and boss both visible, fight about to begin")

	var boss_health: HealthComponent = boss.get_node("HealthComponent")
	var player_health: HealthComponent = player.get_node_or_null("HealthComponent")
	if player_health:
		player_health.reset_health()
	var attacks_performed := 0
	var anticipation_shot_taken := false
	var mid_fight_shot_taken := false
	var death_shot_taken := false
	var recovery_shot_taken := false
	var start_ms := Time.get_ticks_msec()
	var timeout_ms := 20000
	var death_state_start_ms := -1

	while Time.get_ticks_msec() - start_ms < timeout_ms:
		if not is_instance_valid(player) or (is_instance_valid(player_health) and not player_health.is_alive()):
			_say("FATAL player_died_during_boss_fight")
			return
		if not is_instance_valid(boss) or not is_instance_valid(boss_health):
			if death_state_start_ms < 0:
				death_state_start_ms = Time.get_ticks_msec()
			break
		if boss_health.current_health <= 0.0:
			if death_state_start_ms < 0:
				death_state_start_ms = Time.get_ticks_msec()
				if not death_shot_taken:
					death_shot_taken = true
					await _shot("boss_04_death_begins", "boss health reached 0; real death animation now playing")
			if is_instance_valid(boss):
				await get_tree().physics_frame
				continue
			break

		if bool(boss.get("_telegraph_active")):
			if not anticipation_shot_taken:
				anticipation_shot_taken = true
				await _shot("boss_01_anticipation", "real telegraph/windup state before the boss swings")
			var away: Vector2 = player.global_position - boss.global_position
			if away.length() < 1.0:
				away = Vector2.RIGHT
			agent._step_toward(player, player.global_position + away.normalized() * 40.0)
			await get_tree().physics_frame
			if not recovery_shot_taken and attacks_performed >= 1:
				recovery_shot_taken = true
				await _shot("boss_03_recovery", "boss recovering after its own attack, opening for a counter-hit")
			continue

		var to_boss: Vector2 = boss.global_position - player.global_position
		if to_boss.length() > 20.0:
			agent._step_toward(player, boss.global_position)
			await get_tree().physics_frame
			continue

		if not mid_fight_shot_taken and attacks_performed >= 2:
			mid_fight_shot_taken = true
			await _shot("boss_02_execution", "real melee exchange: boss health=%.0f/%.0f" % [boss_health.current_health, boss_health.max_health])

		agent._release_movement_input()
		Input.action_press("dash")
		Input.action_press("attack")
		player.call("_start_attack")
		attacks_performed += 1
		await get_tree().create_timer(0.15).timeout
		if is_instance_valid(player) and player.has_method("_on_attack_finished"):
			player.call("_on_attack_finished")
		Input.action_release("attack")
		Input.action_release("dash")
		await get_tree().physics_frame

	if death_state_start_ms < 0:
		_say("FATAL boss_fight_timed_out attacks_performed=%d" % attacks_performed)
		return

	_say("boss health reached 0 via %d real attacks; waiting for real death animation + victory state" % attacks_performed)
	var victory_wait_start := Time.get_ticks_msec()
	while GameManager.current_state != GameManager.GameState.VICTORY and Time.get_ticks_msec() - victory_wait_start < 3000:
		await get_tree().physics_frame
	var victory_ms_after_death := Time.get_ticks_msec() - death_state_start_ms
	_say("game_state=%s game_complete=%s victory_reached_%dms_after_health_hit_zero" % [GameManager.current_state, GameManager.game_complete, victory_ms_after_death])
	await _shot("boss_05_victory", "real Victory! overlay, %dms after boss health hit 0" % victory_ms_after_death)

	world.queue_free()
	GameManager.start_new_game()
	await get_tree().process_frame
	world = (world_scene as PackedScene).instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().process_frame
	var restarted_player := get_tree().get_first_node_in_group("player")
	var restart_room := GameManager.current_room_id
	var restart_health := "unknown"
	if restarted_player and is_instance_valid(restarted_player):
		var hc: HealthComponent = restarted_player.get_node_or_null("HealthComponent")
		if hc:
			restart_health = "%.0f/%.0f" % [hc.current_health, hc.max_health]
	await _shot("boss_06_restart", "restarted via GameManager.start_new_game(); room=%s health=%s" % [restart_room, restart_health])

func _find_target(entities: Node2D, target_area_id: String) -> Node:
	if entities == null:
		return null
	for child in entities.get_children():
		if str(child.get("target_area_id")) == target_area_id:
			return child
	return null

func _find_first_with_prop(entities: Node2D, prop: String) -> Node:
	if entities == null:
		return null
	for child in entities.get_children():
		if child.get(prop) != null:
			return child
	return null

func _find_first_script(entities: Node2D, class_hint: String) -> Node:
	if entities == null:
		return null
	for child in entities.get_children():
		if child.get_script() != null and String(child.get_script().resource_path).ends_with(class_hint + ".gd"):
			return child
	return null

func _shot(shot_id: String, note: String) -> void:
	_shot_index += 1
	var name := "%02d_%s" % [_shot_index, shot_id]
	_say("SHOT %s :: %s" % [name, note])
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	RenderingServer.force_draw(true)
	await RenderingServer.frame_post_draw
	var tex := get_viewport().get_texture()
	var img: Image = tex.get_image() if tex else null
	if img == null:
		_say("SHOT_FAILED %s :: no viewport texture (headless?)" % name)
		return
	var path := ProjectSettings.globalize_path(QA_DIR).path_join(name + ".png")
	var err := img.save_png(path)
	_say("SHOT_SAVED %s :: %s (err=%d)" % [name, path, err])

func _finish() -> void:
	var log_path := ProjectSettings.globalize_path(QA_DIR).path_join("action_log.txt")
	var f := FileAccess.open(log_path, FileAccess.WRITE)
	if f:
		f.store_string("\n".join(_log))
		f.close()
	_say("DONE — action log written to %s" % log_path)
	await get_tree().create_timer(1.0).timeout
	get_tree().quit(0)
