extends "res://scripts/MinesArtPlayground.gd"
## Portable generated entry: validates configuration before creating any world state.
var generation_config: Dictionary = {}
var initial_terrain_sha256: String = ""
const WorkbenchProbe = preload("res://scripts/WorkbenchRunDriver.gd")

func _load_generation_config() -> bool:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://quantum_project.json"))
	if not parsed is Dictionary or parsed.size() != 8: return false
	for key in ["version","archetype","biome","candidateOnly","productionApproved","seed","title","prompt"]:
		if not parsed.has(key): return false
	if parsed.version != 1 or parsed.archetype != "QUANTUM_SIMULATION_ROGUELITE": return false
	if parsed.biome != "probability-mines" or parsed.candidateOnly != true or parsed.productionApproved != false: return false
	if typeof(parsed.seed) not in [TYPE_INT,TYPE_FLOAT]: return false
	if parsed.seed != floor(parsed.seed) or parsed.seed < 0 or parsed.seed > 2147483647: return false
	if not parsed.title is String or parsed.title.strip_edges().is_empty() or parsed.title.length() > 80: return false
	for index in parsed.title.length():
		var code: int = parsed.title.unicode_at(index)
		if code < 32 or code == 127: return false
	if not parsed.prompt is String or parsed.prompt.length() > 4000: return false
	generation_config = parsed
	return true

func _world_seed() -> int:
	return int(generation_config.seed)

func _game_title() -> String:
	return generation_config.title.to_upper().left(34)

func _ready() -> void:
	if not _load_generation_config():
		_runtime_failure("Missing or malformed Quantum project configuration")
		return
	if not _package_status().integrity:
		_runtime_failure("Quantum runtime template bytes failed verification")
		return
	super._ready()
	var digest := HashingContext.new()
	digest.start(HashingContext.HASH_SHA256)
	digest.update(grid.cells)
	initial_terrain_sha256 = digest.finish().hex_encode()
	report.scope = "MetroForge-generated local Quantum Probability Mines candidate; native gameplay verification is separate from AI generation and final visual approval"
	if "--generation-layout-only" in OS.get_cmdline_user_args():
		print("QUANTUM_GENERATED_LAYOUT " + JSON.stringify(_world_descriptor()))
		get_tree().quit(0)
	elif "--workbench-probe" in OS.get_cmdline_user_args():
		# Release templates disable external script/path overrides. Keep this QA driver
		# inside the verified package, using only real Controls and normal game inputs.
		add_child(WorkbenchProbe.new(self))

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
	return {"version":1,"seed":int(generation_config.seed),"pixels":manifest.pixels,"initial_terrain_sha256":initial_terrain_sha256,"stations":stations,"package":_package_status(),"worldGraph":{"version":"1","seed":int(generation_config.seed),"nodes":nodes,"edges":edges,"regions":regions}}

func _package_status() -> Dictionary:
	var template = JSON.parse_string(FileAccess.get_file_as_string("res://quantum-template.json"))
	var failures: Array = []
	var hashes: Dictionary = template.get("hashes", {}) if template is Dictionary else {}
	for relative in hashes:
		if FileAccess.get_sha256("res://" + relative) != hashes[relative]: failures.append(relative)
	return {"standalone":OS.has_feature("template"),"release":OS.has_feature("release"),"template_sha256":FileAccess.get_sha256("res://quantum-template.json"),"files":hashes.size(),"integrity":not hashes.is_empty() and failures.is_empty(),"failures":failures}

func _extend_report() -> void:
	super._extend_report()
	report.generation = {"archetype":generation_config.archetype,"title":generation_config.title,"seed":int(generation_config.seed),"configuration_sha256":FileAccess.get_sha256("res://quantum_project.json"),"entry_script_sha256":FileAccess.get_sha256("res://scripts/GeneratedMines.gd"),"initial_terrain_sha256":initial_terrain_sha256,"package":_package_status(),"candidateOnly":true,"productionApproved":false}
