extends "res://scripts/WorldVictoryPlayground.gd"
## Matching art preview on the real full-world loop. No gameplay statistics are changed.
const ArtTerrain = preload("res://scripts/MineArtTerrain.gd")
const ClipPlayer = preload("res://scripts/SpriteClipPlayer.gd")
const EnemyBinding = preload("res://scripts/EnemyClipBinding.gd")
const Contact = preload("res://scripts/MaterialContact.gd")
const KIT := "res://assets/mine-kit-candidate-v1"
const CAST := "res://assets/cast-candidate-v2"
const DIVER := "res://assets/diver-candidate-v1"
const ART_ZOOM: float = 2.0
var kit_manifest: Dictionary
var cast_manifest: Dictionary
var diver_manifest: Dictionary
var kit_textures: Dictionary = {}
var actor_textures: Dictionary = {}
var actor_bounds: Dictionary = {}
var enemy_bindings: Dictionary = {}
var enemy_samples: Dictionary = {}
var diver_player
var diver_sample: Dictionary
var art_terrain
var art_ready: bool = false
var actor_states_seen: Dictionary = {}
var player_states_seen: Dictionary = {}
var floor_checks: int = 0
var floor_failures: int = 0
var prop_checks: int = 0
var prop_failures: int = 0
var art_integrity: bool = true
var presented_regions: Dictionary = {}
var additional_captures: Dictionary = {}

func _art_origin() -> Vector2:
	# Zoom presentation only. The existing simulation/awake regions and combat clocks stay intact.
	return camera_origin+Vector2(VIEW.size.x*.25,160)

func screen_to_world(point: Vector2) -> Vector2:
	return (point-VIEW.position)/ART_ZOOM+_art_origin()

func world_to_screen(point: Vector2) -> Vector2:
	return VIEW.position+(point-_art_origin())*ART_ZOOM

func _aim_for_user(muzzle: Vector2) -> Vector2:
	return screen_to_world(get_global_mouse_position())-muzzle

func _ready() -> void:
	art_ready = false
	super._ready()
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	kit_manifest = _load_manifest(KIT)
	cast_manifest = _load_manifest(CAST)
	diver_manifest = _load_manifest(DIVER)
	assert(kit_manifest.genre == "quantum-divergence" and kit_manifest.candidateOnly and not kit_manifest.productionApproved)
	assert(cast_manifest.candidateOnly and not cast_manifest.productionApproved and diver_manifest.candidateOnly and not diver_manifest.productionApproved)
	var tiles: Dictionary = {}
	for name in kit_manifest.assets:
		var image := Image.load_from_file(KIT.path_join(kit_manifest.assets[name].path))
		assert(image != null)
		kit_textures[name] = ImageTexture.create_from_image(image)
		if name in ["bedrock-a","bedrock-b","catwalk","ore","sand","fluid"]:
			var logical := image.duplicate()
			logical.resize(32,32,Image.INTERPOLATE_NEAREST)
			tiles[name] = logical
	actor_textures.clear()
	actor_bounds.clear()
	_load_actor("diver",DIVER,diver_manifest)
	for kind in cast_manifest.actors: _load_actor(kind,CAST,cast_manifest.actors[kind])
	enemy_bindings.clear()
	enemy_samples.clear()
	for actor in enemies.actors.values(): enemy_bindings[actor.id] = EnemyBinding.new(actor.kind,cast_manifest.actors[actor.kind].clips)
	diver_player = ClipPlayer.new(diver_manifest.clips)
	diver_sample = diver_player.sample("idle",player.tick)
	art_terrain = ArtTerrain.new(grid,tiles)
	terrain_chunks.clear()
	art_ready = true
	_update_texture()
	_check_props()
	report.scope = "Matching original Probability Mines art candidate on the complete normal-input world route; not MetroForge app generation, final visual approval, finished weapon aim or durable full-world saves"
	notice = "Stabilize the mine, discover the survey blueprint and reach the Quantum Lift."

func _load_manifest(directory: String) -> Dictionary:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(directory.path_join("manifest.json")))
	for path in data.hashes: art_integrity = art_integrity and FileAccess.get_sha256(directory.path_join(path)) == data.hashes[path]
	return data

func _load_actor(kind: String, directory: String, data: Dictionary) -> void:
	actor_textures[kind] = {}
	actor_bounds[kind] = {}
	var size := Vector2i(int(data.frame[0]),int(data.frame[1]))
	for clip in data.clips:
		var image := Image.load_from_file(directory.path_join(data.clips[clip].path))
		assert(image != null and image.get_size() == Vector2i(size.x*int(data.clips[clip].frames),size.y))
		actor_textures[kind][clip] = ImageTexture.create_from_image(image)
		actor_bounds[kind][clip] = []
		for index in int(data.clips[clip].frames): actor_bounds[kind][clip].append(image.get_region(Rect2i(index*size.x,0,size.x,size.y)).get_used_rect())

func _input(event: InputEvent) -> void:
	super._input(event)
	queue_redraw()

func _update_texture() -> void:
	if not art_ready: return
	visible_chunks.clear()
	var first := Vector2i(camera_origin/128)
	var last := Vector2i(ceil((camera_origin+VIEW.size)/128))-Vector2i.ONE
	for y in range(first.y,last.y+1):
		for x in range(first.x,last.x+1):
			var chunk := Vector2i(x,y)
			visible_chunks.append(chunk)
			var revisions: Array = art_terrain.revisions(chunk)
			if not terrain_chunks.has(chunk) or terrain_chunks[chunk].revisions != revisions:
				terrain_chunks[chunk] = {"texture":ImageTexture.create_from_image(art_terrain.raster(chunk)),"revisions":revisions}
	# Camera history cannot retain every full-size raster indefinitely.
	for chunk in terrain_chunks.keys():
		if not visible_chunks.has(chunk): terrain_chunks.erase(chunk)

func _after_simulation(input: Dictionary) -> void:
	super._after_simulation(input)
	if not art_ready: return
	var event_id: int = player.attack_until if player.state == "attack" else -1
	diver_sample = diver_player.sample(player.state,player.tick,event_id, int(Instruments.DEFINITIONS[selected].windup)+6 if player.state == "attack" else -1)
	player_states_seen[player.state] = true
	if player.grounded and player.state not in ["jump","levitate"]:
		floor_checks += 1
		var bounds: Rect2i = actor_bounds.diver[diver_sample.state][diver_sample.index]
		if bounds.end.y != 96 or not Contact.supported(grid,player.body_rect(player.position)): floor_failures += 1
	for actor in enemies.actors.values():
		enemy_samples[actor.id] = enemy_bindings[actor.id].sample(actor,enemies.tick)
		if not actor_states_seen.has(actor.kind): actor_states_seen[actor.kind] = {}
		actor_states_seen[actor.kind][actor.state] = true
		if actor.kind != "wraith" and Contact.supported(grid,enemies.body_rect(actor,actor.position)):
			floor_checks += 1
			var sample: Dictionary = enemy_samples[actor.id]
			var bounds: Rect2i = actor_bounds[actor.kind][sample.clip][sample.index]
			if bounds.end.y != int(cast_manifest.actors[actor.kind].frame[1]): floor_failures += 1
	if smoke_test and capture_dir != "":
		var region: String = MineWorld.region_at(player.position)
		if not presented_regions.has(region):
			presented_regions[region] = simulation_tick
			additional_captures["region:"+region] = simulation_tick
			captured[simulation_tick] = true
			_capture(simulation_tick)
		for event in enemies.events:
			if event.type == "attack_active" and not additional_captures.has("attack:"+str(event.id)+":"+event.attack):
				additional_captures["attack:"+str(event.id)+":"+event.attack] = simulation_tick
				captured[simulation_tick] = true
				_capture(simulation_tick)
			if event.type == "enemy_death":
				additional_captures["death:"+str(event.id)] = simulation_tick+65
		for name in additional_captures:
			if name.begins_with("death:") and int(additional_captures[name]) == simulation_tick and not captured.has(simulation_tick):
				captured[simulation_tick] = true
				_capture(simulation_tick)

func _check_props() -> void:
	for at in manifest.stations:
		var name: String = _station_asset(at)
		var data: Dictionary = kit_manifest.assets[name]
		var width: int = int(data.bounds[2]/2)
		var left: int = floori(at.x-float(data.pivot[0])/2+float(data.bounds[0])/2)
		for x in range(left,left+width):
			prop_checks += 1
			if not Contact.solid(grid.material_at(floori(float(x)/4),floori(at.y/4))): prop_failures += 1

func _station_asset(at: Vector2) -> String:
	if at == manifest.layout.anchor: return "anchor"
	if at == manifest.layout.core: return "core"
	if at == manifest.layout.exit: return "lift"
	return "station"

func _extend_report() -> void:
	super._extend_report()
	report.art = {"candidateOnly":true,"productionApproved":false,"integrity":art_integrity,
		"kitManifestSha256":FileAccess.get_sha256(KIT.path_join("manifest.json")),"castManifestSha256":FileAccess.get_sha256(CAST.path_join("manifest.json")),
		"diverManifestSha256":FileAccess.get_sha256(DIVER.path_join("manifest.json")),"floorChecks":floor_checks,"floorFailures":floor_failures,
		"propChecks":prop_checks,"propFailures":prop_failures,"playerStates":player_states_seen,"actorStates":actor_states_seen,
		"regions":presented_regions,"additionalCaptures":additional_captures,"maxSwatches":art_terrain.swatches.size(),"maxTerrainTextures":terrain_chunks.size()}

func _test_passed() -> bool:
	return super._test_passed() and art_integrity and floor_checks > 10000 and floor_failures == 0 and prop_checks > 300 and prop_failures == 0

func _draw_asset(name: String, at: Vector2, tint: Color = Color.WHITE) -> void:
	var data: Dictionary = kit_manifest.assets[name]
	var size := Vector2(float(data.logicalSize[0]),float(data.logicalSize[1]))
	var pivot := Vector2(float(data.pivot[0]),float(data.pivot[1]))*.5
	draw_texture_rect(kit_textures[name],Rect2(at-pivot,size),false,tint)

func _draw_sprite(kind: String, clip: String, index: int, at: Vector2, facing: int) -> void:
	var data: Dictionary = diver_manifest if kind == "diver" else cast_manifest.actors[kind]
	var size := Vector2(float(data.frame[0]),float(data.frame[1]))
	var pivot := Vector2(float(data.pivot[0]),float(data.pivot[1]))
	draw_set_transform(world_to_screen(at),0,Vector2(.5*facing*ART_ZOOM,.5*ART_ZOOM))
	draw_texture_rect_region(actor_textures[kind][clip],Rect2(-pivot,size),Rect2(Vector2(index*size.x,0),size))
	draw_set_transform(VIEW.position-_art_origin()*ART_ZOOM,0,Vector2.ONE*ART_ZOOM)

func _background() -> void:
	var view := Rect2(_art_origin(),VIEW.size/ART_ZOOM)
	draw_rect(view,Color("0c1627"))
	var first := Vector2i(floor(view.position/Vector2(128,96)))
	var last := Vector2i(ceil(view.end/Vector2(128,96)))
	for y in range(first.y,last.y+1):
		for x in range(first.x,last.x+1):
			var name: String = "wall-b" if (x+y)%4 == 0 else "wall-a"
			draw_texture_rect(kit_textures[name],Rect2(Vector2(x*128,y*96),Vector2(128,96)),false,Color(.46,.52,.65))
	for room in manifest.rooms:
		var rect := Rect2(Vector2(room.tiles.position)*32,Vector2(room.tiles.size)*32)
		if not rect.intersects(view): continue
		var floor_y: float = rect.end.y-32
		for x in range(int(rect.position.x)+96,int(rect.end.x)-64,192):
			for height in [0,128,256,384,512,640,768,896,1024,1152]:
				var at := Vector2(x,floor_y-height)
				if Rect2(at-Vector2(32,128),Vector2(64,128)).intersects(view): _draw_asset("wall-rib",at,Color(.40,.46,.58))
	# Local ambient pools illuminate the same interior walls rather than introducing
	# an unrelated landscape behind the mine. Terrain and actors render afterward.
	for at in manifest.stations:
		if not view.grow(96).has_point(at): continue
		for radius in range(96,4,-4): draw_circle(at-Vector2(0,28),radius,Color(.18,.62,.66,.006))

func _draw() -> void:
	if not art_ready: return
	draw_rect(Rect2(0,0,960,600),Color("0b1523"))
	draw_set_transform(VIEW.position-_art_origin()*ART_ZOOM,0,Vector2.ONE*ART_ZOOM)
	_background()
	for chunk in visible_chunks: draw_texture_rect(terrain_chunks[chunk].texture,Rect2(Vector2(chunk)*128,Vector2(128,128)),false)
	for at in manifest.stations:
		if Rect2(camera_origin-Vector2(96,96),VIEW.size+Vector2(192,192)).has_point(at): _draw_asset(_station_asset(at),at)
	for id in [101,102,103]:
		var target: Dictionary = instruments.targets[id]
		var at := Vector2(target.rect.get_center().x,target.rect.end.y)
		if target.hp > 0: _draw_asset("crystal",at)
		else:
			for side in [-1,1]: draw_polygon(PackedVector2Array([at+Vector2(side*5,0),at+Vector2(side*9,0),at+Vector2(side*7,-3)]),PackedColorArray([Color("755d94")]))
	for actor in enemies.actors.values():
		if not enemy_samples.has(actor.id): continue
		var sample: Dictionary = enemy_samples[actor.id]
		_draw_sprite(actor.kind,sample.clip,sample.index,actor.position,int(actor.facing))
		if actor.phase == "telegraph":
			var rect: Rect2 = enemies.body_rect(actor,actor.position)
			var fraction: float = clampf(float(enemies.tick-int(actor.attack_started))/int(Enemies.ATTACKS[actor.attack].windup),0,1)
			draw_arc(rect.get_center(),rect.size.length()*.55,-PI*.5,-PI*.5+TAU*fraction,24,Color("f4ae75"),1)
	for projectile in instruments.projectiles:
		var color := Color("7ff4ec") if projectile.instrument == "photon" else Color("e5a1f6")
		draw_line(projectile.position-projectile.direction*12,projectile.position,color.darkened(.3),3)
		draw_line(projectile.position-projectile.direction*8,projectile.position,color,1)
		draw_circle(projectile.position,1,Color.WHITE)
	for bolt in enemies.projectiles:
		draw_line(bolt.position-Vector2(bolt.direction)*7,bolt.position,Color("efaa76"),2)
	_draw_sprite("diver",diver_sample.state,diver_sample.index,player.position,player.facing)
	for effect in effects:
		var life: float = minf(1,float(int(effect.until)-simulation_tick)/12)
		draw_arc(effect.position,8+(1-life)*12,0,TAU,12,Color(.50,.93,.95,life),1)
	draw_set_transform(Vector2.ZERO)
	_draw_hud()

func _game_title() -> String:
	return "QUANTUM DIVERGENCE"

func _draw_hud() -> void:
	draw_rect(Rect2(0,0,960,96),Color("0b1523"))
	draw_rect(Rect2(0,528,960,72),Color("0b1523"))
	draw_rect(Rect2(0,96,16,432),Color("0b1523"))
	draw_rect(Rect2(944,96,16,432),Color("0b1523"))
	_text(Vector2(24,29),_game_title(),21,Color("d7e9ec"))
	_text(Vector2(24,51),MineWorld.region_at(player.position).to_upper(),12,Color("819cab"))
	_text(Vector2(24,78),"VITALITY  %d" % player.hp,12,Color("91d6cc"))
	draw_rect(Rect2(134,68,120,6),Color("243348"))
	draw_rect(Rect2(134,68,player.hp*1.2,6),Color("7acbbb"))
	_text(Vector2(292,78),"ENERGY  %d" % instruments.energy,12,Color("8abbd7"))
	draw_rect(Rect2(395,68,120,6),Color("243348"))
	draw_rect(Rect2(395,68,instruments.energy*1.2,6),Color("69b8d7"))
	_text(Vector2(634,29),"PHOTON STABILIZER" if selected == "photon" else "TACHYON SPLITTER",15,Color("82e8da") if selected == "photon" else Color("d9a0ec"))
	_text(Vector2(634,52),"Stabilize the mine • reach the Quantum Lift",11,Color("96aebb"))
	_text(Vector2(24,549),"ANCHOR  "+("STABLE" if progress.anchor_upper else "UNSTABLE")+"     RIFT  %d / 3     CORE  " % progress.crystals_destroyed+("STABLE" if progress.golem_core else "UNSTABLE"),12,Color("92d2c6"))
	_text(Vector2(24,573),"A/D Move   Shift Run   Space Jump/Levitate   Ctrl Dash   Mouse Aim/Fire   Q Swap   R Recall   E Interact",12,Color("aabfc9"))
	_text(Vector2(24,592),"Art preview • progress resets when closed",10,Color("758c9c"))
	if get_tree().paused:
		draw_rect(VIEW,Color(0.02,.04,.08,.75))
		_text(Vector2(330,305),"PAUSED  •  ESC TO CONTINUE",18,Color("d7e9ec"))
	elif player.hp <= 0 or progress.extracted:
		draw_rect(VIEW,Color(0.02,.04,.08,.65))
		_text(Vector2(245,304),"MINE STABILIZED" if progress.extracted else "DIVER LOST",24,Color("aee9d9"))
		_text(Vector2(245,332),"ENTER begins a fresh run",15,Color("d7e9ec"))
