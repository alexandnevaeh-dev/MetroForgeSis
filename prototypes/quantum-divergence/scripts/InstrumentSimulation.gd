extends RefCounted
## Fixed-tick instrument rules, independent of input, sprites and scene nodes.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const MAX_SLOTS: int = 64
const MAX_RANGE: float = 640.0
const DEFINITIONS: Dictionary = {
	"photon": {"damage": 12.0, "cost": 4.0, "cooldown": 24, "windup": 6, "life": 36, "speed": 1200.0, "slots": 1},
	"tachyon": {"damage": 8.0, "cost": 6.0, "cooldown": 36, "windup": 9, "life": 48, "speed": 1000.0, "slots": 3}
}
var grid
var tick: int = 0
var energy: float = 100.0
var last_fire: int = -60
var cooldown_until: Dictionary = {"photon": 0, "tachyon": 0}
var pending: Array[Dictionary] = []
var projectiles: Array[Dictionary] = []
var targets: Dictionary = {}
var events: Array[Dictionary] = []
var next_id: int = 1

func _init(material_grid) -> void:
	grid = material_grid

func slot_count() -> int:
	var total: int = 0
	for request in pending:
		total += int(request.slots)
	for projectile in projectiles:
		total += int(projectile.slots)
	return total

func fire(instrument: String, origin: Vector2, direction: Vector2) -> Dictionary:
	if not DEFINITIONS.has(instrument):
		return {"accepted": false, "reason": "unknown_instrument"}
	if not is_finite(origin.x) or not is_finite(origin.y) or not is_finite(direction.x) or not is_finite(direction.y) or direction.length_squared() < 0.000001:
		return {"accepted": false, "reason": "invalid_aim"}
	if not grid.in_bounds(int(floor(origin.x / Grid.CELL_PX)), int(floor(origin.y / Grid.CELL_PX))):
		return {"accepted": false, "reason": "outside_world"}
	var definition: Dictionary = DEFINITIONS[instrument]
	if tick < int(cooldown_until[instrument]):
		return {"accepted": false, "reason": "cooldown"}
	if energy < float(definition.cost):
		return {"accepted": false, "reason": "energy"}
	if slot_count() + int(definition.slots) > MAX_SLOTS:
		return {"accepted": false, "reason": "capacity"}
	var id: int = next_id
	next_id += 1
	# Commit accounting only after all validation succeeds. Reserve child capacity now.
	energy -= float(definition.cost)
	cooldown_until[instrument] = tick + int(definition.cooldown)
	last_fire = tick
	pending.append({"id": id, "instrument": instrument, "origin": origin,
		"direction": direction.normalized(), "spawn_at": tick + int(definition.windup), "slots": int(definition.slots)})
	return {"accepted": true, "id": id}

func add_target(id: int, rect: Rect2, hp: float) -> void:
	targets[id] = {"rect": rect, "hp": hp}

func _segment_hit(start: Vector2, end: Vector2, rect: Rect2) -> float:
	var delta: Vector2 = end - start
	var entry: float = 0.0
	var exit_time: float = 1.0
	for axis in 2:
		if absf(delta[axis]) < 0.000001:
			if start[axis] < rect.position[axis] or start[axis] >= rect.end[axis]:
				return -1.0
		else:
			var a: float = (rect.position[axis] - start[axis]) / delta[axis]
			var b: float = (rect.end[axis] - start[axis]) / delta[axis]
			entry = maxf(entry, minf(a, b))
			exit_time = minf(exit_time, maxf(a, b))
			if entry > exit_time:
				return -1.0
	return entry if entry >= 0.0 and entry <= 1.0 else -1.0

func _sweep_cells(start: Vector2, end: Vector2) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var cell: Vector2i = Vector2i(floor(start / float(Grid.CELL_PX)))
	var delta: Vector2 = end - start
	var sx: int = int(signf(delta.x))
	var sy: int = int(signf(delta.y))
	var tx: float = INF
	var ty: float = INF
	var dx: float = INF
	var dy: float = INF
	if sx != 0:
		tx = ((cell.x + (1 if sx > 0 else 0)) * Grid.CELL_PX - start.x) / delta.x
		dx = Grid.CELL_PX / absf(delta.x)
	if sy != 0:
		ty = ((cell.y + (1 if sy > 0 else 0)) * Grid.CELL_PX - start.y) / delta.y
		dy = Grid.CELL_PX / absf(delta.y)
	result.append({"cell": cell, "t": 0.0})
	# Finite range and fixed speed bound this loop, including exact grid-corner crossings.
	for iteration in 512:
		var crossing: float = minf(tx, ty)
		if crossing > 1.0:
			break
		if is_equal_approx(tx, ty):
			result.append({"cell": cell + Vector2i(sx, 0), "t": crossing})
			result.append({"cell": cell + Vector2i(0, sy), "t": crossing})
			cell += Vector2i(sx, sy)
			tx += dx
			ty += dy
		elif tx < ty:
			cell.x += sx
			tx += dx
		else:
			cell.y += sy
			ty += dy
		result.append({"cell": cell, "t": crossing})
	return result

func _damage(projectile: Dictionary, target_id: int, point: Vector2) -> void:
	var target: Dictionary = targets[target_id]
	target.hp = maxf(0.0, float(target.hp) - float(projectile.damage))
	events.append({"type": "hit", "id": projectile.id, "target": target_id, "position": point, "damage": projectile.damage})

func _advance(projectile: Dictionary, output: Array[Dictionary]) -> void:
	if tick >= int(projectile.expires_at):
		events.append({"type": "expired", "id": projectile.id, "distance": projectile.travelled})
		return
	var distance: float = minf(float(projectile.speed) / 60.0, MAX_RANGE - float(projectile.travelled))
	if distance <= 0.0:
		events.append({"type": "expired", "id": projectile.id, "distance": projectile.travelled})
		return
	var start: Vector2 = projectile.position
	var end: Vector2 = start + Vector2(projectile.direction) * distance
	var nearest_id: int = -1
	var nearest_time: float = INF
	var ids: Array = targets.keys()
	ids.sort()
	for id in ids:
		if targets[id].hp <= 0:
			continue
		var hit_time: float = _segment_hit(start, end, targets[id].rect)
		if hit_time >= 0 and hit_time < nearest_time:
			nearest_time = hit_time
			nearest_id = id
	for entry in _sweep_cells(start, end):
		var cell: Vector2i = entry.cell
		var point: Vector2 = start.lerp(end, float(entry.t))
		if nearest_id != -1 and nearest_time <= float(entry.t):
			_damage(projectile, nearest_id, start.lerp(end, nearest_time))
			return
		if not grid.in_bounds(cell.x, cell.y):
			return
		var index: int = cell.y * grid.width + cell.x
		var material: int = grid.cells[index]
		if grid.immutable[index] != 0 and material != Grid.CellMaterial.EMPTY:
			events.append({"type": "impact", "position": point, "protected": true})
			return
		var low_density: bool = material == Grid.CellMaterial.FLUID or (material == Grid.CellMaterial.EMPTY and grid.ore_origin[index] != 0)
		if projectile.instrument == "tachyon" and not bool(projectile.split_child) and low_density and int(projectile.expires_at) - tick >= 12:
			for angle in [-0.16, 0.0, 0.16]:
				var child: Dictionary = projectile.duplicate(true)
				child.id = next_id
				next_id += 1
				child.position = point
				child.direction = Vector2(projectile.direction).rotated(angle)
				child.travelled = float(projectile.travelled) + distance * float(entry.t)
				child.split_child = true
				child.slots = 1
				output.append(child)
			events.append({"type": "split", "id": projectile.id, "position": point, "children": 3})
			return
		if material == Grid.CellMaterial.SOLID or material == Grid.CellMaterial.UNSTABLE_ORE or material == Grid.CellMaterial.SAND or (projectile.instrument == "photon" and material == Grid.CellMaterial.FLUID):
			if projectile.instrument == "photon":
				if grid.ore_origin[index] != 0:
					grid.collapse_rect(Rect2i(cell - Vector2i(4, 4), Vector2i(8, 8)))
				else:
					grid.add_heat(cell.x, cell.y, 0.95)
				events.append({"type": "impact", "position": point, "protected": false})
			return
	if nearest_id != -1:
		_damage(projectile, nearest_id, start.lerp(end, nearest_time))
		return
	projectile.position = end
	projectile.travelled = minf(MAX_RANGE, float(projectile.travelled) + distance)
	output.append(projectile)

func step() -> void:
	tick += 1
	events.clear()
	if tick - last_fire >= 60:
		energy = minf(100.0, energy + 8.0 / 60.0)
	var waiting: Array[Dictionary] = []
	for request in pending:
		if tick < int(request.spawn_at):
			waiting.append(request)
			continue
		var definition: Dictionary = DEFINITIONS[request.instrument]
		projectiles.append({"id": request.id, "instrument": request.instrument, "position": request.origin,
			"direction": request.direction, "damage": definition.damage, "speed": definition.speed,
			"expires_at": tick + int(definition.life), "travelled": 0.0, "split_child": false, "slots": request.slots})
		events.append({"type": "spawn", "id": request.id, "position": request.origin})
	pending = waiting
	var active: Array[Dictionary] = []
	for projectile in projectiles:
		_advance(projectile, active)
	projectiles = active
	assert(slot_count() <= MAX_SLOTS)
