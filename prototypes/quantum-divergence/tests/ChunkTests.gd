extends SceneTree
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Chunks = preload("res://scripts/ChunkedGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const Enemies = preload("res://scripts/EnemySimulation.gd")
var passed: int = 0
var failed: int = 0
var checks: Array[Dictionary] = []

func _initialize() -> void:
	call_deferred("run_tests")

func check(condition: bool, label: String) -> void:
	passed += int(condition)
	failed += int(not condition)
	checks.append({"test":label,"passed":condition})
	print(("PASS " if condition else "FAIL ") + label)

func run_tests() -> void:
	var reference = Grid.new(96,96,741)
	var candidate = Chunks.new(96,96,741)
	check(candidate.set_active_regions([Rect2i(0,0,96,96)]),"all chunks in the reference comparison are awake")
	for grid in [reference,candidate]:
		for x in range(20,75):
			grid.set_material(x,78,Grid.CellMaterial.SOLID,true)
		for y in range(20,30):
			for x in range(26,38):
				grid.set_material(x,y,Grid.CellMaterial.SAND if x % 2 == 0 else Grid.CellMaterial.FLUID)
		for x in range(55,65):
			grid.set_material(x,52,Grid.CellMaterial.UNSTABLE_ORE)
		grid.add_heat(32,25,0.85)
		grid.set_flicker_region("region",Rect2i(50,40,20,20),0.10)
		grid.collapse_rect(Rect2i(55,52,3,1))
	for i in 200:
		reference.step()
		candidate.step()
	check(candidate.cells == reference.cells,"awake chunk seams preserve whole-grid material motion, melting and flicker")
	check(candidate.heat == reference.heat,"sparse double buffering matches reference heat across chunk boundaries")
	check(candidate.collapse_until == reference.collapse_until and candidate.flicker_events == reference.flicker_events,"global seeded ore and exact collapse expiry match reference")
	check(candidate.tick == reference.tick,"chunk activation never changes the fixed simulation tick")
	var revision: int = int(candidate.render_revisions.get(Vector2i(1,1),0))
	candidate.collapse_rect(Rect2i(55,52,3,1))
	check(int(candidate.render_revisions.get(Vector2i(1,1),0)) > revision,"an immediate collapse invalidates its terrain texture rather than displaying stale ore")
	var sleeping = Chunks.new(128,128,17)
	sleeping.set_material(100,60,Grid.CellMaterial.FLUID)
	sleeping.add_heat(102,59,0.5)
	sleeping.set_active_regions([Rect2i(4,4,1,1)])
	for i in 10:
		sleeping.step()
	check(sleeping.material_at(100,60) == Grid.CellMaterial.FLUID and sleeping.heat[59 * 128 + 102] == 0.5,"sleeping chunks retain matter and heat without hidden offscreen work")
	check(sleeping.last_work_cells == 0,"a static awake region does not scan the full world")
	sleeping.set_active_regions([Rect2i(100,60,1,1)])
	sleeping.step()
	check(sleeping.material_at(100,61) == Grid.CellMaterial.FLUID,"reactivation resumes frozen matter at one cell per tick")
	var stored: Dictionary = sleeping.snapshot()
	var resumed = Chunks.new(128,128,0)
	check(resumed.restore(stored),"chunk snapshot restores active regions and reconstructs sparse metadata")
	for i in 30:
		sleeping.step()
		resumed.step()
	check(sleeping.cells == resumed.cells and sleeping.heat == resumed.heat,"restored activation produces identical future material and heat state")
	var malformed: Dictionary = stored.duplicate(true)
	malformed.active_chunks.append(malformed.active_chunks[0])
	var untouched: PackedByteArray = var_to_bytes(resumed.snapshot())
	check(not resumed.restore(malformed) and untouched == var_to_bytes(resumed.snapshot()),"invalid activation metadata is rejected before mutating any restored state")
	var full = Chunks.new(1440,960,42)
	check(full.cells.size() == 1382400 and full.immutable[0] == 1 and full.material_at(1440,10) == Grid.CellMaterial.SOLID,"the specified 5760 by 3840 world allocates bounded state and protected edges")
	check(full.set_active_regions([Rect2i(120,160,232,108)]),"camera region activates a bounded halo at intended world scale")
	var active_before: Dictionary = full.active_chunks.duplicate()
	check(not full.set_active_regions([Rect2i(0,0,1440,960)]) and full.active_chunks == active_before,"over-budget activation is rejected atomically instead of dropping arbitrary chunks")
	check(full.active_chunks.size() <= Chunks.MAX_ACTIVE_CHUNKS,"awake material computation has a deterministic chunk cap")
	var diver = Player.new(full,Vector2(4500,3424))
	check(diver.cell_rect(diver.position).end.y == 856,"full-world player bounds exclude an exact supporting floor without relying on a rounded-away epsilon")
	var full_shots = Instruments.new(full)
	var full_enemies = Enemies.new(full,full_shots,diver)
	check(full_enemies.cell_rect(Rect2(4370,3332,60,92)).end.y == 856,"full-world boss bounds use the same exact half-open floor convention")
	var actor_grid = Chunks.new(128,128,12)
	var actor_player = Player.new(actor_grid,Vector2(340,220))
	var actor_shots = Instruments.new(actor_grid)
	var actors = Enemies.new(actor_grid,actor_shots,actor_player)
	assert(actors.add_enemy("wraith",1,Vector2(400,200)))
	actor_grid.set_active_regions([Rect2i(4,4,1,1)])
	for i in 20:
		actors.step()
	check(actors.actors[1].position == Vector2(400,200) and actors.actors[1].attack_count == 0,"sleeping enemies neither patrol offscreen nor attack through a paused material region")
	actor_grid.set_active_regions([Rect2i(100,50,1,1)])
	actors.step()
	check(actors.actors[1].phase == "telegraph" and actors.projectiles.is_empty(),"a newly awake Wraith starts its actual warning before firing")
	var elapsed: int = actors.tick - int(actors.actors[1].attack_started)
	actor_grid.set_active_regions([Rect2i(4,4,1,1)])
	for i in 20:
		actors.step()
	check(actors.tick - int(actors.actors[1].attack_started) == elapsed,"sleeping actor clocks preserve remaining warning time instead of skipping it")
	actor_grid.set_active_regions([Rect2i(100,50,1,1)])
	for i in 14:
		actors.step()
	check(actors.projectiles.is_empty(),"resumed telegraph still has no early hostile projectile")
	actors.step()
	check(actors.projectiles.size() == 1,"the resumed warning emits exactly one projectile at its original active boundary")
	print("QUANTUM_CHUNK_RESULTS " + JSON.stringify({"passed":passed,"failed":failed,"tests":checks}))
	quit(0 if failed == 0 else 1)
