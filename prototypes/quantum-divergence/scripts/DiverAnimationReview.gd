extends Node2D
## Actual player/instrument controls with a separate candidate animation gallery.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const ClipPlayer = preload("res://scripts/SpriteClipPlayer.gd")
const ORDER: Array[String] = ["idle","walk","run","attack","jump","levitate","dash","hit","death"]
var candidate: String
var output: String
var background: String
var manifest: Dictionary
var textures: Dictionary = {}
var bounds_by_clip: Dictionary = {}
var gallery: Dictionary = {}
var seen_frames: Dictionary = {}
var seen_states: Dictionary = {}
var player
var grid
var instruments
var playback
var tick: int = 0
var phase: int = 0
var phase_tick: int = 0
var sample: Dictionary
var attack_id: int = -1
var shots: int = 0
var spawned: int = 0
var ground_checks: int = 0
var ground_failures: int = 0
var ground_failure_samples: Array[Dictionary] = []
var checks: Dictionary = {}
var captures: Array[String] = []
var sprite_current_bottom: int = 96
var ending: bool = false
var wall: ImageTexture

func _ready() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--candidate="): candidate = argument.trim_prefix("--candidate=")
		if argument.begins_with("--capture-dir="): output = argument.trim_prefix("--capture-dir=")
		if argument.begins_with("--background="): background = argument.trim_prefix("--background=")
	assert(candidate.to_lower().begins_with("e:/") and output.to_lower().begins_with("e:/"))
	assert(background.to_lower().begins_with("e:/"))
	assert(not DirAccess.dir_exists_absolute(output))
	DirAccess.make_dir_recursive_absolute(output)
	manifest = JSON.parse_string(FileAccess.get_file_as_string(candidate.path_join("manifest.json")))
	checks.candidate_scope = manifest.genre == "quantum-divergence" and manifest.candidateOnly and not manifest.productionApproved and not manifest.animationReady and not manifest.completeCast
	checks.fixed_dimensions = manifest.frame == [64.0,96.0] and manifest.logicalSize == [32.0,48.0] and manifest.pivot == [32.0,96.0]
	var integrity: bool = true
	for relative in manifest.hashes:
		integrity = integrity and FileAccess.get_sha256(candidate.path_join(relative)) == manifest.hashes[relative]
	checks.pack_integrity = integrity
	for clip in manifest.clips:
		var definition: Dictionary = manifest.clips[clip]
		var image := Image.load_from_file(candidate.path_join(definition.path))
		assert(image != null and image.get_size() == Vector2i(64*int(definition.frames),96))
		textures[clip] = ImageTexture.create_from_image(image)
		gallery[clip] = ClipPlayer.new(manifest.clips)
		seen_frames[clip] = {}
		bounds_by_clip[clip] = []
		for index in int(definition.frames):
			var frame := image.get_region(Rect2i(index*64,0,64,96))
			bounds_by_clip[clip].append(frame.get_used_rect())
	var image := Image.load_from_file(background)
	assert(image != null)
	wall = ImageTexture.create_from_image(image)
	grid = Grid.new(76,64,42)
	for y in range(40,64):
		for x in 76: grid.set_material(x,y,Grid.CellMaterial.SOLID,true)
	for y in 64:
		grid.set_material(0,y,Grid.CellMaterial.SOLID,true)
		grid.set_material(75,y,Grid.CellMaterial.SOLID,true)
	player = Player.new(grid,Vector2(120,160))
	instruments = Instruments.new(grid)
	playback = ClipPlayer.new(manifest.clips)
	sample = playback.sample("idle",0)

func _physics_process(_delta: float) -> void:
	if ending: return
	tick += 1
	if tick > 1000:
		push_error("ANIMATION_REVIEW_TIMEOUT")
		get_tree().quit(1)
		return
	var input: Dictionary = {}
	var desired: String = ORDER[phase]
	if desired == "walk": input.move = 1.0
	if desired == "run": input = {"move":-1.0,"run":true}
	if desired == "jump": input.jump = phase_tick == 0
	if desired == "levitate": input = {"jump":phase_tick == 0,"levitate":phase_tick < 25}
	if desired == "dash": input = {"move":1.0,"dash":phase_tick == 0}
	if desired == "attack" and phase_tick in [0,25,50]:
		var result: Dictionary = instruments.fire("photon",player.position-Vector2(0,24),Vector2.RIGHT)
		if result.accepted:
			attack_id = int(result.id)
			player.notify_attack(6)
			shots += 1
	if desired == "hit" and phase_tick == 0:
		assert(player.take_damage(5,"animation-review-event"))
	if desired == "death" and phase_tick == 0:
		assert(player.take_damage(100,"animation-review-event"))
	player.step(input)
	instruments.step()
	for event in instruments.events:
		if event.type == "spawn": spawned += 1
	var duration: int = 12 if player.state == "attack" else 9 if player.state == "dash" else -1
	sample = playback.sample(player.state,tick,attack_id if player.state == "attack" else -1,duration)
	seen_states[player.state] = true
	sprite_current_bottom = bounds_by_clip[player.state][sample.index].end.y
	if player.grounded:
		ground_checks += 1
		if sprite_current_bottom != 96 or player.position.y != 160:
			ground_failures += 1
			if ground_failure_samples.size() < 16:
				ground_failure_samples.append({"tick":tick,"state":player.state,"frame":sample.index,
					"feetY":player.position.y,"floorY":160,"opaqueBottom":sprite_current_bottom})
	for clip in manifest.clips:
		var preview: Dictionary = gallery[clip].sample(clip,tick)
		seen_frames[clip][str(preview.index)] = true
	queue_redraw()
	phase_tick += 1
	if phase_tick == 30 and desired in ["walk","attack","levitate","death"]:
		_capture(desired)
	var phase_length: int = 90 if desired == "death" else 45 if desired in ["walk","run"] else 60
	if phase_tick >= phase_length:
		phase += 1
		phase_tick = 0
		if phase == ORDER.size():
			ending = true
			_finish()

func _capture(label: String) -> void:
	await RenderingServer.frame_post_draw
	var path: String = output.path_join("animation-"+label+".png")
	assert(get_viewport().get_texture().get_image().save_png(path) == OK)
	captures.append(path)

func _finish() -> void:
	await RenderingServer.frame_post_draw
	checks.every_physics_state = ORDER.all(func(state): return seen_states.has(state))
	checks.every_source_frame = manifest.clips.keys().all(func(clip): return seen_frames[clip].size() == int(manifest.clips[clip].frames))
	checks.planted_boot_contact = ground_checks > 300 and ground_failures == 0
	checks.real_projectile_windups = shots == 3 and spawned == 3
	checks.hit_and_death = player.hp == 0 and player.state == "death" and player.damage_events.size() == 2
	checks.death_terminal_frame = sample.index == 11 and sample.elapsed >= 60
	checks.airborne_clearance = seen_states.has("jump") and seen_states.has("levitate")
	var report := {"ticks":tick,"candidate":candidate,"checks":checks,"groundChecks":ground_checks,"groundFailures":ground_failures,
		"groundFailureSamples":ground_failure_samples,"backgroundSha256":FileAccess.get_sha256(background),
		"states":seen_states.keys(),"frames":seen_frames,"shots":shots,"captures":captures,
		"renderDevice":RenderingServer.get_video_adapter_name(),"sourceScriptSha256":FileAccess.get_sha256("res://scripts/DiverAnimationReview.gd"),
		"scope":"Actual native original Diver clip playback with real movement, jump/levitation/dash, Photon windups and damage events. Not full matching cast, weapon aim polish, final visual approval or app generation."}
	var file := FileAccess.open(output.path_join("animation-result.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"))
	print("QUANTUM_DIVER_ANIMATION_REVIEW " + JSON.stringify(report))
	get_tree().quit(0 if not checks.values().has(false) else 1)

func _label(at: Vector2, value: String, size: int = 12, color: Color = Color("bdd5e3")) -> void:
	draw_string(ThemeDB.fallback_font,at,value,HORIZONTAL_ALIGNMENT_LEFT,-1,size,color)

func _sprite(clip: String, index: int, feet: Vector2, facing: int = 1) -> void:
	var at: Vector2 = feet-Vector2(32,96)
	var dimensions := Vector2(64,96)
	if facing < 0:
		at.x += 64
		dimensions.x = -64
	draw_texture_rect_region(textures[clip],Rect2(at,dimensions),Rect2(index*64,0,64,96))

func _draw() -> void:
	if textures.is_empty(): return
	draw_rect(Rect2(0,0,960,600),Color("080f1b"))
	_label(Vector2(24,32),"QUANTUM DIVERGENCE / ORIGINAL ANIMATION TEST",21)
	_label(Vector2(24,61),"One articulated source / crisp pixels / shared feet and camera",13,Color("73dedb"))
	draw_rect(Rect2(16,96,608,372),Color("111f31"))
	draw_texture_rect_region(wall,Rect2(16,108,608,304),Rect2(0,0,304,152))
	draw_rect(Rect2(16,412,608,56),Color("2a4054"))
	draw_line(Vector2(16,412),Vector2(624,412),Color("9dafbe"),2)
	for x in range(16,624,32): draw_line(Vector2(x,416),Vector2(x,468),Color("1b2a3b"),2)
	var feet: Vector2 = Vector2(16,92)+player.position*2
	_sprite(player.state,sample.index,feet,player.facing)
	for projectile in instruments.projectiles:
		var at: Vector2 = Vector2(16,92)+Vector2(projectile.position)*2
		draw_circle(at,6,Color("13565e"))
		draw_circle(at,2,Color("9ffaf0"))
	_label(Vector2(26,120),"REAL PLAYER STATE: "+player.state.to_upper(),12)
	_label(Vector2(26,450),"FLOOR CONTACT CHECKS: %d / FAILURES: %d" % [ground_checks,ground_failures],11)
	for row in 3:
		for column in 3:
			var clip: String = ["idle","walk","run","attack","hit","death","jump","levitate","dash"][row*3+column]
			var at := Vector2(652+column*94,102+row*132)
			draw_rect(Rect2(at,Vector2(90,128)),Color("132136"))
			_label(at+Vector2(6,17),clip.to_upper(),10,Color("7cc8d5"))
			_sprite(clip,gallery[clip].current_index,at+Vector2(44,118))
			draw_line(at+Vector2(6,118),at+Vector2(84,118),Color("557085"),1)
	_label(Vector2(24,514),"61 distinct source frames across all nine states. One-shot death holds its final pose.",13)
	_label(Vector2(24,544),"Movement, attacks and damage use the real simulation; this is a separate art test.",12)
	_label(Vector2(24,574),"The matching enemy/boss cast and full-world visual admission are still pending.",12,Color("819cb5"))
