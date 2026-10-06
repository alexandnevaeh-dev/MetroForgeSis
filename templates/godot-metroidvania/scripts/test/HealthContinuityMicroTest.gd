extends Node
## Isolated diagnostic for the health-continuity / checkpoint / death-respawn milestone.
## Unlike GameplayVerificationRunner (real input-simulated play, no direct state mutation), this
## test uses DIRECT calls to trigger damage, checkpoint activation, and death — clearly labeled
## as such throughout — so each property can be checked in isolation without depending on a real
## combat encounter's timing or an enemy actually landing a killing blow. It exercises the real
## production code paths (WorldManager.transition_to_room, the real SavePoint.tscn scene's own
## _on_body_entered, GameManager._on_player_died/_do_respawn) — only the *inputs* that trigger
## them are direct, not the systems themselves.
## Invoked via: godot --headless --path <project> res://scenes/test/HealthContinuityMicroTest.tscn
##
## This test is also what found two separate, real bugs during the health-continuity milestone:
## 1. PlayerController._on_died() awaited `sprite.animation_finished` before ever emitting
##    EventBus.player_died. In a real, reproduced run where death is triggered by a direct
##    take_damage() call (as this test does), neither that signal, nor `await
##    get_tree().create_timer(...).timeout`, nor a `.timeout.connect(...)` on the same timer ever
##    fired — GameManager's entire respawn flow never started. Fixed at the source in
##    PlayerController.gd: emits via `call_deferred()` instead of any wait mechanism, all of which
##    had a real, reproduced failure mode here.
## 2. This test's *own* first version of the post-death wait loop only checked for
##    `current_state == PLAYING` — but state is already PLAYING at the instant take_damage() above
##    returns (death registration is deferred, not synchronous), so that loop exited on its very
##    first check, before death had actually registered at all. Every post-death check "passed" on
##    that broken version — a real, observed false-positive, not a hypothetical one. Fixed by
##    waiting for state to actually leave PLAYING (game_over_state_actually_reached) before waiting
##    for it to return.

const RESPAWN_TIMEOUT_SEC := 6.0

var _results: Array[Dictionary] = []
var _checkpoint_signal_activated: bool = false
var _checkpoint_signal_room: String = ""
var _death_signal_fired: bool = false

func _on_activation_signal_for_test(object_id: String) -> void:
	if object_id.begins_with("save_"):
		_checkpoint_signal_activated = true
		_checkpoint_signal_room = object_id.trim_prefix("save_")

func _on_player_died_for_test() -> void:
	_death_signal_fired = true

func _check(name: String, condition: bool, detail: String = "") -> void:
	_results.append({"name": name, "passed": condition, "detail": detail})
	print("%s: %s%s" % ["PASS" if condition else "FAIL", name, (" (%s)" % detail) if detail else ""])

func _ready() -> void:
	await get_tree().process_frame
	await _run()
	_finish()

func _run() -> void:
	GameManager.start_new_game()
	var world_scene := load("res://scenes/world/World.tscn") as PackedScene
	_check("world_scene_loads", world_scene != null)
	if world_scene == null:
		return
	var world: Node2D = world_scene.instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().process_frame

	var world_manager := get_tree().get_first_node_in_group("world_manager")
	_check("world_manager_found", world_manager != null)
	if world_manager == null:
		return

	var player := get_tree().get_first_node_in_group("player")
	_check("player_exists_at_start", player != null)
	if player == null:
		return
	var health := player.get_node_or_null("HealthComponent") as HealthComponent
	_check("player_has_health_component", health != null)
	if health == null:
		return

	var start_room := GameManager.current_room_id
	_check("start_room_is_room_000", start_room == "room_000", start_room)
	_check("player_starts_at_full_health", health.current_health == health.max_health,
		"%.0f/%.0f" % [health.current_health, health.max_health])

	# --- 1. Health continuity across an ordinary transition ------------------------------------
	# DIRECT CALL (isolated diagnostic): damages the player by a known amount so the post-
	# transition health can be checked against an exact expected value, rather than depending on
	# a real enemy's damage output and timing.
	health.take_damage(30.0)
	var pre_transition_health := health.current_health
	_check("direct_damage_applied", pre_transition_health == health.max_health - 30.0,
		"%.0f" % pre_transition_health)

	world_manager.call("transition_to_room", "room_001", "left")
	var transition_start := Time.get_ticks_msec()
	while GameManager.current_room_id != "room_001" and Time.get_ticks_msec() - transition_start < 4000:
		await get_tree().physics_frame
	_check("ordinary_transition_completed", GameManager.current_room_id == "room_001",
		GameManager.current_room_id)

	var player_after_transition := get_tree().get_first_node_in_group("player")
	_check("player_replaced_by_new_instance", player_after_transition != null and player_after_transition != player)
	var health_after_transition := player_after_transition.get_node_or_null("HealthComponent") as HealthComponent if player_after_transition else null
	_check("health_component_exists_after_transition", health_after_transition != null)
	if health_after_transition == null:
		return
	# THE core fix under test: health must carry forward, not silently reset to max on the new
	# Player instance's scene-default HealthComponent.
	_check("health_persists_across_ordinary_transition",
		health_after_transition.current_health == pre_transition_health,
		"expected %.0f, got %.0f" % [pre_transition_health, health_after_transition.current_health])

	# --- 2. Ability/progression state preserved across the same transition ---------------------
	# DIRECT CALL (isolated diagnostic): simulates an ability pickup without needing to navigate
	# to a real one.
	GameManager._on_ability_acquired("dash")
	_check("ability_granted_before_checkpoint", GameManager.has_ability("dash"))

	# --- 3. Real checkpoint activation ----------------------------------------------------------
	# Instantiates the real SavePoint.tscn and calls its own _on_body_entered() directly — this is
	# the real production method (heal-to-full, SaveManager.set_checkpoint, the real
	# EventBus.object_activated("save_<room>") signal), triggered directly rather than via a
	# physics-overlap walk, since this test's purpose is the checkpoint *system*, not navigation.
	var checkpoint_room := GameManager.current_room_id
	var save_point_scene := load("res://scenes/world/SavePoint.tscn") as PackedScene
	_check("save_point_scene_loads", save_point_scene != null)
	if save_point_scene == null:
		return
	var save_point := save_point_scene.instantiate()
	get_tree().get_first_node_in_group("world_manager").add_child(save_point)
	EventBus.object_activated.connect(_on_activation_signal_for_test)
	save_point.call("_on_body_entered", player_after_transition)
	await get_tree().process_frame
	EventBus.object_activated.disconnect(_on_activation_signal_for_test)

	_check("checkpoint_activation_signal_fired", _checkpoint_signal_activated)
	_check("checkpoint_signal_identifies_correct_room", _checkpoint_signal_room == checkpoint_room,
		_checkpoint_signal_room)
	_check("save_manager_records_checkpoint_room", SaveManager.get_checkpoint_room_id() == checkpoint_room,
		SaveManager.get_checkpoint_room_id())
	_check("save_manager_records_full_checkpoint_health",
		SaveManager.get_checkpoint_health() == health_after_transition.max_health,
		"%.0f" % SaveManager.get_checkpoint_health())
	_check("checkpoint_heals_player_to_full_on_touch",
		health_after_transition.current_health == health_after_transition.max_health,
		"%.0f" % health_after_transition.current_health)

	# --- 4. Real death and checkpoint respawn ---------------------------------------------------
	# DIRECT CALL (isolated diagnostic): triggers lethal damage directly rather than waiting on a
	# real enemy encounter — GameplayVerificationRunner's real playthrough covers the real-combat
	# path for this session; this test isolates the respawn *destination/state* logic instead.
	# Everything after this call (died signal -> EventBus.player_died -> GameManager's real
	# _on_player_died/_do_respawn, including its real 1s GAME_OVER window) is the unmodified
	# production respawn flow.
	EventBus.player_died.connect(_on_player_died_for_test)
	var pre_death_player_id := player_after_transition.get_instance_id()
	health_after_transition.take_damage(99999.0)
	_check("lethal_damage_kills_player", not health_after_transition.is_alive())

	# Death -> EventBus.player_died is a deferred call (see PlayerController._on_died), not
	# synchronous with take_damage() above — waiting only for "state == PLAYING" is not enough on
	# its own, since state is *already* PLAYING at this exact instant (death hasn't registered
	# yet) and a naive loop would exit on its very first check, racing ahead of the real respawn
	# sequence entirely (found by direct reproduction — this exact mistake produced a run where
	# every post-death check "passed" despite death never actually being detected). Wait for state
	# to actually leave PLAYING (confirming death registered) first.
	var death_wait_start := Time.get_ticks_msec()
	while GameManager.current_state == GameManager.GameState.PLAYING and Time.get_ticks_msec() - death_wait_start < int(RESPAWN_TIMEOUT_SEC * 1000.0):
		await get_tree().physics_frame
	_check("game_over_state_actually_reached", GameManager.current_state == GameManager.GameState.GAME_OVER,
		str(GameManager.current_state))

	var respawn_start := Time.get_ticks_msec()
	while GameManager.current_state != GameManager.GameState.PLAYING and Time.get_ticks_msec() - respawn_start < int(RESPAWN_TIMEOUT_SEC * 1000.0):
		await get_tree().physics_frame
	# These two are load-bearing against exactly the false-positive this test itself once
	# produced: state/room values that happen to already match if death never actually registered
	# (see this file's class doc comment). A real death must (a) actually emit the signal
	# GameManager's whole respawn flow depends on, and (b) actually replace the Player instance —
	# neither is true if the flow silently stalled and the player is just still standing there.
	_check("player_died_signal_actually_fired", _death_signal_fired)
	var respawned_player := get_tree().get_first_node_in_group("player")
	_check("respawned_player_exists", respawned_player != null)
	if respawned_player == null:
		return
	_check("player_instance_actually_replaced_by_respawn", respawned_player.get_instance_id() != pre_death_player_id)
	_check("respawn_flow_reaches_playing_state", GameManager.current_state == GameManager.GameState.PLAYING)
	_check("respawn_lands_in_checkpoint_room", GameManager.current_room_id == checkpoint_room,
		"expected %s, got %s" % [checkpoint_room, GameManager.current_room_id])
	var respawned_health := respawned_player.get_node_or_null("HealthComponent") as HealthComponent
	_check("respawned_health_component_exists", respawned_health != null)
	if respawned_health:
		_check("respawn_restores_checkpoint_health",
			respawned_health.current_health == SaveManager.get_checkpoint_health(),
			"%.0f vs saved %.0f" % [respawned_health.current_health, SaveManager.get_checkpoint_health()])
	_check("ability_preserved_through_death_and_respawn", GameManager.has_ability("dash"))

func _finish() -> void:
	var failures := 0
	print("HEALTH_CONTINUITY_RESULTS_BEGIN")
	for r in _results:
		if not r.passed:
			failures += 1
	print("HEALTH_CONTINUITY_RESULTS_END")
	print("HEALTH_CONTINUITY_SUMMARY total=%d passed=%d failed=%d" % [_results.size(), _results.size() - failures, failures])
	get_tree().quit(0 if failures == 0 else 1)
