extends SceneTree
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
var passed: int = 0
var failed: int = 0
var results: Array[Dictionary] = []

func _initialize() -> void:
	call_deferred("run_tests")

func check(condition: bool, label: String) -> void:
	passed += int(condition)
	failed += int(not condition)
	results.append({"test": label, "passed": condition})
	print(("PASS " if condition else "FAIL ") + label)

func flat_world():
	var grid = Grid.new(220, 80, 77)
	for x in range(1, 219):
		grid.set_material(x, 60, Grid.CellMaterial.SOLID, true)
	return grid

func run_tests() -> void:
	var grid = flat_world()
	var shots = Instruments.new(grid)
	var accepted: Dictionary = shots.fire("photon", Vector2(40, 100), Vector2.RIGHT)
	check(accepted.accepted and shots.energy == 96.0 and shots.slot_count() == 1, "accepted Photon reserves capacity and charges exactly four energy")
	for i in 5:
		shots.step()
	check(shots.projectiles.is_empty(), "Photon cannot spawn before its six-tick telegraph")
	shots.step()
	check(shots.projectiles.size() == 1, "Photon spawns at the six-tick attack boundary")
	var prior_energy: float = shots.energy
	var prior_id: int = shots.next_id
	var declined: Dictionary = shots.fire("photon", Vector2(40, 100), Vector2.RIGHT)
	check(not declined.accepted and declined.reason == "cooldown" and shots.energy == prior_energy and shots.next_id == prior_id, "cooldown rejection has no resource or entity side effects")
	declined = shots.fire("tachyon", Vector2(40, 100), Vector2(NAN, 1.0))
	check(not declined.accepted and shots.energy == prior_energy, "nonfinite aiming rejected without energy charge")
	var maximum_travel: float = 0.0
	for i in 50:
		shots.step()
		for projectile in shots.projectiles:
			maximum_travel = maxf(maximum_travel, projectile.travelled)
	check(maximum_travel <= 640.0 and shots.projectiles.is_empty(), "Photon has finite maximum range and lifetime")

	var wall_grid = flat_world()
	wall_grid.set_material(16, 25, Grid.CellMaterial.SOLID)
	var wall_shots = Instruments.new(wall_grid)
	wall_shots.add_target(1, Rect2(80, 96, 8, 8), 20.0)
	wall_shots.fire("photon", Vector2(40, 100), Vector2.RIGHT)
	for i in 8:
		wall_shots.step()
	check(wall_shots.projectiles.is_empty() and wall_shots.targets[1].hp == 20.0 and wall_grid.heat[25 * wall_grid.width + 16] == 0.95, "swept shot hits a four-pixel wall before the enemy behind it")
	wall_grid.step()
	check(wall_grid.cells.count(Grid.CellMaterial.SAND) == 1, "Photon impact genuinely transforms mutable terrain through heat")
	var damage = Instruments.new(grid)
	damage.add_target(9, Rect2(60, 96, 4, 8), 20.0)
	damage.fire("photon", Vector2(40, 100), Vector2.RIGHT)
	for i in 10:
		damage.step()
	check(damage.targets[9].hp == 8.0 and damage.projectiles.is_empty(), "swept enemy collision applies damage once and consumes the projectile")
	var fluid_grid = flat_world()
	fluid_grid.set_material(16, 25, Grid.CellMaterial.FLUID)
	var fluid_shots = Instruments.new(fluid_grid)
	fluid_shots.add_target(1, Rect2(80, 96, 8, 8), 20.0)
	fluid_shots.fire("photon", Vector2(40, 100), Vector2.RIGHT)
	for i in 8:
		fluid_shots.step()
	check(fluid_shots.targets[1].hp == 20.0 and fluid_shots.projectiles.is_empty(), "flowing material shields a target from the first Photon shot")
	fluid_grid.step()
	check(fluid_grid.material_at(16, 25) == Grid.CellMaterial.EMPTY, "Photon heat vaporizes the struck fluid cell instead of damaging the target through it")
	for i in 16:
		fluid_shots.step()
	fluid_shots.fire("photon", Vector2(40, 100), Vector2.RIGHT)
	for i in 8:
		fluid_shots.step()
	check(fluid_shots.targets[1].hp == 8.0, "a later shot reaches the target after the material shield is removed")

	var split_grid = flat_world()
	for x in range(13, 70):
		split_grid.set_material(x, 25, Grid.CellMaterial.FLUID)
	var split = Instruments.new(split_grid)
	split.fire("tachyon", Vector2(40, 100), Vector2.RIGHT)
	for i in 9:
		split.step()
	check(split.projectiles.size() == 3 and split.slot_count() == 3, "Superposition replaces one parent with exactly three children")
	var children_only: bool = true
	var deadline: int = split.projectiles[0].expires_at
	for i in 10:
		split.step()
		for projectile in split.projectiles:
			children_only = children_only and projectile.split_child and projectile.expires_at == deadline
	check(split.projectiles.size() <= 3 and children_only, "split children cannot recurse or extend the parent lifetime")
	for i in 50:
		split.step()
	check(split.projectiles.is_empty(), "all split descendants expire within the original life budget")

	var capacity = Instruments.new(grid)
	for i in 62:
		capacity.pending.append({"id": i + 200, "instrument": "photon", "origin": Vector2(40, 100), "direction": Vector2.RIGHT, "spawn_at": 1000, "slots": 1})
	var before_pending: int = capacity.pending.size()
	declined = capacity.fire("tachyon", Vector2(40, 100), Vector2.RIGHT)
	check(not declined.accepted and declined.reason == "capacity" and capacity.energy == 100.0 and capacity.cooldown_until.tachyon == 0 and capacity.pending.size() == before_pending, "capacity rejection reserves all three child slots or changes nothing")
	check(capacity.fire("photon", Vector2(40, 100), Vector2.RIGHT).accepted and capacity.slot_count() == 63, "remaining capacity still admits a single-slot instrument")
	var corners = Instruments.new(grid)
	grid.set_material(11, 10, Grid.CellMaterial.SOLID, true)
	corners.fire("photon", Vector2(42, 42), Vector2(1, 1))
	for i in 6:
		corners.step()
	check(corners.projectiles.is_empty(), "swept collision detects protected material at a diagonal grid corner")

	var player_grid = flat_world()
	var player = Player.new(player_grid, Vector2(60, 240))
	for i in 120:
		player.step({})
	check(player.grounded and absf(player.position.y - 240.0) < 1.0 and player.state == "idle", "player feet remain in contact with the visible material floor")
	player.step({"jump": true})
	check(player.position.y < 240.0 and not player.grounded and player.state == "jump", "jump leaves the floor through actual material collision")
	var initial_fuel: int = player.levitation_ticks
	for i in 20:
		player.step({"levitate": true})
	check(player.levitation_ticks < initial_fuel and player.position.y < 200.0, "levitation consumes a bounded fuel reservoir while lifting the player")
	for i in 180:
		player.step({})
	check(player.grounded and player.levitation_ticks == 90, "landing refills levitation and aligns feet with the floor")
	for y in range(30, 60):
		player_grid.set_material(40, y, Grid.CellMaterial.SOLID, true)
	for i in 120:
		player.step({"move": 1.0, "run": true, "dash": i % 36 == 0})
	check(player.position.x <= 150.0 and player.position.x >= 149.0, "run and dash cannot tunnel the full player body through a material wall")
	for i in 59:
		player.step({"recall": true})
	check(player.position.x > 140.0, "Recall cannot teleport before the one-second hold")
	player.step({"recall": true})
	check(player.recalled_this_tick and player.position.distance_to(Vector2(60, 240)) < 1.0 and player.immunity_until == player.tick + 30, "Recall returns to the safe entry with exactly half-second arrival immunity")
	var recall_deadline: int = player.immunity_until
	for i in 90:
		player.step({"recall": true})
	check(player.immunity_until == recall_deadline and player.tick > player.immunity_until, "holding Recall cannot repeatedly refresh immunity")
	player.step({"recall": false})
	check(player.register_station(Vector2(100, 240)), "new safe station registered using full body clearance")
	player_grid.set_material(25, 55, Grid.CellMaterial.SOLID)
	player.position = Vector2(140, 240)
	check(player.recall() and player.position.x == 60.0, "blocked newest station falls back to the older safe entry")
	player_grid.occupy_actor(player.cell_rect(Vector2(100, 240)))
	check(not player_grid.collapse_rect(Rect2i(25, 55, 1, 1)) and not player_grid.set_material(25, 55, Grid.CellMaterial.SOLID), "actor occupancy protects material mutations independently of static objective reservations")

	print("QUANTUM_GAMEPLAY_RESULTS " + JSON.stringify({"passed": passed, "failed": failed, "tests": results}))
	quit(0 if failed == 0 else 1)
