extends RefCounted
class_name PlaytestAgent
## Input-simulating bot that follows `playtest_route.json` through the live world.
## Supports persona-specific timeouts and emits structured telemetry for balance analysis.

const ROUTE_PATH := "res://playtest_route.json"

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

func run(world: Node, host: Node) -> Dictionary:
	_started_at_ms = Time.get_ticks_msec()
	var route := _load_route()
	if route.is_empty():
		return {"ok": false, "reason": "missing_route"}

	_apply_persona(route.get("persona", {}))

	if not route.get("reachable", false):
		return {"ok": false, "reason": "route_unreachable"}

	var transitions: Array = route.get("transitions", [])
	for step in transitions:
		var from_room: String = step.get("fromRoomId", "")
		var to_room: String = step.get("toRoomId", "")
		var step_start := Time.get_ticks_msec()
		if not await _execute_transition(world, host, from_room, to_room):
			return {"ok": false, "reason": "transition_failed", "from": from_room, "to": to_room}
		_transition_timings_ms.append(Time.get_ticks_msec() - step_start)
		steps_completed += 1

	var boss_start := Time.get_ticks_msec()
	if not await _defeat_final_boss(host, String(route.get("victoryBossId", "boss_final"))):
		return {"ok": false, "reason": "boss_not_defeated"}
	var boss_fight_ms := Time.get_ticks_msec() - boss_start

	return {
		"ok": true,
		"steps": steps_completed,
		"used_input": used_input_simulation,
		"telemetry": _build_telemetry(route, boss_fight_ms),
	}

func _apply_persona(persona: Variant) -> void:
	if typeof(persona) != TYPE_DICTIONARY:
		return
	_persona_id = String(persona.get("id", _persona_id))
	_walk_timeout_sec = float(persona.get("walkTimeoutSec", _walk_timeout_sec))
	_boss_attack_timeout_sec = float(persona.get("bossAttackTimeoutSec", _boss_attack_timeout_sec))
	_collect_all_pickups = bool(persona.get("collectAllPickups", _collect_all_pickups))

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

func _execute_transition(world: Node, host: Node, from_room: String, to_room: String) -> bool:
	if GameManager.current_room_id != from_room:
		return false

	var player := host.get_tree().get_first_node_in_group("player")
	if player == null:
		return false

	if _collect_all_pickups:
		await _collect_room_pickups(host, player)

	var transition := _find_transition(host, to_room)
	if transition == null:
		return false

	if not await _walk_player_to(host, player, transition.global_position):
		return false

	await host.get_tree().physics_frame
	await host.get_tree().physics_frame

	return GameManager.current_room_id == to_room

func _collect_room_pickups(host: Node, player: Node) -> void:
	var room := _current_room(host)
	if room == null:
		return
	for child in room.get_children():
		if child.name.begins_with("AbilityPickup"):
			await _walk_player_to(host, player, child.global_position)
			pickups_collected += 1
			await host.get_tree().physics_frame

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
	var player_attack: HitboxComponent = player.get_node_or_null("AttackHitbox")
	if player_attack == null:
		return false

	var elapsed := 0.0
	while elapsed < _boss_attack_timeout_sec and boss_health.current_health > 0.0:
		var delta := host.get_physics_process_delta_time()
		elapsed += delta
		if not await _walk_player_to(host, player, boss.global_position, 2.0):
			break
		used_input_simulation = true
		Input.action_press("attack")
		player_attack.activate()
		attacks_performed += 1
		await host.get_tree().create_timer(0.15).timeout
		player_attack.deactivate()
		Input.action_release("attack")
		await host.get_tree().physics_frame

	return boss_health.current_health <= 0.0 or GameManager.current_state == GameManager.GameState.VICTORY

func _walk_player_to(host: Node, player: Node, target: Vector2, timeout_sec: float = -1.0) -> bool:
	if timeout_sec < 0.0:
		timeout_sec = _walk_timeout_sec
	if not (player is CharacterBody2D):
		return false

	var body := player as CharacterBody2D
	var elapsed := 0.0
	while elapsed < timeout_sec:
		var delta := host.get_physics_process_delta_time()
		elapsed += delta
		var dx := target.x - body.global_position.x
		if absf(dx) < 12.0:
			_release_horizontal_input()
			return true
		used_input_simulation = true
		if dx > 0.0:
			Input.action_press("move_right")
			Input.action_release("move_left")
		else:
			Input.action_press("move_left")
			Input.action_release("move_right")
		await host.get_tree().physics_frame

	_release_horizontal_input()
	return absf(target.x - body.global_position.x) < 24.0

func _release_horizontal_input() -> void:
	Input.action_release("move_left")
	Input.action_release("move_right")

func _current_room(host: Node) -> Node:
	var world_manager := host.get_tree().get_first_node_in_group("world_manager")
	if world_manager == null:
		return null
	for child in world_manager.get_children():
		if child is Node2D:
			return child
	return null

func _find_transition(host: Node, target_room_id: String) -> Node:
	var room := _current_room(host)
	if room == null:
		return null
	return _find_transition_recursive(room, target_room_id)

func _find_transition_recursive(root: Node, target_room_id: String) -> Node:
	for child in root.get_children():
		if child.get("target_room_id") == target_room_id:
			return child
		var found := _find_transition_recursive(child, target_room_id)
		if found != null:
			return found
	return null
