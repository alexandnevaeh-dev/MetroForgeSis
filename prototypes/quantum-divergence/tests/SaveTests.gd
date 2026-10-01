extends SceneTree
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const Enemies = preload("res://scripts/EnemySimulation.gd")
const Progression = preload("res://scripts/MinesProgression.gd")
const State = preload("res://scripts/RunState.gd")
const Store = preload("res://scripts/SaveStore.gd")
const Session = preload("res://scripts/RunSession.gd")
var passed: int = 0
var failed: int = 0
var results: Array[Dictionary] = []
var artifact_root: String = "E:/Metroforge/MetroForge-Publish/reports/game-tests/20261001-quantum-divergence/save-tests-%d-%d" % [OS.get_process_id(), Time.get_ticks_usec()]

func _initialize() -> void:
	call_deferred("run_tests")

func check(condition: bool, label: String) -> void:
	passed += int(condition)
	failed += int(not condition)
	results.append({"test": label, "passed": condition})
	print(("PASS " if condition else "FAIL ") + label)

func fixture(profile: Dictionary) -> Dictionary:
	var grid = Grid.new(192, 96, 521)
	for x in range(1, 191):
		grid.set_material(x, 84, Grid.CellMaterial.SOLID, true)
	var player = Player.new(grid, Vector2(80, 336))
	var shots = Instruments.new(grid)
	for i in 3:
		shots.add_target(101 + i, Rect2(212 + i * 80, 300, 20, 36), 24.0)
	shots.add_target(200, Rect2(544, 240, 64, 96), 300.0)
	var enemies = Enemies.new(grid, shots, player)
	assert(enemies.add_enemy("skitter", 301, Vector2(238, 336)))
	assert(enemies.add_enemy("wraith", 302, Vector2(356, 254)))
	assert(enemies.add_enemy("driller", 303, Vector2(474, 336)))
	assert(enemies.add_enemy("golem", 200, Vector2(576, 336), true))
	var progress = Progression.new(grid, shots, player, profile)
	assert(progress.configure({"anchor": Vector2(120,336), "core": Vector2(626,336), "exit": Vector2(708,336), "secret": Vector2(165,336), "upper_region": Rect2i(1,1,78,83), "ghost_platforms": [Rect2i(80,53,12,1), Rect2i(106,48,12,1)], "crystals": [101,102,103], "golem": 200}))
	for rect in progress.layout.ghost_platforms:
		for x in range(rect.position.x, rect.end.x):
			grid.set_material(x, rect.position.y, Grid.CellMaterial.UNSTABLE_ORE)
	return {"grid":grid, "player":player, "instruments":shots, "enemies":enemies, "progress":progress}

func advance(bundle: Dictionary, count: int, controls: Dictionary = {}) -> void:
	for i in count:
		bundle.grid.clear_actor_occupancy()
		bundle.enemies.occupy_all()
		bundle.player.step(controls)
		bundle.grid.occupy_actor(bundle.player.cell_rect(bundle.player.position))
		bundle.grid.step()
		bundle.enemies.step()
		bundle.instruments.step()
		bundle.enemies.synchronize_damage()
		bundle.progress.step()

func invalid(state: Dictionary, profile: Dictionary, label: String) -> void:
	check(not State.build(state, profile).accepted, label)

func run_tests() -> void:
	var profile: Dictionary = {"blueprints": ["entanglement"], "loadouts": ["default"], "lore": ["log_001"]}
	var bundle = fixture(profile)
	advance(bundle, 60)
	for y in range(15,46):
		for x in range(33,69):
			bundle.grid.set_material(x,y,Grid.CellMaterial.FLUID)
	check(bundle.instruments.fire("tachyon", Vector2(120,100),Vector2.RIGHT).accepted, "save fixture fires a real capacity-reserved Tachyon")
	advance(bundle, 9)
	check(bundle.instruments.projectiles.size() == 3 and bundle.enemies.projectiles.size() > 0, "checkpoint includes actual split children and a live hostile projectile")
	bundle.instruments.fire("photon", Vector2(120,100), Vector2.RIGHT)
	bundle.grid.add_heat(30,20,0.9)
	var state: Dictionary = State.snapshot(bundle,"tachyon")
	var restored: Dictionary = State.build(state,profile)
	check(restored.accepted, "complete suspended run validates into a detached bundle")
	if not restored.accepted:
		print("RESTORE_REASON " + str(restored))
		finish()
		return
	check(var_to_bytes(State.snapshot(restored.bundle,"tachyon")) == var_to_bytes(state), "restore preserves every material, player, instrument, actor and objective field")
	check(restored.bundle.instruments.pending.size() == 1 and restored.bundle.instruments.slot_count() == bundle.instruments.slot_count(), "resume preserves pending attack windup and shared split/hostile capacity")
	advance(bundle,120)
	advance(restored.bundle,120)
	check(var_to_bytes(State.snapshot(bundle,"tachyon")) == var_to_bytes(State.snapshot(restored.bundle,"tachyon")), "resumed run produces identical future material, AI, projectile and damage state")
	var untouched: PackedByteArray = var_to_bytes(State.snapshot(bundle))
	var malformed: Dictionary = state.duplicate(true)
	malformed.schema_version = 99
	invalid(malformed,profile,"unknown save version is rejected")
	malformed = state.duplicate(true)
	malformed.player.hp = NAN
	invalid(malformed,profile,"nonfinite player health is rejected before allocation/commit")
	malformed = state.duplicate(true)
	malformed.player.stations = [Vector2(-1,30)]
	invalid(malformed,profile,"out-of-world Recall station is rejected")
	malformed = state.duplicate(true)
	malformed.instruments.pending[0].slots = 3
	invalid(malformed,profile,"pending Photon cannot forge extra reserved split capacity")
	malformed = state.duplicate(true)
	malformed.instruments.projectiles[0].expires_at = 0
	invalid(malformed,profile,"expired projectile cannot gain a new life on resume")
	malformed = state.duplicate(true)
	malformed.instruments.projectiles[0].direction = Vector2.ZERO
	invalid(malformed,profile,"invalid projectile direction is rejected")
	malformed = state.duplicate(true)
	malformed.instruments.projectiles[1].id = malformed.instruments.projectiles[0].id
	invalid(malformed,profile,"duplicate projectile IDs are rejected")
	malformed = state.duplicate(true)
	malformed.instruments.external_slots = 0
	invalid(malformed,profile,"hostile capacity cannot disappear from the shared accounting")
	malformed = state.duplicate(true)
	malformed.enemies.actors[301].last_hp = 7.0
	invalid(malformed,profile,"actor and authoritative target HP must agree")
	malformed = state.duplicate(true)
	malformed.enemies.actors[301].kind = "unknown"
	invalid(malformed,profile,"unknown actor family cannot be loaded")
	malformed = state.duplicate(true)
	malformed.progress.golem_core = true
	invalid(malformed,profile,"forged core completion cannot bypass a living Golem")
	malformed = state.duplicate(true)
	malformed.progress.anchor_upper = true
	invalid(malformed,profile,"anchor flags must agree with the restored regional probability")
	malformed = state.duplicate(true)
	malformed.progress.crystals_destroyed = 3
	invalid(malformed,profile,"crystal objective counts must agree with actual target health")
	malformed = state.duplicate(true)
	malformed.grid.immutable[0] = 0
	invalid(malformed,profile,"corrupted save cannot erase the immutable world boundary")
	malformed = state.duplicate(true)
	malformed.player.extra_hp_upgrade = 999
	invalid(malformed,profile,"unexpected player fields cannot introduce permanent stat inflation")
	check(var_to_bytes(State.snapshot(bundle)) == untouched and profile.blueprints == ["entanglement"], "failed candidate loads leave live gameplay and profile knowledge untouched")
	malformed = state.duplicate(true)
	malformed.player = 42
	invalid(malformed,profile,"incorrect component type is rejected without calling methods on a scalar")
	malformed = state.duplicate(true)
	malformed.enemies.actors[301].attack = "roar"
	invalid(malformed,profile,"an enemy cannot load another family's special attack")
	malformed = state.duplicate(true)
	malformed.grid.unexpected = true
	invalid(malformed,profile,"unknown grid fields are rejected by the versioned run schema")
	malformed = state.duplicate(true)
	malformed.player.immunity_until = 999999
	invalid(malformed,profile,"resume cannot forge permanent immunity from a timer")
	malformed = state.duplicate(true)
	malformed.player.velocity = Vector2(0,-1000000)
	invalid(malformed,profile,"unbounded velocity cannot create an unbounded collision loop after resume")
	malformed = state.duplicate(true)
	malformed.instruments.projectiles[0].expires_at = state.tick + 1000
	invalid(malformed,profile,"resume cannot extend a projectile beyond its instrument lifetime")
	var store = Store.new(artifact_root)
	var profile_write: Dictionary = store.write_profile(profile)
	check(profile_write.accepted and profile_write.path.to_lower().begins_with("e:/"), "profile is written and read back on E with a complete checksum envelope")
	var profile_load: Dictionary = store.load_profile()
	check(profile_load.accepted and profile_load.profile == profile, "profile preserves only knowledge, loadout IDs and lore")
	check(not store.write_profile({"blueprints": [], "hp":999}).accepted, "profile rejects raw health or damage upgrades")
	check(not Store.new("C:/QuantumTest").write_profile(profile).accepted, "storage outside E is rejected without creating a file")
	var first: Dictionary = store.write_active(state)
	check(first.accepted, "real complete suspended run is published as a fresh generation")
	var validator: Callable = func(candidate): return State.build(candidate,profile)
	var loaded: Dictionary = store.load_active(validator)
	check(loaded.accepted and loaded.tick == 69 and not loaded.recovered, "latest active generation restores the exact checkpoint tick")
	malformed = state.duplicate(true)
	malformed.player.hp = NAN
	store.write_active(malformed)
	loaded = store.load_active(validator)
	check(loaded.accepted and loaded.recovered and loaded.path == first.path, "semantically corrupt newer generation falls back to the previous valid run")
	var second: Dictionary = store.write_active(state)
	var corrupt = FileAccess.open(second.path,FileAccess.WRITE)
	corrupt.store_buffer(PackedByteArray([1,2,3]))
	corrupt.close()
	loaded = store.load_active(validator)
	check(loaded.accepted and loaded.recovered and loaded.path == first.path, "truncated newer file cannot partially replace a running game")
	var incomplete = FileAccess.open(artifact_root.path_join("active-99999999999999999999-1-1.qds.tmp"),FileAccess.WRITE)
	incomplete.store_string("unfinished")
	incomplete.close()
	check(store.load_active(validator).accepted, "unpublished temporary files never become a resumable run")
	var terminal: Dictionary = store.end_run("death")
	check(terminal.accepted and store.load_active(validator).reason == "run_ended", "death marker ends the suspend without resurrecting an older living generation")
	corrupt = FileAccess.open(terminal.path,FileAccess.WRITE)
	corrupt.store_string("damaged ending")
	corrupt.close()
	check(store.load_active(validator).reason == "run_ended", "even a corrupted published death marker blocks older run resurrection")
	check(store.load_profile().profile.blueprints == ["entanglement"], "death leaves persistent blueprint knowledge intact")
	var fresh = fixture(store.load_profile().profile)
	check(fresh.player.hp == 100.0 and fresh.instruments.energy == 100.0 and not fresh.progress.anchor_upper and fresh.enemies.actors[200].attack_count == 0 and fresh.instruments.targets[200].hp == 300.0, "new run resets health, energy, enemies and objectives without stat inflation")
	check(store.write_active(State.snapshot(fresh)).accepted and store.load_active(validator).accepted, "an explicitly started new run publishes a newer active generation")
	for i in 12:
		store.write_profile(profile)
	check(store._records("profile").size() == Store.KEEP_GENERATIONS, "profile retention stays bounded while preserving eight complete backups")
	var damaged_store = Store.new(artifact_root.path_join("damaged-retention"))
	var retained: Dictionary = damaged_store.write_active(state)
	for i in Store.KEEP_GENERATIONS:
		var damaged: Dictionary = damaged_store.write_active(state)
		corrupt = FileAccess.open(damaged.path,FileAccess.WRITE)
		corrupt.store_string("truncated")
		corrupt.close()
	damaged_store.write_active(state)
	check(FileAccess.file_exists(retained.path) and damaged_store._read({"name":retained.path.get_file(), "kind":"active", "sequence":retained.sequence}).accepted, "damaged generations never consume retention slots and erase valid older recovery files")
	var ended_store = Store.new(artifact_root.path_join("ended"))
	check(ended_store.end_run("extracted").accepted and ended_store.load_active(validator).reason == "run_ended", "extraction closes the logical suspend slot")
	var session_profile: Dictionary = {"blueprints": []}
	var session_bundle = fixture(session_profile)
	var session = Session.new(artifact_root.path_join("session"),session_profile)
	check(session.initialize(session_bundle).accepted, "interactive session captures a validated fresh baseline and loads independent knowledge")
	advance(session_bundle,20,{"move": 1.0})
	check(session_bundle.progress.interact("secret").accepted, "session control obtains the actual nearby blueprint secret")
	advance(session_bundle,40)
	check(session.suspend(session_bundle,"photon").accepted, "interactive suspend publishes a complete validated living run")
	var continued = session.resume()
	check(continued.accepted and continued.tick == 60 and continued.bundle.progress.secret_found, "interactive resume restores the secret, actor states and original checkpoint tick")
	var new_process_profile: Dictionary = {"blueprints": []}
	var next_session = Session.new(artifact_root.path_join("session"),new_process_profile)
	check(next_session.initialize(fixture(new_process_profile)).accepted and next_session.resume().accepted and new_process_profile.blueprints == ["entanglement"], "a new session reads the persisted run and separate blueprint knowledge")
	var death_bundle = fixture(session_profile)
	death_bundle.player.take_damage(100.0,"save_death_control")
	check(session.observe(death_bundle).accepted and session.resume().get("reason") == "run_ended", "session death publishes a terminal marker and blocks reload")
	check(not session.suspend(death_bundle,"photon").accepted, "dead gameplay cannot overwrite the slot with a living suspend")
	var restarted: Dictionary = session.new_run()
	check(restarted.accepted and restarted.tick == 0 and restarted.bundle.player.hp == 100.0 and restarted.bundle.instruments.energy == 100.0 and not restarted.bundle.progress.secret_found and session_profile.blueprints == ["entanglement"], "interactive restart restores the fresh world and base stats while retaining earned knowledge")
	check(session.resume().accepted, "new active run is resumable after a successful explicit restart")
	finish()

func finish() -> void:
	print("QUANTUM_SAVE_RESULTS " + JSON.stringify({"passed":passed,"failed":failed,"tests":results,"artifacts":artifact_root}))
	quit(0 if failed == 0 else 1)
