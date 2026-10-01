extends Node2D
## Visible mechanics playground. Programmatic original test art, not approved final assets.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const WORLD_OFFSET := Vector2(96, 106)
var grid
var player
var instruments
var terrain: ImageTexture
var image: Image
var selected: String = "photon"
var simulation_tick: int = 0
var smoke_test: bool = false
var capture_dir: String = ""
var captured: Dictionary = {}
var effects: Array[Dictionary] = []
var started_usec: int
var worst_tick_usec: int = 0
var measured_usec: int = 0
var measured_ticks: int = 0
var capture_ticks: Array[int] = [60, 330, 425]
var report: Dictionary = {"scope": "Native mechanics playground; not MetroForge app generation, completed biome or final art approval", "shots": 0, "splits": 0, "impacts": 0, "recalls": 0}

func _ready() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument == "--smoke-test":
			smoke_test = true
		if argument.begins_with("--capture-dir="):
			capture_dir = argument.trim_prefix("--capture-dir=")
	if capture_dir != "":
		assert(capture_dir.to_lower().begins_with("e:/") or capture_dir.to_lower().begins_with("e:\\"))
		DirAccess.make_dir_recursive_absolute(capture_dir)
	grid = Grid.new(192, 96, 42)
	_build_world()
	player = Player.new(grid, Vector2(80, 336))
	instruments = Instruments.new(grid)
	_setup_targets()
	image = Image.create(grid.width, grid.height, false, Image.FORMAT_RGBA8)
	terrain = ImageTexture.create_from_image(image)
	_update_texture()
	started_usec = Time.get_ticks_usec()

func _setup_targets() -> void:
	instruments.add_target(1, Rect2(250, 276, 24, 60), 100.0)

func _aim_for_test(muzzle: Vector2) -> Vector2:
	return Vector2(410, 350) - muzzle if selected == "tachyon" else Vector2.RIGHT

func _after_simulation(_input: Dictionary) -> void:
	pass

func _occupy_other_actors() -> void:
	pass

func _step_actors() -> void:
	pass

func _test_finished() -> bool:
	return simulation_tick >= 450

func _test_passed() -> bool:
	return report.shots == 3 and report.recalls == 1 and player.hp > 0

func _can_fire() -> bool:
	return player.hp > 0

func _extend_report() -> void:
	pass

func _build_world() -> void:
	for y in range(84, 95):
		for x in range(1, 191):
			grid.set_material(x, y, Grid.CellMaterial.SOLID, y >= 92)
	# A genuinely protected entry: both the floor and full clearance stay intact.
	for y in range(70, 85):
		for x in range(13, 28):
			grid.set_material(x, y, Grid.CellMaterial.EMPTY if y < 84 else Grid.CellMaterial.SOLID, true)
	for x in range(44, 62):
		grid.set_material(x, 60, Grid.CellMaterial.SOLID, true)
	for y in range(65, 84):
		for x in range(72, 76):
			grid.set_material(x, y, Grid.CellMaterial.UNSTABLE_ORE)
	for y in range(84, 92):
		for x in range(92, 128):
			grid.set_material(x, y, Grid.CellMaterial.FLUID)
	for y in range(24, 40):
		for x in range(140, 156):
			grid.set_material(x, y, Grid.CellMaterial.SAND)
	for x in range(135, 168):
		grid.set_material(x, 65, Grid.CellMaterial.SOLID, true)

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_Q:
			selected = "tachyon" if selected == "photon" else "photon"
		if event.physical_keycode == KEY_ESCAPE:
			get_tree().paused = not get_tree().paused
		if event.physical_keycode == KEY_SPACE:
			jump_requested = true
		if event.physical_keycode == KEY_CTRL:
			dash_requested = true
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		fire_requested = true

var jump_requested: bool = false
var dash_requested: bool = false
var fire_requested: bool = false

func _controls() -> Dictionary:
	var input: Dictionary = {"move": float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)),
		"run": Input.is_physical_key_pressed(KEY_SHIFT), "jump": jump_requested, "dash": dash_requested,
		"levitate": Input.is_physical_key_pressed(KEY_SPACE), "recall": Input.is_physical_key_pressed(KEY_R)}
	if smoke_test:
		input = {"move": 1.0 if simulation_tick >= 60 and simulation_tick < 155 else 0.0,
			"run": true, "jump": simulation_tick == 110,
			"levitate": simulation_tick > 110 and simulation_tick < 140,
			"recall": simulation_tick >= 360 and simulation_tick <= 420}
		if simulation_tick == 190 or simulation_tick == 240:
			selected = "photon"
			fire_requested = true
		if simulation_tick == 285:
			selected = "tachyon"
			fire_requested = true
	jump_requested = false
	dash_requested = false
	return input

func _physics_process(_delta: float) -> void:
	if get_tree().paused:
		return
	var before_usec: int = Time.get_ticks_usec()
	simulation_tick += 1
	var input: Dictionary = _controls()
	grid.clear_actor_occupancy()
	player.step(input)
	grid.occupy_actor(player.cell_rect(player.position))
	_occupy_other_actors()
	grid.step()
	_step_actors()
	if player.recalled_this_tick:
		report.recalls += 1
		effects.append({"type": "recall", "position": player.position - Vector2(0, 20), "until": simulation_tick + 30})
	if _can_fire() and (fire_requested or (not smoke_test and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT))):
		var muzzle: Vector2 = player.position + Vector2(player.facing * 14, -25)
		var aim: Vector2 = get_global_mouse_position() - WORLD_OFFSET - muzzle
		if smoke_test:
			aim = _aim_for_test(muzzle)
		var fired: Dictionary = instruments.fire(selected, muzzle, aim)
		if fired.accepted:
			report.shots += 1
			player.notify_attack(int(Instruments.DEFINITIONS[selected].windup))
		fire_requested = false
	instruments.step()
	_after_simulation(input)
	for event in instruments.events:
		if event.type == "split":
			report.splits += 1
		if event.type == "impact":
			report.impacts += 1
			if not report.has("impact_positions"):
				report.impact_positions = []
			report.impact_positions.append([event.position.x, event.position.y])
		if event.type == "hit":
			if not report.has("target_hits"):
				report.target_hits = {}
			report.target_hits[str(event.target)] = int(report.target_hits.get(str(event.target), 0)) + 1
		if event.has("position"):
			effects.append({"type": event.type, "position": event.position, "until": simulation_tick + 12})
	effects = effects.filter(func(effect): return int(effect.until) > simulation_tick)
	if simulation_tick % 2 == 0:
		_update_texture()
	queue_redraw()
	var duration: int = Time.get_ticks_usec() - before_usec
	worst_tick_usec = maxi(worst_tick_usec, duration)
	measured_usec += duration
	measured_ticks += 1
	if smoke_test and capture_dir != "" and simulation_tick in capture_ticks and not captured.has(simulation_tick):
		captured[simulation_tick] = true
		_capture(simulation_tick)
	if smoke_test and _test_finished():
		report.ticks = simulation_tick
		report.wall_seconds = (Time.get_ticks_usec() - started_usec) / 1000000.0
		report.mean_tick_ms = float(measured_usec) / maxi(1, measured_ticks) / 1000.0
		report.worst_tick_ms = worst_tick_usec / 1000.0
		report.player_feet = [player.position.x, player.position.y]
		report.player_hp = player.hp
		report.max_projectile_slots = Instruments.MAX_SLOTS
		_extend_report()
		if capture_dir != "":
			var file = FileAccess.open(capture_dir.path_join("playground-result.json"), FileAccess.WRITE)
			file.store_string(JSON.stringify(report, "\t"))
		print("QUANTUM_PLAYGROUND_RESULTS " + JSON.stringify(report))
		get_tree().quit(0 if _test_passed() else 1)

func _capture(at_tick: int) -> void:
	await RenderingServer.frame_post_draw
	var pixels: Image = get_viewport().get_texture().get_image()
	if pixels != null and not pixels.is_empty():
		pixels.save_png(capture_dir.path_join("playground-%03d.png" % at_tick))

func _update_texture() -> void:
	var bytes := PackedByteArray()
	bytes.resize(grid.width * grid.height * 4)
	var materials: PackedByteArray = grid.cells
	var heat_values: PackedFloat64Array = grid.heat
	var protected_cells: PackedByteArray = grid.immutable
	for y in grid.height:
		for x in grid.width:
			var index: int = y * grid.width + x
			var material: int = materials[index]
			if material == Grid.CellMaterial.EMPTY and heat_values[index] <= 0.05:
				continue
			var color := Color.TRANSPARENT
			var variant: float = float((x * 17 + y * 31) % 7) / 7.0
			if material == Grid.CellMaterial.SOLID:
				color = Color(0.19 + variant * 0.05, 0.23 + variant * 0.05, 0.34 + variant * 0.07)
				if protected_cells[index] != 0:
					color = Color(0.25, 0.32, 0.45)
				if y > 0 and materials[index - grid.width] == Grid.CellMaterial.EMPTY:
					color = Color(0.48, 0.62, 0.73)
			elif material == Grid.CellMaterial.UNSTABLE_ORE:
				color = Color(0.12, 0.78 + variant * 0.15, 0.85)
			elif material == Grid.CellMaterial.SAND:
				color = Color(0.68 + variant * 0.15, 0.43 + variant * 0.08, 0.24)
			elif material == Grid.CellMaterial.FLUID:
				color = Color(0.12, 0.36 + variant * 0.04, 0.67, 0.90)
			if heat_values[index] > 0.05:
				color = color.lerp(Color(1.0, 0.36, 0.10, 1.0), heat_values[index])
			bytes[index * 4] = int(color.r * 255)
			bytes[index * 4 + 1] = int(color.g * 255)
			bytes[index * 4 + 2] = int(color.b * 255)
			bytes[index * 4 + 3] = int(color.a * 255)
	image.set_data(grid.width, grid.height, false, Image.FORMAT_RGBA8, bytes)
	terrain.update(image)

func _text(at: Vector2, value: String, size: int, color: Color = Color("c9d8ed")) -> void:
	draw_string(ThemeDB.fallback_font, at, value, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func _draw_diver() -> void:
	var at: Vector2 = player.position
	var clip_frame: int = int(float(simulation_tick) * (24.0 if absf(player.velocity.x) > Player.WALK_SPEED else 16.0) / 60.0)
	var stride: float = sin(clip_frame * 0.72) * 5.0 if player.grounded and absf(player.velocity.x) > 0.1 else 0.0
	# Boots terminate exactly at the authoritative feet, never below or above an offset shadow.
	for side in [-1.0, 1.0]:
		var foot_x: float = side * 5.0 + stride * side
		var lift: float = maxf(0.0, stride * side * 0.6)
		draw_line(at + Vector2(side * 4, -16), at + Vector2(foot_x, -4 - lift), Color("253b5a"), 5)
		draw_rect(Rect2(at + Vector2(foot_x - 3, -4 - lift), Vector2(7, 4)), Color("bcc7d5"))
		draw_line(at + Vector2(foot_x - 2, -3 - lift), at + Vector2(foot_x + 3, -3 - lift), Color("65edea"), 1)
	draw_rect(Rect2(at + Vector2(-12, -31), Vector2(8, 20)), Color("243044"))
	draw_rect(Rect2(at + Vector2(-11, -29), Vector2(3, 11)), Color("70ded4"))
	draw_polygon(PackedVector2Array([at + Vector2(-8, -34), at + Vector2(6, -35), at + Vector2(10, -20), at + Vector2(6, -14), at + Vector2(-6, -14)]), PackedColorArray([Color("8dabc8")]))
	draw_rect(Rect2(at + Vector2(-4, -32), Vector2(8, 13)), Color("314562"))
	draw_rect(Rect2(at + Vector2(-3, -30), Vector2(6, 4)), Color("a6fff0"))
	draw_line(at + Vector2(-7, -17), at + Vector2(6, -17), Color("ddaa70"), 2)
	draw_rect(Rect2(at + Vector2(-7, -43), Vector2(14, 11)), Color("cad9e7"))
	draw_rect(Rect2(at + Vector2(-5, -41), Vector2(12, 6)), Color("1b293f"))
	draw_rect(Rect2(at + Vector2(-2, -40), Vector2(9, 3)), Color("59dfde"))
	var hand: Vector2 = at + Vector2(player.facing * 14, -25)
	draw_line(at + Vector2(player.facing * 7, -31), hand, Color("c6d2df"), 4)
	draw_rect(Rect2(hand - Vector2(3, 3), Vector2(10, 6)), Color("243649"))
	draw_rect(Rect2(hand + Vector2(2, -2), Vector2(5, 4)), Color("77f4e9") if selected == "photon" else Color("f476de"))
	if player.state == "levitate":
		draw_line(at + Vector2(-5, 4), at + Vector2(-5, 12), Color("58c2e9"), 2)
		draw_line(at + Vector2(5, 4), at + Vector2(5, 10), Color("a7f3ff"), 2)

func _draw_targets() -> void:
	for id in instruments.targets:
		var target: Dictionary = instruments.targets[id]
		var rect: Rect2 = target.rect
		if target.hp > 0:
			draw_rect(rect, Color("253b51"))
			draw_rect(Rect2(rect.position + Vector2(3, 3), rect.size - Vector2(6, 6)), Color("536b82"))
			draw_circle(rect.get_center() - Vector2(0, 8), 6, Color("d08768"))
			draw_rect(Rect2(rect.position - Vector2(0, 7), Vector2(rect.size.x * target.hp / 100.0, 3)), Color("c4a18a"))

func _draw_overlay() -> void:
	pass

func _draw() -> void:
	if grid == null:
		return
	draw_rect(Rect2(0, 0, 960, 600), Color("080e1d"))
	_text(Vector2(48, 40), "QUANTUM DIVERGENCE", 24, Color("d2e6f5"))
	_text(Vector2(49, 62), "PROBABILITY MINES  /  MECHANICS PLAYGROUND", 12, Color("758ba9"))
	_text(Vector2(643, 42), "PHOTON" if selected == "photon" else "TACHYON", 15, Color("79eee3") if selected == "photon" else Color("e798ed"))
	draw_rect(Rect2(643, 52, 170, 5), Color("263b50"))
	draw_rect(Rect2(643, 52, instruments.energy * 1.7, 5), Color("77d7d2"))
	_text(Vector2(822, 57), "%d%%" % int(instruments.energy), 12)
	draw_set_transform(WORLD_OFFSET)
	draw_rect(Rect2(0, 0, 768, 384), Color("111b31"))
	for column in range(0, 8):
		var x: float = column * 96.0
		draw_rect(Rect2(x + 4, 12, 86, 310), Color("142038") if column % 2 == 0 else Color("131e34"))
		draw_line(Vector2(x + 90, 4), Vector2(x + 90, 360), Color("202d48"), 3)
		draw_rect(Rect2(x + 14, 31, 59, 6), Color("263755"))
		draw_line(Vector2(x + 17, 98), Vector2(x + 71, 98), Color("273e59"), 1)
	for cable in range(4):
		draw_line(Vector2(16, 43 + cable * 4), Vector2(746, 63 + cable * 4), Color("1f3750"), 1)
	for radius in range(48, 0, -4):
		draw_circle(Vector2(80, 306), radius, Color(0.15, 0.72, 0.73, 0.012))
	draw_texture_rect(terrain, Rect2(0, 0, 768, 384), false)
	draw_rect(Rect2(56, 330, 48, 6), Color("78ece0"))
	draw_rect(Rect2(60, 316, 6, 14), Color("4f7590"))
	draw_rect(Rect2(60, 317, 6, 4), Color("a5fff1"))
	_draw_targets()
	for projectile in instruments.projectiles:
		var color: Color = Color("86f6e9") if projectile.instrument == "photon" else Color("ec83de")
		draw_line(projectile.position - Vector2(projectile.direction) * 10, projectile.position, color, 2)
		draw_circle(projectile.position, 2, Color.WHITE)
	_draw_diver()
	for effect in effects:
		var remaining: float = int(effect.until) - simulation_tick
		draw_arc(effect.position, 16.0 - remaining * 0.6, 0, TAU, 12, Color(0.54, 0.86, 0.92, remaining / 15.0), 1.0)
	draw_set_transform(Vector2.ZERO)
	_text(Vector2(97, 521), "SAFE ANCHOR", 11, Color("66cbc8"))
	_text(Vector2(320, 521), "CALIBRATION TARGET", 11, Color("9eacbc"))
	_text(Vector2(569, 521), "SIMULATED LIQUID / ORE / DUST", 11, Color("8b9db9"))
	_text(Vector2(48, 561), "A / D  Move     Shift  Run     Space  Jump / Levitate     Ctrl  Dash     Mouse  Aim / Fire", 13)
	_text(Vector2(48, 582), "Q  Swap instrument     Hold R  Recall     Esc  Pause     Original test art; full biome and final assets in development", 12, Color("758ba9"))
	_draw_overlay()
