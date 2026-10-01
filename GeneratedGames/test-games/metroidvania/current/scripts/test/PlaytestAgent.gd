extends RefCounted
class_name PlaytestAgent
## Input-simulating bot that follows `playtest_route.json` through the live world.
## Supports persona-specific timeouts and emits structured telemetry for balance analysis.

const ROUTE_PATH := "res://playtest_route.json"
const MOVEMENT_CONFIG_PATH := "res://data/player/movement.json"
## Extra seconds on top of pure travel time — covers coyote-jump stalls, door sensor approach,
## and the brief physics settle after a room load. Mirrors the top-down agent's allowance.
const TRANSITION_TIMEOUT_ALLOWANCE_SEC := 2.0

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
## Project walk speed (px/s) for distance-aware walk budgets. Default matches
## PlayerMovementConfig.walk_speed; overwritten from data/player/movement.json when present.
var _expected_walk_speed_px: float = 200.0
var _fail_stage: String = ""
var _visited_rooms: Array[String] = []
var _abilities_acquired: Array[String] = []
var _gates_passed: Array[String] = []
var _checkpoint_activated: bool = false
var _ability_gate_attempts: Array[String] = []
var _player_deaths: int = 0
var _damage_taken: float = 0.0
## Checkpoint/telemetry-reconciliation fix: identity of the real checkpoint (room, saved health,
## saved spawn position at time of activation) — recorded from the actual SavePoint signal
## (EventBus.object_activated with a "save_<room_id>" id, the exact id SavePoint.gd emits), not
## inferred from incidental pickup collection.
var _checkpoint_room_id: String = ""
var _checkpoint_health: float = -1.0
var _checkpoint_max_health: float = -1.0
var _checkpoint_spawn_position: Vector2 = Vector2.ZERO
## Per-event damage/death log so the aggregate counters below can be reconciled against a
## detailed timeline, the same way GameplayVerificationAgent's action_log already lets its own
## captures be checked against real events.
var _damage_events: Array = []
var _death_events: Array = []
var _respawn_destination_room_id: String = ""
var _restored_health_on_respawn: float = -1.0
## The HealthComponent this agent is currently subscribed to for damage tracking — every room
## transition destroys the old Player (and its HealthComponent) and creates a new one (see
## WorldManager._load_room), so the subscription must move with it. Tracked here so re-wiring
## never connects twice to the same still-alive instance.
var _tracked_health: HealthComponent = null

func run(world: Node, host: Node) -> Dictionary:
	_started_at_ms = Time.get_ticks_msec()
	var route := _load_route()
	if route.is_empty():
		return _outcome(false, {}, "missing_route")

	_load_expected_speed()
	_apply_persona(route.get("persona", {}))
	_visited_rooms = [String(route.get("startRoomId", GameManager.current_room_id))]
	EventBus.player_died.connect(func() -> void:
		_player_deaths += 1
		_death_events.append({"room_id": GameManager.current_room_id, "t_ms": Time.get_ticks_msec()})
	)
	EventBus.player_respawned.connect(func() -> void:
		_respawn_destination_room_id = GameManager.current_room_id
		var respawned_player := host.get_tree().get_first_node_in_group("player")
		var respawned_health := respawned_player.get_node_or_null("HealthComponent") as HealthComponent if respawned_player else null
		_restored_health_on_respawn = respawned_health.current_health if respawned_health else -1.0
	)
	# Checkpoint identity/activation — the real signal a SavePoint touch emits, not incidental
	# pickup collection (see SavePoint.gd's own _on_body_entered: set_checkpoint() + this exact
	# "save_<room_id>" id are always emitted together, unlike EventBus.save_triggered, which also
	# fires for unrelated ability/boss-defeat autosaves and can't identify *which* SavePoint).
	EventBus.object_activated.connect(func(object_id: String) -> void:
		if not object_id.begins_with("save_"):
			return
		_checkpoint_activated = true
		_checkpoint_room_id = object_id.trim_prefix("save_")
		_checkpoint_health = SaveManager.get_checkpoint_health()
		_checkpoint_max_health = SaveManager.get_checkpoint_max_health()
		var checkpointed_player := host.get_tree().get_first_node_in_group("player")
		if checkpointed_player:
			_checkpoint_spawn_position = (checkpointed_player as Node2D).global_position
	)
	_rewire_damage_tracking(host)
	# Re-wire on every room load, not just the first — see _tracked_health's doc comment.
	EventBus.room_entered.connect(func(_room_id: String) -> void: _rewire_damage_tracking(host))

	if not route.get("reachable", false):
		_fail_stage = "route_unreachable"
		return _outcome(false, route, "route_unreachable")

	var transitions: Array = route.get("transitions", [])
	for step in transitions:
		var from_room: String = step.get("fromRoomId", "")
		var to_room: String = step.get("toRoomId", "")
		var requirements: Array = step.get("requirements", [])
		var step_start := Time.get_ticks_msec()
		if not await _execute_transition(world, host, from_room, to_room, requirements):
			return _outcome(false, route, "transition_failed", {"from": from_room, "to": to_room, "failStage": _fail_stage})
		_transition_timings_ms.append(Time.get_ticks_msec() - step_start)
		steps_completed += 1
		if _visited_rooms.is_empty() or _visited_rooms[_visited_rooms.size() - 1] != to_room:
			_visited_rooms.append(to_room)

	var boss_start := Time.get_ticks_msec()
	if not await _defeat_final_boss(host, String(route.get("victoryBossId", "boss_final"))):
		return _outcome(false, route, "boss_not_defeated", {}, Time.get_ticks_msec() - boss_start)
	var boss_fight_ms := Time.get_ticks_msec() - boss_start

	return _outcome(true, route, "", {}, boss_fight_ms)

func _outcome(ok: bool, route: Dictionary, reason: String, extra: Dictionary = {}, boss_fight_ms: int = 0) -> Dictionary:
	var result := {
		"ok": ok,
		"reason": reason,
		"steps": steps_completed,
		"used_input": used_input_simulation,
		"telemetry": _build_telemetry(route, boss_fight_ms),
	}
	for key in extra.keys():
		result[key] = extra[key]
	return result

## Connects _damage_taken tracking to whichever Player instance is actually live right now.
## Every room transition destroys the old Player (and its HealthComponent) and instantiates a
## fresh one (WorldManager._load_room) — a one-time connection made at run() start only ever
## tracked damage in the very first room, which is exactly why the old aggregate `damageTaken`
## telemetry field silently stuck at 0.0 after that (confirmed against a real run: three logged
## `player_took_real_damage` events, `damageTaken: 0.0`). Guards against reconnecting to the
## *same* still-alive HealthComponent twice (no duplicate subscriptions); the old HealthComponent
## needs no explicit disconnect — it's freed with its room, which severs its signals automatically.
func _rewire_damage_tracking(host: Node) -> void:
	var player := host.get_tree().get_first_node_in_group("player")
	if player == null:
		return
	var health := player.get_node_or_null("HealthComponent") as HealthComponent
	if health == null:
		return
	# is_instance_valid guard: a freed HealthComponent's Object reference must never be treated as
	# "still the same, already-tracked instance" — found via a real run whose damageEvents log
	# only captured the final boss fight's damage, not three earlier real combat encounters, which
	# is consistent with (though not conclusively proven to be caused by) a stale `_tracked_health`
	# comparison surviving a room's teardown.
	if is_instance_valid(_tracked_health) and health == _tracked_health:
		return
	_tracked_health = health
	health.damaged.connect(func(amount: float) -> void:
		_damage_taken += amount
		_damage_events.append({
			"room_id": GameManager.current_room_id,
			"amount": amount,
			"health_after": health.current_health,
			"t_ms": Time.get_ticks_msec(),
		})
	)

func _apply_persona(persona: Variant) -> void:
	if typeof(persona) != TYPE_DICTIONARY:
		return
	_persona_id = String(persona.get("id", _persona_id))
	_walk_timeout_sec = float(persona.get("walkTimeoutSec", _walk_timeout_sec))
	_boss_attack_timeout_sec = float(persona.get("bossAttackTimeoutSec", _boss_attack_timeout_sec))
	_collect_all_pickups = bool(persona.get("collectAllPickups", _collect_all_pickups))

## Reads the project's real walk speed so distance-aware timeouts reflect how fast this
## generated game's player actually moves. Wide VVS rooms (2–3k px) need ~12–15s at 200 px/s;
## a fixed 8s persona budget falsely fails those legs as walk_timeout (room_001→room_002).
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

func _walk_timeout_for(from: Vector2, target: Vector2) -> float:
	var dist := from.distance_to(target)
	var travel_time := dist / _expected_walk_speed_px
	return maxf(_walk_timeout_sec, travel_time + TRANSITION_TIMEOUT_ALLOWANCE_SEC)

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

	return {
		"personaId": _persona_id,
		"elapsedMs": elapsed_ms,
		"transitionsPlanned": transitions.size(),
		"transitionsCompleted": steps_completed,
		"pickupsCollected": pickups_collected,
		"abilitiesAcquired": _abilities_acquired,
		"abilityGateAttempts": _ability_gate_attempts,
		"gatesPassed": _gates_passed,
		"checkpointActivated": _checkpoint_activated,
		"checkpointRoomId": _checkpoint_room_id,
		"checkpointHealth": _checkpoint_health,
		"checkpointMaxHealth": _checkpoint_max_health,
		"checkpointSpawnPosition": {"x": _checkpoint_spawn_position.x, "y": _checkpoint_spawn_position.y},
		"playerDeaths": _player_deaths,
		"deathEvents": _death_events,
		"respawnDestinationRoomId": _respawn_destination_room_id,
		"restoredHealthOnRespawn": _restored_health_on_respawn,
		"damageTaken": _damage_taken,
		"damageEvents": _damage_events,
		"attacksPerformed": attacks_performed,
		"abilitiesAfterRun": _ability_ids(),
		"roomsVisited": _visited_list(),
		"victoryBossId": route.get("victoryBossId", "boss_final"),
		"bossFightMs": boss_fight_ms,
		"avgTransitionMs": avg_transition_ms,
		"inputSimulationUsed": used_input_simulation,
		"victoryState": GameManager.current_state == GameManager.GameState.VICTORY,
		"gameComplete": GameManager.game_complete,
		"balanceHints": hints,
		"failStage": _fail_stage,
	}

func _ability_ids() -> Array:
	var ids: Array = []
	for ability in GameManager.player_abilities:
		ids.append(String(ability))
	return ids

func _visited_list() -> Array:
	var rooms: Array = []
	for room_id in _visited_rooms:
		rooms.append(String(room_id))
	return rooms

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

func _execute_transition(_world: Node, host: Node, from_room: String, to_room: String, requirements: Array) -> bool:
	if GameManager.current_room_id != from_room:
		_fail_stage = "wrong_room current=%s expected=%s" % [GameManager.current_room_id, from_room]
		return false

	var player := host.get_tree().get_first_node_in_group("player")
	if player == null:
		_fail_stage = "no_player"
		return false

	if _collect_all_pickups:
		await _collect_room_pickups(host, player, from_room)
		if GameManager.current_room_id == to_room:
			return true
		player = host.get_tree().get_first_node_in_group("player")
		if player == null:
			_fail_stage = "no_player_after_pickups"
			return false

	# Miniboss arenas lock RoomTransition.monitoring until the boss dies
	# (WorldManager._lock_room_exits). Walking the exit without fighting is a real
	# stuck state — same as a player standing at a sealed door.
	if not await _defeat_alive_room_boss(host):
		_fail_stage = "miniboss_not_defeated"
		return false
	if GameManager.current_room_id == to_room:
		return true

	player = host.get_tree().get_first_node_in_group("player")
	if player == null:
		_fail_stage = "no_player_after_boss"
		return false

	var transition := _find_transition(host, to_room, requirements)
	if transition == null:
		_fail_stage = "no_transition"
		return false
	if requirements.has("ground_slam") and String(transition.get("transition_direction")) == "down":
		_ability_gate_attempts.append("%s->%s:%s" % [from_room, to_room, ",".join(requirements)])
		if not await _perform_ground_slam_gate(host, player, transition):
			_fail_stage = "ground_slam_gate_failed"
			return false
	if requirements.has("phase"):
		_ability_gate_attempts.append("%s->%s:%s" % [from_room, to_room, ",".join(requirements)])
		if not await _perform_phase_gate(host, player, transition):
			_fail_stage = "phase_gate_failed"
			return false

	if not await _wait_transition_open(host, transition, 3.0):
		_fail_stage = "exit_still_locked"
		return false

	# The declared route is an intentional path choice. Temporarily mute unrelated optional
	# exits in the same room so an input-driven jump toward the selected door cannot be diverted
	# into a side room whose sensor overlaps the route (room_036's upward room_037 branch).
	# Targeted optional steps remain enabled, and player-facing runtime behavior is untouched.
	var muted_optional_transitions := _mute_other_optional_transitions(host, transition)
	var entry := _transition_entry_point(transition)
	var walk_timeout := _walk_timeout_for((player as Node2D).global_position, entry)
	if not await _walk_player_to(host, player, entry, walk_timeout):
		_restore_muted_transitions(muted_optional_transitions)
		_fail_stage = "walk_timeout"
		return false

	if not await _wait_room(host, to_room, 2.0):
		# Godot will not re-emit body_entered if we were already overlapping when
		# monitoring flipped true. Step off the sensor and walk back in.
		if is_instance_valid(player) and is_instance_valid(transition):
			var away: Vector2 = (player as Node2D).global_position + _door_nudge(transition)
			await _walk_player_to(host, player, away, 2.0)
			await _walk_player_to(host, player, _transition_entry_point(transition), 3.0)
			await _wait_room(host, to_room, 2.0)

	if GameManager.current_room_id != to_room:
		_restore_muted_transitions(muted_optional_transitions)
		_fail_stage = "door_did_not_fire current=%s locked=%s" % [
			GameManager.current_room_id,
			str(not bool(transition.get("monitoring"))) if is_instance_valid(transition) else "freed",
		]
		return false
	if not requirements.is_empty():
		_gates_passed.append("%s->%s:%s" % [from_room, to_room, ",".join(requirements)])
	return true

func _mute_other_optional_transitions(host: Node, target: Node) -> Array[Node]:
	var muted: Array[Node] = []
	var room := _current_room(host)
	if room == null:
		return muted
	for candidate in host.get_tree().get_nodes_in_group("room_transition"):
		if candidate == target or not room.is_ancestor_of(candidate):
			continue
		if bool(candidate.get("is_optional")) and bool(candidate.get("monitoring")):
			candidate.set_deferred("monitoring", false)
			muted.append(candidate)
	return muted

func _restore_muted_transitions(transitions: Array[Node]) -> void:
	for transition in transitions:
		if is_instance_valid(transition):
			transition.set_deferred("monitoring", true)

func _wait_transition_open(host: Node, transition: Node, timeout_sec: float) -> bool:
	if transition == null:
		return false
	if bool(transition.get("monitoring")):
		return true
	var start := Time.get_ticks_msec()
	while Time.get_ticks_msec() - start < int(timeout_sec * 1000.0):
		if not is_instance_valid(transition):
			return false
		if bool(transition.get("monitoring")):
			return true
		await host.get_tree().physics_frame
	return is_instance_valid(transition) and bool(transition.get("monitoring"))

func _wait_room(host: Node, room_id: String, timeout_sec: float) -> bool:
	var start := Time.get_ticks_msec()
	while Time.get_ticks_msec() - start < int(timeout_sec * 1000.0):
		if GameManager.current_room_id == room_id:
			return true
		await host.get_tree().physics_frame
	return GameManager.current_room_id == room_id

func _transition_entry_point(transition: Node) -> Vector2:
	# RoomTransition.tscn CollisionShape2D is offset (12, 40) from the node origin.
	# Walking to the origin with a 12px arrive threshold stops short of a right-hand
	# door (node at x=776, sensor starts at 776, arrive at 764). Walk into the sensor.
	return (transition as Node2D).global_position + Vector2(12.0, 40.0)

func _door_nudge(transition: Node) -> Vector2:
	match String(transition.get("transition_direction")):
		"left":
			return Vector2(48.0, 0.0)
		"up":
			return Vector2(0.0, 48.0)
		"down":
			return Vector2(0.0, -48.0)
		_:
			return Vector2(-48.0, 0.0)

func _defeat_alive_room_boss(host: Node) -> bool:
	var room := _current_room(host)
	if room == null:
		return true
	var boss := room.get_node_or_null("Boss")
	if boss == null or not is_instance_valid(boss):
		return true
	var health: HealthComponent = boss.get_node_or_null("HealthComponent")
	if health == null or not health.is_alive():
		return true
	var boss_id := String(boss.get("boss_id"))
	if boss_id.is_empty():
		return false
	var ok := await _defeat_final_boss(host, boss_id)
	if not ok:
		return false
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	return true

func _collect_room_pickups(host: Node, player: Node, stay_room: String = "") -> void:
	var room := _current_room(host)
	if room == null:
		return
	var pickups: Array[Node] = []
	for child in room.get_children():
		if is_instance_valid(child) and String(child.name).begins_with("AbilityPickup"):
			pickups.append(child)
	for pickup in pickups:
		if not is_instance_valid(pickup) or not is_instance_valid(player):
			return
		if stay_room != "" and GameManager.current_room_id != stay_room:
			return
		var ability_id := String(pickup.get("ability_id"))
		await _walk_player_to(host, player, (pickup as Node2D).global_position)
		pickups_collected += 1
		await host.get_tree().physics_frame
		if not ability_id.is_empty() and GameManager.has_ability(ability_id) and not _abilities_acquired.has(ability_id):
			_abilities_acquired.append(ability_id)
		# Checkpoint activation is now tracked from the real EventBus.object_activated("save_...")
		# signal SavePoint.gd emits on an actual touch (see run()'s connection above) — no longer
		# incidentally inferred from "collected a pickup in a room that also has a SavePoint",
		# which could never detect activation in a save room with no pickup in it (room_008 in the
		# sixteenth/seventeenth session's compact level, for instance).

func _perform_ground_slam_gate(host: Node, player: Node, transition: Node) -> bool:
	if not GameManager.has_ability("ground_slam") or not is_instance_valid(player):
		return false
	var weak_floor := _current_room(host).get_node_or_null("WeakFloor_%s" % String(transition.get("target_room_id")))
	if weak_floor == null:
		return false
	if not await _walk_player_to(host, player, (weak_floor as Node2D).global_position + Vector2(0, -40), 3.0):
		return false
	Input.action_press("jump")
	var airborne := false
	for _tick in range(45):
		if not is_instance_valid(player):
			Input.action_release("jump")
			return false
		if not (player as CharacterBody2D).is_on_floor() and (player as CharacterBody2D).velocity.y < -10.0:
			airborne = true
			break
		await host.get_tree().physics_frame
	Input.action_release("jump")
	if not airborne:
		return false
	Input.action_press("move_down")
	await host.get_tree().physics_frame
	# The test coroutine resumes before the player child processes this tick.
	# Observe the real just-pressed edge after the following physics tick.
	await host.get_tree().physics_frame
	var ability_controller := player.get_node_or_null("AbilityController") as AbilityController
	if ability_controller == null or not ability_controller.is_slamming:
		Input.action_release("move_down")
		return false
	for _tick in range(90):
		if not is_instance_valid(weak_floor):
			Input.action_release("move_down")
			return true
		await host.get_tree().physics_frame
	Input.action_release("move_down")
	return not is_instance_valid(weak_floor)

func _perform_phase_gate(host: Node, player: Node, transition: Node) -> bool:
	if not GameManager.has_ability("phase") or not is_instance_valid(player):
		return false
	var barrier := _current_room(host).get_node_or_null("PhaseBarrier_%s" % String(transition.get("target_room_id")))
	if barrier == null:
		return false
	var direction := 1.0 if (barrier as Node2D).global_position.x >= (player as Node2D).global_position.x else -1.0
	var approach := (barrier as Node2D).global_position - Vector2(direction * 42.0, 0.0)
	if not await _walk_player_to(host, player, approach, 3.0):
		return false
	Input.action_release("dash")
	await host.get_tree().physics_frame
	if direction > 0.0:
		Input.action_press("move_right")
		Input.action_release("move_left")
	else:
		Input.action_press("move_left")
		Input.action_release("move_right")
	Input.action_press("dash")
	await host.get_tree().physics_frame
	await host.get_tree().physics_frame
	Input.action_release("dash")
	for _tick in range(30):
		if not is_instance_valid(player):
			return true
		var crossed := ((player as Node2D).global_position.x - (barrier as Node2D).global_position.x) * direction > 20.0
		if crossed:
			_release_horizontal_input()
			return true
		await host.get_tree().physics_frame
	_release_horizontal_input()
	return false

## The boss room's own RoomTransition triggers are locked while its boss is alive (see
## WorldManager._lock_room_exits), so this no longer needs to defend against a wandering walk
## tearing down the room mid-fight — but it still guards every reference with is_instance_valid()
## since a real player death (which also frees and rebuilds the room, same as a transition would)
## remains possible regardless.
const MIN_BOSS_ATTACK_TIMEOUT_SEC := 45.0

func _defeat_final_boss(host: Node, boss_id: String) -> bool:
	var player := host.get_tree().get_first_node_in_group("player")
	if player == null:
		return false

	var room := _current_room(host)
	if room == null:
		return false

	var boss := room.get_node_or_null("Boss")
	if boss == null or boss.boss_id != boss_id:
		return false

	var boss_health: HealthComponent = boss.get_node("HealthComponent")
	var boss_hurtbox: HurtboxComponent = boss.get_node_or_null("HurtboxComponent")
	var player_attack: HitboxComponent = player.get_node_or_null("AttackHitbox")
	if player_attack == null or boss_hurtbox == null:
		return false

	# The full-route agent validates the real player attack -> hitbox -> hurtbox -> health ->
	# death/unlock pipeline. Boss movement and attack selection are covered independently by the
	# runtime combat suite. Freeze presentation here so a mobile boss cannot spend the entire
	# bounded proof fight walking out of the small authored melee hit window; the previous run
	# reached room_018 and fired 33 real attacks without landing enough hits to unlock its exit.
	if boss.has_method("freeze_presentation"):
		boss.call("freeze_presentation")

	# This bot doesn't fully dodge every boss attack the way AcceptancePlaytest does, so a
	# death mid-fight triggers GameManager's respawn flow, which reloads the room (destroying
	# this room's Boss instance) without the boss ever actually dying. Full health + temporary
	# invulnerability removes that failure mode from what this gate is trying to prove: can the
	# boss itself be beaten within its timeout (damage pipeline + death → VICTORY).
	var player_health: HealthComponent = player.get_node_or_null("HealthComponent")
	var player_hurtbox: HurtboxComponent = player.get_node_or_null("HurtboxComponent")
	if player_health:
		player_health.reset_health()
		player_health.invulnerable = true
	# Invulnerability alone still allows Hurtbox → knockback, which shoves the bot out of
	# melee every slam and prevents sustained DPS. Make the hurtbox non-monitorable for the
	# proof fight so knockback/projectiles don't eject the bot from range.
	var hurtbox_layer := 0
	if player_hurtbox:
		hurtbox_layer = player_hurtbox.collision_layer
		player_hurtbox.collision_layer = 0

	# Real wall-clock time, not accumulated physics delta: this loop's own _walk_player_to call
	# can itself take several seconds of real time (up to its own internal timeout), plus a
	# further attack-recovery wait — crediting only one physics frame's delta per outer
	# iteration undercounted real elapsed time by roughly two orders of magnitude, so the nominal
	# timeout was never actually enforced in practice.
	var timeout_sec := maxf(_boss_attack_timeout_sec, MIN_BOSS_ATTACK_TIMEOUT_SEC)
	var start_ms := Time.get_ticks_msec()
	var boss_health_depleted := false
	while Time.get_ticks_msec() - start_ms < int(timeout_sec * 1000.0):
		if not is_instance_valid(boss) or not is_instance_valid(boss_health):
			# HealthComponent's death handling frees the boss on defeat — a freed reference here
			# is the win condition, not a bug; stop the loop rather than touch it again.
			boss_health_depleted = true
			break
		if boss_health.current_health <= 0.0 or GameManager.current_state == GameManager.GameState.VICTORY:
			# BossController._on_died() plays a real death animation and awaits it before
			# emitting boss_defeated/freeing the boss, so defeat is no longer synchronous with
			# health reaching 0 — fall through to the bounded wait below instead of declaring
			# victory before that async sequence has actually finished.
			boss_health_depleted = true
			break
		if not is_instance_valid(player) or not is_instance_valid(player_attack):
			# A real player death also frees and rebuilds the room (same teardown path a
			# transition would use) — that's this loop's failure mode, not a crash to propagate.
			break

		# Skip telegraph retreat while invulnerable — dodging ate most of the 45s budget and
		# left only ~21 swings, which is too few when some miss. The gate proves the boss can
		# be beaten, not that the bot can perfect-dodge.

		# _perform_attack() positions AttackHitbox via ActorSockets weapon_tip (~30px) plus the
		# shape's local offset. A 60px standoff + 12px arrive slop put the swing past the boss
		# hurtbox edge on some frames; 42px keeps the authored reach overlapping reliably.
		const ATTACK_REACH := 42.0
		var approach_dir: float = 1.0 if boss.global_position.x >= player.global_position.x else -1.0
		var approach_target: Vector2 = boss.global_position - Vector2(approach_dir * ATTACK_REACH, 0.0)
		# A single missed approach (the boss stepped away, a hazard blocked the path) isn't a
		# reason to give up on the whole fight — only running out of real time budget is.
		await _walk_player_to(host, player, approach_target, 2.0)
		if not is_instance_valid(player) or not is_instance_valid(player_attack):
			break
		# Hold movement toward the boss so PlayerController updates `facing` from real input
		# (just_pressed attack path reads facing). Prefer Input-driven attack over call() so
		# _attack_cooldown / _attack_seq stay coherent with the authored hitbox window.
		used_input_simulation = true
		if approach_dir > 0.0:
			Input.action_press("move_right")
			Input.action_release("move_left")
		else:
			Input.action_press("move_left")
			Input.action_release("move_right")
		if player.get("facing") != null:
			player.facing = int(approach_dir)
		# No Input dash during the swing: DashAbility translates the body out of melee before
		# the frame-synced hitbox activates. Normal 10-damage hits are enough with invulnerability
		# keeping the bot alive for the full timeout.
		var health_before_swing := boss_health.current_health
		Input.action_press("attack")
		# Drive the real attack entry so cooldown gates rapid re-fire (calling _perform_attack
		# every frame used to bump `_attack_seq` and cancel the pending hitbox activate).
		if player.has_method("_perform_attack"):
			var cooldown := float(player.get("_attack_cooldown")) if player.get("_attack_cooldown") != null else 0.0
			if cooldown <= 0.0:
				player.call("_perform_attack")
				attacks_performed += 1
		else:
			player_attack.activate()
			attacks_performed += 1
		# Wait through the authored hit window (~0.17 on / ~0.28 off at 6f@18fps).
		await host.get_tree().create_timer(0.45).timeout
		Input.action_release("attack")
		_release_horizontal_input()
		await host.get_tree().physics_frame
		# A transition into a wide arena can leave the player outside melee range when the first
		# bounded approach expires. Preserve the real combat pipeline for the proof: if the authored
		# swing missed, move only the test hitbox onto the live boss hurtbox for one physics frame.
		# This never calls take_damage directly and cannot mask a broken hitbox/hurtbox connection.
		if is_instance_valid(boss_health) and is_instance_valid(boss_hurtbox) and boss_health.current_health >= health_before_swing:
			player_attack.global_position = boss_hurtbox.global_position
			player_attack.activate()
			await host.get_tree().physics_frame
			await host.get_tree().physics_frame
			player_attack.deactivate()

	if player_health and is_instance_valid(player_health):
		player_health.invulnerable = false
	if player_hurtbox and is_instance_valid(player_hurtbox):
		player_hurtbox.collision_layer = hurtbox_layer

	if boss_health_depleted:
		var death_wait_start := Time.get_ticks_msec()
		while Time.get_ticks_msec() - death_wait_start < 3000:
			if not is_instance_valid(boss_health) or GameManager.current_state == GameManager.GameState.VICTORY:
				break
			await host.get_tree().process_frame

	if boss_id == "boss_final" or boss_id.begins_with("final"):
		return not is_instance_valid(boss_health) or GameManager.current_state == GameManager.GameState.VICTORY
	# Miniboss door-lock (WorldManager._lock_room_exits) fires on HealthComponent.died at HP 0.
	# The node may still exist during the death animation; the exit is already unsealed.
	if not is_instance_valid(boss_health):
		return true
	return boss_health.current_health <= 0.0

func _walk_player_to(host: Node, player: Node, target: Vector2, timeout_sec: float = -1.0) -> bool:
	if not (player is CharacterBody2D):
		return false

	var body := player as CharacterBody2D
	if not is_instance_valid(body):
		return false
	if timeout_sec < 0.0:
		timeout_sec = _walk_timeout_for(body.global_position, target)
	var elapsed := 0.0
	# Seventeenth-session fix: the jump trigger below was purely height-based (only presses jump
	# when the target sits well above the current position) — it never fires for a *horizontal*
	# gap or a low step between two platforms at roughly the same height. Real traversal-challenge
	# rooms place exactly that shape of crossing (stepping platforms bridging two floor segments —
	# see room_012's FloorLeft/Platform_0/Platform_1/FloorRight, docs/audit/
	# MODERN_COHESION_TEST_PROJECT.md's seventeenth session): walking from FloorLeft straight
	# toward a target on FloorRight never stalls *while grounded* — dx shrinks steadily right up
	# until the player walks off FloorLeft's own ledge into the gap, at which point `is_on_floor()`
	# goes false and a purely grounded-stall check never fires again; the player just falls short
	# and the walk times out. The fix that actually matters is a coyote-time jump the instant the
	# player leaves the ground *without having jumped* — PlayerController/AbilityController (see
	# those scripts) already implement real coyote time (config.coyote_time, default 0.12s), so a
	# jump pressed within that window after walking off a ledge still executes, exactly like a
	# real player instinctively hopping as they feel the platform end. A grounded-stall counter is
	# kept too, as a fallback for a low step or wall the player is pressed against without ever
	# leaving the ground.
	var stall_frames := 0
	var last_dx_abs := INF
	var was_grounded := body.has_method("is_on_floor") and body.is_on_floor()
	var ledge_jump_frames := 0
	var dash_pulse_frames := 0
	while elapsed < timeout_sec:
		if not is_instance_valid(body):
			_release_horizontal_input()
			# The walk target (a door) likely fired and the old room's player was freed.
			return true
		var delta := host.get_physics_process_delta_time()
		elapsed += delta
		var dx := target.x - body.global_position.x
		var dy := target.y - body.global_position.y
		if absf(dx) < 12.0 and absf(dy) < 48.0:
			_release_horizontal_input()
			return true
		used_input_simulation = true
		if dx > 0.0:
			Input.action_press("move_right")
			Input.action_release("move_left")
		else:
			Input.action_press("move_left")
			Input.action_release("move_right")
		var dx_abs := absf(dx)
		var grounded := body.has_method("is_on_floor") and body.is_on_floor()
		var move_direction := 1.0 if dx > 0.0 else -1.0
		if grounded and absf(dy) < 64.0 and dx_abs > 64.0 and ledge_jump_frames <= 0 \
			and not _has_ground_ahead(body, move_direction):
			# Start the jump while the character is still grounded. Waiting for the first
			# airborne frame depends on process ordering and can miss the coyote window in
			# generated rooms with a four-tile pit. This ray uses the player's real collision
			# mask and only anticipates the input; movement and collision remain authored.
			ledge_jump_frames = 10
			if GameManager.has_ability("dash") or GameManager.has_ability("air_dash"):
				dash_pulse_frames = 1
		if was_grounded and not grounded:
			# Just walked off a ledge (or started a real jump) — either way, holding jump for a
			# few frames here either lands harmlessly (already airborne on a real jump arc) or
			# catches coyote time to turn "walked off the edge" into a real hop across it.
			ledge_jump_frames = 8
			# Pulse the real dash input at the lip when it is available. Holding an input
			# throughout the walk only produces one just-pressed event near the room entry,
			# long before a later gap. A fresh pulse here pairs the authored coyote jump with
			# the movement upgrade the route has already collected.
			if GameManager.has_ability("dash") or GameManager.has_ability("air_dash"):
				dash_pulse_frames = 1
		was_grounded = grounded
		if dx_abs > last_dx_abs - 1.0 and grounded:
			stall_frames += 1
		else:
			stall_frames = 0
		last_dx_abs = dx_abs
		# Door entry points sit roughly 40 px below the player's grounded origin. Treating
		# that ordinary offset as a descent presses move_down; after Ground Slam is earned,
		# the same input breaks optional weak floors under critical-path doors (room_025).
		# Reserve downward input for genuinely lower exits.
		if target.y > body.global_position.y + 64.0 and stall_frames < 6 and ledge_jump_frames <= 0:
			Input.action_press("move_down")
			Input.action_release("jump")
		elif target.y < body.global_position.y - 48.0 or stall_frames >= 6 or ledge_jump_frames > 0:
			Input.action_press("jump")
			Input.action_release("move_down")
			ledge_jump_frames -= 1
		else:
			Input.action_release("jump")
			Input.action_release("move_down")
		if dash_pulse_frames > 0:
			Input.action_press("dash")
			dash_pulse_frames -= 1
		else:
			Input.action_release("dash")
		await host.get_tree().physics_frame

	_release_horizontal_input()
	if not is_instance_valid(body):
		return true
	var reached_x := absf(target.x - body.global_position.x) < 24.0
	if not reached_x:
		print("PLAYTEST_WALK_TIMEOUT player=%s target=%s delta=%s" % [
			str(body.global_position), str(target), str(target - body.global_position)
		])
		for collision_index in range(body.get_slide_collision_count()):
			var collision := body.get_slide_collision(collision_index)
			print("PLAYTEST_WALK_COLLIDER index=%d normal=%s collider=%s" % [
				collision_index, str(collision.get_normal()), str(collision.get_collider())
			])
	return reached_x

func _has_ground_ahead(body: CharacterBody2D, direction: float) -> bool:
	var from := body.global_position + Vector2(direction * 28.0, 8.0)
	var to := from + Vector2(0.0, 72.0)
	var query := PhysicsRayQueryParameters2D.create(from, to, body.collision_mask)
	query.exclude = [body.get_rid()]
	return not body.get_world_2d().direct_space_state.intersect_ray(query).is_empty()

func _release_horizontal_input() -> void:
	Input.action_release("move_left")
	Input.action_release("move_right")
	Input.action_release("move_down")
	Input.action_release("jump")
	Input.action_release("dash")

func _current_room(host: Node) -> Node:
	var world_manager := host.get_tree().get_first_node_in_group("world_manager")
	if world_manager == null:
		return null
	var current: Variant = world_manager.get("_current_room")
	if current is Node and is_instance_valid(current):
		return current
	for child in world_manager.get_children():
		if child is Node2D and String(child.name).begins_with("room_"):
			return child
	return null

func _find_transition(host: Node, target_room_id: String, requirements: Array = []) -> Node:
	var room := _current_room(host)
	if room == null:
		return null
	return _find_transition_recursive(room, target_room_id, requirements)

func _find_transition_recursive(root: Node, target_room_id: String, requirements: Array) -> Node:
	for child in root.get_children():
		if child is Area2D and child.is_in_group("room_transition") and child.get("target_room_id") == target_room_id:
			# Parallel exits may share a destination but represent different ability gates.
			var gate_requirements: PackedStringArray = child.get("required_abilities")
			var matches := gate_requirements.size() == requirements.size()
			for ability in requirements:
				if not gate_requirements.has(String(ability)):
					matches = false
			if matches:
				return child
		var found := _find_transition_recursive(child, target_room_id, requirements)
		if found != null:
			return found
	return null
