extends "res://scripts/CombatPlayground.gd"
## Recorded durability control: normal gameplay obtains the secret and enemy damage ends the run.
var save_phase: String = "route"
var held_frames: int = 0
var total_frames: int = 0
var checkpoint: PackedByteArray = PackedByteArray()
var save_checks: Dictionary = {}
var checkpoint_tick: int = -1
var death_tick: int = -1
var death_damage: Array = []

func _ready() -> void:
	super._ready()
	assert(smoke_test and capture_dir != "")
	report.scope = "Native suspend/resume and enemy-caused death/restart control; scripted normal controls, original test poses; not MetroForge app generation or full biome"
	session = Session.new(capture_dir.path_join("save-profile"),profile)
	assert(session.initialize(_bundle()).accepted)

func _controls() -> Dictionary:
	if save_phase == "death_route":
		fire_requested = false
		# Deliberately stop dodging and walk into the live Driller encounter; no HP edits.
		var target: int = 303 if instruments.targets[303].hp > 0 else 200
		return _move_to(enemies.actors[target].position)
	if save_phase in ["restart_check", "complete"]:
		fire_requested = false
		return {}
	return super._controls()

func _press(key: int) -> void:
	# Exercise the game's key handler without sending operating-system input.
	var event := InputEventKey.new()
	event.physical_keycode = key
	event.pressed = true
	_input(event)

func _physics_process(delta: float) -> void:
	total_frames += 1
	if save_phase in ["suspend_hold", "death_hold"]:
		held_frames += 1
		if held_frames == 8:
			var label: int = 9001 if save_phase == "suspend_hold" else 9003
			captured[label] = true
			_capture(label)
		if held_frames >= 60:
			_press(KEY_F9 if save_phase == "suspend_hold" else KEY_ENTER)
			save_phase = "queued_resume" if save_phase == "suspend_hold" else "queued_restart"
		queue_redraw()
		return
	super._physics_process(delta)
	if save_phase == "route" and simulation_tick >= 45 and progress.secret_found and not enemies.projectiles.is_empty():
		checkpoint_tick = simulation_tick
		checkpoint = var_to_bytes(RunState.snapshot(_bundle(),selected))
		save_checks.live_hostile_projectile = true
		_press(KEY_F5)
		save_phase = "queued_suspend"
	elif save_phase == "queued_suspend":
		save_checks.suspended = get_tree().paused
		save_checks.pause_tick = simulation_tick == checkpoint_tick
		save_phase = "suspend_hold"
		held_frames = 0
	elif save_phase == "queued_resume":
		save_checks.resumed_exactly = checkpoint == var_to_bytes(RunState.snapshot(_bundle(),selected))
		save_checks.resumed_unpaused = not get_tree().paused
		save_checks.resume_tick = simulation_tick == checkpoint_tick
		var next_profile: Dictionary = {"blueprints": []}
		var new_process = Session.new(capture_dir.path_join("save-profile"),next_profile)
		var initial: Dictionary = RunState.build(session.baseline,next_profile)
		save_checks.new_session_load = initial.accepted and new_process.initialize(initial.bundle).accepted and new_process.resume().accepted and next_profile.blueprints == ["entanglement"]
		save_phase = "death_route"
	elif save_phase == "death_route" and player.hp <= 0:
		death_tick = simulation_tick
		death_damage = player.damage_events.duplicate(true)
		save_checks.enemy_caused_death = not death_damage.is_empty()
		for damage in death_damage:
			save_checks.enemy_caused_death = save_checks.enemy_caused_death and damage.source in ["enemy_projectile", "skitter", "driller", "golem_slam"]
		save_checks.death_blocks_resume = session.resume().get("reason") == "run_ended"
		save_checks.disk_death_blocks_resume = session.store.load_active(func(candidate): return RunState.build(candidate,profile)).get("reason") == "run_ended"
		save_checks.knowledge_survives = session.store.load_profile().get("profile",{}).get("blueprints",[]) == ["entanglement"]
		save_phase = "death_hold"
		held_frames = 0
	elif save_phase == "queued_restart":
		save_checks.new_run = simulation_tick == 0 and player.hp == 100.0 and instruments.energy == 100.0 and enemies.actors[200].attack_count == 0 and instruments.targets[200].hp == 300.0 and not progress.secret_found and not progress.anchor_upper and profile.blueprints == ["entanglement"]
		save_checks.new_run_resumable = session.resume().accepted
		save_phase = "restart_check"
		captured[9004] = true
		_capture(9004)
	elif save_phase == "restart_check" and simulation_tick >= 59:
		save_phase = "complete"

func _test_finished() -> bool:
	return (save_phase == "complete" and simulation_tick >= 60) or total_frames >= 7200

func _test_passed() -> bool:
	return save_phase == "complete" and save_checks.size() == 13 and not false in save_checks.values()

func _extend_report() -> void:
	super._extend_report()
	report.save_checks = save_checks
	report.save_phase = save_phase
	report.checkpoint_tick = checkpoint_tick
	report.death_tick = death_tick
	report.death_damage = death_damage
	report.total_frames = total_frames
	report.save_root = session.store.root

func _draw_overlay() -> void:
	super._draw_overlay()
	draw_rect(Rect2(46,49,575,30), Color("080e1d"))
	_text(Vector2(49,64), "SAVE / DEATH / RESTART CONTROL  /  " + save_phase.to_upper(), 12, Color("758ba9"))
