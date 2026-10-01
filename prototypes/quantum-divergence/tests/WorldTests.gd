extends SceneTree
const Chunks = preload("res://scripts/ChunkedGrid.gd")
const World = preload("res://scripts/MineWorld.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Navigator = preload("res://scripts/MineNavigator.gd")
var passed: int = 0
var failed: int = 0
var results: Array[Dictionary] = []

func _initialize() -> void:
	call_deferred("run_tests")

func check(condition: bool, label: String) -> void:
	passed += int(condition)
	failed += int(not condition)
	results.append({"test":label,"passed":condition})
	print(("PASS " if condition else "FAIL ") + label)

func focus(grid, point: Vector2) -> bool:
	var cell := Vector2i(point / 4.0)
	var origin := Vector2i(clampi(cell.x - 116,0,grid.width - 232),clampi(cell.y - 80,0,grid.height - 108))
	return grid.set_active_regions([Rect2i(origin,Vector2i(232,108))])

func run_tests() -> void:
	var start: int = Time.get_ticks_usec()
	var grid = Chunks.new(1440,960,42)
	var world = World.new(grid)
	var manifest: Dictionary = world.build(42)
	check(manifest.pixels == [5760,3840] and manifest.rooms.size() == 8,"authored world has the specified full biome dimensions and eight distinct landmarks")
	check(manifest.rooms[0].tiles.size == Vector2i(48,32) and manifest.rooms[6].tiles.size == Vector2i(64,48),"entry chamber and Golem arena retain the requested authored scale")
	var player = Player.new(grid,manifest.spawn)
	var clear_stations: bool = true
	for station in manifest.stations:
		var clear: bool = grid.is_clear(player.cell_rect(station))
		var supported: bool = player._blocked(station + Vector2(0,1))
		if not clear or not supported:
			print("STATION_FAILED " + JSON.stringify({"at":str(station),"clear":clear,"supported":supported}))
		clear_stations = clear_stations and clear and supported
	check(clear_stations,"every station has full-size arrival clearance and actual supporting floor cells")
	if "--station-only" in OS.get_cmdline_user_args():
		quit(0 if clear_stations else 1)
		return
	if "--stair-debug" in OS.get_cmdline_user_args():
		player = Player.new(grid,Vector2(800,3488))
		var driver = Navigator.new()
		for i in 100:
			focus(grid,player.position)
			grid.clear_actor_occupancy()
			var input: Dictionary = driver.controls(player,[Vector2(800,3488),Vector2(928,3424),Vector2(1056,3424)])
			player.step(input)
			grid.occupy_actor(player.cell_rect(player.position))
			grid.step()
			if i % 4 == 0:
				print("STAIR_FRAME " + JSON.stringify({"i":i,"at":str(player.position),"velocity":str(player.velocity),"grounded":player.grounded,"input":input}))
		quit()
		return
	var same_grid = Chunks.new(1440,960,42)
	World.new(same_grid).build(42)
	check(same_grid.cells == grid.cells,"same seed reproduces authored terrain and all procedural deposits")
	var other_grid = Chunks.new(1440,960,43)
	World.new(other_grid).build(43)
	check(other_grid.cells != grid.cells,"a different seed changes terrain deposits without moving authored landmarks")
	same_grid = null
	other_grid = null
	var navigator = Navigator.new()
	var no_collision: bool = true
	var bounded_activation: bool = true
	var max_work: int = 0
	var previous_point: int = 1
	var stalled_ticks: int = 0
	var steps: int = 0
	var stair_frames: int = 0
	while navigator.next_point < manifest.route.size() and steps < 14000:
		bounded_activation = bounded_activation and focus(grid,player.position)
		grid.clear_actor_occupancy()
		var controls: Dictionary = navigator.controls(player,manifest.route)
		if "--trace-stairs" in OS.get_cmdline_user_args() and navigator.next_point == 67 and stair_frames < 45:
			print("ROUTE_STAIR " + JSON.stringify({"at":str(player.position),"velocity":str(player.velocity),"fuel":player.levitation_ticks,"grounded":player.grounded,"controls":controls}))
			stair_frames += 1
		player.step(controls)
		grid.occupy_actor(player.cell_rect(player.position))
		grid.step()
		no_collision = no_collision and not player._blocked(player.position)
		max_work = maxi(max_work,grid.last_work_cells)
		steps += 1
		if previous_point == navigator.next_point:
			stalled_ticks += 1
		else:
			previous_point = navigator.next_point
			stalled_ticks = 0
		if stalled_ticks > 600:
			print("TRAVERSAL_STALL " + JSON.stringify({"next":navigator.next_point,"target":str(manifest.route[navigator.next_point]),"player":str(player.position),"grounded":player.grounded}))
			break
	check(navigator.next_point == manifest.route.size(),"the actual starting movement kit traverses the complete main mine backbone without teleportation")
	check(no_collision and player.hp > 0,"full-route traversal never embeds the player in solid terrain or requires a health grant")
	check(bounded_activation and max_work <= Chunks.MAX_ACTIVE_CHUNKS * 32 * 32,"all traversal frames retain bounded deterministic activation and material work")
	check(player.position.distance_to(manifest.layout.exit) < 20.0,"physical traversal arrives at the actual Quantum Lift")
	check(player.recall() and player.position == manifest.spawn,"full-world Recall returns to the protected entry using full-body clearance")
	print("QUANTUM_WORLD_RESULTS " + JSON.stringify({"passed":passed,"failed":failed,"tests":results,"steps":steps,"waypoints_reached":navigator.reached.size(),"waypoints":manifest.route.size(),"max_work_cells":max_work,"wall_seconds":(Time.get_ticks_usec() - start) / 1000000.0,"scope":"Full-size layout, chunk simulation and physical traversal; not final art, live full-biome combat or MetroForge app generation"}))
	quit(0 if failed == 0 else 1)
