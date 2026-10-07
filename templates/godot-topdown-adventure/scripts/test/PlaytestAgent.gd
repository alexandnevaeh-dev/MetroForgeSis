extends RefCounted
class_name PlaytestAgent
## Input-simulating bot that follows `playtest_route.json` through the live top-down world.
## Adapted from the side-view template's version: no per-room child scenes here â€” every area's
## content lives under OverworldManager.get_current_entities(), transitions are AreaPortal/
## LockedDoor nodes keyed by `target_area_id` (not RoomTransition's `target_room_id`), pickups
## are interact-based ChestPickup (not walk-over AbilityPickup), and movement is free-roam 2D
## (both axes), not a single horizontal axis. Supports persona-specific timeouts and emits
## structured telemetry for balance analysis, matching the side-view version's contract.
##
## Walk routes use the actual player's swept collision shape and bounded grid search.
## Inputs still drive traversal; no teleportation or collision disabling is used.
## A failed search or timed-out walk remains a failed playtest leg.

const ROUTE_PATH := "res://playtest_route.json"
const MOVEMENT_CONFIG_PATH := "res://data/player/movement.json"

var steps_completed: int = 0
var used_input_simulation: bool = false
var pickups_collected: int = 0
var attacks_performed: int = 0
var _walk_timeout_sec: float = 8.0
var _boss_attack_timeout_sec: float = 12.0
var _collect_all_pickups: bool = true
var _persona_id: String = "victory_rusher"
var _started_at_ms: int = 0
var _transition_timings_ms: Array[int] = []
var _expected_walk_speed_px: float = 110.0

# --- Phase 13 telemetry / Phase 4 diagnostics state -------------------------------------------
var _step_diagnostics: Array[Dictionary] = []
var _transitions_attempted: int = 0
var _gates_opened: int = 0
var _enemy_encounters: int = 0
var _boss_attempts: int = 0
var _boss_defeated: bool = false
var _unstick_attempts: int = 0
var _timeouts_exceeded: int = 0
var _failure_reason: String = ""
var _failed_step_index: int = -1
var _last_walk_budget_sec: float = 0.0
var _boss_final_health: float = -1.0
var _boss_player_final_health: float = -1.0
var _boss_player_initial_health: float = -1.0
var _observed_areas: Array[String] = []
var _area_captures: Array[String] = []
var _damage_events: Array = []
var _checkpoint_events: Array = []
var _save_events: Array = []
var _player_deaths := 0
var _tracked_health: HealthComponent
var _telemetry_host: Node

func _observe_area(area_id: String) -> void:
	_observed_areas.append(area_id)
	if is_instance_valid(_telemetry_host):
		await _telemetry_host.get_tree().process_frame
		await _telemetry_host.get_tree().process_frame
		_attach_player_health()
		if DisplayServer.get_name() != "headless":
			await RenderingServer.frame_post_draw
			if not is_instance_valid(_telemetry_host):
				return
			var directory := "res://qa/topdown-playtest/areas"
			DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
			var path := "%s/%03d_%s.png" % [directory, _observed_areas.size(), area_id.validate_filename()]
			if _telemetry_host.get_viewport().get_texture().get_image().save_png(path) == OK:
				_area_captures.append(path)

func _attach_player_health() -> void:
	if not is_instance_valid(_telemetry_host):
		return
	var player := _telemetry_host.get_tree().get_first_node_in_group("player")
	if player == null:
		return
	var hp := player.get_node_or_null("HealthComponent") as HealthComponent
	if hp == null or hp == _tracked_health:
		return
	if is_instance_valid(_tracked_health) and _tracked_health.damaged.is_connected(_observe_damage):
		_tracked_health.damaged.disconnect(_observe_damage)
	_tracked_health = hp
	hp.damaged.connect(_observe_damage)

func _observe_damage(amount: float) -> void:
	_damage_events.append({"amount":amount,"healthAfter":_tracked_health.current_health if is_instance_valid(_tracked_health) else -1,"area":GameManager.current_room_id,"tMs":Time.get_ticks_msec()-_started_at_ms})

func _observe_death() -> void:
	_player_deaths += 1

func _observe_checkpoint(object_id: String) -> void:
	if not object_id.begins_with("save_"):
		return
	_attach_player_health()
	_checkpoint_events.append({"area":GameManager.current_room_id,"health":_tracked_health.current_health if is_instance_valid(_tracked_health) else -1,"tMs":Time.get_ticks_msec()-_started_at_ms})

func _observe_save() -> void:
	_attach_player_health()
	_save_events.append({"area":GameManager.current_room_id,"health":_tracked_health.current_health if is_instance_valid(_tracked_health) else -1,"tMs":Time.get_ticks_msec()-_started_at_ms})

func run(world: Node, host: Node) -> Dictionary:
	_started_at_ms = Time.get_ticks_msec()
	_telemetry_host = host
	EventBus.room_entered.connect(_observe_area)
	EventBus.player_died.connect(_observe_death)
	EventBus.object_activated.connect(_observe_checkpoint)
	EventBus.save_triggered.connect(_observe_save)
	_attach_player_health()
	await _observe_area(GameManager.current_room_id)
	_load_expected_speed()
	var route := _load_route()
	if route.is_empty():
		_failure_reason = "missing_route"
		return _finish(false, route, 0)

	_apply_persona(route.get("persona", {}))

	if not route.get("reachable", false):
		_failure_reason = "route_unreachable"
		return _finish(false, route, 0)

	var transitions: Array = route.get("transitions", [])
	for i in range(transitions.size()):
		var step: Dictionary = transitions[i]
		var from_area: String = step.get("fromRoomId", "")
		var to_area: String = step.get("toRoomId", "")
		var step_start := Time.get_ticks_msec()
		_transitions_attempted += 1
		var step_ok := await _execute_transition(world, host, from_area, to_area, i)
		_transition_timings_ms.append(Time.get_ticks_msec() - step_start)
		if not step_ok:
			_failed_step_index = i
			_failure_reason = "transition_failed"
			return _finish(false, route, 0, from_area, to_area)
		steps_completed += 1

	var boss_start := Time.get_ticks_msec()
	_boss_attempts += 1
	_boss_defeated = await _defeat_final_boss(host, String(route.get("victoryBossId", "boss_final")))
	var boss_fight_ms := Time.get_ticks_msec() - boss_start
	if not _boss_defeated:
		_failure_reason = "boss_not_defeated"
		return _finish(false, route, boss_fight_ms)

	return _finish(true, route, boss_fight_ms)

## Builds the final outcome dictionary â€” always, on every exit path (success or failure), so
## PlaytestRunner.gd always has telemetry to write to playtest_telemetry.json even for a run that
## never got anywhere near victory. Before this fix, telemetry only existed on full success (see
## the old `run()`'s early `return {"ok": false, "reason": ...}` returns with no "telemetry" key
## at all) â€” a route failing on its very first step produced zero diagnostic output.
func _finish(ok: bool, route: Dictionary, boss_fight_ms: int, from_area: String = "", to_area: String = "") -> Dictionary:
	for pair in [[EventBus.room_entered,_observe_area],[EventBus.player_died,_observe_death],[EventBus.object_activated,_observe_checkpoint],[EventBus.save_triggered,_observe_save]]:
		if pair[0].is_connected(pair[1]):
			pair[0].disconnect(pair[1])
	if is_instance_valid(_tracked_health) and _tracked_health.damaged.is_connected(_observe_damage):
		_tracked_health.damaged.disconnect(_observe_damage)
	var result := {
		"ok": ok,
		"steps": steps_completed,
		"used_input": used_input_simulation,
		"telemetry": _build_telemetry(route, boss_fight_ms),
	}
	if not ok:
		result["reason"] = _failure_reason
		if from_area != "":
			result["from"] = from_area
		if to_area != "":
			result["to"] = to_area
	return result

## The persona's own bossAttackTimeoutSec (12-14s) is tuned for the side-view template's melee
## pacing and shared by both archetypes today. A top-down boss actively wanders/kites (see
## TopDownEnemyController.gd), so each attack cycle spends most of its walk budget re-chasing a
## moving target â€” measured at ~2.2s/cycle even against a stationary-looking TINY_TEST boss â€”
## and 12s (~5 cycles) isn't enough to land the ~20 hits a 200 HP boss needs. Floor it higher
## here rather than change the shared persona data side-view already relies on.
const MIN_BOSS_ATTACK_TIMEOUT_SEC := 55.0

func _apply_persona(persona: Variant) -> void:
	if typeof(persona) != TYPE_DICTIONARY:
		_boss_attack_timeout_sec = max(_boss_attack_timeout_sec, MIN_BOSS_ATTACK_TIMEOUT_SEC)
		return
	_persona_id = String(persona.get("id", _persona_id))
	_walk_timeout_sec = float(persona.get("walkTimeoutSec", _walk_timeout_sec))
	_boss_attack_timeout_sec = max(
		float(persona.get("bossAttackTimeoutSec", _boss_attack_timeout_sec)),
		MIN_BOSS_ATTACK_TIMEOUT_SEC,
	)
	_collect_all_pickups = bool(persona.get("collectAllPickups", _collect_all_pickups))

## Reads the project's real walk speed so distance-aware timeouts (Phase 14 / _walk_timeout_for)
## reflect how fast this specific generated game's player actually moves, rather than a hardcoded
## guess. Best-effort â€” falls back to the template's own default (see PlayerMovementConfig.gd)
## if the file is missing or malformed.
func _load_expected_speed() -> void:
	if not FileAccess.file_exists(MOVEMENT_CONFIG_PATH):
		return
	var file := FileAccess.open(MOVEMENT_CONFIG_PATH, FileAccess.READ)
	if file == null:
		return
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return
	var data: Variant = json.data
	if typeof(data) == TYPE_DICTIONARY and data.has("walkSpeed"):
		_expected_walk_speed_px = max(1.0, float(data.get("walkSpeed")))

func _build_telemetry(route: Dictionary, boss_fight_ms: int) -> Dictionary:
	var transitions: Array = route.get("transitions", [])
	var avg_transition_ms := 0.0
	if _transition_timings_ms.size() > 0:
		var total := 0
		for ms in _transition_timings_ms:
			total += ms
		avg_transition_ms = float(total) / float(_transition_timings_ms.size())

	var elapsed_ms := Time.get_ticks_msec() - _started_at_ms
	var hints: Array[String] = []
	if boss_fight_ms > int(_boss_attack_timeout_sec * 1000 * 0.85):
		hints.append("boss_fight_near_timeout")
	if transitions.size() > 0 and float(steps_completed) / float(transitions.size()) < 1.0:
		hints.append("incomplete_route")
	if avg_transition_ms > _walk_timeout_sec * 1000 * 0.75:
		hints.append("slow_room_transitions")
	if _unstick_attempts > 0:
		hints.append("navigation_required_unstick")

	return {
		"personaId": _persona_id,
		"elapsedMs": elapsed_ms,
		"transitionsPlanned": transitions.size(),
		"transitionsCompleted": steps_completed,
		"pickupsCollected": pickups_collected,
		"attacksPerformed": attacks_performed,
		"abilitiesAfterRun": GameManager.player_abilities.duplicate(),
		"roomsVisited": _observed_areas.duplicate(),
		"roomsPlanned": route.get("visitedRoomOrder", []),
		"damageEvents": _damage_events.duplicate(true),
		"playerDeaths": _player_deaths,
		"checkpointEvents": _checkpoint_events.duplicate(true),
		"areaCaptures": _area_captures.duplicate(),
		"saveEvents": _save_events.duplicate(true),
		"bossPlayerInitialHealth": _boss_player_initial_health,
		"healthGrantedByHarness": false,
		"victoryBossId": route.get("victoryBossId", "boss_final"),
		"bossFightMs": boss_fight_ms,
		"avgTransitionMs": avg_transition_ms,
		"inputSimulationUsed": used_input_simulation,
		"victoryState": GameManager.current_state == GameManager.GameState.VICTORY,
		"gameComplete": GameManager.game_complete,
		"balanceHints": hints,
		# --- Phase 13 additions: failure/balance diagnosability, present on every run -----------
		"archetype": "TOP_DOWN_ACTION_ADVENTURE",
		"routeLength": transitions.size(),
		"completedSteps": steps_completed,
		"failedStepIndex": _failed_step_index,
		"transitionsAttempted": _transitions_attempted,
		"itemsCollected": pickups_collected,
		"gatesOpened": _gates_opened,
		"enemyEncounters": _enemy_encounters,
		"bossAttempts": _boss_attempts,
		"bossDefeated": _boss_defeated,
		"bossFinalHealth": _boss_final_health,
		"bossPlayerFinalHealth": _boss_player_final_health,
		"victoryReached": GameManager.current_state == GameManager.GameState.VICTORY or GameManager.game_complete,
		"durationMs": elapsed_ms,
		"timeoutsExceeded": _timeouts_exceeded,
		"unstickAttempts": _unstick_attempts,
		"failureReason": _failure_reason,
		"stepDiagnostics": _step_diagnostics,
	}

func _load_route() -> Dictionary:
	if not FileAccess.file_exists(ROUTE_PATH):
		return {}
	var file := FileAccess.open(ROUTE_PATH, FileAccess.READ)
	if file == null:
		return {}
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return {}
	return json.data if typeof(json.data) == TYPE_DICTIONARY else {}

func _execute_transition(world: Node, host: Node, from_area: String, to_area: String, step_index: int) -> bool:
	var step_start_ms := Time.get_ticks_msec()
	var player := host.get_tree().get_first_node_in_group("player")
	var diag := {
		"stepIndex": step_index,
		"stepType": "area_transition",
		"sourceNode": from_area,
		"destinationNode": to_area,
		"requiredItem": "",
		"playerPositionStart": _pos_str(player),
		"playerPositionEnd": "",
		"targetPosition": "",
		"distanceToTarget": -1.0,
		"currentArea": GameManager.current_room_id,
		"expectedArea": from_area,
		"transitionId": "%s->%s" % [from_area, to_area],
		"portalId": "",
		"elapsedMs": 0,
		"timeoutMs": int(_walk_timeout_sec * 1000.0),
		"result": "FAIL",
		"failureReason": "",
	}

	if GameManager.current_room_id != from_area:
		diag["failureReason"] = "wrong_current_area"
		_record_step(diag, step_start_ms)
		return false

	if player == null:
		diag["failureReason"] = "player_missing"
		_record_step(diag, step_start_ms)
		return false

	_enemy_encounters += _count_enemies(host)
	# Observe actual openings, including switches encountered during pickup walks.
	diag["openedGates"] = []
	for door in host.get_tree().get_nodes_in_group("locked_door"):
		if door is LockedDoor:
			if door.target_area_id == to_area:
				diag["requiredItem"] = door.key_id
			door.opened.connect(func(method: String):
				_gates_opened += 1
				diag["openedGates"].append({"doorId": door.door_id, "method": method})
			, CONNECT_ONE_SHOT)

	if _collect_all_pickups:
		await _collect_area_pickups(host, player)

	# An incidental pickup-walk can itself carry the player across a portal boundary (AreaPortal
	# triggers on physical contact, no arrival tolerance) â€” check before searching for one.
	if GameManager.current_room_id == to_area:
		diag["result"] = "PASS"
		diag["playerPositionEnd"] = _pos_str(player)
		_record_step(diag, step_start_ms)
		return true

	var portal := _find_portal(host, to_area)
	if portal == null:
		diag["failureReason"] = "portal_not_found"
		_record_step(diag, step_start_ms)
		return false
	diag["portalId"] = str(portal.get("door_id")) if portal.get("door_id") != null and str(portal.get("door_id")) != "" else str(portal.get("name"))
	diag["targetPosition"] = _pos_str(portal)

	# LockedDoor starts solid and interact-only; unlock it (uses whichever key/switch state the
	# player has already collected this run) before trying to walk through it. AreaPortal has no
	# such gate and this is simply a no-op check.
	if portal.has_method("interact") and portal.get("unlocked") == false:
		diag["requiredItem"] = str(portal.get("key_id"))
		var approach: Vector2 = portal.global_position + (player.global_position - portal.global_position).normalized() * 24.0
		await _walk_player_to(host, player, approach, _walk_timeout_for(player.global_position, approach))
		if not is_instance_valid(player) or not is_instance_valid(portal) or player.global_position.distance_to(portal.global_position) > 36.0:
			diag["failureReason"] = "gate_interaction_out_of_range"
			_record_step(diag, step_start_ms)
			return false
		_release_movement_input()
		Input.action_press("interact")
		await host.get_tree().physics_frame
		await host.get_tree().process_frame
		Input.action_release("interact")
		if not portal.unlocked:
			diag["failureReason"] = "gate_interaction_rejected"
			_record_step(diag, step_start_ms)
			return false


	# Walking toward the portal can itself complete the transition mid-flight â€” touching its
	# Area2D fires AreaPortal/LockedDoor's own body_entered handler immediately, before
	# _walk_player_to's distance-based "arrival" check would ever run, and that handler frees the
	# old area's player instance. So the walk call's own return value isn't the success signal â€”
	# a freed player reference there is the *expected* shape of success, not a bug â€” only the
	# resulting room id is. Ignore what _walk_player_to returns and re-check state directly.
	var walk_timeout := _walk_timeout_for(player.global_position, portal.global_position)
	diag["timeoutMs"] = int(walk_timeout * 1000.0)
	await _walk_player_to(host, player, portal.global_position, walk_timeout)
	diag["timeoutMs"] = int(_last_walk_budget_sec * 1000.0)
	var final_ok := await _await_area_ready(world, host, to_area)
	diag["currentArea"] = GameManager.current_room_id
	diag["result"] = "PASS" if final_ok else "FAIL"
	if not final_ok:
		diag["failureReason"] = "walk_timeout_or_blocked"
		diag["distanceToTarget"] = (
			player.global_position.distance_to(portal.global_position) if is_instance_valid(player) else -1.0
		)
		if is_instance_valid(player):
			var hp: HealthComponent = player.get_node_or_null("HealthComponent")
			diag["playerHealth"] = hp.current_health if hp else -1.0
			if DisplayServer.get_name() != "headless":
				await RenderingServer.frame_post_draw
				host.get_viewport().get_texture().get_image().save_png("res://route-failure.png")
	diag["playerPositionEnd"] = _pos_str(player) if is_instance_valid(player) else "freed"
	_record_step(diag, step_start_ms)
	return final_ok

func _await_area_ready(world: Node, host: Node, area_id: String) -> bool:
	# Area loading yields a process frame; several physics frames can precede that frame.
	# Wait only for an already-running transition, never extend a blocked movement attempt.
	var deadline := Time.get_ticks_msec() + 1000
	while world.has_method("is_transitioning") and world.is_transitioning():
		if Time.get_ticks_msec() >= deadline:
			return false
		await host.get_tree().process_frame
	return GameManager.current_room_id == area_id

func _record_step(diag: Dictionary, step_start_ms: int) -> void:
	diag["elapsedMs"] = Time.get_ticks_msec() - step_start_ms
	_step_diagnostics.append(diag)

func _pos_str(node: Node) -> String:
	if node == null or not is_instance_valid(node) or not (node is Node2D):
		return ""
	return str((node as Node2D).global_position)

func _count_enemies(host: Node) -> int:
	var entities := _current_entities(host)
	if entities == null:
		return 0
	var count := 0
	for child in entities.get_children():
		if child.is_in_group("enemy") or child.get("enemy_id") != null:
			count += 1
	return count

func _collect_area_pickups(host: Node, player: Node) -> void:
	var entities := _current_entities(host)
	if entities == null:
		return
	# Chests only here â€” locked doors/gates are handled at their own transition step (see
	# _execute_transition), since walking to every interactable indiscriminately could waste the
	# walk-timeout budget on objects unrelated to this leg of the route.
	for child in entities.get_children():
		if not (child is ChestPickup) or child.opened:
			continue
		var reached := await _walk_player_to(host, player, child.global_position)
		# Only grant the pickup if the walk actually got the player into real interact range
		# (matching TopDownPlayerController._try_interact()'s own 36px group-distance check) â€”
		# calling interact() unconditionally regardless of whether the bot ever got there would
		# be exactly the kind of shortcut Phase 21 rules out ("no false green"). A route step
		# whose only prerequisite is a required chest (e.g. a dungeon key) will correctly fail
		# its own transition/gate check below instead of silently appearing to succeed.
		if is_instance_valid(child) and is_instance_valid(player):
			var close_enough: bool = reached or (player.global_position.distance_to(child.global_position) <= 36.0)
			if close_enough:
				_release_movement_input()
				Input.action_press("interact")
				await host.get_tree().physics_frame
				await host.get_tree().process_frame
				Input.action_release("interact")
				if is_instance_valid(child) and child.opened:
					pickups_collected += 1
		await host.get_tree().physics_frame

func _defeat_final_boss(host: Node, boss_id: String) -> bool:
	var player := host.get_tree().get_first_node_in_group("player")
	if player == null:
		return false

	var entities := _current_entities(host)
	if entities == null:
		return false

	var boss: Node = null
	for child in entities.get_children():
		if child.get("boss_id") == boss_id:
			boss = child
			break
	if boss == null:
		return false

	var boss_health: HealthComponent = boss.get_node("HealthComponent")
	if not player.has_method("_start_attack"):
		return false

	# Preserve the health earned through ordinary traversal and checkpoint interactions.
	_attach_player_health()
	var player_health: HealthComponent = player.get_node_or_null("HealthComponent")
	_boss_player_initial_health = player_health.current_health if player_health else -1.0

	var boss_defeated := false
	# Real wall-clock time, not accumulated physics delta: each iteration below nests its own
	# multi-step waits (_walk_player_to's up-to-2s internal loop, a 0.15s attack-recovery timer),
	# so crediting only one physics frame's delta per outer iteration under-counted real elapsed
	# time by roughly two orders of magnitude â€” the 12s budget was never actually enforced, the
	# loop could run for minutes of real time before its own counter agreed 12s had passed, and
	# the QA runner's outer process timeout would kill Godot first, discarding all output.
	var start_ms := Time.get_ticks_msec()
	var timeout_ms := int(_boss_attack_timeout_sec * 1000.0)
	while Time.get_ticks_msec() - start_ms < timeout_ms:
		# Checked before the boss-validity branch below: on player death, GameManager respawns
		# at the last checkpoint via load_area(), which queue_free()s every child of the *current*
		# room â€” including the still-alive boss. That would otherwise satisfy the "boss reference
		# went away" check just below and get misread as a win instead of the loss it actually is.
		if not is_instance_valid(player) or (is_instance_valid(player_health) and not player_health.is_alive()):
			break
		if not is_instance_valid(boss) or not is_instance_valid(boss_health):
			# HealthComponent's death handling frees the boss on defeat â€” a freed reference here
			# (once the player-death case above is ruled out) is the win condition, not a bug.
			boss_defeated = true
			break
		if boss_health.current_health <= 0.0:
			boss_defeated = true
			break

		# BossController flags its telegraph window on `_telegraph_active` (also a visual red
		# flash) precisely so a reacting player can back out of melee range before the swing
		# lands. Polled every physics frame here (not once per multi-frame approach/attack step)
		# so the dodge actually reacts within the ~0.6-0.8s telegraph instead of finding out about
		# it only after the current multi-frame action already committed the player to a hit.
		if bool(boss.get("_telegraph_active")) or bool(boss.get("_attack_busy")):
			var away: Vector2 = player.global_position - boss.global_position
			if away.length() < 1.0:
				away = Vector2.RIGHT
			if away.length() < 80.0:
				var escape: Vector2 = away.normalized()
				if String(boss.get("_planned_attack")) == "projectile":
					escape = escape.orthogonal()
				_step_toward(player, player.global_position + escape*90.0)
			else:
				_release_movement_input()
			# Use the game's dodge input during a telegraph, including its real cooldown
			# and invulnerability. Walking away alone can lose a close-range damage race.
			if away.length() < 60.0: Input.action_press("dash")
			else: Input.action_release("dash")
			await host.get_tree().physics_frame
			continue
		Input.action_release("dash")

		var to_boss: Vector2 = boss.global_position - player.global_position
		if to_boss.length() > 20.0:
			used_input_simulation = true
			_step_toward(player, boss.global_position)
			await host.get_tree().physics_frame
			continue

		# In range and the boss isn't winding up â€” safe to commit to a swing. Call the player's
		# own attack, not a direct hitbox poke: TopDownPlayerController's _start_attack() positions
		# AttackHitbox toward cardinal_facing() (whichever direction the player last moved) â€”
		# attacking is directional in a free-roam world, so activating the hitbox without that
		# positioning step would swing at empty space next to the boss.
		_release_movement_input()
		used_input_simulation = true
		# Holding "dash" through the swing exploits this boss's "dash_through" weakness tag (see
		# bosses.json / BossController._on_hit_received's WEAKNESS_DAMAGE_MULTIPLIER) â€” a real
		# player reading their own boss's weakness data would fight the same way, and without it
		# the fight is a straight, close-to-even HP race the player (100 HP) statistically loses
		# against a 200 HP boss even with clean dodging.
		Input.action_press("dash")
		Input.action_press("attack")
		# Let the same input and metadata-driven timing used by a human finish the swing.
		# Forcing recovery after 0.15s cancelled newer clips before their active frames.
		await host.get_tree().physics_frame
		await host.get_tree().process_frame
		Input.action_release("attack")
		attacks_performed += 1
		var swing_started := Time.get_ticks_msec()
		while is_instance_valid(player) and int(player.get("_attack_state")) != 0 and Time.get_ticks_msec() - swing_started < 3000:
			await host.get_tree().physics_frame
			await host.get_tree().process_frame
		Input.action_release("dash")
		await host.get_tree().physics_frame

	_boss_final_health = boss_health.current_health if is_instance_valid(boss_health) else 0.0
	_boss_player_final_health = player_health.current_health if is_instance_valid(player_health) else 0.0
	Input.action_release("dash")
	if Time.get_ticks_msec() - start_ms >= timeout_ms and not boss_defeated:
		_timeouts_exceeded += 1
		print("PLAYTEST_TIMEOUT: boss_fight exceeded %dms budget" % timeout_ms)

	# BossController._on_died() now plays a real death animation (DEATH_ANIMATION_DURATION_SEC,
	# ~0.7s) before emitting EventBus.boss_defeated / GameManager.current_state actually becoming
	# VICTORY â€” `boss_health.current_health <= 0.0` above (or the boss reference going away) is
	# true well before that. Without waiting here, a caller checking victory state immediately
	# after this returns would see it not-yet-true and misreport a real win as a failure â€” this
	# genuinely changed how long "defeated" takes to become "victory," not just a test artifact.
	if boss_defeated and GameManager.current_state != GameManager.GameState.VICTORY:
		var victory_wait_start := Time.get_ticks_msec()
		while GameManager.current_state != GameManager.GameState.VICTORY and Time.get_ticks_msec() - victory_wait_start < 2000:
			await host.get_tree().physics_frame

	return boss_defeated or GameManager.current_state == GameManager.GameState.VICTORY

# --- Phase 14: distance-aware walk timeout -----------------------------------------------------
# A flat per-persona walk timeout (8-12s) works for short hops but not for a long diagonal
# crossing of a larger overworld â€” and a flat timeout that's simply raised across the board is
# exactly the "increase every timeout arbitrarily" shortcut Phase 21 rules out. Instead, floor the
# persona's own budget but extend it, transparently, by how far this *specific* walk actually is:
# real travel time at the project's own walk speed, plus a fixed allowance for the unstick
# maneuvers below and the final approach/arrival slop.
const TRANSITION_TIMEOUT_ALLOWANCE_SEC := 2.0

func _walk_timeout_for(from: Vector2, target: Vector2) -> float:
	var dist := from.distance_to(target)
	var travel_time := dist / _expected_walk_speed_px
	return max(_walk_timeout_sec, travel_time + TRANSITION_TIMEOUT_ALLOWANCE_SEC)

## Bounded A-star search using the actual player's swept collision shape.
## No terrain-only shortcuts: authored props and solid doors also participate.
func _plan_walk(body: CharacterBody2D, target: Vector2) -> Array[Vector2]:
	var origin := body.global_position
	var queue: Array[Vector2i] = [Vector2i.ZERO]
	var parents := {Vector2i.ZERO: Vector2i.ZERO}
	var costs := {Vector2i.ZERO: 0.0}
	var goal := (target - origin) / 4.0
	var expanded := 0
	var end := Vector2i.ZERO
	var found := false
	while not queue.is_empty() and expanded < 8192:
		queue.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
			var ha: float = absf(goal.x-a.x)+absf(goal.y-a.y)
			var hb: float = absf(goal.x-b.x)+absf(goal.y-b.y)
			var fa: float = costs[a]+ha
			var fb: float = costs[b]+hb
			return fa > fb if not is_equal_approx(fa,fb) else ha > hb)
		var cell: Vector2i = queue.pop_back()
		expanded += 1
		var position := origin + Vector2(cell) * 4.0
		if position.distance_to(target) < 10.0:
			end = cell
			found = true
			break
		for direction in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
			var next: Vector2i = cell + direction
			var cost: float = costs[cell] + 1.0
			if costs.has(next) and costs[next] <= cost: continue
			var from := body.global_transform
			from.origin = position
			if body.test_move(from, Vector2(direction) * 4.0): continue
			parents[next] = cell
			costs[next] = cost
			if not queue.has(next): queue.append(next)
	var path: Array[Vector2] = []
	if not found: return path
	while end != Vector2i.ZERO:
		path.push_front(origin + Vector2(end) * 4.0)
		end = parents[end]
	path.append(target)
	# Keep the swept-body safety of A-star, but avoid braking at every four-pixel
	# waypoint. A long visible segment is traversed with the same real controls.
	var smooth: Array[Vector2] = []
	var current := origin
	var first := 0
	while first < path.size():
		var furthest := first
		var from := body.global_transform
		from.origin = current
		for i in range(path.size()-1,first-1,-1):
			if not body.test_move(from,path[i]-current):
				furthest = i
				break
		smooth.append(path[furthest])
		current = path[furthest]
		first = furthest+1
	return smooth

func _walk_player_to(host: Node, player: Node, target: Vector2, timeout_sec: float = -1.0) -> bool:
	if not (player is CharacterBody2D): return false
	var body := player as CharacterBody2D
	if timeout_sec < 0.0:
		timeout_sec = _walk_timeout_for(body.global_position, target)
	var path := _plan_walk(body, target)
	if path.is_empty():
		_release_movement_input()
		return false
	# Winding rooms can have a much longer traversable route than the straight-line
	# distance. Budget the actual swept-shape route at the game's authored walk speed.
	var route_length := 0.0
	var previous := body.global_position
	for point: Vector2 in path:
		route_length += previous.distance_to(point)
		previous = point
	timeout_sec = maxf(timeout_sec,route_length/_expected_walk_speed_px+TRANSITION_TIMEOUT_ALLOWANCE_SEC)
	_last_walk_budget_sec = timeout_sec
	var elapsed := 0.0
	var waypoint := 0
	var stagnant := 0.0
	var last_progress := body.global_position
	while elapsed < timeout_sec:
		if not is_instance_valid(body):
			_release_movement_input()
			return false # Caller checks whether the portal replaced the player.
		if body.global_position.distance_to(target) < 12.0:
			_release_movement_input()
			return true
		while waypoint < path.size() - 1 and body.global_position.distance_to(path[waypoint]) < 2.5:
			waypoint += 1
		# Hurt knockback or corner cutting can invalidate an otherwise collision-safe
		# path. Replan from the actual body without extending this walk's budget.
		if body.global_position.distance_to(last_progress) > 6.0:
			last_progress = body.global_position
			stagnant = 0.0
		else:
			stagnant += host.get_physics_process_delta_time()
		if stagnant > 0.6:
			path = _plan_walk(body,target)
			if path.is_empty(): break
			waypoint = 0
			stagnant = 0.0
			_unstick_attempts += 1
		used_input_simulation = true
		_step_toward(body, path[waypoint], 1.0)
		elapsed += host.get_physics_process_delta_time()
		await host.get_tree().physics_frame
	_release_movement_input()
	_timeouts_exceeded += 1
	return false

## One frame's worth of directional input toward `target`, factored out of _walk_player_to so
## the boss fight's frame-reactive approach/retreat can drive movement without that function's
## own multi-frame blocking loop swallowing telegraph-state changes mid-walk.
func _step_toward(body: CharacterBody2D, target: Vector2, deadzone: float = 4.0) -> void:
	var offset := target - body.global_position
	if offset.x > deadzone:
		Input.action_press("move_right")
		Input.action_release("move_left")
	elif offset.x < -deadzone:
		Input.action_press("move_left")
		Input.action_release("move_right")
	else:
		Input.action_release("move_left")
		Input.action_release("move_right")
	if offset.y > deadzone:
		Input.action_press("move_down")
		Input.action_release("move_up")
	elif offset.y < -deadzone:
		Input.action_press("move_up")
		Input.action_release("move_down")
	else:
		Input.action_release("move_up")
		Input.action_release("move_down")

## Steps at 90 degrees to the current target direction instead of straight at it â€” a small
## deterministic sidestep to break out of a corner/diagonal pinch the direct approach can't cross,
## without any pathfinding system. `sign` picks left vs. right so alternating attempts try both
## sides of the obstacle.
func _step_perpendicular(body: CharacterBody2D, target: Vector2, sign: float) -> void:
	var to_target := target - body.global_position
	if to_target.length() < 1.0:
		to_target = Vector2.RIGHT
	var dir := to_target.normalized()
	var perpendicular := Vector2(-dir.y, dir.x) * sign
	_step_toward(body, body.global_position + perpendicular * 40.0)

func _release_movement_input() -> void:
	Input.action_release("move_left")
	Input.action_release("move_right")
	Input.action_release("move_up")
	Input.action_release("move_down")

## The manager attached to World.tscn â€” OverworldManager.gd in this template â€” exposes its
## currently-loaded area's content via get_current_entities().
func _current_entities(host: Node) -> Node2D:
	var world_manager := host.get_tree().get_first_node_in_group("world_manager")
	if world_manager == null or not world_manager.has_method("get_current_entities"):
		return null
	return world_manager.get_current_entities()

func _find_portal(host: Node, target_area_id: String) -> Node:
	var entities := _current_entities(host)
	if entities == null:
		return null
	for child in entities.get_children():
		if str(child.get("target_area_id")) == target_area_id:
			return child
	return null
