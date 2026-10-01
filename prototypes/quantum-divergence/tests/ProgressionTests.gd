extends SceneTree
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const Progression = preload("res://scripts/MinesProgression.gd")
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

func fixture(configure: bool = true, persistent_profile: Dictionary = {}) -> Dictionary:
	var grid = Grid.new(180, 90, 703)
	for x in range(1, 179):
		grid.set_material(x, 70, Grid.CellMaterial.SOLID, true)
	var player = Player.new(grid, Vector2(60, 280))
	var shots = Instruments.new(grid)
	for i in 3:
		shots.add_target(101 + i, Rect2(180 + i * 80, 244, 16, 36), 24.0)
	shots.add_target(200, Rect2(460, 184, 64, 96), 300.0)
	var definition: Dictionary = {"anchor": Vector2(60, 280), "core": Vector2(540, 280),
		"exit": Vector2(660, 280), "secret": Vector2(110, 280), "upper_region": Rect2i(1, 1, 70, 69),
		"ghost_platforms": [Rect2i(80, 50, 12, 1), Rect2i(105, 45, 12, 1)],
		"crystals": [101, 102, 103], "golem": 200}
	for rect in definition.ghost_platforms:
		for x in range(rect.position.x, rect.end.x):
			grid.set_material(x, rect.position.y, Grid.CellMaterial.UNSTABLE_ORE)
	var profile: Dictionary = persistent_profile if not persistent_profile.is_empty() else {"blueprints": []}
	var progress = Progression.new(grid, shots, player, profile)
	if configure:
		assert(progress.configure(definition))
	return {"grid": grid, "player": player, "shots": shots, "progress": progress, "layout": definition, "profile": profile}

func destroy(f: Dictionary, id: int) -> int:
	var accepted: int = 0
	# Exercise real instrument windup, swept collision, cooldown and energy recharge.
	for i in 2400:
		if f.shots.targets[id].hp <= 0:
			return accepted
		var rect: Rect2 = f.shots.targets[id].rect
		if f.shots.fire("photon", rect.get_center() - Vector2(32, 0), Vector2.RIGHT).accepted:
			accepted += 1
		f.shots.step()
		f.progress.step()
	return -1

func run_tests() -> void:
	var f = fixture()
	check(not f.progress.exit_ready() and not f.progress.interact("exit").accepted, "fresh run cannot use the locked lift")
	f.player.position = f.layout.exit
	check(f.progress.interact("exit").reason == "objectives_incomplete" and not f.progress.extracted, "being inside the lift does not bypass its objective gate")
	f.player.position = f.layout.core
	check(f.progress.interact("core").reason == "golem_alive" and not f.progress.golem_core, "living Golem prevents core stabilization")
	check(f.progress.interact("anchor").reason == "too_far" and not f.progress.anchor_upper, "interaction requires actual proximity to the node")
	f.player.position = f.layout.anchor
	check(f.progress.interact("anchor").accepted and f.grid.flicker_probability_at(20, 20) == 0.10 and f.grid.flicker_probability_at(110, 20) == 0.20, "upper anchor reduces only its regional per-second probability")
	check(not f.progress.interact("anchor").accepted and f.grid.flicker_probability_at(20, 20) == 0.10, "repeated anchor interaction does not compound its effect")
	check(not f.grid.set_material(15, 65, Grid.CellMaterial.SOLID), "objective clearance cannot fill with mutated terrain")
	check(destroy(f, 101) == 2 and f.progress.crystals_destroyed == 1 and not f.progress.collapse_rift, "first crystal requires two real Photon impacts and leaves the rift incomplete")
	check(destroy(f, 102) == 2 and not f.progress.collapse_rift, "two destroyed crystals are insufficient to stabilize the ghost route")
	f.grid.occupy_actor(Rect2i(111, 45, 1, 1))
	check(destroy(f, 103) == 2 and f.progress.crystals_destroyed == 3 and f.progress.stabilization_pending and not f.progress.collapse_rift, "third crystal waits for an actor occupying the future platform")
	check(f.grid.material_at(80, 50) == Grid.CellMaterial.UNSTABLE_ORE and f.grid.immutable[50 * 180 + 80] == 0, "blocked stabilization changes none of the other platforms")
	f.grid.clear_actor_occupancy()
	f.progress.step()
	check(f.progress.collapse_rift and not f.progress.stabilization_pending and f.grid.material_at(80, 50) == Grid.CellMaterial.SOLID, "clearing actor occupancy commits all permanent ghost platforms")
	check(not f.grid.add_heat(80, 50, 1.0) and not f.grid.set_material(80, 50, Grid.CellMaterial.EMPTY), "permanently stabilized required route rejects heat and destruction")
	for i in 240:
		f.grid.step()
	check(f.grid.material_at(80, 50) == Grid.CellMaterial.SOLID and f.grid.collapse_until[50 * 180 + 80] == 0, "permanent platform stays solid after the temporary-collapse expiry")
	var boss_shots: int = destroy(f, 200)
	check(boss_shots == 25 and f.progress.golem_defeated and not f.progress.golem_core and not f.progress.exit_ready(), "300-HP Golem needs 25 Photon hits and its death alone cannot unlock the lift")
	f.player.position = f.layout.core
	check(f.progress.interact("core").accepted and f.progress.exit_ready(), "interacting with the defeated core completes the third objective")
	f.player.position = f.layout.exit
	check(f.progress.interact("exit").accepted and f.progress.extracted, "complete run can extract at the lift")
	check(f.progress.interact("secret").reason == "run_ended", "completed run cannot collect late rewards")
	var secret = fixture()
	secret.player.position = secret.layout.secret
	secret.player.hp = 60.0
	check(secret.progress.interact("secret").accepted and secret.player.hp == 85.0 and secret.profile.blueprints == ["entanglement"], "secret grants one blueprint and exactly 25 healing")
	check(not secret.progress.interact("secret").accepted and secret.player.hp == 85.0, "holding interaction cannot farm secret healing")
	var next_run = fixture(true, secret.profile)
	next_run.player.position = next_run.layout.secret
	next_run.progress.interact("secret")
	check(next_run.profile.blueprints == ["entanglement"] and next_run.player.hp == 100.0 and not next_run.progress.anchor_upper, "new run keeps blueprint knowledge without duplicated unlocks, inflated HP or objective carryover")
	var dead = fixture()
	dead.player.hp = 0.0
	check(dead.progress.interact("anchor").reason == "run_ended" and not dead.progress.anchor_upper, "dead player cannot advance objectives")
	# Exhaustive gate permutations prove that no individual objective replaces the others.
	var gate = fixture()
	var invalid_gates: int = 0
	for bits in 16:
		gate.progress.anchor_upper = bool(bits & 1)
		gate.progress.collapse_rift = bool(bits & 2)
		gate.progress.golem_core = bool(bits & 4)
		gate.progress.golem_defeated = bool(bits & 8)
		invalid_gates += int(gate.progress.exit_ready() != (bits == 15))
	check(invalid_gates == 0, "all sixteen objective/boss combinations enforce the full exit conjunction")
	var invalid = fixture(false)
	var definition: Dictionary = invalid.layout.duplicate(true)
	definition.crystals = [101, 101, 103]
	var prior = invalid.grid.snapshot()
	check(not invalid.progress.configure(definition) and invalid.grid.reserved == prior.reserved and invalid.grid.flicker_regions == prior.flicker_regions, "duplicate crystal IDs reject the layout without partial reservations")
	definition = invalid.layout.duplicate(true)
	definition.ghost_platforms = [Rect2i(0, 45, 5, 1)]
	check(not invalid.progress.configure(definition), "ghost platform definitions cannot overwrite the protected world boundary")
	definition = invalid.layout.duplicate(true)
	definition.ghost_platforms = [Rect2i(13, 65, 5, 1)]
	check(not invalid.progress.configure(definition), "ghost route cannot overlap objective machinery clearance")
	var regional = fixture()
	var control = fixture()
	regional.progress.interact("anchor")
	for y in range(10, 20):
		for x in range(90, 120):
			regional.grid.set_material(x, y, Grid.CellMaterial.UNSTABLE_ORE)
			control.grid.set_material(x, y, Grid.CellMaterial.UNSTABLE_ORE)
	for i in 600:
		regional.grid.step()
		control.grid.step()
	var lower_equal: bool = true
	for y in range(10, 20):
		for x in range(90, 120):
			lower_equal = lower_equal and regional.grid.material_at(x, y) == control.grid.material_at(x, y)
	check(lower_equal, "upper-anchor interaction leaves seeded lower-region material replay unchanged")
	var restored = Grid.new(180, 90, 0)
	check(restored.restore(regional.grid.snapshot()) and restored.flicker_probability_at(20, 20) == 0.10, "material snapshot preserves regional stabilization rates")
	for i in 60:
		regional.grid.step()
		restored.step()
	check(restored.cells == regional.grid.cells and restored.flicker_events == regional.grid.flicker_events, "regional snapshot resumes the same deterministic future")
	var malformed: Dictionary = regional.grid.snapshot()
	malformed.flicker_regions.upper_mines.probability = NAN
	prior = restored.snapshot()
	check(not restored.restore(malformed) and restored.cells == prior.cells and restored.tick == prior.tick, "nonfinite regional rate rejects a snapshot atomically")
	check(not restored.set_flicker_region("overlap", Rect2i(10, 10, 5, 5), 0.1), "overlapping probability overrides are rejected instead of depending on iteration order")
	print("QUANTUM_PROGRESSION_RESULTS " + JSON.stringify({"passed": passed, "failed": failed, "tests": results}))
	quit(0 if failed == 0 else 1)
