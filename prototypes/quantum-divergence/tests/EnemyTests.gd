extends SceneTree
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

func fixture(kind: String, at: Vector2) -> Dictionary:
	var grid = Grid.new(180, 100, 812)
	for x in range(1, 179):
		grid.set_material(x, 80, Grid.CellMaterial.SOLID, true)
	var player = Player.new(grid, Vector2(120, 320))
	var shots = Instruments.new(grid)
	var enemies = Enemies.new(grid, shots, player)
	assert(enemies.add_enemy(kind, 1, at))
	return {"grid": grid, "player": player, "shots": shots, "enemies": enemies, "actor": enemies.actors[1]}

func advance(f: Dictionary, count: int, input: Dictionary = {}) -> void:
	for i in count:
		f.grid.clear_actor_occupancy()
		f.enemies.occupy_all()
		f.player.step(input)
		f.grid.occupy_actor(f.player.cell_rect(f.player.position))
		f.grid.step()
		f.enemies.step()
		f.shots.step()
		f.enemies.synchronize_damage()

func run_tests() -> void:
	var skitter = fixture("skitter", Vector2(144, 320))
	advance(skitter, 12)
	check(skitter.actor.phase == "telegraph" and skitter.player.hp == 100.0, "Skitter cannot move its damage hitbox during twelve warning ticks")
	advance(skitter, 1)
	check(skitter.actor.phase == "active" and skitter.actor.state == "run" and skitter.player.hp == 95.0, "Skitter dash begins at 0.20 seconds and deals five damage")
	advance(skitter, 17)
	check(skitter.actor.phase == "active" and skitter.player.hp == 95.0, "Skitter active dash lasts eighteen ticks and cannot repeatedly damage one player")
	advance(skitter, 1)
	check(skitter.actor.phase == "recovery", "Skitter recovery starts after its complete active interval")
	advance(skitter, 17)
	check(skitter.actor.phase == "recovery", "Skitter retains all eighteen recovery ticks")
	advance(skitter, 1)
	check(skitter.actor.phase == "idle", "Skitter attack returns to idle at the exact total duration")
	var wraith = fixture("wraith", Vector2(170, 286))
	advance(wraith, 15)
	check(wraith.enemies.projectiles.is_empty() and wraith.actor.phase == "telegraph", "Wraith cannot shoot during its fifteen-tick warning")
	advance(wraith, 1)
	check(wraith.enemies.projectiles.size() == 1, "Wraith spawns exactly one shot after 0.25 seconds")
	advance(wraith, 8)
	check(wraith.player.hp == 92.0, "Wraith projectile uses swept player collision and deals eight damage")
	check(is_equal_approx(float(wraith.actor.position.y), 286.0), "Wraith intentionally levitates at its center anchor instead of falling onto a foot pivot")
	var wall = fixture("wraith", Vector2(170, 286))
	for y in range(62, 80):
		wall.grid.set_material(35, y, Grid.CellMaterial.SOLID, true)
	advance(wall, 30)
	check(wall.player.hp == 100.0 and wall.enemies.projectiles.is_empty(), "four-pixel protected material blocks an enemy shot before the player")
	var drill = fixture("driller", Vector2(168, 320))
	for y in range(73, 80):
		drill.grid.set_material(34, y, Grid.CellMaterial.SOLID)
	advance(drill, 30)
	check(drill.actor.phase == "telegraph" and drill.grid.material_at(34, 75) == Grid.CellMaterial.SOLID, "Driller cannot carve during its thirty-tick spin-up")
	advance(drill, 8)
	check(drill.grid.material_at(34, 75) == Grid.CellMaterial.EMPTY and drill.player.hp == 90.0, "active Driller carves mutable material and deals ten damage")
	advance(drill, 16)
	check(drill.actor.phase == "active", "Driller charge retains twenty-four active ticks")
	advance(drill, 1)
	check(drill.actor.phase == "recovery", "Driller ends its damaging charge before recovery")
	var protected = fixture("driller", Vector2(168, 320))
	for y in range(73, 80):
		protected.grid.set_material(34, y, Grid.CellMaterial.SOLID, true)
	advance(protected, 54)
	check(protected.grid.material_at(34, 75) == Grid.CellMaterial.SOLID and protected.actor.position.x >= 162.0 and protected.player.hp == 100.0, "Driller cannot carve or tunnel its full body through protected station material")
	var reserved = fixture("driller", Vector2(168, 320))
	for y in range(73, 80):
		reserved.grid.set_material(34, y, Grid.CellMaterial.SOLID)
	reserved.grid.reserve_rect(Rect2i(34, 73, 1, 7))
	advance(reserved, 54)
	check(reserved.grid.material_at(34, 75) == Grid.CellMaterial.SOLID and reserved.player.hp == 100.0, "Driller also preserves statically reserved objective cells")
	var golem = fixture("golem", Vector2(180, 320))
	advance(golem, 36)
	check(golem.actor.attack == "slam" and golem.actor.phase == "telegraph" and golem.player.hp == 100.0, "Golem slam gives the complete 0.60-second telegraph without early damage")
	advance(golem, 1)
	check(golem.player.hp == 85.0 and golem.actor.phase == "active", "Golem slam impact occurs only at the active boundary and deals fifteen damage")
	advance(golem, 17)
	check(golem.actor.phase == "active" and golem.player.hp == 85.0, "Golem slam cannot damage twice during its eighteen-tick active window")
	advance(golem, 36)
	check(golem.actor.phase == "recovery", "Golem keeps the full thirty-six-tick recovery")
	advance(golem, 2)
	check(golem.actor.attack == "burst" and golem.actor.phase == "telegraph", "Golem cycles from slam into its distinct burst attack")
	var burst_start: int = golem.actor.attack_started
	var spawned: int = 0
	while golem.enemies.tick < burst_start + 54:
		advance(golem, 1)
		for event in golem.enemies.events:
			spawned += int(event.type == "enemy_projectile")
	check(spawned == 3, "Golem burst emits exactly three finite shots during its bounded active interval")
	while golem.actor.attack != "roar" or golem.actor.phase != "telegraph":
		advance(golem, 1)
		if golem.enemies.tick > 220:
			break
	var hp_before_roar: float = golem.player.hp
	golem.enemies.projectiles.clear()
	golem.shots.external_slots = 0
	advance(golem, 25)
	check(golem.actor.attack == "roar" and golem.actor.effect_done and golem.player.hp == hp_before_roar, "Golem roar changes allowed terrain without direct damage")
	var pulse = fixture("golem", Vector2(180, 320))
	pulse.grid.flicker_probability_per_second = 0.0
	pulse.grid.set_material(24, 77, Grid.CellMaterial.UNSTABLE_ORE)
	pulse.grid.set_material(25, 77, Grid.CellMaterial.UNSTABLE_ORE)
	pulse.grid.set_material(26, 77, Grid.CellMaterial.UNSTABLE_ORE, true)
	pulse.grid.reserve_rect(Rect2i(25, 77, 1, 1))
	advance(pulse, 37)
	check(pulse.grid.material_at(24, 77) == Grid.CellMaterial.SOLID and pulse.grid.collapse_until[77 * 180 + 24] == pulse.grid.tick + 180, "Golem pulse genuinely stabilizes eligible ore for three seconds")
	check(pulse.grid.material_at(25, 77) == Grid.CellMaterial.UNSTABLE_ORE and pulse.grid.material_at(26, 77) == Grid.CellMaterial.UNSTABLE_ORE, "Golem pulse preserves reserved objective ore and immutable anchor ore")
	var dodge = fixture("golem", Vector2(180, 320))
	advance(dodge, 24)
	advance(dodge, 13, {"jump": true, "levitate": true})
	check(dodge.player.hp == 100.0 and dodge.player.position.y < 276.0, "jump input with 0.20 seconds of warning remaining clears the Golem slam hitbox")
	var late_dodge = fixture("golem", Vector2(180, 320))
	advance(late_dodge, 30)
	advance(late_dodge, 7, {"jump": true, "levitate": true})
	check(late_dodge.player.hp == 85.0, "jumping with only 0.10 seconds remaining is too late to clear the slam")
	var actor_cells = fixture("golem", Vector2(180, 320))
	actor_cells.enemies.occupy_all()
	check(not actor_cells.grid.set_material(45, 70, Grid.CellMaterial.UNSTABLE_ORE), "enemy body occupancy rejects terrain creation inside a living actor")
	var capacity = fixture("wraith", Vector2(170, 286))
	for i in 63:
		capacity.shots.pending.append({"id": i + 100, "instrument": "photon", "origin": Vector2(40, 100), "direction": Vector2.RIGHT, "spawn_at": 10000, "slots": 1})
	advance(capacity, 16)
	check(capacity.shots.slot_count() == 64 and capacity.enemies.projectiles.size() == 1, "enemy projectile and reserved player shots share one global sixty-four-slot cap")
	var prior_energy: float = capacity.shots.energy
	check(not capacity.shots.fire("photon", Vector2(40, 100), Vector2.RIGHT).accepted and capacity.shots.energy == prior_energy, "full mixed projectile capacity rejects player fire without charging energy")
	var saturated = fixture("wraith", Vector2(170, 286))
	for i in 64:
		saturated.shots.pending.append({"id": i + 100, "instrument": "photon", "origin": Vector2(40, 100), "direction": Vector2.RIGHT, "spawn_at": 10000, "slots": 1})
	advance(saturated, 16)
	check(saturated.enemies.projectiles.is_empty() and saturated.enemies.next_projectile == 1, "hostile firing also rejects saturated capacity without replacing reserved player entities")
	var health = fixture("skitter", Vector2(144, 320))
	check(health.player.take_damage(8.0) and health.player.state == "hit" and not health.player.take_damage(8.0), "player enters hit state and receives one bounded damage event during immunity")
	advance(health, 30, {"move": -1.0})
	check(health.player.take_damage(8.0), "hurt immunity expires after exactly thirty ticks")
	check(not health.player.take_damage(NAN) and not health.player.take_damage(-2.0), "invalid damage requests cannot corrupt player health")
	var recall = fixture("skitter", Vector2(144, 320))
	recall.player.position = Vector2(80, 320)
	check(recall.player.recall() and not recall.player.take_damage(15.0), "Recall arrival immunity applies to live enemy damage")
	var occupied_recall = fixture("skitter",Vector2(120,320))
	occupied_recall.player.position = Vector2(320,320)
	occupied_recall.enemies.occupy_all()
	check(not occupied_recall.player.recall(),"Recall rejects a station occupied by a living enemy before committing the arrival")
	occupied_recall.shots.targets[1].hp = 0.0
	occupied_recall.enemies.synchronize_damage()
	occupied_recall.grid.clear_actor_occupancy()
	occupied_recall.enemies.occupy_all()
	check(occupied_recall.player.recall() and occupied_recall.player.position == Vector2(120,320),"a cleared station becomes a safe Recall destination after the enemy dies")
	var kill = fixture("skitter", Vector2(144, 320))
	for i in 80:
		if kill.shots.targets[1].hp > 0:
			var center: Vector2 = kill.enemies.body_rect(kill.actor, kill.actor.position).get_center()
			kill.shots.fire("photon", center - Vector2(24, 0), Vector2.RIGHT)
		advance(kill, 1)
	check(kill.shots.targets[1].hp == 0.0 and kill.actor.state == "death" and kill.actor.state_history.has("hit"), "actual player projectiles drive enemy hit and death through the shared target HP")
	var prior_attacks: int = kill.actor.attack_count
	advance(kill, 120)
	check(kill.actor.attack_count == prior_attacks and kill.actor.velocity == Vector2.ZERO, "dead enemy cannot resume moving or start new attacks")
	check(not kill.enemies.add_enemy("skitter", 1, Vector2(350, 320)), "duplicate enemy IDs do not overwrite authoritative targets")
	var fast = fixture("wraith", Vector2(370, 286))
	advance(fast, 1)
	check(fast.actor.state == "run" and fast.actor.position.y == 286.0, "Wraith exposes a distinct fast-glide run state while retaining its levitation anchor")
	var replay = fixture("driller", Vector2(168, 320))
	var replay2 = fixture("driller", Vector2(168, 320))
	advance(replay, 120, {"move": -1.0})
	advance(replay2, 120, {"move": -1.0})
	check(replay.actor.position == replay2.actor.position and replay.actor.phase == replay2.actor.phase and replay.player.hp == replay2.player.hp, "same inputs replay identical actor movement, attack state and damage")
	print("QUANTUM_ENEMY_RESULTS " + JSON.stringify({"passed": passed, "failed": failed, "tests": results}))
	quit(0 if failed == 0 else 1)
