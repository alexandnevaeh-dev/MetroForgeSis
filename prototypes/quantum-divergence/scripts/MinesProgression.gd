extends RefCounted
## Run progression owns gates; input and presentation cannot mark an objective complete.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const INTERACT_DISTANCE: float = 48.0
var grid
var instruments
var player
var layout: Dictionary = {}
var profile: Dictionary
var configured: bool = false
var anchor_upper: bool = false
var collapse_rift: bool = false
var golem_core: bool = false
var golem_defeated: bool = false
var secret_found: bool = false
var extracted: bool = false
var crystals_destroyed: int = 0
var stabilization_pending: bool = false
var events: Array[Dictionary] = []

func _init(material_grid, instrument_simulation, player_simulation, persistent_profile: Dictionary = {}) -> void:
	grid = material_grid
	instruments = instrument_simulation
	player = player_simulation
	profile = persistent_profile

func _valid_rect(rect: Rect2i) -> bool:
	return rect.size.x > 0 and rect.size.y > 0 and rect.position.x >= 1 and rect.position.y >= 1 and rect.end.x <= grid.width - 1 and rect.end.y <= grid.height - 1

func _point_cells(point: Vector2) -> Rect2i:
	return Rect2i(Vector2i(floor((point - Vector2(12, 24)) / Grid.CELL_PX)), Vector2i(6, 6))

func configure(definition: Dictionary) -> bool:
	if configured:
		return false
	for key in ["anchor", "core", "exit", "secret"]:
		if typeof(definition.get(key)) != TYPE_VECTOR2:
			return false
		var point: Vector2 = definition[key]
		if not is_finite(point.x) or not is_finite(point.y) or not _valid_rect(_point_cells(point)):
			return false
	if typeof(definition.get("upper_region")) != TYPE_RECT2I or not _valid_rect(definition.upper_region):
		return false
	if typeof(definition.get("ghost_platforms")) != TYPE_ARRAY or definition.ghost_platforms.is_empty():
		return false
	var ghost_cells: Dictionary = {}
	for rect in definition.ghost_platforms:
		if typeof(rect) != TYPE_RECT2I or not _valid_rect(rect):
			return false
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				var index: int = y * grid.width + x
				if ghost_cells.has(index) or grid.immutable[index] != 0 or grid.reserved[index] != 0:
					return false
				ghost_cells[index] = true
	if ghost_cells.size() > Grid.COLLAPSE_BUDGET:
		return false
	for key in ["anchor", "core", "exit", "secret"]:
		var volume: Rect2i = _point_cells(definition[key])
		for rect in definition.ghost_platforms:
			if volume.intersects(rect):
				return false
	var ids = definition.get("crystals")
	var boss_id = definition.get("golem")
	if typeof(ids) != TYPE_ARRAY or ids.size() != 3 or typeof(boss_id) != TYPE_INT:
		return false
	var unique: Dictionary = {}
	for id in ids + [boss_id]:
		if typeof(id) != TYPE_INT or unique.has(id) or not instruments.targets.has(id) or instruments.targets[id].hp <= 0:
			return false
		unique[id] = true
	if not grid.set_flicker_region("upper_mines", definition.upper_region, 0.20):
		return false
	# Geometry is reviewed before reserving objective clearance. Never modify occupied cells.
	layout = definition.duplicate(true)
	for key in ["anchor", "core", "exit"]:
		grid.reserve_rect(_point_cells(layout[key]))
	configured = true
	return true

func exit_ready() -> bool:
	return configured and anchor_upper and collapse_rift and golem_core and golem_defeated

func _stabilize_platforms() -> bool:
	# Preflight every cell before committing any platform. Wait until all actors are clear.
	for rect in layout.ghost_platforms:
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				var index: int = y * grid.width + x
				if grid.actor_occupancy[index] != 0 or grid.reserved[index] != 0:
					return false
				if grid.immutable[index] != 0 and grid.cells[index] != Grid.CellMaterial.SOLID:
					return false
	for rect in layout.ghost_platforms:
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				var index: int = y * grid.width + x
				if grid.immutable[index] == 0:
					grid.set_material(x, y, Grid.CellMaterial.SOLID, true)
				grid.heat[index] = 0.0
	return true

func step() -> void:
	events.clear()
	if not configured or extracted:
		return
	crystals_destroyed = 0
	for id in layout.crystals:
		crystals_destroyed += int(instruments.targets[id].hp <= 0)
	golem_defeated = instruments.targets[layout.golem].hp <= 0
	if crystals_destroyed == 3 and not collapse_rift:
		stabilization_pending = not _stabilize_platforms()
		if not stabilization_pending:
			collapse_rift = true
			events.append({"type": "rift_stabilized"})

func interact(id: String) -> Dictionary:
	if not configured or not id in ["anchor", "core", "exit", "secret"]:
		return {"accepted": false, "reason": "unknown_objective"}
	if player.hp <= 0 or extracted:
		return {"accepted": false, "reason": "run_ended"}
	if player.position.distance_to(layout[id]) > INTERACT_DISTANCE:
		return {"accepted": false, "reason": "too_far"}
	if id == "anchor":
		if anchor_upper:
			return {"accepted": false, "reason": "already_complete"}
		if not grid.set_flicker_region("upper_mines", layout.upper_region, 0.10):
			return {"accepted": false, "reason": "region_invalid"}
		anchor_upper = true
	elif id == "core":
		# Query live combat state; a stale UI flag never grants access to the core.
		golem_defeated = instruments.targets[layout.golem].hp <= 0
		if not golem_defeated:
			return {"accepted": false, "reason": "golem_alive"}
		if golem_core:
			return {"accepted": false, "reason": "already_complete"}
		golem_core = true
	elif id == "exit":
		golem_defeated = instruments.targets[layout.golem].hp <= 0
		if not exit_ready():
			return {"accepted": false, "reason": "objectives_incomplete"}
		extracted = true
	elif id == "secret":
		if secret_found:
			return {"accepted": false, "reason": "already_complete"}
		secret_found = true
		var blueprints: Array = profile.get("blueprints", []).duplicate()
		if not blueprints.has("entanglement"):
			blueprints.append("entanglement")
		profile.blueprints = blueprints
		player.hp = minf(100.0, player.hp + 25.0)
	events.append({"type": id + "_completed"})
	return {"accepted": true}

func status() -> Dictionary:
	return {"anchor_upper": anchor_upper, "collapse_rift": collapse_rift, "golem_core": golem_core,
		"golem_defeated": golem_defeated, "crystals_destroyed": crystals_destroyed,
		"stabilization_pending": stabilization_pending, "secret_found": secret_found,
		"exit_ready": exit_ready(), "extracted": extracted}
