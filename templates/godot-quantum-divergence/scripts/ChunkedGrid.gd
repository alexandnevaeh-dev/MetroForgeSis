extends "res://scripts/MicrocellGrid.gd"
## Dense bounded storage, sparse active computation. Sleeping chunks retain matter/heat.
## Global ticks expire collapse; inactive materials otherwise freeze until reactivated.
const CHUNK_CELLS: int = 32
const MAX_WORLD_CELLS: int = 2097152
const MAX_ACTIVE_CHUNKS: int = 96
var active_chunks: Dictionary = {}
var dynamic_chunks: Dictionary = {}
var last_work_cells: int = 0
var last_heat_cells: int = 0
var cached_work_key := PackedInt32Array()
var cached_indices := PackedInt32Array()
var cached_rows: Dictionary = {}
var render_revisions: Dictionary = {}
var render_epoch: int = 0

func _dirty(index: int) -> void:
	var chunk: Vector2i = _chunk(index)
	render_revisions[chunk] = int(render_revisions.get(chunk,0)) + 1

func _init(grid_width: int = 1440, grid_height: int = 960, seed_value: int = 42) -> void:
	super(3,3,seed_value)
	assert(grid_width >= 3 and grid_height >= 3 and grid_width * grid_height <= MAX_WORLD_CELLS)
	width = grid_width
	height = grid_height
	var count: int = width * height
	for name in ["cells", "heat", "immutable", "reserved", "actor_occupancy", "ore_origin", "collapse_until"]:
		var values = get(name)
		values.resize(count)
		values.fill(0)
		set(name,values)
	for x in width:
		cells[x] = CellMaterial.SOLID
		immutable[x] = 1
		cells[(height - 1) * width + x] = CellMaterial.SOLID
		immutable[(height - 1) * width + x] = 1
	for y in height:
		cells[y * width] = CellMaterial.SOLID
		immutable[y * width] = 1
		cells[y * width + width - 1] = CellMaterial.SOLID
		immutable[y * width + width - 1] = 1

func _chunk(index: int) -> Vector2i:
	return Vector2i(int((index % width) / CHUNK_CELLS), int(int(index / width) / CHUNK_CELLS))

func set_material(x: int, y: int, material: int, protect: bool = false) -> bool:
	var accepted: bool = super.set_material(x,y,material,protect)
	if accepted:
		_dirty(y * width + x)
	if accepted and material in [CellMaterial.UNSTABLE_ORE,CellMaterial.SAND,CellMaterial.FLUID]:
		dynamic_chunks[_chunk(y * width + x)] = true
	return accepted

func add_heat(x: int, y: int, amount: float) -> bool:
	var accepted: bool = super.add_heat(x,y,amount)
	if accepted and heat[y * width + x] > 0.0:
		dynamic_chunks[_chunk(y * width + x)] = true
		_dirty(y * width + x)
	return accepted

func collapse_rect(rect: Rect2i) -> int:
	var changed: int = super.collapse_rect(rect)
	if changed > 0:
		var first := Vector2i(int(maxi(0,rect.position.x) / CHUNK_CELLS),int(maxi(0,rect.position.y) / CHUNK_CELLS))
		var last := Vector2i(int(mini(width - 1,rect.end.x - 1) / CHUNK_CELLS),int(mini(height - 1,rect.end.y - 1) / CHUNK_CELLS))
		for y in range(first.y,last.y + 1):
			for x in range(first.x,last.x + 1):
				var chunk := Vector2i(x,y)
				render_revisions[chunk] = int(render_revisions.get(chunk,0)) + 1
	return changed

func set_active_regions(regions: Array) -> bool:
	if regions.is_empty() or regions.size() > 65:
		return false
	var candidate: Dictionary = {}
	var limit: Vector2i = Vector2i(ceili(float(width) / CHUNK_CELLS), ceili(float(height) / CHUNK_CELLS))
	for rect in regions:
		if typeof(rect) != TYPE_RECT2I or rect.size.x <= 0 or rect.size.y <= 0 or rect.position.x < 0 or rect.position.y < 0 or rect.end.x > width or rect.end.y > height:
			return false
		var first := Vector2i(int(rect.position.x / CHUNK_CELLS),int(rect.position.y / CHUNK_CELLS)) - Vector2i.ONE
		var last := Vector2i(int((rect.end.x - 1) / CHUNK_CELLS),int((rect.end.y - 1) / CHUNK_CELLS)) + Vector2i.ONE
		for y in range(maxi(0,first.y),mini(limit.y,last.y + 1)):
			for x in range(maxi(0,first.x),mini(limit.x,last.x + 1)):
				candidate[Vector2i(x,y)] = true
	if candidate.size() > MAX_ACTIVE_CHUNKS:
		return false
	active_chunks = candidate
	return true

func _can_enter(index: int) -> bool:
	return active_chunks.has(_chunk(index)) and super._can_enter(index)

func is_rect_awake(rect: Rect2) -> bool:
	var first := Vector2i(floor(rect.position / (CHUNK_CELLS * CELL_PX)))
	var last := Vector2i(ceil(rect.end / (CHUNK_CELLS * CELL_PX))) - Vector2i.ONE
	for y in range(first.y,last.y + 1):
		for x in range(first.x,last.x + 1):
			if active_chunks.has(Vector2i(x,y)):
				return true
	return false

func _move_cell(from_index: int, to_index: int, moved: Dictionary) -> void:
	cells[to_index] = cells[from_index]
	cells[from_index] = CellMaterial.EMPTY
	var previous_heat: float = heat[to_index]
	heat[to_index] = heat[from_index]
	heat[from_index] = previous_heat
	moved[from_index] = true
	moved[to_index] = true
	dynamic_chunks[_chunk(to_index)] = true
	_dirty(from_index)
	_dirty(to_index)

func _indices() -> PackedInt32Array:
	var working: Dictionary = {}
	for chunk in dynamic_chunks:
		if not active_chunks.has(chunk):
			continue
		# A one-chunk work halo allows material and heat to cross awake chunk seams.
		for y in range(chunk.y - 1,chunk.y + 2):
			for x in range(chunk.x - 1,chunk.x + 2):
				var neighbor := Vector2i(x,y)
				if active_chunks.has(neighbor):
					working[neighbor] = true
	var result := PackedInt32Array()
	var work_key := PackedInt32Array()
	var columns: int = ceili(float(width) / CHUNK_CELLS)
	for chunk in working:
		work_key.append(chunk.y * columns + chunk.x)
	work_key.sort()
	if work_key == cached_work_key:
		return cached_indices
	for chunk in working:
		for y in range(maxi(1,chunk.y * CHUNK_CELLS),mini(height - 1,(chunk.y + 1) * CHUNK_CELLS)):
			for x in range(maxi(1,chunk.x * CHUNK_CELLS),mini(width - 1,(chunk.x + 1) * CHUNK_CELLS)):
				result.append(y * width + x)
	result.sort()
	cached_work_key = work_key
	cached_indices = result
	cached_rows.clear()
	for index in result:
		var y: int = int(index / width)
		if not cached_rows.has(y):
			cached_rows[y] = PackedInt32Array()
		cached_rows[y].append(index)
	return result

func step() -> void:
	tick += 1
	collapsed_this_tick = 0
	var indices: PackedInt32Array = _indices()
	last_work_cells = indices.size()
	var p_tick: float = 1.0 - pow(1.0 - flicker_probability_per_second,1.0 / TICK_HZ)
	var regional: Array[Dictionary] = []
	for region in flicker_regions.values():
		regional.append({"rect":region.rect,"p":1.0 - pow(1.0 - float(region.probability),1.0 / TICK_HZ)})
	for index in indices:
		if immutable[index] != 0 or collapse_until[index] > tick:
			continue
		var before: int = cells[index]
		if collapse_until[index] != 0:
			collapse_until[index] = 0
			cells[index] = CellMaterial.UNSTABLE_ORE
		if ore_origin[index] != 0 and reserved[index] == 0 and actor_occupancy[index] == 0 and cells[index] in [CellMaterial.UNSTABLE_ORE,CellMaterial.EMPTY]:
			var probability: float = p_tick
			var point := Vector2i(index % width,int(index / width))
			for region in regional:
				if region.rect.has_point(point):
					probability = region.p
					break
			if _noise(index) < probability:
				cells[index] = CellMaterial.EMPTY if cells[index] == CellMaterial.UNSTABLE_ORE else CellMaterial.UNSTABLE_ORE
				flicker_events += 1
		if cells[index] in [CellMaterial.SOLID,CellMaterial.UNSTABLE_ORE] and heat[index] >= 0.8:
			cells[index] = CellMaterial.SAND
			ore_origin[index] = 0
		elif cells[index] == CellMaterial.SAND and heat[index] >= 0.6:
			cells[index] = CellMaterial.FLUID
		elif cells[index] == CellMaterial.FLUID and heat[index] >= 0.9:
			cells[index] = CellMaterial.EMPTY
		if cells[index] != before:
			_dirty(index)
	# Build global row spans so awake computation preserves the reference scan order.
	var ys: Array = cached_rows.keys()
	ys.sort()
	ys.reverse()
	var moved: Dictionary = {}
	for y in ys:
		var row: PackedInt32Array = cached_rows[y]
		if tick % 2 != 0:
			row = row.duplicate()
			row.reverse()
		for index in row:
			if moved.has(index) or immutable[index] != 0 or reserved[index] != 0 or actor_occupancy[index] != 0 or cells[index] not in [CellMaterial.SAND,CellMaterial.FLUID]:
				continue
			var direction: int = -1 if _noise(index) < 0.5 else 1
			var destinations: Array[int] = [index + width,index + width + direction,index + width - direction]
			if cells[index] == CellMaterial.FLUID:
				destinations.append(index + direction)
				destinations.append(index - direction)
			for destination in destinations:
				if _can_enter(destination) and not moved.has(destination):
					_move_cell(index,destination,moved)
					break
	var candidates: Dictionary = {}
	for index in indices:
		if heat[index] <= 0.0:
			continue
		for neighbor in [index,index - 1,index + 1,index - width,index + width]:
			if neighbor >= width and neighbor < cells.size() - width and neighbor % width > 0 and neighbor % width < width - 1 and immutable[neighbor] == 0 and active_chunks.has(_chunk(neighbor)):
				candidates[neighbor] = true
	last_heat_cells = candidates.size()
	var updates: Dictionary = {}
	for index in candidates:
		var diffusion: float = 0.0
		for neighbor in [index - 1,index + 1,index - width,index + width]:
			if immutable[neighbor] == 0 and active_chunks.has(_chunk(neighbor)):
				diffusion += (heat[neighbor] - heat[index]) * 0.1 / TICK_HZ
		updates[index] = clampf(heat[index] + diffusion - 0.02 / TICK_HZ,0.0,1.0)
	for index in updates:
		if heat[index] != updates[index]:
			_dirty(index)
		heat[index] = updates[index]
		if heat[index] > 0.0:
			dynamic_chunks[_chunk(index)] = true
	# Rebuild only awake dynamic metadata; sleeping state remains authoritative.
	var alive: Dictionary = {}
	for index in indices:
		if ore_origin[index] != 0 or heat[index] > 0.0 or cells[index] in [CellMaterial.SAND,CellMaterial.FLUID]:
			alive[_chunk(index)] = true
	for chunk in dynamic_chunks.keys():
		if active_chunks.has(chunk) and not alive.has(chunk):
			dynamic_chunks.erase(chunk)
	dynamic_chunks.merge(alive)

func snapshot() -> Dictionary:
	var state: Dictionary = super.snapshot()
	state.chunk_schema_version = 1
	state.chunk_size = CHUNK_CELLS
	state.active_chunks = active_chunks.keys()
	return state

func restore(state: Dictionary) -> bool:
	if state.get("chunk_schema_version") != 1 or state.get("chunk_size") != CHUNK_CELLS or typeof(state.get("active_chunks")) != TYPE_ARRAY or state.active_chunks.size() > MAX_ACTIVE_CHUNKS:
		return false
	var candidate: Dictionary = {}
	for chunk in state.active_chunks:
		if typeof(chunk) != TYPE_VECTOR2I or chunk.x < 0 or chunk.y < 0 or chunk.x * CHUNK_CELLS >= width or chunk.y * CHUNK_CELLS >= height or candidate.has(chunk):
			return false
		candidate[chunk] = true
	if not super.restore(state):
		return false
	active_chunks = candidate
	render_epoch += 1
	render_revisions.clear()
	dynamic_chunks.clear()
	for index in cells.size():
		if ore_origin[index] != 0 or heat[index] > 0.0 or cells[index] in [CellMaterial.SAND,CellMaterial.FLUID]:
			dynamic_chunks[_chunk(index)] = true
	return true
