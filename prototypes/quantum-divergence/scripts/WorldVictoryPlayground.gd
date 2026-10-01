extends "res://scripts/WorldPlayground.gd"
## Full-size rendered test route. All gameplay changes go through ordinary player inputs.
const RunDriver = preload("res://scripts/WorldRunDriver.gd")
var driver
var milestone_captures: Dictionary = {}

func _ready() -> void:
	super._ready()
	driver = RunDriver.new(manifest)
	capture_ticks = [60]
	report.scope = "Native full-size Probability Mines combat/objective route with both optional branches and original test art; not MetroForge app generation or final animation approval"

func _controls() -> Dictionary:
	if not smoke_test:
		return super._controls()
	var input: Dictionary = driver.controls(player,instruments,enemies,progress,active_counts)
	fire_requested = driver.fire
	interact_requested = driver.interact
	selected = "photon"
	test_aim = driver.aim
	return input

func _after_simulation(input: Dictionary) -> void:
	super._after_simulation(input)
	if smoke_test and capture_dir != "":
		for id in ["anchor","secret","rift","golem"]:
			var reached: bool = progress.anchor_upper if id == "anchor" else progress.secret_found if id == "secret" else progress.collapse_rift if id == "rift" else int(active_counts.get("200",0)) > 0
			if reached and not milestone_captures.has(id):
				milestone_captures[id] = simulation_tick
				captured[simulation_tick] = true
				_capture(simulation_tick)
	if smoke_test and simulation_tick % 600 == 0:
		print("WORLD_RUN_PROGRESS " + JSON.stringify({"tick":simulation_tick,"hp":player.hp,"at":str(player.position),"driver":driver.status(),"target_hp":_target_hp()}))

func _target_hp() -> Dictionary:
	var hp: Dictionary = {}
	for id in instruments.targets:
		hp[str(id)] = instruments.targets[id].hp
	return hp

func _test_finished() -> bool:
	return player.hp <= 0 or driver.failure != "" or (extraction_tick > 0 and simulation_tick >= extraction_tick + 90) or simulation_tick >= 11000

func _test_passed() -> bool:
	var route: Dictionary = driver.status()
	return progress.extracted and progress.secret_found and player.hp > 0 and enemy_deaths.size() == 4 and active_counts.size() == 4 and boss_active.has("slam") and boss_active.has("burst") and boss_active.has("roar") and route.reached == route.waypoints and route.branches.echo.returned and route.branches.survey.returned

func _extend_report() -> void:
	super._extend_report()
	report.full_route = driver.status()
	report.world.tour_waypoints = driver.points.size()
	report.world.visited_waypoints = driver.navigator.reached.size()
	report.target_hp = _target_hp()
	report.milestone_captures = milestone_captures

func _update_texture() -> void:
	# A headless rehearsal retains the identical simulation/inputs without texture construction.
	if DisplayServer.get_name() != "headless":
		super._update_texture()

func _capture(at_tick: int) -> void:
	if DisplayServer.get_name() != "headless":
		super._capture(at_tick)
