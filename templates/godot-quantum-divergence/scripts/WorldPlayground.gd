extends "res://scripts/CombatPlayground.gd"
## Full-size connected mine. Original diagnostic poses; world-scale saves/art remain pending.
const ChunkGrid = preload("res://scripts/ChunkedGrid.gd")
const MineWorld = preload("res://scripts/MineWorld.gd")
const Navigator = preload("res://scripts/MineNavigator.gd")
const VIEW := Rect2(Vector2(16,96),Vector2(928,432))
var manifest: Dictionary
var navigator = Navigator.new()
var camera_origin := Vector2.ZERO
var maximum_awake: int = 0
var maximum_work: int = 0
var ready_usec: int = 0
var terrain_chunks: Dictionary = {}
var visible_chunks: Array[Vector2i] = []
var restart_requested: bool = false
var focus_work_usec: int = 0

func _input(event: InputEvent) -> void:
	super._input(event)
	if event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_ENTER and (player.hp <= 0 or progress.extracted):
		restart_requested = true

func _world_seed() -> int:
	return 42

func _ready() -> void:
	var before: int = Time.get_ticks_usec()
	for argument in OS.get_cmdline_user_args():
		if argument == "--smoke-test":
			smoke_test = true
		if argument.begins_with("--capture-dir="):
			capture_dir = argument.trim_prefix("--capture-dir=")
	if capture_dir != "":
		assert(capture_dir.to_lower().begins_with("e:/") or capture_dir.to_lower().begins_with("e:\\"))
		DirAccess.make_dir_recursive_absolute(capture_dir)
	var world_seed: int = _world_seed()
	grid = ChunkGrid.new(1440,960,world_seed)
	manifest = MineWorld.new(grid).build(world_seed)
	player = Player.new(grid,manifest.spawn)
	instruments = Instruments.new(grid)
	for i in 3:
		instruments.add_target(101 + i,Rect2(2296 + 304 * i,2236,20,36),24.0)
	instruments.add_target(200,Rect2(4370,3332,60,92),300.0)
	progress = Progression.new(grid,instruments,player,profile)
	assert(progress.configure(manifest.layout))
	enemies = Enemies.new(grid,instruments,player)
	for actor in manifest.encounters:
		assert(enemies.add_enemy(actor.kind,actor.id,actor.position,actor.id == 200))
	capture_ticks = [60,240,480]
	process_mode = Node.PROCESS_MODE_ALWAYS
	report.scope = "Full-size connected mine with viewport chunk activation and live actor placement; rendered entry-to-upper-anchor control, not full-biome combat completion, final art or MetroForge app generation"
	_focus()
	_update_texture()
	ready_usec = Time.get_ticks_usec() - before
	started_usec = Time.get_ticks_usec()
	notice = "Explore the mine; E activates stations and objective machinery. World saves are not connected yet."

func _focus() -> void:
	var cell := Vector2i(player.position / 4.0)
	var origin := Vector2i(clampi(cell.x - 116,0,grid.width - 232),clampi(cell.y - 80,0,grid.height - 108))
	camera_origin = Vector2(origin) * 4.0
	var regions: Array = [Rect2i(origin,Vector2i(232,108))]
	for projectile in instruments.projectiles + enemies.projectiles:
		var at := Vector2i(projectile.position / 4.0)
		if grid.in_bounds(at.x,at.y):
			regions.append(Rect2i(at,Vector2i.ONE))
	if not grid.set_active_regions(regions):
		# Deterministic camera-first admission; entities are preserved when work is saturated.
		var admitted: Array = [regions[0]]
		assert(grid.set_active_regions(admitted))
		for region in regions.slice(1):
			var candidate: Array = admitted + [region]
			if grid.set_active_regions(candidate):
				admitted = candidate
		report.activation_saturated = int(report.get("activation_saturated",0)) + 1
	maximum_awake = maxi(maximum_awake,grid.active_chunks.size())
	maximum_work = maxi(maximum_work,grid.last_work_cells)

func _physics_process(delta: float) -> void:
	if restart_requested:
		restart_requested = false
		get_tree().paused = false
		simulation_tick = 0
		measured_ticks = 0
		measured_usec = 0
		worst_tick_usec = 0
		focus_work_usec = 0
		jump_requested = false
		dash_requested = false
		fire_requested = false
		interact_requested = false
		extraction_tick = -1
		selected = "photon"
		effects.clear()
		terrain_chunks.clear()
		navigator = Navigator.new()
		_ready()
		return
	if not get_tree().paused:
		var before: int = Time.get_ticks_usec()
		_focus()
		focus_work_usec += Time.get_ticks_usec() - before
	super._physics_process(delta)

func _after_simulation(input: Dictionary) -> void:
	if interact_requested:
		# Remove the player's own occupancy while retaining all living enemies for admission.
		grid.clear_actor_occupancy()
		enemies.occupy_all()
		for station in manifest.stations:
			if player.position.distance_to(station) < Progression.INTERACT_DISTANCE:
				player.register_station(station)
		grid.occupy_actor(player.cell_rect(player.position))
	super._after_simulation(input)

func _controls() -> Dictionary:
	if not smoke_test:
		return super._controls()
	if player.position.distance_to(manifest.layout.anchor) < 12.0:
		interact_requested = true
	if navigator.next_point >= 16:
		return {}
	return navigator.controls(player,manifest.route)

func _aim_for_user(muzzle: Vector2) -> Vector2:
	return get_global_mouse_position() - VIEW.position + camera_origin - muzzle

func _test_finished() -> bool:
	return simulation_tick >= 540 or player.hp <= 0

func _test_passed() -> bool:
	return player.hp > 0 and progress.anchor_upper and navigator.next_point >= 16 and grid.cells.size() == 1382400

func _extend_report() -> void:
	super._extend_report()
	report.world = {"pixels":manifest.pixels,"cells":grid.cells.size(),"rooms":manifest.rooms.size(),"seed":manifest.seed,"world_id":manifest.world_id,"main_waypoints":manifest.route.size(),"visited_waypoints":navigator.reached.size(),"max_active_chunks":maximum_awake,"max_work_cells":maximum_work,"generation_ms":ready_usec / 1000.0,"camera_origin":[camera_origin.x,camera_origin.y],"focus_mean_ms":float(focus_work_usec) / maxi(1,measured_ticks) / 1000.0,"cpu_mean_with_focus_ms":float(measured_usec + focus_work_usec) / maxi(1,measured_ticks) / 1000.0,"recall_stations":player.stations.size()}

func _update_texture() -> void:
	if grid == null:
		return
	visible_chunks.clear()
	var first := Vector2i(camera_origin / 128.0)
	var last := Vector2i(ceil((camera_origin + VIEW.size) / 128.0)) - Vector2i.ONE
	for y in range(first.y,last.y + 1):
		for x in range(first.x,last.x + 1):
			var chunk := Vector2i(x,y)
			visible_chunks.append(chunk)
			var revision: int = int(grid.render_revisions.get(chunk,0))
			var previous: Dictionary = terrain_chunks.get(chunk,{})
			if previous.is_empty() or previous.revision != revision or previous.epoch != grid.render_epoch:
				terrain_chunks[chunk] = {"texture":_refresh_chunk(chunk),"revision":revision,"epoch":grid.render_epoch}

func _refresh_chunk(chunk: Vector2i) -> ImageTexture:
	var bytes := PackedByteArray()
	bytes.resize(32 * 32 * 4)
	var origin: Vector2i = chunk * 32
	for y in 32:
		for x in 32:
			var wx: int = origin.x + x
			var wy: int = origin.y + y
			var index: int = wy * grid.width + wx
			var material: int = grid.cells[index]
			if material == Grid.CellMaterial.EMPTY and grid.heat[index] < 0.05:
				continue
			var grain: float = float((wx * 13 + wy * 23) % 11) / 11.0
			var color := Color("28354b")
			if material == Grid.CellMaterial.SOLID:
				color = Color(0.13 + grain * 0.08,0.18 + grain * 0.09,0.27 + grain * 0.11)
				if grid.material_at(wx,wy - 1) == Grid.CellMaterial.EMPTY:
					color = Color("7996ad") if grid.immutable[index] == 1 else Color("526b83")
				elif wy % 8 == 0 or wx % 16 == 0:
					color = color.darkened(0.28)
			elif material == Grid.CellMaterial.UNSTABLE_ORE:
				color = Color(0.18,0.68 + grain * 0.28,0.83)
			elif material == Grid.CellMaterial.SAND:
				color = Color(0.58 + grain * 0.18,0.36 + grain * 0.08,0.25)
			elif material == Grid.CellMaterial.FLUID:
				color = Color(0.13,0.35 + grain * 0.1,0.66,0.9)
			if grid.heat[index] > 0.05:
				color = color.lerp(Color("ff8c4f"),grid.heat[index])
			var destination: int = (y * 32 + x) * 4
			bytes[destination] = int(color.r * 255)
			bytes[destination + 1] = int(color.g * 255)
			bytes[destination + 2] = int(color.b * 255)
			bytes[destination + 3] = int(color.a * 255)
	var raster := Image.create_from_data(32,32,false,Image.FORMAT_RGBA8,bytes)
	return ImageTexture.create_from_image(raster)

func _draw() -> void:
	if grid == null:
		return
	draw_rect(Rect2(0,0,960,600),Color("090f1a"))
	_text(Vector2(24,31),"QUANTUM DIVERGENCE",23,Color("d5e7ee"))
	_text(Vector2(24,55),"PROBABILITY MINES  /  " + MineWorld.region_at(player.position).to_upper(),12,Color("87a5ba"))
	_text(Vector2(24,78),"HP %d     ENERGY %d     %s" % [player.hp,instruments.energy,selected.to_upper()],12,Color("8ae3d4"))
	_text(Vector2(590,32),"CONNECTED WORLD  /  5,760 × 3,840",12,Color("8fa6bd"))
	_text(Vector2(590,54),"%d / 96 CHUNKS AWAKE" % grid.active_chunks.size(),11,Color("6c849e"))
	draw_set_transform(VIEW.position - camera_origin)
	draw_rect(Rect2(camera_origin,VIEW.size),Color("101b2d"))
	# A continuous mine-wall layer follows world coordinates across rooms and passages.
	var first_x: int = int(camera_origin.x / 128.0) * 128
	var first_y: int = int(camera_origin.y / 96.0) * 96
	for y in range(first_y,int(camera_origin.y + VIEW.size.y) + 96,96):
		for x in range(first_x,int(camera_origin.x + VIEW.size.x) + 128,128):
			draw_rect(Rect2(x + 4,y + 4,120,88),Color("17263c") if int(x / 128) % 2 == 0 else Color("152237"))
			draw_line(Vector2(x,y),Vector2(x + 128,y),Color("22374e"),2)
			draw_line(Vector2(x + 10,y + 80),Vector2(x + 117,y + 10),Color("1b2c43"),2)
	for x in range(first_x,int(camera_origin.x + VIEW.size.x) + 128,256):
		draw_rect(Rect2(x + 44,camera_origin.y,8,VIEW.size.y),Color("293a4e"))
		draw_line(Vector2(x + 42,camera_origin.y),Vector2(x + 42,camera_origin.y + VIEW.size.y),Color("3b5168"),2)
	for chunk in visible_chunks:
		draw_texture_rect(terrain_chunks[chunk].texture,Rect2(Vector2(chunk) * 128.0,Vector2(128,128)),false)
	for station in manifest.stations:
		if Rect2(camera_origin - Vector2(40,40),VIEW.size + Vector2(80,80)).has_point(station):
			draw_rect(Rect2(station - Vector2(22,8),Vector2(44,8)),Color("4a827f"))
			draw_rect(Rect2(station - Vector2(20,22),Vector2(5,16)),Color("4a647b"))
			draw_rect(Rect2(station - Vector2(19,21),Vector2(3,5)),Color("affae6"))
	_draw_targets()
	for projectile in instruments.projectiles:
		draw_line(projectile.position - projectile.direction * 10,projectile.position,Color("8bf6e6") if projectile.instrument == "photon" else Color("eab4f9"),2)
	_draw_diver()
	draw_set_transform(Vector2.ZERO)
	# Mask drawing outside the viewport so distant actors cannot bleed through the HUD.
	draw_rect(Rect2(0,0,960,96),Color("090f1a"))
	_text(Vector2(24,31),"QUANTUM DIVERGENCE",23,Color("d5e7ee"))
	_text(Vector2(24,55),"PROBABILITY MINES / " + MineWorld.region_at(player.position).to_upper(),12,Color("87a5ba"))
	_text(Vector2(24,78),"HP %d  ENERGY %d  %s" % [player.hp,instruments.energy,selected.to_upper()],12,Color("8ae3d4"))
	_text(Vector2(600,31),"5,760 × 3,840 / %d CHUNKS" % grid.active_chunks.size(),12,Color("8fa6bd"))
	draw_rect(Rect2(0,528,960,72),Color("090f1a"))
	draw_rect(Rect2(0,96,16,432),Color("090f1a"))
	draw_rect(Rect2(944,96,16,432),Color("090f1a"))
	_text(Vector2(24,549),"A/D Move  Shift Run  Space Jump/Levitate  Ctrl Dash  Mouse Aim/Fire  Q Swap  R Recall  E Interact",12)
	_text(Vector2(24,572),"ANCHOR %s  RIFT %d/3  CORE %s  LIFT %s" % ["OK" if progress.anchor_upper else "--",progress.crystals_destroyed,"OK" if progress.golem_core else "--","READY" if progress.exit_ready() else "LOCKED"],12,Color("82cbbb"))
	_text(Vector2(24,590),"World movement/encounters preview; original test poses, final art and world save integration remain pending.",11,Color("748da4"))
	if player.hp <= 0 or progress.extracted:
		_text(Vector2(245,306),"RUN ENDED — ENTER starts a fresh mine",18,Color("e6eaff"))
