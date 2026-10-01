extends Node2D
## Static art review only. The complete playable cast is promoted as a separate set.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
var grid
var player
var diver: ImageTexture
var wall: ImageTexture
var actor_textures: Dictionary = {}
var manifest: Dictionary
var candidate: String = ""
var output: String = ""
var ticks: int = 0
var checks: Dictionary = {}

func _ready() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--candidate="):
			candidate = argument.trim_prefix("--candidate=")
		if argument.begins_with("--capture-dir="):
			output = argument.trim_prefix("--capture-dir=")
	assert(candidate.to_lower().begins_with("e:/") or candidate.to_lower().begins_with("e:\\"))
	assert(output == "" or output.to_lower().begins_with("e:/") or output.to_lower().begins_with("e:\\"))
	manifest = JSON.parse_string(FileAccess.get_file_as_string(candidate.path_join("manifest.json")))
	assert(manifest.genre == "quantum-divergence" and manifest.candidateOnly and not manifest.animationReady)
	var integrity_valid: bool = true
	for relative_path in manifest.hashes:
		integrity_valid = integrity_valid and FileAccess.get_sha256(candidate.path_join(relative_path)) == manifest.hashes[relative_path]
	checks.pack_integrity = integrity_valid
	var seed := Image.load_from_file(candidate.path_join(manifest.diver.path))
	var background := Image.load_from_file(candidate.path_join(manifest.wall.path))
	assert(seed != null and background != null)
	checks.frame_size = seed.get_size() == Vector2i(32,48)
	# Godot's JSON parser represents numbers as floats; compare numeric pivots.
	checks.foot_anchor = seed.get_used_rect().end.y == 48 and Vector2(manifest.diver.pivot[0],manifest.diver.pivot[1]) == Vector2(16,48)
	checks.alpha_clearance = seed.get_pixel(0,0).a == 0 and seed.get_used_rect().position.y > 0
	checks.single_seed_honest = manifest.diver.uniqueFrames == 1 and not manifest.productionApproved and not manifest.animationReady
	checks.wall_size = background.get_size() == Vector2i(384,192)
	diver = ImageTexture.create_from_image(seed)
	wall = ImageTexture.create_from_image(background)
	var anchors_valid: bool = true
	for kind in manifest.actors:
		var definition: Dictionary = manifest.actors[kind]
		var actor_image := Image.load_from_file(candidate.path_join(definition.path))
		assert(actor_image != null)
		anchors_valid = anchors_valid and actor_image.get_size() == Vector2i(definition.frame[0],definition.frame[1])
		if kind == "wraith":
			anchors_valid = anchors_valid and definition.anchor == "center" and absf(actor_image.get_used_rect().get_center().y - float(definition.pivot[1])) <= 0.5
		else:
			anchors_valid = anchors_valid and definition.anchor == "feet" and actor_image.get_used_rect().end.y == int(definition.pivot[1])
		actor_textures[kind] = ImageTexture.create_from_image(actor_image)
	checks.cast_anchors = anchors_valid
	checks.cast_kept_separate = manifest.genre == "quantum-divergence" and manifest.candidateOnly
	grid = Grid.new(192,128,42)
	for y in range(110,127):
		for x in range(1,191):
			grid.set_material(x,y,Grid.CellMaterial.SOLID,true)
	player = Player.new(grid,Vector2(320,440))
	if output != "":
		DirAccess.make_dir_recursive_absolute(output)

func _physics_process(_delta: float) -> void:
	ticks += 1
	player.step({})
	queue_redraw()
	if output != "" and ticks == 60:
		checks.actual_floor_contact = player.grounded and player.position.y == 440.0 and not player._blocked(player.position)
		checks.rendered_feet_match_physics = player.position.y - 48.0 + diver.get_image().get_used_rect().end.y == player.position.y
		await RenderingServer.frame_post_draw
		var viewport: Image = get_viewport().get_texture().get_image()
		assert(viewport != null and not viewport.is_empty())
		viewport.save_png(output.path_join("art-review.png"))
		var report: Dictionary = {"ticks":ticks,"checks":checks,"candidate":candidate,"feet":[player.position.x,player.position.y],"scope":"Actual native static seed/floor-contact and mine-wall review, not a completed animation set, whole-cast approval or MetroForge app generation"}
		var file := FileAccess.open(output.path_join("art-review-result.json"),FileAccess.WRITE)
		file.store_string(JSON.stringify(report,"\t"))
		print("QUANTUM_ART_REVIEW " + JSON.stringify(report))
		get_tree().quit(0 if not checks.values().has(false) else 1)

func _text(at: Vector2, value: String, size: int, color: Color = Color("c4d9e5")) -> void:
	draw_string(ThemeDB.fallback_font,at,value,HORIZONTAL_ALIGNMENT_LEFT,-1,size,color)

func _draw() -> void:
	if diver == null:
		return
	draw_rect(Rect2(0,0,960,600),Color("090f1a"))
	_text(Vector2(24,33),"QUANTUM DIVERGENCE / NEW ART FOUNDATION",22)
	_text(Vector2(24,61),"Original diver design and a coherent mine interior",13,Color("80cec7"))
	draw_rect(Rect2(16,96,608,400),Color("111d30"))
	# Integer 2x sampling keeps the source pixel grid crisp in this review.
	draw_texture_rect_region(wall,Rect2(16,128,608,304),Rect2(0,0,304,152))
	draw_rect(Rect2(16,440,608,56),Color("253a4d"))
	draw_line(Vector2(16,440),Vector2(624,440),Color("819eaf"),2)
	for x in range(16,624,32):
		draw_line(Vector2(x,444),Vector2(x,496),Color("192c40"),2)
	draw_texture_rect(diver,Rect2(player.position + Vector2(16,0) - Vector2(16,48),Vector2(32,48)),false)
	var locations: Dictionary = {"skitter":Vector2(112,440),"wraith":Vector2(224,392),"driller":Vector2(440,440),"golem":Vector2(548,440)}
	for kind in locations:
		if not actor_textures.has(kind):
			continue
		var definition: Dictionary = manifest.actors[kind]
		var pivot := Vector2(definition.pivot[0],definition.pivot[1])
		var dimensions := Vector2(definition.frame[0],definition.frame[1])
		draw_texture_rect(actor_textures[kind],Rect2(Vector2(locations[kind]) - pivot,dimensions),false)
		_text(Vector2(locations[kind]) - pivot - Vector2(5,8),kind.to_upper(),9,Color("95b5c8"))
	_text(Vector2(24,116),"GAME SCALE / STANDING ON THE ACTUAL FLOOR",11)
	draw_rect(Rect2(648,96,288,416),Color("122134"))
	draw_texture_rect(diver,Rect2(664,128,256,384),false)
	draw_line(Vector2(648,512),Vector2(936,512),Color("819eaf"),2)
	_text(Vector2(654,116),"DESIGN DETAIL / NEAREST PIXELS",11)
	_text(Vector2(24,543),"Static seed review. Matching animation strips and the remaining cast are next.",13)
	_text(Vector2(24,573),"The playable game keeps its existing test set until the new cast is ready together.",12,Color("849bad"))
