extends SceneTree
## Native Control signals and game-owned input events. No OS input or gameplay state grants.
var game
var output: String
var passed: int = 0
var failed: int = 0
var results: Array = []

func _initialize() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--capture-dir="): output = argument.trim_prefix("--capture-dir=")
	call_deferred("run_tests")

func check(value: bool, label: String) -> void:
	passed += int(value)
	failed += int(not value)
	results.append({"test":label,"passed":value})
	print(("PASS " if value else "FAIL ")+label)

func key(code: int) -> void:
	for pressed in [true,false]:
		var event := InputEventKey.new()
		event.keycode = code
		event.physical_keycode = code
		event.pressed = pressed
		Input.parse_input_event(event)

func hold_key(code: int, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)

func click(at: Vector2) -> void:
	var move := InputEventMouseMotion.new()
	move.position = at
	move.global_position = at
	Input.parse_input_event(move)
	for pressed in [true,false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.position = at
		event.global_position = at
		event.pressed = pressed
		Input.parse_input_event(event)

func capture(name: String) -> void:
	await RenderingServer.frame_post_draw
	var image: Image = root.get_texture().get_image()
	check(image.get_size() == Vector2i(960,600) and image.save_png(output.path_join(name+".png")) == OK,"actual native viewport captured: "+name)

func frames(count: int) -> void:
	for index in count: await process_frame

func run_tests() -> void:
	if not output.to_lower().begins_with("e:/") or DirAccess.make_dir_recursive_absolute(output) != OK:
		push_error("Workbench captures require an E: folder")
		quit(1)
		return
	game = load("res://scenes/MinesArtPlayground.tscn").instantiate()
	root.add_child(game)
	for index in 20: await physics_frame
	check(game.programming.admission().accepted,"real grounded Diver is admitted at the registered entry station")
	key(KEY_P)
	await frames(3)
	check(game.workbench.opened and paused,"P opens the actual native station workbench")
	check(game.workbench.instrument_choice.has_focus(),"opening gives keyboard focus to the instrument selector")
	var tick_before: int = game.simulation_tick
	var cells_before: PackedByteArray = game.grid.cells.duplicate()
	var hp_before: float = game.player.hp
	var energy_before: float = game.instruments.energy
	await frames(20)
	check(game.simulation_tick == tick_before and game.grid.cells == cells_before and game.player.hp == hp_before,"editing pauses actual material, enemy and player clocks")
	await capture("01-workbench")
	game.workbench.choices.operator.select(3)
	game.workbench.choices.operator.item_selected.emit(3)
	await frames(2)
	check(game.workbench.apply_button.disabled and game.workbench.preview.text.contains("blueprint"),"locked Tunneling shows a reason and disables application")
	await capture("02-locked-blueprint")
	game.workbench.choices.operator.select(0)
	game.workbench.choices.operator.item_selected.emit(0)
	game.workbench.choices.waveform.select(1)
	game.workbench.choices.waveform.item_selected.emit(1)
	await frames(3)
	check(not game.workbench.apply_button.disabled and game.workbench.preview.text.contains("6 energy"),"valid edited waveform previews its real firing price")
	var applied_before: int = game.workbench.applied
	click(game.workbench.apply_button.get_global_rect().get_center())
	await frames(3)
	check(game.workbench.applied == applied_before+1 and game.instruments.programs.photon.waveform == "tachyon","native mouse input applies the edited program to the selected slot")
	check(game.instruments.programs.tachyon == game.Instruments.Program.DEFAULTS.tachyon and game.instruments.energy == energy_before,"application preserves the other slot and existing energy")
	check(game.workbench.feedback.text.contains("applied") and paused,"successful application stays paused and reports its result")
	await capture("03-program-applied")
	key(KEY_ESCAPE)
	await frames(3)
	check(not game.workbench.opened and not paused,"Escape closes the workbench and resumes the game")
	for index in 3: await physics_frame
	check(game.report.shots == 0 and game.player.state == "idle","workbench clicks do not leak into attacks or movement after closing")
	click(Vector2(680,290))
	# A complete click between ticks is consumed through the same game fire request.
	await physics_frame
	await physics_frame
	check(game.report.shots == 1 and is_equal_approx(game.instruments.energy,energy_before-6.0),"resumed game fires the newly programmed waveform at the previewed energy cost")
	var stats: Dictionary = game.instruments.definition_for("photon")
	check(stats.windup == 9 and stats.damage == 8.0 and stats.slots == 1,"applied waveform controls telegraph, damage and projectile capacity")
	hold_key(KEY_D,true)
	for index in 60: await physics_frame
	hold_key(KEY_D,false)
	for index in 3: await physics_frame
	var programs_before: PackedByteArray = var_to_bytes(game.instruments.programs)
	var declined: Dictionary = game.programming.apply("photon",game.Instruments.Program.DEFAULTS.photon)
	check(not declined.accepted and var_to_bytes(game.instruments.programs) == programs_before,"walking away from the station rejects direct application without changing the loadout")
	key(KEY_P)
	await frames(2)
	check(not game.workbench.opened and not paused and game.notice == declined.reason,"P away from a station leaves gameplay running and reports the actual admission reason")
	hold_key(KEY_R,true)
	for index in 65: await physics_frame
	hold_key(KEY_R,false)
	for index in 3: await physics_frame
	check(game.player.position.distance_to(game.manifest.stations[0]) < 2.0,"normal Recall input returns to the safe station without test position grants")
	key(KEY_P)
	await frames(3)
	check(game.workbench.opened,"the same workbench can reopen after normal traversal and Recall")
	game.workbench.choices.state.select(1)
	game.workbench.choices.state.item_selected.emit(1)
	key(KEY_ESCAPE)
	await frames(3)
	check(var_to_bytes(game.instruments.programs) == programs_before,"closing an uncommitted draft preserves the actual equipped program")
	var proof := {"passed":passed,"failed":failed,"results":results,"scope":"Native Control selection signals, game-owned P/Escape/mouse events and actual GPU captures; no OS input, no position/health grants","programs":game.instruments.programs,"simulation_tick":game.simulation_tick}
	var file = FileAccess.open(output.path_join("workbench-result.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(proof,"\t"))
	print("QUANTUM_WORKBENCH_RESULTS "+JSON.stringify(proof))
	quit(0 if failed == 0 else 1)
