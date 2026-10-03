extends "res://scripts/MinesArtPlayground.gd"
## Portable generated entry: validates configuration before creating any world state.
var generation_config: Dictionary = {}
var initial_terrain_sha256: String = ""

func _load_generation_config() -> void:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://quantum_project.json"))
	assert(parsed is Dictionary, "Missing or malformed Quantum project configuration")
	generation_config = parsed
	assert(generation_config.version == 1 and generation_config.archetype == "QUANTUM_SIMULATION_ROGUELITE")
	assert(generation_config.biome == "probability-mines" and generation_config.candidateOnly and not generation_config.productionApproved)
	assert(generation_config.seed is float or generation_config.seed is int)
	assert(generation_config.seed == floor(generation_config.seed) and generation_config.seed >= 0 and generation_config.seed <= 2147483647)
	assert(generation_config.title is String and not generation_config.title.strip_edges().is_empty())

func _world_seed() -> int:
	_load_generation_config()
	return int(generation_config.seed)

func _game_title() -> String:
	return generation_config.title.to_upper().left(34)

func _ready() -> void:
	super._ready()
	var digest := HashingContext.new()
	digest.start(HashingContext.HASH_SHA256)
	digest.update(grid.cells)
	initial_terrain_sha256 = digest.finish().hex_encode()
	report.scope = "MetroForge-generated local Quantum Probability Mines candidate; native gameplay verification is separate from AI generation and final visual approval"
	if "--generation-layout-only" in OS.get_cmdline_user_args():
		print("QUANTUM_GENERATED_LAYOUT " + JSON.stringify(_world_descriptor()))
		get_tree().quit(0)

func _world_descriptor() -> Dictionary:
	var nodes: Array = []
	var regions: Array = []
	for room in manifest.rooms:
		var rect: Rect2i = room.tiles
		nodes.append({"id":room.id,"type":"region","label":room.name,"metadata":{"biome":"probability-mines","rect_pixels":[rect.position.x*32,rect.position.y*32,rect.size.x*32,rect.size.y*32],"continuous_material_world":true}})
		regions.append({"id":room.id,"name":room.name,"biomeId":"probability-mines","roomIds":[]})
	var edges: Array = []
	var seen: Dictionary = {}
	for path_name in ["main","survey","echo"]:
		var points: Array = manifest.route if path_name == "main" else manifest.branch_routes[path_name]
		var previous: String = ""
		for point in points:
			var current: String = ""
			for room in manifest.rooms:
				if Rect2(Vector2(room.tiles.position)*32,Vector2(room.tiles.size)*32).has_point(point): current = room.id
			if current == "": continue
			if previous != "" and previous != current:
				var key: String = previous+":"+current
				var reverse: String = current+":"+previous
				if not seen.has(key) and not seen.has(reverse):
					seen[key] = true
					edges.append({"id":key,"from":previous,"to":current,"requirements":[],"optional":path_name != "main","bidirectional":true,"metadata":{"source":"authored_physical_backbone","branch":path_name}})
			previous = current
	var stations: Array = []
	for point in manifest.stations: stations.append([point.x,point.y])
	return {"version":1,"seed":int(generation_config.seed),"pixels":manifest.pixels,"initial_terrain_sha256":initial_terrain_sha256,"stations":stations,"worldGraph":{"version":"1","seed":int(generation_config.seed),"nodes":nodes,"edges":edges,"regions":regions}}

func _extend_report() -> void:
	super._extend_report()
	report.generation = {"archetype":generation_config.archetype,"title":generation_config.title,"seed":int(generation_config.seed),"configuration_sha256":FileAccess.get_sha256("res://quantum_project.json"),"entry_script_sha256":FileAccess.get_sha256("res://scripts/GeneratedMines.gd"),"initial_terrain_sha256":initial_terrain_sha256,"candidateOnly":true,"productionApproved":false}
