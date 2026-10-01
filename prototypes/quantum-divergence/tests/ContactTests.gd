extends SceneTree
## Exercise real actor movement against material faces, without visual offsets or gap tolerances.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const Enemies = preload("res://scripts/EnemySimulation.gd")
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

func floor_grid(width: int = 220, height: int = 80, row: int = 60, material: int = Grid.CellMaterial.SOLID):
	var grid = Grid.new(width, height, 77)
	for x in range(1, width - 1):
		grid.set_material(x, row, material, true)
	return grid

func run_tests() -> void:
	var grid = floor_grid()
	var player = Player.new(grid, Vector2(120.25, 220.25))
	var premature: int = 0
	for i in 120:
		player.step({})
		premature += int(player.grounded and player.position.y != 240.0)
	check(player.position.y == 240.0 and player.grounded and not player._blocked(player.position), "fractional fall ends exactly on the floor without material penetration")
	check(premature == 0, "grounded is never reported before the feet actually touch the floor")
	var repeated: bool = true
	for repetition in 20:
		player.step({"jump": true})
		repeated = repeated and not player.grounded and player.position.y < 240.0
		for i in 70:
			player.step({})
			repeated = repeated and (not player.grounded or player.position.y == 240.0)
		repeated = repeated and player.position.y == 240.0 and player.grounded
	check(repeated, "twenty real jumps each return to exact contact without accumulating a foot gap")
	var near = Player.new(grid, Vector2(120.25, 239.5))
	near.step({})
	check(near.position.y < 240.0 and not near.grounded, "a subpixel gap remains airborne when this tick cannot reach the floor")
	near.step({})
	check(near.position.y == 240.0 and near.grounded, "the next falling tick resolves the remaining gap to the actual surface")
	var fast = Player.new(grid, Vector2(160.25, 239.25))
	fast.velocity.y = 480.0
	fast.step({})
	check(fast.position.y == 240.0 and not fast._blocked(fast.position), "maximum fall speed cannot tunnel through a four-pixel floor")
	for material in [Grid.CellMaterial.SOLID, Grid.CellMaterial.UNSTABLE_ORE, Grid.CellMaterial.SAND]:
		var material_world = floor_grid(100, 80, 60, material)
		var material_player = Player.new(material_world, Vector2(120.25, 229.25))
		for i in 90: material_player.step({})
		check(material_player.position.y == 240.0 and material_player.grounded, "exact contact is shared by solid material type " + str(material))
	var fluid = Player.new(floor_grid(100, 80, 60, Grid.CellMaterial.FLUID), Vector2(120.25, 239.25))
	fluid.velocity.y = 480.0
	fluid.step({})
	check(fluid.position.y > 240.0 and not fluid.grounded, "fluid never becomes a fabricated supporting floor")
	var ledge_grid = Grid.new(100, 80, 77)
	ledge_grid.set_material(30, 40, Grid.CellMaterial.SOLID, true)
	var ledge = Player.new(ledge_grid, Vector2(120.5, 150.25))
	for i in 60: ledge.step({})
	check(ledge.position.y == 160.0 and ledge.grounded, "a single microcell ledge supports the actual overlapping foot width")
	for i in 20: ledge.step({"move": 1.0})
	check(ledge.position.y > 160.0 and not ledge.grounded, "walking beyond the ledge resumes falling without phantom support")
	var ceiling_grid = floor_grid(100, 80, 40)
	for x in range(1, 99): ceiling_grid.set_material(x, 20, Grid.CellMaterial.SOLID, true)
	var ceiling = Player.new(ceiling_grid, Vector2(120.25, 160))
	ceiling.step({"jump": true})
	var hit_ceiling: bool = false
	for i in 15:
		ceiling.step({})
		if ceiling.velocity.y == 0.0:
			hit_ceiling = ceiling.position.y == 124.0 and not ceiling._blocked(ceiling.position)
			break
	check(hit_ceiling, "upward collision puts the full body exactly below the ceiling")
	var corridor = floor_grid()
	for y in range(20, 60):
		corridor.set_material(20, y, Grid.CellMaterial.SOLID, true)
		corridor.set_material(40, y, Grid.CellMaterial.SOLID, true)
	var wall_player = Player.new(corridor, Vector2(120.25, 240))
	for i in 60: wall_player.step({"move": 1.0, "run": true})
	check(wall_player.position.x == 150.0 and not wall_player._blocked(wall_player.position), "right wall contact respects the whole body at fractional movement speeds")
	for i in 60: wall_player.step({"move": -1.0, "run": true})
	check(wall_player.position.x == 94.0 and not wall_player._blocked(wall_player.position), "left wall contact uses the same precise material boundary")
	var wall_air = Grid.new(100, 80, 77)
	for y in range(20, 60): wall_air.set_material(40, y, Grid.CellMaterial.SOLID, true)
	var air_player = Player.new(wall_air, Vector2(150.0, 160.0))
	air_player.step({"move": 1.0})
	check(not air_player.grounded and air_player.position.y > 160.0, "touching a vertical wall cannot be mistaken for floor support")
	var deep_grid = floor_grid(64, 900, 856)
	var deep = Player.new(deep_grid, Vector2(120.25, 3400.25))
	for i in 120: deep.step({})
	check(deep.position.y == 3424.0 and deep.grounded and not deep._blocked(deep.position), "full-world vertical coordinates preserve exact half-open floor contact")
	var wide = Player.new(floor_grid(1200, 80), Vector2(4400.25, 220.25))
	for i in 120: wide.step({})
	check(wide.position.y == 240.0 and wide.grounded and not wide._blocked(wide.position), "full-world horizontal coordinates preserve the body footprint")
	for kind in ["skitter", "driller", "golem"]:
		var enemy_grid = floor_grid(180, 100, 80)
		var observer = Player.new(enemy_grid, Vector2(600.0, 320.0))
		var instruments = Instruments.new(enemy_grid)
		var enemies = Enemies.new(enemy_grid, instruments, observer)
		assert(enemies.add_enemy(kind, 1, Vector2(150.25, 310.25)))
		for i in 120: enemies.step()
		var actor: Dictionary = enemies.actors[1]
		check(actor.position.y == 320.0 and not enemies._blocked(actor, actor.position), kind + " uses exact ground contact after a fractional fall")
	var wraith_grid = floor_grid(180, 100, 80)
	var wraith_observer = Player.new(wraith_grid, Vector2(600, 320))
	var wraiths = Enemies.new(wraith_grid, Instruments.new(wraith_grid), wraith_observer)
	assert(wraiths.add_enemy("wraith", 1, Vector2(150.25, 286.5)))
	for i in 120: wraiths.step()
	check(wraiths.actors[1].position.y == 286.5, "Wraith retains deliberate center-anchored levitation")
	print("QUANTUM_CONTACT_RESULTS " + JSON.stringify({"passed": passed, "failed": failed, "tests": results}))
	quit(0 if failed == 0 else 1)
