extends RefCounted
## Feet are the authoritative position; the renderer uses this same bottom-center pivot.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const BODY_SIZE := Vector2(20.0, 40.0)
const WALK_SPEED: float = 160.0
const RUN_SPEED: float = 260.0
const GRAVITY: float = 840.0
var grid
var position: Vector2
var velocity := Vector2.ZERO
var facing: int = 1
var grounded: bool = false
var hp: float = 100.0
var tick: int = 0
var levitation_ticks: int = 90
var dash_until: int = 0
var next_dash: int = 0
var recall_hold: int = 0
var recall_latched: bool = false
var immunity_until: int = 0
var next_heat_damage: int = 0
var stations: Array[Vector2] = []
var recalled_this_tick: bool = false
var state: String = "idle"

func _init(material_grid, start: Vector2) -> void:
	grid = material_grid
	position = start
	register_station(start)

func body_rect(at: Vector2) -> Rect2:
	return Rect2(at - Vector2(BODY_SIZE.x / 2.0, BODY_SIZE.y), BODY_SIZE)

func cell_rect(at: Vector2) -> Rect2i:
	var body: Rect2 = body_rect(at)
	var first: Vector2i = Vector2i(floor(body.position / Grid.CELL_PX))
	var last: Vector2i = Vector2i(floor((body.end - Vector2(0.0001, 0.0001)) / Grid.CELL_PX))
	return Rect2i(first, last - first + Vector2i.ONE)

func _blocked(at: Vector2) -> bool:
	var rect: Rect2i = cell_rect(at)
	for y in range(rect.position.y, rect.end.y):
		for x in range(rect.position.x, rect.end.x):
			var material: int = grid.material_at(x, y)
			if material == Grid.CellMaterial.SOLID or material == Grid.CellMaterial.UNSTABLE_ORE or material == Grid.CellMaterial.SAND:
				return true
	return false

func register_station(at: Vector2) -> bool:
	if not grid.is_clear(cell_rect(at)):
		return false
	if not stations.has(at):
		stations.append(at)
	return true

func recall() -> bool:
	# Newest station first, then older verified anchors including the safe entry.
	for index in range(stations.size() - 1, -1, -1):
		if not grid.is_clear(cell_rect(stations[index])):
			continue
		position = stations[index]
		velocity = Vector2.ZERO
		immunity_until = tick + 30
		recalled_this_tick = true
		return true
	return false

func _move_axis(axis: int, distance: float) -> void:
	var remaining: float = absf(distance)
	var direction: float = signf(distance)
	while remaining > 0.00001:
		var amount: float = minf(1.0, remaining)
		var candidate: Vector2 = position
		candidate[axis] += direction * amount
		if _blocked(candidate):
			velocity[axis] = 0.0
			return
		position = candidate
		remaining -= amount

func step(input: Dictionary) -> void:
	tick += 1
	recalled_this_tick = false
	if hp <= 0:
		state = "death"
		return
	if bool(input.get("recall", false)):
		if not recall_latched:
			recall_hold += 1
			if recall_hold >= 60:
				recall_latched = true
				recall()
	else:
		recall_hold = 0
		recall_latched = false
	grounded = _blocked(position + Vector2(0, 1.0))
	if grounded:
		levitation_ticks = 90
	var movement: float = clampf(float(input.get("move", 0.0)), -1.0, 1.0)
	if movement != 0:
		facing = 1 if movement > 0 else -1
	if bool(input.get("dash", false)) and tick >= next_dash:
		dash_until = tick + 9
		next_dash = tick + 36
	velocity.x = movement * (RUN_SPEED if bool(input.get("run", false)) else WALK_SPEED)
	if tick < dash_until:
		velocity.x = facing * 380.0
	if bool(input.get("jump", false)) and grounded:
		velocity.y = -330.0
		grounded = false
	velocity.y = minf(480.0, velocity.y + GRAVITY / 60.0)
	if bool(input.get("levitate", false)) and levitation_ticks > 0 and not grounded:
		velocity.y = maxf(-190.0, velocity.y - 24.0)
		levitation_ticks -= 1
	_move_axis(0, velocity.x / 60.0)
	_move_axis(1, velocity.y / 60.0)
	grounded = _blocked(position + Vector2(0, 1.0))
	var center_cell: Vector2i = Vector2i(floor((position - Vector2(0, BODY_SIZE.y / 2.0)) / Grid.CELL_PX))
	if grid.in_bounds(center_cell.x, center_cell.y) and grid.heat[center_cell.y * grid.width + center_cell.x] >= 0.6 and tick >= immunity_until and tick >= next_heat_damage:
		hp = maxf(0.0, hp - 5.0)
		next_heat_damage = tick + 30
	state = "idle"
	if hp <= 0:
		state = "death"
	elif tick < dash_until:
		state = "dash"
	elif not grounded:
		state = "levitate" if bool(input.get("levitate", false)) and levitation_ticks > 0 else "jump"
	elif absf(velocity.x) > 0.01:
		state = "run" if bool(input.get("run", false)) else "walk"
