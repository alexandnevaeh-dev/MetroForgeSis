extends RefCounted
## Authored landmarks, deterministic deposits and a protected traversable backbone.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const SIZE := Vector2i(1440,960)
const ROOMS: Array[Dictionary] = [
	{"id":"entry","name":"Diver Arrival","tiles":Rect2i(4,4,48,32)},
	{"id":"upper","name":"Upper Probability Mines","tiles":Rect2i(58,4,48,32)},
	{"id":"rift","name":"Mid Mines Rift","tiles":Rect2i(58,42,48,30)},
	{"id":"survey","name":"Collapsed Survey Tunnel","tiles":Rect2i(4,42,42,28)},
	{"id":"lower","name":"Lower Extraction Works","tiles":Rect2i(4,78,48,32)},
	{"id":"echo","name":"Entanglement Echo Chamber","tiles":Rect2i(112,4,44,28)},
	{"id":"arena","name":"Probability Golem Foundry","tiles":Rect2i(112,60,64,48)},
	{"id":"lift","name":"Quantum Lift","tiles":Rect2i(112,112,40,6)}]
var grid
var tunnel_mask := PackedByteArray()
var floors: Array[Rect2i] = []
var route: Array[Vector2] = []
var branches: Array[Vector2] = []

func _init(material_grid) -> void:
	grid = material_grid
	assert(Vector2i(grid.width,grid.height) == SIZE)
	tunnel_mask.resize(grid.cells.size())

func _carve(rect: Rect2i, tunnel: bool = false) -> void:
	for y in range(maxi(1,rect.position.y),mini(grid.height - 1,rect.end.y)):
		for x in range(maxi(1,rect.position.x),mini(grid.width - 1,rect.end.x)):
			var index: int = y * grid.width + x
			grid.cells[index] = Grid.CellMaterial.EMPTY
			grid.ore_origin[index] = 0
			grid.collapse_until[index] = 0
			if tunnel:
				tunnel_mask[index] = 1

func _cells(rect: Rect2) -> Rect2i:
	var first := Vector2i(floor(rect.position / 4.0))
	var last := Vector2i(ceil(rect.end / 4.0))
	return Rect2i(first,last - first)

func _passage(a: Vector2, b: Vector2) -> void:
	var samples: int = maxi(1,ceili(a.distance_to(b) / 16.0))
	for i in range(samples + 1):
		var at: Vector2 = a.lerp(b,float(i) / samples)
		_carve(_cells(Rect2(at - Vector2(48,112),Vector2(96,120))),true)

func _floor(at: Vector2, span: float = 64.0) -> void:
	floors.append(_cells(Rect2(at - Vector2(span / 2.0,0),Vector2(span,8))))

func _horizontal(a: Vector2, b: Vector2, points: Array[Vector2]) -> void:
	_passage(a,b)
	var steps: int = maxi(1,ceili(absf(b.x - a.x) / 128.0))
	for i in range(1,steps + 1):
		points.append(a.lerp(b,float(i) / steps))
	floors.append(_cells(Rect2(Vector2(minf(a.x,b.x) - 64,a.y),Vector2(absf(b.x - a.x) + 128,8))))

func _vertical(a: Vector2, b: Vector2, points: Array[Vector2], side: float = 1.0) -> void:
	var rising: bool = b.y < a.y
	var distance: float = absf(b.y - a.y)
	var count: int = maxi(1,ceili(distance / (64.0 if rising else 96.0)))
	var previous: Vector2 = a
	for i in range(1,count + 1):
		# Rising steps advance sideways instead of stacking a ceiling over the launch pad.
		var horizontal: float = 128.0 * side * i if rising else (128.0 * side if i % 2 == 1 else 0.0)
		var at := Vector2(a.x + horizontal,snappedf(lerpf(a.y,b.y,float(i) / count),4.0))
		_passage(previous,at)
		_floor(at)
		points.append(at)
		previous = at
	if previous.x != b.x:
		if rising:
			# Preserve side access to the top step; a continuous bridge becomes an impassable ceiling.
			var steps: int = maxi(1,ceili(absf(previous.x - b.x) / 128.0))
			var begin: Vector2 = previous
			for i in range(1,steps + 1):
				var at: Vector2 = begin.lerp(b,float(i) / steps)
				_passage(previous,at)
				_floor(at)
				points.append(at)
				previous = at
		else:
			_horizontal(previous,b,points)

func _join(a: Vector2, b: Vector2, points: Array[Vector2]) -> void:
	if b.y < a.y:
		var side: float = 1.0 if b.x >= a.x else -1.0
		var corner := Vector2(a.x + side * 128.0 * maxi(2,ceili((a.y - b.y) / 64.0)),b.y)
		_vertical(a,corner,points,side)
		_horizontal(corner,b,points)
	else:
		var corner := Vector2(b.x,a.y)
		_horizontal(a,corner,points)
		if a.y != b.y:
			_vertical(corner,b,points,-1.0 if b.x < a.x else 1.0)

func _station(at: Vector2) -> void:
	var clearance: Rect2i = _cells(Rect2(at - Vector2(32,64),Vector2(64,64)))
	for y in range(clearance.position.y,clearance.end.y):
		for x in range(clearance.position.x,clearance.end.x):
			grid.set_material(x,y,Grid.CellMaterial.EMPTY,true)
	grid.reserve_rect(clearance)
	for x in range(int(at.x / 4) - 16,int(at.x / 4) + 16):
		grid.set_material(x,int(at.y / 4),Grid.CellMaterial.SOLID,true)

func build(seed_value: int = 42) -> Dictionary:
	seed_value = seed_value & 0x7fffffff
	grid.run_seed = seed_value
	grid.cells.fill(Grid.CellMaterial.SOLID)
	for room in ROOMS:
		var rect: Rect2i = room.tiles
		_carve(Rect2i((rect.position + Vector2i.ONE) * 8,(rect.size - Vector2i(2,2)) * 8))
	var spawn := Vector2(512,1120)
	var anchor := Vector2(2400,1120)
	var rift := Vector2(2400,2272)
	var lower := Vector2(800,3488)
	var core := Vector2(4500,3424)
	var lift := Vector2(4500,3744)
	route.append(spawn)
	_join(spawn,anchor,route)
	_join(anchor,Vector2(3152,2272),route)
	_join(Vector2(3152,2272),rift,route)
	_join(rift,lower,route)
	_join(lower,core,route)
	_join(core,lift,route)
	var secret := Vector2(512,2208)
	var survey_route: Array[Vector2] = [rift]
	var echo_route: Array[Vector2] = [anchor]
	_join(rift,secret,survey_route)
	_join(anchor,Vector2(4200,992),echo_route)
	branches.append_array(survey_route.slice(1))
	branches.append_array(echo_route.slice(1))
	# Continuous room floors preserve a coherent chamber interior, with actual shaft openings.
	for room in ROOMS:
		var rect: Rect2i = room.tiles
		var floor_y: int = (rect.end.y - 1) * 8
		for y in range(floor_y,floor_y + 8):
			for x in range((rect.position.x + 1) * 8,(rect.end.x - 1) * 8):
				if tunnel_mask[y * grid.width + x] == 0:
					grid.set_material(x,y,Grid.CellMaterial.SOLID,true)
	for rect in floors:
		for y in range(rect.position.y,rect.end.y):
			for x in range(rect.position.x,rect.end.x):
				grid.set_material(x,y,Grid.CellMaterial.SOLID,true)
	for at in [spawn,anchor,rift,lower,core,lift,secret,Vector2(4200,992)]:
		_station(at)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	for room in ROOMS:
		var rect: Rect2i = room.tiles
		for deposit in 8:
			var x: int = rng.randi_range((rect.position.x + 3) * 8,(rect.end.x - 3) * 8)
			var y: int = rng.randi_range((rect.position.y + 3) * 8,(rect.end.y - 5) * 8)
			for dy in range(-2,3):
				for dx in range(-5,6):
					if tunnel_mask[(y + dy) * grid.width + x + dx] == 0 and dx * dx + dy * dy * 4 < 26:
						grid.set_material(x + dx,y + dy,Grid.CellMaterial.UNSTABLE_ORE)
		# Small seeded off-backbone material pockets, never an invisible old collision tilemap.
		if room.id in ["upper","rift","lower","arena"]:
			var x: int = (rect.position.x + 5) * 8
			var y: int = (rect.position.y + 6) * 8
			for dy in range(6):
				for dx in range(12):
					if tunnel_mask[(y + dy) * grid.width + x + dx] == 0:
						grid.set_material(x + dx,y + dy,Grid.CellMaterial.FLUID if room.id in ["rift","arena"] else Grid.CellMaterial.SAND)
	var encounters: Array[Dictionary] = [{"kind":"skitter","id":301,"position":Vector2(1100,1120),"size":Vector2(28,28)},
		{"kind":"wraith","id":302,"position":Vector2(2700,940),"size":Vector2(28,44)},
		{"kind":"driller","id":303,"position":Vector2(2744,2272),"size":Vector2(44,28)},
		{"kind":"golem","id":200,"position":Vector2(4400,3424),"size":Vector2(60,92)}]
	for actor in encounters:
		var at: Vector2 = actor.position
		var body := Rect2(at - Vector2(actor.size.x / 2.0,actor.size.y / 2.0 if actor.kind == "wraith" else actor.size.y),actor.size)
		_carve(_cells(body))
	return {"schema_version":1,"world_id":"probability-mines-world-v1","seed":seed_value,"pixels":[5760,3840],"encounters":encounters,
		"rooms":ROOMS.duplicate(true),"spawn":spawn,"route":route,"branches":branches,
		"branch_routes":{"survey":survey_route,"echo":echo_route},
		"stations":[spawn,anchor,rift,lower,core,lift,secret,Vector2(4200,992)],
		"layout":{"anchor":anchor,"core":core,"exit":lift,"secret":secret,
			"upper_region":Rect2i(58 * 8 + 1,4 * 8 + 1,48 * 8 - 2,32 * 8 - 2),
			"ghost_platforms":[Rect2i(576,488,24,2),Rect2i(624,472,24,2)],"crystals":[101,102,103],"golem":200}}

static func region_at(point: Vector2) -> String:
	for room in ROOMS:
		var rect := Rect2(Vector2(room.tiles.position) * 32.0,Vector2(room.tiles.size) * 32.0)
		if rect.has_point(point):
			return room.name
	return "Connecting Mine Galleries"
