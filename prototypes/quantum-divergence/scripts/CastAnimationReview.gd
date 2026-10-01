extends Node2D
## Controlled native AI fixtures, with the actual material/player/enemy simulations.
## Stage resets are explicit test setup; this is not a full generated-game playthrough.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const Enemies = preload("res://scripts/EnemySimulation.gd")
const Binding = preload("res://scripts/EnemyClipBinding.gd")
const ClipPlayer = preload("res://scripts/SpriteClipPlayer.gd")
const KINDS: Array[String] = ["skitter","driller","wraith","golem"]
const STAGES: Array[String] = ["idle","walk","fast-action","combat","hit","death"]
const DURATIONS: Array[int] = [60,60,60,300,18,120]
var candidate: String
var output: String
var manifest: Dictionary
var textures: Dictionary = {}
var bounds: Dictionary = {}
var gallery: Dictionary = {}
var seen_frames: Dictionary = {}
var seen_states: Dictionary = {}
var attacks: Dictionary = {}
var impact_checks: Dictionary = {}
var death_holds: Dictionary = {}
var checks: Dictionary = {}
var captures: Array[String] = []
var kind_index: int = 0
var stage_index: int = 0
var stage_tick: int = 0
var tick: int = 0
var grid
var player
var instruments
var enemies
var binding
var actor: Dictionary
var current: Dictionary
var floor_checks: int = 0
var floor_failures: int = 0
var ending: bool = false
var diver: ImageTexture
var event_capture: Dictionary = {}

func _ready() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--candidate="): candidate = argument.trim_prefix("--candidate=")
		if argument.begins_with("--capture-dir="): output = argument.trim_prefix("--capture-dir=")
	assert(candidate.to_lower().begins_with("e:/") and output.to_lower().begins_with("e:/") and not DirAccess.dir_exists_absolute(output))
	assert(DirAccess.make_dir_recursive_absolute(output) == OK)
	manifest = JSON.parse_string(FileAccess.get_file_as_string(candidate.path_join("manifest.json")))
	checks.candidate_scope = manifest.genre == "quantum-divergence" and manifest.candidateOnly and not manifest.productionApproved and not manifest.animationReady and not manifest.completeCast
	var integrity: bool = true
	for relative in manifest.hashes:
		integrity = integrity and FileAccess.get_sha256(candidate.path_join(relative)) == manifest.hashes[relative]
	checks.pack_integrity = integrity
	for kind in KINDS:
		textures[kind] = {}
		bounds[kind] = {}
		gallery[kind] = {}
		seen_frames[kind] = {}
		seen_states[kind] = {}
		attacks[kind] = {}
		impact_checks[kind] = []
		death_holds[kind] = true
		var definition: Dictionary = manifest.actors[kind]
		for clip in definition.clips:
			var entry: Dictionary = definition.clips[clip]
			var image := Image.load_from_file(candidate.path_join(entry.path))
			var size := Vector2i(int(definition.frame[0]),int(definition.frame[1]))
			assert(image != null and image.get_size() == Vector2i(size.x*int(entry.frames),size.y))
			textures[kind][clip] = ImageTexture.create_from_image(image)
			gallery[kind][clip] = ClipPlayer.new(definition.clips)
			seen_frames[kind][clip] = {}
			bounds[kind][clip] = []
			for index in int(entry.frames): bounds[kind][clip].append(image.get_region(Rect2i(index*size.x,0,size.x,size.y)).get_used_rect())
	diver = ImageTexture.create_from_image(Image.load_from_file("res://assets/diver-candidate-v1/idle.png"))
	_setup()

func _setup() -> void:
	var kind: String = KINDS[kind_index]
	var stage: String = STAGES[stage_index]
	grid = Grid.new(250,110,42)
	for y in range(80,110):
		for x in 250: grid.set_material(x,y,Grid.CellMaterial.SOLID,true)
	player = Player.new(grid,Vector2(80,320))
	instruments = Instruments.new(grid)
	enemies = Enemies.new(grid,instruments,player)
	var at := Vector2(502,270 if kind == "wraith" else 320)
	if stage == "idle":
		var left: int = floori((at.x-float(Enemies.DEFINITIONS[kind].size.x)*.5)/4)
		for y in 80: grid.set_material(left-1,y,Grid.CellMaterial.SOLID,true)
	if stage in ["fast-action","combat"]:
		at.x = {"skitter":134.0,"driller":168.0,"wraith":250.0,"golem":300.0}[kind]
		if stage == "fast-action" and kind in ["wraith","golem"]: at.x = 330 if kind == "wraith" else 364
	assert(enemies.add_enemy(kind,1,at))
	actor = enemies.actors[1]
	binding = Binding.new(kind,manifest.actors[kind].clips)
	if stage == "hit": instruments.targets[1].hp -= 1.0
	if stage == "death": instruments.targets[1].hp = 0.0
	current = binding.sample(actor,0)
	event_capture.clear()

func _physics_process(_delta: float) -> void:
	if ending: return
	tick += 1
	if tick > 2600:
		push_error("CAST_REVIEW_TIMEOUT")
		get_tree().quit(1)
		return
	var kind: String = KINDS[kind_index]
	grid.clear_actor_occupancy()
	enemies.occupy_all()
	player.step({})
	grid.occupy_actor(player.cell_rect(player.position))
	grid.step()
	enemies.step()
	instruments.step()
	enemies.synchronize_damage()
	current = binding.sample(actor,enemies.tick)
	seen_states[kind][actor.state] = true
	for event in enemies.events:
		if event.type == "telegraph": attacks[kind][event.attack] = true
		if event.type == "attack_active":
			var correct: bool = true
			if kind == "golem": correct = current.clip == event.attack and current.index == Binding.BOSS_WINDOWS[event.attack][0]
			elif kind == "skitter": correct = current.clip == "run"
			elif kind == "driller": correct = current.clip == "drill"
			elif kind == "wraith": correct = current.clip == "attack" and current.index == 5
			impact_checks[kind].append(correct)
			if STAGES[stage_index] == "combat" and not event_capture.has(event.attack):
				event_capture[event.attack] = true
				_capture("active-"+kind+"-"+event.attack)
	if kind != "wraith":
		floor_checks += 1
		var frame_bounds: Rect2i = bounds[kind][current.clip][current.index]
		if actor.position.y != 320.0 or frame_bounds.end.y != int(manifest.actors[kind].frame[1]): floor_failures += 1
	elif actor.position.y != 270.0:
		checks.wraith_center_preserved = false
	if STAGES[stage_index] == "death" and stage_tick >= 80:
		death_holds[kind] = death_holds[kind] and current.clip == "death" and current.index == int(manifest.actors[kind].clips.death.frames)-1
	for clip in manifest.actors[kind].clips:
		var sample: Dictionary = gallery[kind][clip].sample(clip,stage_tick+_stage_elapsed())
		seen_frames[kind][clip][sample.index] = true
	if STAGES[stage_index] == "walk" and stage_tick == 30: _capture("walk-"+kind)
	if STAGES[stage_index] == "death" and stage_tick == 100: _capture("death-"+kind)
	queue_redraw()
	stage_tick += 1
	if stage_tick >= DURATIONS[stage_index]:
		stage_tick = 0
		stage_index += 1
		if stage_index >= STAGES.size():
			stage_index = 0
			kind_index += 1
		if kind_index >= KINDS.size():
			ending = true
			_finish()
		else: _setup()

func _stage_elapsed() -> int:
	var count: int = 0
	for index in stage_index: count += DURATIONS[index]
	return count

func _capture(name: String) -> void:
	# Capture this state after the draw, before the next physics tick/stage setup.
	queue_redraw()
	await RenderingServer.frame_post_draw
	var path: String = output.path_join(name+".png")
	assert(get_viewport().get_texture().get_image().save_png(path) == OK)
	captures.append(path)

func _draw_sprite(kind: String, clip: String, index: int, at: Vector2, scale_factor: float, facing: int = 1) -> void:
	var data: Dictionary = manifest.actors[kind]
	var size := Vector2(float(data.frame[0]),float(data.frame[1]))
	var pivot := Vector2(float(data.pivot[0]),float(data.pivot[1]))
	draw_set_transform(at,0,Vector2(scale_factor*facing,scale_factor))
	draw_texture_rect_region(textures[kind][clip],Rect2(-pivot,size),Rect2(Vector2(index*size.x,0),size))
	draw_set_transform(Vector2.ZERO)

func _draw() -> void:
	if manifest.is_empty() or current.is_empty(): return
	var kind: String = KINDS[mini(kind_index,KINDS.size()-1)]
	var font := ThemeDB.fallback_font
	draw_rect(Rect2(0,0,960,600),Color("0b1524"))
	draw_string(font,Vector2(24,30),"QUANTUM DIVERGENCE  /  MATCHING CAST REVIEW",HORIZONTAL_ALIGNMENT_LEFT,-1,20,Color("b9d9e5"))
	draw_string(font,Vector2(24,56),kind.to_upper()+"   "+STAGES[stage_index].to_upper()+"   AI: "+str(current.actor_state)+" / "+str(current.phase),HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color("65dedb"))
	draw_string(font,Vector2(24,78),"Controlled fixtures • original rigs • actual AI timing • candidate artwork",HORIZONTAL_ALIGNMENT_LEFT,-1,13,Color("7593ac"))
	for x in range(0,960,64):
		draw_rect(Rect2(x+2,94,60,191),Color("132237"),false,1)
		draw_line(Vector2(x+8,112),Vector2(x+54,112),Color("1a3049"),1)
	draw_rect(Rect2(0,286,960,42),Color("334b62"))
	draw_line(Vector2(0,286),Vector2(960,286),Color("91b9c5"),2)
	var origin := Vector2(480,286)-Vector2(actor.home.x,320)*2
	_draw_sprite(kind,current.clip,current.index,origin+Vector2(actor.position)*2,1,int(actor.facing))
	if actor.phase == "telegraph":
		draw_arc(origin+Vector2(actor.position)*2-Vector2(0,manifest.actors[kind].logicalSize[1]),34,PI,TAU,20,Color("da976d"),2)
	for bolt in enemies.projectiles: draw_circle(origin+Vector2(bolt.position)*2,4,Color("8febf1"))
	draw_texture_rect_region(diver,Rect2(806,190,64,96),Rect2(0,0,64,96))
	draw_string(font,Vector2(770,311),"DIVER SCALE REFERENCE",HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color("b9d9e5"))
	var column: int = 0
	for clip in manifest.actors[kind].clips:
		var at := Vector2(92+(column%5)*177,446+(column/5)*120)
		var sample: Dictionary = gallery[kind][clip].sample(clip,stage_tick+_stage_elapsed())
		draw_rect(Rect2(at-Vector2(72,99),Vector2(151,110)),Color("16283d"),true)
		_draw_sprite(kind,clip,sample.index,at if kind != "wraith" else at-Vector2(0,28),.5)
		draw_string(font,at+Vector2(-65,20),clip+"  "+str(sample.index+1)+"/"+str(manifest.actors[kind].clips[clip].frames),HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color("aacddc"))
		column += 1

func _finish() -> void:
	checks.grounded_contact = floor_checks > 1500 and floor_failures == 0
	if not checks.has("wraith_center_preserved"): checks.wraith_center_preserved = true
	for kind in KINDS:
		var all_states: bool = true
		for state in ["idle","walk","run","attack","hit","death"]: all_states = all_states and seen_states[kind].has(state)
		checks[kind+"_core_states"] = all_states
		var all_frames: bool = true
		for clip in manifest.actors[kind].clips: all_frames = all_frames and seen_frames[kind][clip].size() == int(manifest.actors[kind].clips[clip].frames)
		checks[kind+"_all_source_frames"] = all_frames
		checks[kind+"_active_frame_timing"] = not impact_checks[kind].is_empty() and not impact_checks[kind].has(false)
		checks[kind+"_death_terminal_hold"] = death_holds[kind]
	checks.golem_all_three_attacks = attacks.golem.has("slam") and attacks.golem.has("burst") and attacks.golem.has("roar")
	var ok: bool = not checks.values().has(false)
	var file := FileAccess.open(output.path_join("cast-result.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify({"ok":ok,"checks":checks,"ticks":tick,"floorChecks":floor_checks,"floorFailures":floor_failures,
		"states":seen_states,"attacks":attacks,"impactChecks":impact_checks,"seenFrames":seen_frames,"captures":captures,
		"manifestSha256":FileAccess.get_sha256(candidate.path_join("manifest.json")),"sourceScriptSha256":FileAccess.get_sha256("res://scripts/CastAnimationReview.gd"),
		"renderDevice":RenderingServer.get_video_adapter_name(),"productionApproved":false,"completeCast":false,
		"scope":"Native candidate animation fixtures using actual enemy simulation. Not app generation, full-world artwork, Wraith teleport or final visual approval."},"\t"))
	print("QUANTUM_CAST_REVIEW " + JSON.stringify({"ok":ok,"checks":checks,"ticks":tick,"floorFailures":floor_failures}))
	get_tree().quit(0 if ok else 1)
