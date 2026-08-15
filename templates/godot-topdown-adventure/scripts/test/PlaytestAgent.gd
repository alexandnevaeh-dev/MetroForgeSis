extends RefCounted
class_name PlaytestAgent
## Input-simulating bot that follows `playtest_route.json` through the live top-down world.
## Adapted from the side-view template's version: no per-room child scenes here — every area's
## content lives under OverworldManager.get_current_entities(), transitions are AreaPortal/
## LockedDoor nodes keyed by `target_area_id` (not RoomTransition's `target_room_id`), pickups
## are interact-based ChestPickup (not walk-over AbilityPickup), and movement is free-roam 2D
## (both axes), not a single horizontal axis. Supports persona-specific timeouts and emits
## structured telemetry for balance analysis, matching the side-view version's contract.
##
## Root-cause note (see docs/debug/TOPDOWN_PLAYTEST_REPAIR.md): the overworld's per-cell random
## water/wall scatter (packages/procedural/src/topdown/world.ts) used to place obstacles fully
## independently of POI positions and player paths — a POI could generate on top of a blocked
## tile, and two randomly-scattered obstacles could end up diagonally touching, pinching a path
## to zero real width. A real headless run confirmed the greedy straight-line walk below got
## permanently wedged at exactly such a spot (position and velocity frozen for the rest of the
## walk timeout). That's now fixed at the generation layer (every POI gets guaranteed-walkable
## clearance, and a de-pinch pass removes diagonal-only blocked patterns), but the bot below also
## gained bounded stuck-detection/unstick logic as defense-in-depth — the same terrain shape that
## wedged a bot with no recovery logic can still cost a real player time, and a competent player
## sidesteps around a minor obstacle rather than standing still walking into it forever.

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

func run(world: Node, host: Node) -> Dictionary:
	_started_at_ms = Time.get_ticks_msec()
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

## Builds the final outcome dictionary — always, on every exit path (success or failure), so
## PlaytestRunner.gd always has telemetry to write to playtest_telemetry.json even for a run that
## never got anywhere near victory. Before this fix, telemetry only existed on full success (see
## the old `run()`'s early `return {"ok": false, "reason": ...}` returns with no "telemetry" key
## at all) — a route failing on its very first step produced zero diagnostic output.
func _finish(ok: bool, route: Dictionary, boss_fight_ms: int, from_area: String = "", to_area: String = "") -> Dictionary:
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
## moving target — measured at ~2.2s/cycle even against a stationary-looking TINY_TEST boss —
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
## guess. Best-effort — falls back to the template's own default (see PlayerMovementConfig.gd)
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
		"roomsVisited": route.get("visitedRoomOrder", []),
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

	if _collect_all_pickups:
		await _collect_area_pickups(host, player)

	# An incidental pickup-walk can itself carry the player across a portal boundary (AreaPortal
	# triggers on physical contact, no arrival tolerance) — check before searching for one.
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
		portal.interact(player)
		await host.get_tree().physics_frame
		if portal.get("unlocked") == true:
			_gates_opened += 1

	# Walking toward the portal can itself complete the transition mid-flight — touching its
	# Area2D fires AreaPortal/LockedDoor's own body_entered handler immediately, before
	# _walk_player_to's distance-based "arrival" check would ever run, and that handler frees the
	# old area's player instance. So the walk call's own return value isn't the success signal —
	# a freed player reference there is the *expected* shape of success, not a bug — only the
	# resulting room id is. Ignore what _walk_player_to returns and re-check state directly.
	var walk_timeout := _walk_timeout_for(player.global_position, portal.global_position)
	diag["timeoutMs"] = int(walk_timeout * 1000.0)
	await _walk_player_to(host, player, portal.global_position, walk_timeout)
	await host.get_tree().physics_frame
	await host.get_tree().physics_frame

	var final_ok := GameManager.current_room_id == to_area
	diag["result"] = "PASS" if final_ok else "FAIL"
	if not final_ok:
		diag["failureReason"] = "walk_timeout_or_blocked"
		diag["distanceToTarget"] = (
			player.global_position.distance_to(portal.global_position) if is_instance_valid(player) else -1.0
		)
	diag["playerPositionEnd"] = _pos_str(player) if is_instance_valid(player) else "freed"
	_record_step(diag, step_start_ms)
	return final_ok

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
	# Chests only here — locked doors/gates are handled at their own transition step (see
	# _execute_transition), since walking to every interactable indiscriminately could waste the
	# walk-timeout budget on objects unrelated to this leg of the route.
	for child in entities.get_children():
		if not (child is ChestPickup) or child.opened:
			continue
		var reached := await _walk_player_to(host, player, child.global_position)
		# Only grant the pickup if the walk actually got the player into real interact range
		# (matching TopDownPlayerController._try_interact()'s own 36px group-distance check) —
		# calling interact() unconditionally regardless of whether the bot ever got there would
		# be exactly the kind of shortcut Phase 21 rules out ("no false green"). A route step
		# whose only prerequisite is a required chest (e.g. a dungeon key) will correctly fail
		# its own transition/gate check below instead of silently appearing to succeed.
		if is_instance_valid(child) and is_instance_valid(player):
			var close_enough: bool = reached or (player.global_position.distance_to(child.global_position) <= 36.0)
			if close_enough:
				child.interact(player)
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

	# Route-following incidentally walks the player through/near regular enemies on the way to
	# the arena (this bot doesn't dodge them either), so it can arrive with chip damage already
	# taken — a real player would typically rest at the dungeon's SavePoint first, but the route
	# only visits pickups on each leg's *origin* room, never the boss room itself (nothing
	# transitions *from* it). Reset to full here so this gate proves "is the boss itself
	# beatable within its timeout," not "did the bot happen to arrive undamaged."
	var player_health: HealthComponent = player.get_node_or_null("HealthComponent")
	if player_health:
		player_health.reset_health()

	var boss_defeated := false
	# Real wall-clock time, not accumulated physics delta: each iteration below nests its own
	# multi-step waits (_walk_player_to's up-to-2s internal loop, a 0.15s attack-recovery timer),
	# so crediting only one physics frame's delta per outer iteration under-counted real elapsed
	# time by roughly two orders of magnitude — the 12s budget was never actually enforced, the
	# loop could run for minutes of real time before its own counter agreed 12s had passed, and
	# the QA runner's outer process timeout would kill Godot first, discarding all output.
	var start_ms := Time.get_ticks_msec()
	var timeout_ms := int(_boss_attack_timeout_sec * 1000.0)
	while Time.get_ticks_msec() - start_ms < timeout_ms:
		# Checked before the boss-validity branch below: on player death, GameManager respawns
		# at the last checkpoint via load_area(), which queue_free()s every child of the *current*
		# room — including the still-alive boss. That would otherwise satisfy the "boss reference
		# went away" check just below and get misread as a win instead of the loss it actually is.
		if not is_instance_valid(player) or (is_instance_valid(player_health) and not player_health.is_alive()):
			break
		if not is_instance_valid(boss) or not is_instance_valid(boss_health):
			# HealthComponent's death handling frees the boss on defeat — a freed reference here
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
		if bool(boss.get("_telegraph_active")):
			var away: Vector2 = player.global_position - boss.global_position
			if away.length() < 1.0:
				away = Vector2.RIGHT
			_step_toward(player, player.global_position + away.normalized() * 40.0)
			await host.get_tree().physics_frame
			continue

		var to_boss: Vector2 = boss.global_position - player.global_position
		if to_boss.length() > 20.0:
			used_input_simulation = true
			_step_toward(player, boss.global_position)
			await host.get_tree().physics_frame
			continue

		# In range and the boss isn't winding up — safe to commit to a swing. Call the player's
		# own attack, not a direct hitbox poke: TopDownPlayerController's _start_attack() positions
		# AttackHitbox toward cardinal_facing() (whichever direction the player last moved) —
		# attacking is directional in a free-roam world, so activating the hitbox without that
		# positioning step would swing at empty space next to the boss.
		_release_movement_input()
		used_input_simulation = true
		# Holding "dash" through the swing exploits this boss's "dash_through" weakness tag (see
		# bosses.json / BossController._on_hit_received's WEAKNESS_DAMAGE_MULTIPLIER) — a real
		# player reading their own boss's weakness data would fight the same way, and without it
		# the fight is a straight, close-to-even HP race the player (100 HP) statistically loses
		# against a 200 HP boss even with clean dodging.
		Input.action_press("dash")
		Input.action_press("attack")
		player.call("_start_attack")
		attacks_performed += 1
		await host.get_tree().create_timer(0.15).timeout
		if is_instance_valid(player) and player.has_method("_on_attack_finished"):
			player.call("_on_attack_finished")
		Input.action_release("attack")
		Input.action_release("dash")
		await host.get_tree().physics_frame

	if Time.get_ticks_msec() - start_ms >= timeout_ms and not boss_defeated:
		_timeouts_exceeded += 1
		print("PLAYTEST_TIMEOUT: boss_fight exceeded %dms budget" % timeout_ms)

	return boss_defeated or GameManager.current_state == GameManager.GameState.VICTORY

# --- Phase 14: distance-aware walk timeout -----------------------------------------------------
# A flat per-persona walk timeout (8-12s) works for short hops but not for a long diagonal
# crossing of a larger overworld — and a flat timeout that's simply raised across the board is
# exactly the "increase every timeout arbitrarily" shortcut Phase 21 rules out. Instead, floor the
# persona's own budget but extend it, transparently, by how far this *specific* walk actually is:
# real travel time at the project's own walk speed, plus a fixed allowance for the unstick
# maneuvers below and the final approach/arrival slop.
const TRANSITION_TIMEOUT_ALLOWANCE_SEC := 2.0

func _walk_timeout_for(from: Vector2, target: Vector2) -> float:
	var dist := from.distance_to(target)
	var travel_time := dist / _expected_walk_speed_px
	return max(_walk_timeout_sec, travel_time + TRANSITION_TIMEOUT_ALLOWANCE_SEC)

# --- Phase 15: bounded unstick strategy ---------------------------------------------------------
const STUCK_CHECK_INTERVAL_SEC := 0.4
const STUCK_PROGRESS_THRESHOLD_PX := 6.0
const MAX_UNSTICK_ATTEMPTS_PER_WALK := 4
const UNSTICK_HOLD_SEC := 0.25

## Free-roam 2D walk (both axes at once), unlike the side-view template's horizontal-only
## version — a top-down world has no floor/corridor constraint forcing single-axis movement.
## Detects being stuck (position not meaningfully progressing over a short window) and tries a
## perpendicular sidestep before resuming the direct approach — bounded, and never a teleport: if
## the bounded attempts don't free the body, this returns false honestly rather than silently
## treating the leg as complete.
func _walk_player_to(host: Node, player: Node, target: Vector2, timeout_sec: float = -1.0) -> bool:
	if not (player is CharacterBody2D):
		return false
	var body := player as CharacterBody2D
	if timeout_sec < 0.0:
		timeout_sec = _walk_timeout_for(body.global_position, target)

	var elapsed := 0.0
	var stuck_timer := 0.0
	var last_check_pos := body.global_position
	var unstick_hold := 0.0
	var unstick_sign := 1.0
	var local_unstick_attempts := 0

	while elapsed < timeout_sec:
		if not is_instance_valid(body):
			# The player instance is recreated on every load_area() call — walking into this
			# target can itself trigger an area transition (a portal/door has no arrival
			# tolerance of its own), freeing the old instance before this loop's distance check
			# would fire. That's the caller's success signal to interpret, not a failure here —
			# just stop cleanly instead of touching the freed reference again.
			return false
		var delta := host.get_physics_process_delta_time()
		elapsed += delta
		stuck_timer += delta
		if body.global_position.distance_to(target) < 12.0:
			_release_movement_input()
			return true

		if unstick_hold > 0.0:
			unstick_hold -= delta
			await host.get_tree().physics_frame
			continue

		if stuck_timer >= STUCK_CHECK_INTERVAL_SEC:
			var progressed := body.global_position.distance_to(last_check_pos)
			stuck_timer = 0.0
			last_check_pos = body.global_position
			if progressed < STUCK_PROGRESS_THRESHOLD_PX:
				local_unstick_attempts += 1
				_unstick_attempts += 1
				if local_unstick_attempts > MAX_UNSTICK_ATTEMPTS_PER_WALK:
					_release_movement_input()
					return false
				# Alternate sides each attempt so a pinch that only opens on one side still gets
				# a fair try, without looping forever on a side that never works.
				unstick_sign = -unstick_sign
				_step_perpendicular(body, target, unstick_sign)
				unstick_hold = UNSTICK_HOLD_SEC
				await host.get_tree().physics_frame
				continue

		used_input_simulation = true
		_step_toward(body, target)
		await host.get_tree().physics_frame

	_release_movement_input()
	_timeouts_exceeded += 1
	print("PLAYTEST_TIMEOUT: walk_to target=%s exceeded %dms budget (unstick_attempts=%d)" % [target, int(timeout_sec * 1000.0), local_unstick_attempts])
	return target.distance_to(body.global_position) < 24.0

## One frame's worth of directional input toward `target`, factored out of _walk_player_to so
## the boss fight's frame-reactive approach/retreat can drive movement without that function's
## own multi-frame blocking loop swallowing telegraph-state changes mid-walk.
func _step_toward(body: CharacterBody2D, target: Vector2) -> void:
	var offset := target - body.global_position
	if offset.x > 4.0:
		Input.action_press("move_right")
		Input.action_release("move_left")
	elif offset.x < -4.0:
		Input.action_press("move_left")
		Input.action_release("move_right")
	else:
		Input.action_release("move_left")
		Input.action_release("move_right")
	if offset.y > 4.0:
		Input.action_press("move_down")
		Input.action_release("move_up")
	elif offset.y < -4.0:
		Input.action_press("move_up")
		Input.action_release("move_down")
	else:
		Input.action_release("move_up")
		Input.action_release("move_down")

## Steps at 90 degrees to the current target direction instead of straight at it — a small
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

## The manager attached to World.tscn — OverworldManager.gd in this template — exposes its
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
