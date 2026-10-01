extends SceneTree

const Grid = preload("res://scripts/MicrocellGrid.gd")
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

func fill_ore(grid) -> void:
	for y in range(2, 12):
		for x in range(2, 22):
			grid.set_material(x, y, Grid.CellMaterial.UNSTABLE_ORE)
	grid.set_material(24, 8, Grid.CellMaterial.SOLID)

func run_tests() -> void:
	var sand = Grid.new(20, 20, 17)
	for y in range(2, 8):
		sand.set_material(10, y, Grid.CellMaterial.SAND)
	sand.step()
	check(sand.material_at(10, 8) == Grid.CellMaterial.SAND and sand.material_at(10, 9) == Grid.CellMaterial.EMPTY, "sand moves at most one cell per fixed tick")
	for i in 299:
		sand.step()
	check(sand.cells.count(Grid.CellMaterial.SAND) == 6, "sand mass conserved through settlement")
	var settled = sand.cells.duplicate()
	for i in 60:
		sand.step()
	check(sand.cells == settled, "settled sand has no persistent jitter")
	check(not sand.set_material(0, 10, Grid.CellMaterial.EMPTY) and sand.material_at(0, 10) == Grid.CellMaterial.SOLID, "world boundary cannot be destroyed")

	var fluid = Grid.new(20, 20, 41)
	for y in range(3, 7):
		for x in range(8, 12):
			fluid.set_material(x, y, Grid.CellMaterial.FLUID)
	for i in 180:
		fluid.step()
	check(fluid.cells.count(Grid.CellMaterial.FLUID) == 16, "fluid spreads without duplication or loss")
	check(fluid.material_at(5, 18) == Grid.CellMaterial.FLUID, "fluid spreads along the basin floor")

	var a = Grid.new(30, 20, 123)
	var b = Grid.new(30, 20, 123)
	var c = Grid.new(30, 20, 987)
	fill_ore(a)
	fill_ore(b)
	fill_ore(c)
	for i in 600:
		a.step()
		b.step()
		c.step()
	check(a.cells == b.cells and a.heat == b.heat and a.flicker_events == b.flicker_events, "same seed and commands replay identical simulation")
	check(a.cells != c.cells, "different seeds change unstable ore patterns")
	check(a.material_at(24, 8) == Grid.CellMaterial.SOLID, "stable solids never probability-flicker")
	# 200 independent cells at 20%/second: about 446 events in 10 seconds.
	check(a.flicker_events > 300 and a.flicker_events < 600, "20 percent per second is converted to 60Hz, not applied every tick")

	var collapse = Grid.new(16, 16, 33)
	collapse.flicker_probability_per_second = 0.0
	collapse.set_material(4, 4, Grid.CellMaterial.UNSTABLE_ORE)
	collapse.set_material(5, 4, Grid.CellMaterial.UNSTABLE_ORE)
	collapse.reserve_rect(Rect2i(5, 4, 1, 1))
	check(collapse.collapse_rect(Rect2i(4, 4, 2, 1)) == 1 and collapse.material_at(5, 4) == Grid.CellMaterial.UNSTABLE_ORE, "collapse rejects occupied actor or objective cells")
	for i in 179:
		collapse.step()
	check(collapse.material_at(4, 4) == Grid.CellMaterial.SOLID, "collapse protection remains for 179 ticks")
	collapse.step()
	check(collapse.material_at(4, 4) == Grid.CellMaterial.UNSTABLE_ORE, "collapse expires at exactly 180 ticks")
	var budget = Grid.new(48, 48, 1)
	for y in range(1, 47):
		for x in range(1, 47):
			budget.set_material(x, y, Grid.CellMaterial.UNSTABLE_ORE)
	var first: int = budget.collapse_rect(Rect2i(1, 1, 46, 46))
	var second: int = budget.collapse_rect(Rect2i(1, 1, 46, 46))
	check(first == 1024 and second == 0, "collapse mutation budget is shared across calls in a tick")

	var thermal = Grid.new(15, 15, 42)
	thermal.add_heat(7, 7, 1.0)
	thermal.step()
	check(is_equal_approx(thermal.heat[7 * 15 + 6], thermal.heat[7 * 15 + 8]) and is_equal_approx(thermal.heat[6 * 15 + 7], thermal.heat[8 * 15 + 7]), "double buffered heat transport is spatially symmetric")
	var initial_heat: float = 0.0
	for amount in thermal.heat:
		initial_heat += amount
	for i in 179:
		thermal.step()
	var final_heat: float = 0.0
	var bounded: bool = true
	for amount in thermal.heat:
		final_heat += amount
		bounded = bounded and is_finite(amount) and amount >= 0.0 and amount <= 1.0
	check(bounded and final_heat < initial_heat, "heat stays finite, bounded and dissipates")
	var melt = Grid.new(12, 12, 1)
	melt.set_material(4, 5, Grid.CellMaterial.SOLID)
	melt.set_material(5, 5, Grid.CellMaterial.SOLID, true)
	melt.add_heat(4, 5, 0.8)
	check(not melt.add_heat(5, 5, 1.0), "protected station material rejects heating")
	melt.step()
	check(melt.cells.count(Grid.CellMaterial.SAND) == 1 and melt.material_at(5, 5) == Grid.CellMaterial.SOLID, "heat melts mutable solid while preserving protected anchors")

	var restored = Grid.new(30, 20, 0)
	check(restored.restore(a.snapshot()), "native snapshot restores all simulation fields")
	for i in 120:
		a.step()
		restored.step()
	check(a.cells == restored.cells and a.heat == restored.heat and a.flicker_events == restored.flicker_events, "suspend resume continues identical future replay")
	var malformed = a.snapshot()
	malformed.cells = PackedByteArray([0])
	var before = restored.snapshot()
	check(not restored.restore(malformed) and restored.cells == before.cells and restored.tick == before.tick, "malformed snapshot rejected without partial mutation")
	malformed = a.snapshot()
	malformed.heat[4] = NAN
	check(not restored.restore(malformed) and restored.cells == before.cells, "snapshot rejects nonfinite heat without mutation")
	malformed = a.snapshot()
	malformed.cells = 7
	check(not restored.restore(malformed), "snapshot rejects wrong array types without throwing")
	malformed = a.snapshot()
	malformed.immutable[0] = 0
	check(not restored.restore(malformed), "snapshot cannot erase immutable world boundaries")

	var clearance = Grid.new(20, 20, 1)
	check(clearance.is_clear(Rect2i(3, 3, 8, 12)), "safe station validates full player-sized clearance")
	clearance.set_material(10, 14, Grid.CellMaterial.SOLID)
	check(not clearance.is_clear(Rect2i(3, 3, 8, 12)), "station recall clearance rejects a single obstructing cell")
	check(not clearance.is_clear(Rect2i(-2, 3, 8, 12)), "station recall clearance rejects out-of-world destinations")

	print("QUANTUM_SIMULATION_RESULTS " + JSON.stringify({"passed": passed, "failed": failed, "tests": results}))
	quit(0 if failed == 0 else 1)

