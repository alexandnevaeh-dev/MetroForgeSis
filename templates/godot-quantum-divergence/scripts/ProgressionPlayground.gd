extends "res://scripts/Playground.gd"
## Rendered progression control. The stationary Golem target is not a finished enemy AI.
const Progression = preload("res://scripts/MinesProgression.gd")
var progress
var profile: Dictionary = {"blueprints": []}
var route_stage: String = "anchor"
var test_aim := Vector2.RIGHT
var interact_requested: bool = false
var extraction_tick: int = -1
var notice: String = "Activate the upper anchor with E."
var rift_capture: bool = false
var exit_capture: bool = false

func _ready() -> void:
	capture_ticks = [60]
	report.scope = "Native progression control with stationary combat targets and original test art; not a full biome, finished enemy AI or MetroForge app generation"
	super._ready()
	progress = Progression.new(grid, instruments, player, profile)
	if not progress.configure({"anchor": Vector2(120, 336), "core": Vector2(626, 336),
		"exit": Vector2(708, 336), "secret": Vector2(165, 336), "upper_region": Rect2i(1, 1, 78, 83),
		"ghost_platforms": [Rect2i(80, 53, 12, 1), Rect2i(106, 48, 12, 1)],
		"crystals": [101, 102, 103], "golem": 200}):
		_runtime_failure("Quantum fixture objective configuration failed")
		return

func _build_world() -> void:
	for y in range(84, 95):
		for x in range(1, 191):
			grid.set_material(x, y, Grid.CellMaterial.SOLID, true)
	for y in range(70, 84):
		for x in range(13, 28):
			grid.set_material(x, y, Grid.CellMaterial.EMPTY, true)
	for x in range(45, 70):
		grid.set_material(x, 34, Grid.CellMaterial.UNSTABLE_ORE)
	for rect in [Rect2i(80, 53, 12, 1), Rect2i(106, 48, 12, 1)]:
		for x in range(rect.position.x, rect.end.x):
			grid.set_material(x, rect.position.y, Grid.CellMaterial.UNSTABLE_ORE)
	for x in range(134, 176):
		grid.set_material(x, 42, Grid.CellMaterial.SOLID, true)
	for y in range(34, 42):
		for x in range(146, 166):
			grid.set_material(x, y, Grid.CellMaterial.FLUID)

func _setup_targets() -> void:
	for i in 3:
		instruments.add_target(101 + i, Rect2(212 + i * 80, 300, 20, 36), 24.0)
	instruments.add_target(200, Rect2(544, 240, 64, 96), 300.0)

func _input(event: InputEvent) -> void:
	super._input(event)
	if event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_E:
		interact_requested = true

func _move_to(point: Vector2) -> Dictionary:
	var dx: float = point.x - player.position.x
	return {"move": signf(dx) if absf(dx) > 4.0 else 0.0, "run": true}

func _controls() -> Dictionary:
	if progress.extracted:
		fire_requested = false
		return {}
	if not smoke_test:
		return super._controls()
	var destination: Vector2 = progress.layout.anchor
	if route_stage == "secret":
		destination = progress.layout.secret
	elif route_stage.begins_with("crystal") or route_stage == "golem":
		var target_id: int = int(route_stage.trim_prefix("crystal")) if route_stage.begins_with("crystal") else 200
		var target: Dictionary = instruments.targets[target_id]
		destination = Vector2(target.rect.position.x - 60, 336)
		test_aim = target.rect.get_center() - (player.position + Vector2(player.facing * 14, -25))
		if absf(destination.x - player.position.x) < 5 and target.hp > 0:
			selected = "photon"
			fire_requested = true
	elif route_stage == "core":
		destination = progress.layout.core
	elif route_stage == "exit":
		destination = progress.layout.exit
	elif route_stage == "complete":
		return {}
	if route_stage in ["anchor", "secret", "core", "exit"] and player.position.distance_to(destination) < 8.0:
		interact_requested = true
	return _move_to(destination)

func _aim_for_test(_muzzle: Vector2) -> Vector2:
	return test_aim

func _after_simulation(_input: Dictionary) -> void:
	progress.step()
	if interact_requested:
		var nearest: String = ""
		var distance: float = Progression.INTERACT_DISTANCE
		for id in ["anchor", "secret", "core", "exit"]:
			var candidate: float = player.position.distance_to(progress.layout[id])
			if candidate < distance:
				distance = candidate
				nearest = id
		if nearest != "":
			var result: Dictionary = progress.interact(nearest)
			notice = nearest.capitalize() + " complete." if result.accepted else result.reason.replace("_", " ").capitalize()
		interact_requested = false
	if smoke_test:
		if route_stage == "anchor" and progress.anchor_upper:
			route_stage = "secret"
		elif route_stage == "secret" and progress.secret_found:
			route_stage = "crystal101"
		elif route_stage.begins_with("crystal"):
			var target_id: int = int(route_stage.trim_prefix("crystal"))
			if instruments.targets[target_id].hp <= 0:
				route_stage = "crystal%d" % (target_id + 1) if target_id < 103 else "golem"
		elif route_stage == "golem" and progress.golem_defeated:
			route_stage = "core"
		elif route_stage == "core" and progress.golem_core:
			route_stage = "exit"
	if progress.extracted and extraction_tick < 0:
		extraction_tick = simulation_tick
		route_stage = "complete"
		notice = "EXTRACTION VERIFIED — all three objectives and the defeated core."
	if smoke_test and capture_dir != "":
		if progress.collapse_rift and not rift_capture:
			rift_capture = true
			captured[simulation_tick] = true
			_capture(simulation_tick)
		if extraction_tick > 0 and simulation_tick == extraction_tick + 30 and not exit_capture:
			exit_capture = true
			captured[simulation_tick] = true
			_capture(simulation_tick)

func _test_finished() -> bool:
	return (extraction_tick > 0 and simulation_tick >= extraction_tick + 90) or simulation_tick >= 2400

func _test_passed() -> bool:
	# The seeded fluid basin spills in front of the target: two shots strike matter first.
	return progress.extracted and progress.secret_found and player.hp > 0 and report.shots == 33 and report.impacts == 2 and report.get("target_hits", {}) == {"101": 2, "102": 2, "103": 2, "200": 25}

func _can_fire() -> bool:
	return super._can_fire() and not progress.extracted

func _extend_report() -> void:
	report.progression = progress.status()
	report.blueprints = profile.blueprints
	report.route_stage = route_stage
	report.capture_ticks = captured.keys()
	report.stationary_target_notice = "Enemy AI and production sprite animation remain pending; this control proves progression and projectile damage."

func _draw_targets() -> void:
	for id in [101, 102, 103, 200]:
		var target: Dictionary = instruments.targets[id]
		var rect: Rect2 = target.rect
		if id == 200:
			if _draw_live_golem(target):
				continue
			var at: Vector2 = Vector2(rect.get_center().x, rect.end.y)
			var color := Color("57687e") if target.hp > 0 else Color("26354b")
			for side in [-1, 1]:
				draw_rect(Rect2(at + Vector2(side * 18 - 8, -26), Vector2(16, 26)), color)
				draw_rect(Rect2(at + Vector2(side * 30 - 9, -70), Vector2(18, 34)), color)
				draw_line(at + Vector2(side * 22, -14), at + Vector2(side * 22, -1), Color("8da0b5"), 2)
			draw_polygon(PackedVector2Array([at + Vector2(-26,-78), at + Vector2(26,-78), at + Vector2(20,-30), at + Vector2(-20,-30)]), PackedColorArray([color]))
			draw_rect(Rect2(at + Vector2(-15, -96), Vector2(30, 20)), color)
			draw_rect(Rect2(at + Vector2(-8, -90), Vector2(16, 4)), Color("80b6c9"))
			draw_circle(at + Vector2(0, -55), 12, Color("173944"))
			draw_circle(at + Vector2(0, -55), 7, Color("68ecdf") if target.hp > 0 else Color("f3d48a"))
			_text(at + Vector2(-37, -111), "GOLEM TARGET", 9, Color("9bb2ca"))
		else:
			var center: Vector2 = rect.get_center()
			if target.hp > 0:
				draw_polygon(PackedVector2Array([center + Vector2(0,-18), center + Vector2(10,-2), center + Vector2(0,18), center + Vector2(-10,-2)]), PackedColorArray([Color("947bc8")]))
				draw_line(center + Vector2(0,-13), center + Vector2(-4,6), Color("ddbefa"), 2)
			else:
				draw_line(center + Vector2(-8,15), center + Vector2(8,15), Color("6173a2"), 3)
			_text(rect.position + Vector2(-2,-10), "RIFT %d" % (id - 100), 9, Color("c5a6ed"))
		if target.hp > 0:
			draw_rect(Rect2(rect.position - Vector2(0,6), Vector2(rect.size.x * target.hp / (300.0 if id == 200 else 24.0), 3)), Color("e1ac85"))
	if progress != null:
		for id in ["anchor", "core", "exit"]:
			var at: Vector2 = progress.layout[id]
			var active: bool = progress.anchor_upper if id == "anchor" else progress.golem_core if id == "core" else progress.exit_ready()
			draw_rect(Rect2(at - Vector2(12,24), Vector2(24,24)), Color("243a51"))
			draw_rect(Rect2(at - Vector2(8,20), Vector2(16,4)), Color("8cf4d7") if active else Color("ba8469"))
			_text(at + Vector2(-17,15), id.to_upper(), 9)

func _draw_live_golem(_target: Dictionary) -> bool:
	return false

func _draw_overlay() -> void:
	if progress == null:
		return
	draw_rect(Rect2(46, 49, 575, 30), Color("080e1d"))
	_text(Vector2(49, 64), "PROGRESSION CONTROL  /  STATIONARY COMBAT TARGETS", 12, Color("758ba9"))
	draw_rect(Rect2(94, 504, 780, 31), Color("080e1d"))
	_text(Vector2(97, 521), "ANCHOR %s    RIFT %d/3 %s    CORE %s    LIFT %s" % ["OK" if progress.anchor_upper else "--", progress.crystals_destroyed, "STABLE" if progress.collapse_rift else "--", "OK" if progress.golem_core else "--", "READY" if progress.exit_ready() else "LOCKED"], 13, Color("8de9d7"))
	_text(Vector2(97, 540), notice, 11, Color("b6cadb"))
	draw_rect(Rect2(46, 569, 890, 29), Color("080e1d"))
	_text(Vector2(48, 586), "E  Interact     Q  Swap     Hold R  Recall     Esc  Pause    Test art and stationary targets; full biome in development", 12, Color("758ba9"))
