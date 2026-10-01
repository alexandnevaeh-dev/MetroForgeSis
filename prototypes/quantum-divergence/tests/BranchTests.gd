extends SceneTree
const Chunks = preload("res://scripts/ChunkedGrid.gd")
const World = preload("res://scripts/MineWorld.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Navigator = preload("res://scripts/MineNavigator.gd")
var results: Array[Dictionary] = []

func _initialize() -> void:
	call_deferred("run_tests")

func run_tests() -> void:
	var failed: int = 0
	for branch_id in ["echo","survey"]:
		var grid = Chunks.new(1440,960,42)
		var manifest: Dictionary = World.new(grid).build(42)
		var points: Array = []
		var branch: Array = manifest.branch_routes[branch_id]
		for point in manifest.route:
			points.append(point)
			if point == branch[0]:
				break
		points.append_array(branch.slice(1))
		var turnaround: int = points.size()
		var reverse: Array = branch.duplicate()
		reverse.reverse()
		points.append_array(reverse.slice(1))
		var player = Player.new(grid,manifest.spawn)
		var navigator = Navigator.new()
		var clear: bool = true
		var steps: int = 0
		var last_point: int = 1
		var stall: int = 0
		while navigator.next_point < points.size() and steps < 14000:
			var cell := Vector2i(player.position / 4.0)
			var origin := Vector2i(clampi(cell.x - 116,0,grid.width - 232),clampi(cell.y - 80,0,grid.height - 108))
			assert(grid.set_active_regions([Rect2i(origin,Vector2i(232,108))]))
			grid.clear_actor_occupancy()
			player.step(navigator.controls(player,points))
			grid.occupy_actor(player.cell_rect(player.position))
			grid.step()
			clear = clear and not player._blocked(player.position)
			steps += 1
			stall = stall + 1 if last_point == navigator.next_point else 0
			last_point = navigator.next_point
			if stall > 600:
				print("BRANCH_STALL " + JSON.stringify({"branch":branch_id,"next":navigator.next_point,"target":str(points[navigator.next_point]),"at":str(player.position),"grounded":player.grounded}))
				break
		var outbound: bool = navigator.next_point >= turnaround
		var returned: bool = navigator.next_point == points.size()
		for item in [{"test":branch_id + " reached with starting kit from entry","passed":outbound},
			{"test":branch_id + " physically backtracks to the main route without Recall or teleport","passed":returned},
			{"test":branch_id + " keeps full-body clearance and player alive","passed":clear and player.hp > 0}]:
			results.append(item)
			failed += int(not item.passed)
			print(("PASS " if item.passed else "FAIL ") + item.test)
		print("BRANCH_ROUTE " + JSON.stringify({"id":branch_id,"steps":steps,"reached":navigator.reached.size(),"waypoints":points.size()}))
	print("QUANTUM_BRANCH_RESULTS " + JSON.stringify({"passed":results.size() - failed,"failed":failed,"tests":results}))
	quit(0 if failed == 0 else 1)
