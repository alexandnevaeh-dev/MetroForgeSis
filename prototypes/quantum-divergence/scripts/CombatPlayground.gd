extends "res://scripts/ProgressionPlayground.gd"
## Small native encounter fixture. Final art, full biome and app integration remain pending.
const Enemies = preload("res://scripts/EnemySimulation.gd")
const Session = preload("res://scripts/RunSession.gd")
const RunState = preload("res://scripts/RunState.gd")
var enemies
var session
var session_action: String = ""
var session_notice: String = "F5 Suspend / F9 Resume"
var dodged_attack: Dictionary = {}
var jump_tick: int = -1000
var enemy_deaths: Dictionary = {}
var attack_counts: Dictionary = {}
var boss_attacks: Dictionary = {}
var active_counts: Dictionary = {}
var boss_active: Dictionary = {}

func _ready() -> void:
	super._ready()
	report.scope = "Native live-enemy objective route with original programmatic test poses; not full biome, approved sprite animation or MetroForge app generation"
	enemies = Enemies.new(grid, instruments, player)
	assert(enemies.add_enemy("skitter", 301, Vector2(238, 336)))
	assert(enemies.add_enemy("wraith", 302, Vector2(356, 254)))
	assert(enemies.add_enemy("driller", 303, Vector2(474, 336)))
	assert(enemies.add_enemy("golem", 200, Vector2(576, 336), true))
	# Keep input active while paused so Escape, F9 and restart can work.
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not smoke_test:
		session = Session.new("E:/MetroForgeData/GameSaves/QuantumDivergence/profile-01", profile)
		var initialized: Dictionary = session.initialize(_bundle())
		if not initialized.accepted:
			session_notice = "Save unavailable: " + initialized.reason.replace("_", " ")
		else:
			var loaded: Dictionary = session.resume()
			if loaded.accepted:
				_commit_run(loaded)
				session_notice = "Suspended run restored."
			elif loaded.reason not in ["no_valid_suspend", "run_ended"]:
				session_notice = "Resume unavailable: " + loaded.reason.replace("_", " ")

func _bundle() -> Dictionary:
	return {"grid": grid, "player": player, "instruments": instruments, "enemies": enemies, "progress": progress}

func _commit_run(loaded: Dictionary) -> void:
	grid = loaded.bundle.grid
	player = loaded.bundle.player
	instruments = loaded.bundle.instruments
	enemies = loaded.bundle.enemies
	progress = loaded.bundle.progress
	selected = loaded.selected
	simulation_tick = loaded.tick
	effects.clear()
	jump_requested = false
	dash_requested = false
	fire_requested = false
	interact_requested = false
	dodged_attack.clear()
	jump_tick = -1000
	extraction_tick = -1
	# Route drivers and telemetry are test/presentation state, never stored as player upgrades.
	if not progress.anchor_upper:
		route_stage = "anchor"
	elif not progress.secret_found:
		route_stage = "secret"
	elif not progress.collapse_rift:
		route_stage = "crystal101"
		for id in [101,102,103]:
			if instruments.targets[id].hp > 0:
				route_stage = "crystal%d" % id
				break
	elif not progress.golem_defeated:
		route_stage = "golem"
	else:
		route_stage = "exit" if progress.golem_core else "core"
	_update_texture()
	queue_redraw()

func _input(event: InputEvent) -> void:
	super._input(event)
	if session == null or not event is InputEventKey or not event.pressed or event.echo:
		return
	if event.physical_keycode == KEY_F5:
		session_action = "suspend"
	elif event.physical_keycode == KEY_F9:
		session_action = "resume"
	elif event.physical_keycode == KEY_ENTER and (player.hp <= 0 or progress.extracted):
		session_action = "new_run"

func _physics_process(delta: float) -> void:
	# Frame-boundary swaps: a failed read cannot alter any running component.
	if session != null and session_action != "":
		var action: String = session_action
		session_action = ""
		var result: Dictionary
		if action == "suspend":
			result = session.suspend(_bundle(), selected)
			if result.accepted:
				get_tree().paused = true
				session_notice = "Suspended on E:. F9 resumes; Escape continues."
		elif action in ["resume", "new_run"]:
			result = session.resume() if action == "resume" else session.new_run()
			if result.accepted:
				_commit_run(result)
				get_tree().paused = false
				session_notice = "Fresh run; knowledge retained." if action == "new_run" else "Suspended run restored."
		if not result.accepted:
			session_notice = "Save action unavailable: " + result.reason.replace("_", " ")
		queue_redraw()
		return
	if not smoke_test and (player.hp <= 0 or progress.extracted):
		queue_redraw()
		return
	super._physics_process(delta)
	if session != null and not get_tree().paused:
		var observed: Dictionary = session.observe(_bundle())
		if not observed.accepted:
			session_notice = "Save unavailable: " + observed.reason.replace("_", " ")

func _occupy_other_actors() -> void:
	enemies.occupy_all()

func _step_actors() -> void:
	if not progress.extracted:
		enemies.step()
	else:
		enemies.events.clear()

func _controls() -> Dictionary:
	if not smoke_test or progress.extracted:
		return super._controls()
	var threat: Dictionary = {}
	var nearest: float = INF
	for actor in enemies.actors.values():
		if instruments.targets[actor.id].hp <= 0 or (actor.kind == "golem" and not progress.collapse_rift):
			continue
		var distance: float = player.position.distance_to(actor.position)
		if distance < 330.0 and distance < nearest:
			nearest = distance
			threat = actor
	var input: Dictionary
	if not threat.is_empty():
		var desired_distance: float = 210.0 if threat.kind == "golem" else 115.0
		if int(threat.attack_count) == 0:
			desired_distance = float(Enemies.DEFINITIONS[threat.kind].range) * 0.75
		var side: float = signf(player.position.x - float(threat.position.x))
		if side == 0:
			side = -1.0
		var destination: Vector2 = Vector2(clampf(float(threat.position.x) + side * desired_distance, 120.0, 706.0), player.position.y)
		input = _move_to(destination)
		# Let each family commit its first attack so the control exercises live behavior.
		if int(threat.attack_count) == 0 and nearest <= float(Enemies.DEFINITIONS[threat.kind].range):
			input.move = 0.0
		elif int(threat.attack_count) > 0:
			selected = "photon"
			fire_requested = true
			test_aim = enemies.body_rect(threat, threat.position).get_center() - (player.position + Vector2(player.facing * 14, -25))
	else:
		input = super._controls()
	for actor in enemies.actors.values():
		if instruments.targets[actor.id].hp <= 0 or actor.phase != "telegraph" or actor.attack not in ["slam", "burst", "shot"]:
			continue
		if player.position.distance_to(actor.position) > 300.0:
			continue
		if dodged_attack.get(actor.id, -1) != actor.attack_started and player.grounded:
			input.jump = true
			jump_tick = simulation_tick
			dodged_attack[actor.id] = actor.attack_started
	input.levitate = simulation_tick - jump_tick < 16
	return input

func _after_simulation(input: Dictionary) -> void:
	enemies.synchronize_damage()
	for event in enemies.events:
		if event.type == "attack_active":
			active_counts[str(event.id)] = int(active_counts.get(str(event.id), 0)) + 1
			if event.id == 200:
				boss_active[event.attack] = int(boss_active.get(event.attack, 0)) + 1
		if event.type == "telegraph":
			attack_counts[str(event.id)] = int(attack_counts.get(str(event.id), 0)) + 1
			if event.id == 200:
				boss_attacks[event.attack] = int(boss_attacks.get(event.attack, 0)) + 1
		if event.type == "enemy_death":
			enemy_deaths[str(event.id)] = event.kind
	super._after_simulation(input)

func _test_finished() -> bool:
	return player.hp <= 0 or (extraction_tick > 0 and simulation_tick >= extraction_tick + 90) or simulation_tick >= 4800

func _test_passed() -> bool:
	return progress.extracted and progress.secret_found and player.hp > 0 and enemy_deaths.size() == 4 and active_counts.size() == 4 and boss_active.has("slam") and boss_active.has("burst") and boss_active.has("roar")

func _extend_report() -> void:
	super._extend_report()
	report.erase("stationary_target_notice")
	report.enemy_deaths = enemy_deaths
	report.enemy_attack_counts = attack_counts
	report.boss_attacks = boss_attacks
	report.enemy_active_counts = active_counts
	report.boss_active = boss_active
	report.player_damage_events = player.damage_events
	report.actor_states = {}
	report.actor_positions = {}
	for actor in enemies.actors.values():
		report.actor_states[str(actor.id)] = actor.state_history.keys()
		report.actor_positions[str(actor.id)] = [actor.position.x, actor.position.y]

func _draw_actor(actor: Dictionary) -> void:
	var at: Vector2 = actor.position
	var dead: bool = instruments.targets[actor.id].hp <= 0
	var warned: bool = actor.phase == "telegraph"
	var color := Color("42667e") if not dead else Color("253548")
	var accent := Color("f5aa6d") if warned else Color("80e3de") if not dead else Color("57647b")
	var phase: float = float(int(float(simulation_tick) * (24.0 if actor.state == "run" else 16.0) / 60.0))
	if actor.kind == "golem":
		var lift: float = 18.0 if warned and actor.attack == "slam" else 0.0
		for side in [-1, 1]:
			draw_rect(Rect2(at + Vector2(side * 19 - 8, -26), Vector2(16, 26)), color)
			draw_rect(Rect2(at + Vector2(side * 30 - 9, -69 - lift), Vector2(18, 34)), color)
			draw_line(at + Vector2(side * 22, -14), at + Vector2(side * 22, -1), Color("879cb2"), 2)
		draw_polygon(PackedVector2Array([at + Vector2(-26,-76), at + Vector2(26,-76), at + Vector2(20,-30), at + Vector2(-20,-30)]), PackedColorArray([color]))
		draw_rect(Rect2(at + Vector2(-15,-96), Vector2(30,20)), color)
		draw_rect(Rect2(at + Vector2(-9,-89), Vector2(18,4)), accent)
		draw_circle(at + Vector2(0,-55), 12, Color("173944"))
		draw_circle(at + Vector2(0,-55), 7, accent)
	elif actor.kind == "skitter":
		var stride: float = sin(phase * 0.9) * 4.0 if actor.state in ["walk", "run"] else 0.0
		for side in [-1,1]:
			draw_line(at + Vector2(side * 5,-12), at + Vector2(side * (11 + stride),-2), color, 3)
			draw_rect(Rect2(at + Vector2(side * (11 + stride) - 3,-3), Vector2(6,3)), Color("a5c5d2"))
		draw_rect(Rect2(at + Vector2(-11,-25), Vector2(22,15)), color)
		draw_rect(Rect2(at + Vector2(-6,-21), Vector2(12,4)), accent)
	elif actor.kind == "wraith":
		draw_polygon(PackedVector2Array([at + Vector2(0,-23), at + Vector2(13,-9), at + Vector2(10,12), at + Vector2(0,22), at + Vector2(-10,12), at + Vector2(-13,-9)]), PackedColorArray([color]))
		draw_circle(at, 6, accent)
		draw_arc(at + Vector2(0,7), 18, 0, PI, 12, Color("ae87d2"), 1)
	else:
		for side in [-1,1]:
			draw_rect(Rect2(at + Vector2(side * 13 - 6,-8), Vector2(12,8)), Color("93b1c1"))
		draw_rect(Rect2(at + Vector2(-20,-26), Vector2(40,19)), color)
		var drill_at: Vector2 = at + Vector2(actor.facing * 25,-16)
		draw_polygon(PackedVector2Array([drill_at + Vector2(actor.facing * 9,0), drill_at + Vector2(-actor.facing * 5,-7), drill_at + Vector2(-actor.facing * 5,7)]), PackedColorArray([accent]))
		draw_rect(Rect2(at + Vector2(-9,-22), Vector2(18,4)), accent)
	var rect: Rect2 = enemies.body_rect(actor, actor.position)
	if not dead:
		draw_rect(Rect2(rect.position - Vector2(0,7), Vector2(rect.size.x * instruments.targets[actor.id].hp / float(Enemies.DEFINITIONS[actor.kind].hp),3)), Color("df9b7b"))
	if warned:
		var timing: Dictionary = Enemies.ATTACKS[actor.attack]
		var fraction: float = clampf(float(enemies.tick - int(actor.attack_started)) / float(timing.windup), 0, 1)
		draw_arc(rect.get_center(), rect.size.length() * 0.55, -PI / 2.0, -PI / 2.0 + TAU * fraction, 24, Color("efb574"), 2)
		_text(rect.position + Vector2(0,-15), actor.attack.to_upper(), 9, Color("ffc994"))
	_text(rect.position + Vector2(0,-27), actor.kind.to_upper(), 9, Color("a8bbce"))

func _draw_live_golem(_target: Dictionary) -> bool:
	if enemies == null:
		return false
	_draw_actor(enemies.actors[200])
	return true

func _draw_targets() -> void:
	super._draw_targets()
	if enemies == null:
		return
	for id in [301,302,303]:
		_draw_actor(enemies.actors[id])
	for bolt in enemies.projectiles:
		draw_line(bolt.position - Vector2(bolt.direction) * 9, bolt.position, Color("fa9b79"), 2)
		draw_circle(bolt.position, 2, Color("ffdcc1"))

func _draw_overlay() -> void:
	super._draw_overlay()
	draw_rect(Rect2(46,49,575,30), Color("080e1d"))
	_text(Vector2(49,64), "LIVE ENCOUNTER CONTROL  /  ORIGINAL TEST POSES", 12, Color("758ba9"))
	_text(Vector2(48,89), "HP %d   STATE %s" % [int(player.hp), player.state.to_upper()], 12, Color("a9d6d7"))
	if session != null:
		_text(Vector2(310,89), session_notice, 11, Color("a9d6d7"))
		if get_tree().paused:
			_text(Vector2(380,302), "SUSPENDED / PAUSED", 18, Color("e6eaff"))
		if player.hp <= 0 or progress.extracted:
			_text(Vector2(295,302), "RUN ENDED — ENTER starts a fresh run", 18, Color("e6eaff"))
	draw_rect(Rect2(46,569,890,29), Color("080e1d"))
	_text(Vector2(48,586), "E  Interact     Q  Swap     Hold R  Recall     Esc  Pause    Live AI; final art and full biome in development", 12, Color("758ba9"))
