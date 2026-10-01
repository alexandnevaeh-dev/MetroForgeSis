extends SceneTree
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const Enemies = preload("res://scripts/EnemySimulation.gd")
const Binding = preload("res://scripts/EnemyClipBinding.gd")
var passed: int = 0
var failed: int = 0
var manifest: Dictionary

func check(value: bool, label: String) -> void:
	passed += int(value)
	failed += int(not value)
	print(("PASS " if value else "FAIL ")+label)

func _initialize() -> void:
	manifest = JSON.parse_string(FileAccess.get_file_as_string("res://assets/cast-candidate-v2/manifest.json"))
	call_deferred("run_tests")

func fixture(kind: String) -> Dictionary:
	var grid = Grid.new(250,100,42)
	for x in 250: grid.set_material(x,80,Grid.CellMaterial.SOLID,true)
	var player = Player.new(grid,Vector2(80,320))
	var shots = Instruments.new(grid)
	var enemies = Enemies.new(grid,shots,player)
	var at := Vector2({"skitter":134.0,"driller":168.0,"wraith":250.0,"golem":300.0}[kind],270 if kind == "wraith" else 320)
	assert(enemies.add_enemy(kind,1,at))
	return {"grid":grid,"player":player,"shots":shots,"enemies":enemies,"actor":enemies.actors[1],"binding":Binding.new(kind,manifest.actors[kind].clips),"sample":{}}

func advance(f: Dictionary, count: int) -> void:
	for index in count:
		f.grid.clear_actor_occupancy()
		f.enemies.occupy_all()
		f.player.step({})
		f.enemies.step()
		f.shots.step()
		f.enemies.synchronize_damage()
		f.sample = f.binding.sample(f.actor,f.enemies.tick)

func run_tests() -> void:
	for kind in ["skitter","driller","wraith","golem"]:
		var f: Dictionary = fixture(kind)
		advance(f,1)
		var started: int = f.actor.attack_started
		var windup: int = Enemies.ATTACKS[f.actor.attack].windup
		advance(f,windup-3)
		f.shots.targets[1].hp -= 1.0
		f.enemies.synchronize_damage()
		f.sample = f.binding.sample(f.actor,f.enemies.tick)
		check(f.sample.clip == "hit" and f.sample.index == 0,kind+" hit interrupts the live warning")
		advance(f,18)
		check(f.actor.attack_started == started and f.actor.attack_count == 1,kind+" reaction does not restart the gameplay attack clock")
		check(f.sample.clip != "hit" and f.sample.phase != "telegraph",kind+" resumes the existing active/recovery phase without replaying its warning")
		if kind == "golem": check(f.sample.clip == "slam" and f.sample.index == 7,"Golem resumes the impact segment after a warning interruption")
		if kind == "driller": check(f.sample.clip == "drill" and f.sample.elapsed == f.enemies.tick-started-windup,"Driller resumes at elapsed active drill time")
		if kind == "wraith": check(f.actor.emitted == 1 and f.sample.clip == "idle","Wraith fires once on time while hit, then resumes recovery")
		f.shots.targets[1].hp = 0
		f.enemies.synchronize_damage()
		advance(f,160)
		check(f.sample.clip == "death" and f.sample.index == int(manifest.actors[kind].clips.death.frames)-1,kind+" real death holds its terminal image")
		advance(f,100)
		check(f.sample.clip == "death" and f.sample.index == int(manifest.actors[kind].clips.death.frames)-1,kind+" death cannot wrap into attack after additional ticks")
	print("QUANTUM_ENEMY_BINDING_RESULTS "+JSON.stringify({"passed":passed,"failed":failed,"scope":"Actual enemy simulation hit interruption, unchanged attack clocks, phase resumption and terminal death"}))
	quit(0 if failed == 0 else 1)
