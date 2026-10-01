extends RefCounted
## Simulation state only; rendering, animation and input never own these arrays.
## Prototype uses a bounded whole grid. Chunk activation is a later milestone.

enum CellMaterial { EMPTY, SOLID, UNSTABLE_ORE, SAND, FLUID }
const CELL_PX: int = 4
const ART_TILE_PX: int = 32
const TICK_HZ: int = 60
const MAX_CELLS: int = 262144
const COLLAPSE_BUDGET: int = 1024 # 16 art tiles, each containing 64 cells.

var width: int
var height: int
var run_seed: int
var tick: int = 0
var cells := PackedByteArray()
var heat := PackedFloat64Array()
var immutable := PackedByteArray()
var reserved := PackedByteArray()
var actor_occupancy := PackedByteArray()
var ore_origin := PackedByteArray()
var collapse_until := PackedInt64Array()
var flicker_probability_per_second: float = 0.20
var collapsed_this_tick: int = 0
var flicker_events: int = 0
var _has_heat: bool = false

func _init(grid_width: int = 64, grid_height: int = 48, seed_value: int = 42) -> void:
	assert(grid_width >= 3 and grid_height >= 3 and grid_width * grid_height <= MAX_CELLS)
	width = grid_width
	height = grid_height
	run_seed = seed_value & 0x7fffffff
	var count: int = width * height
	cells.resize(count)
	heat.resize(count)
	immutable.resize(count)
	reserved.resize(count)
	actor_occupancy.resize(count)
	ore_origin.resize(count)
	collapse_until.resize(count)
	for y in height:
		for x in width:
			if x == 0 or y == 0 or x == width - 1 or y == height - 1:
				var index: int = y * width + x
				cells[index] = CellMaterial.SOLID
				immutable[index] = 1

func in_bounds(x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < width and y < height

func material_at(x: int, y: int) -> int:
	if not in_bounds(x, y):
		return CellMaterial.SOLID
	return cells[y * width + x]

func set_material(x: int, y: int, material: int, protect: bool = false) -> bool:
	if not in_bounds(x, y) or material < CellMaterial.EMPTY or material > CellMaterial.FLUID:
		return false
	var index: int = y * width + x
	if immutable[index] != 0 or reserved[index] != 0 or actor_occupancy[index] != 0:
		return false
	cells[index] = material
	ore_origin[index] = int(material == CellMaterial.UNSTABLE_ORE)
	collapse_until[index] = 0
	immutable[index] = int(protect)
	return true

func add_heat(x: int, y: int, amount: float) -> bool:
	if not in_bounds(x, y) or not is_finite(amount):
		return false
	var index: int = y * width + x
	if immutable[index] != 0:
		return false
	heat[index] = clampf(heat[index] + amount, 0.0, 1.0)
	_has_heat = _has_heat or heat[index] > 0.0
	return true

func reserve_rect(rect: Rect2i, value: bool = true) -> void:
	for y in range(maxi(0, rect.position.y), mini(height, rect.end.y)):
		for x in range(maxi(0, rect.position.x), mini(width, rect.end.x)):
			reserved[y * width + x] = int(value)

func clear_actor_occupancy() -> void:
	actor_occupancy.fill(0)

func occupy_actor(rect: Rect2i) -> void:
	for y in range(maxi(0, rect.position.y), mini(height, rect.end.y)):
		for x in range(maxi(0, rect.position.x), mini(width, rect.end.x)):
			actor_occupancy[y * width + x] = 1

func is_clear(rect: Rect2i) -> bool:
	if rect.size.x <= 0 or rect.size.y <= 0 or rect.position.x < 1 or rect.position.y < 1 or rect.end.x >= width or rect.end.y >= height:
		return false
	for y in range(rect.position.y, rect.end.y):
		for x in range(rect.position.x, rect.end.x):
			if material_at(x, y) != CellMaterial.EMPTY or heat[y * width + x] >= 0.6 or actor_occupancy[y * width + x] != 0:
				return false
	return true

func collapse_rect(rect: Rect2i) -> int:
	var changed: int = 0
	for y in range(maxi(1, rect.position.y), mini(height - 1, rect.end.y)):
		for x in range(maxi(1, rect.position.x), mini(width - 1, rect.end.x)):
			if collapsed_this_tick >= COLLAPSE_BUDGET:
				return changed
			var index: int = y * width + x
			if ore_origin[index] == 0 or immutable[index] != 0 or reserved[index] != 0 or actor_occupancy[index] != 0:
				continue
			cells[index] = CellMaterial.SOLID
			collapse_until[index] = tick + 3 * TICK_HZ
			collapsed_this_tick += 1
			changed += 1
	return changed

func _noise(index: int) -> float:
	var value: int = (run_seed ^ (index * 73856093) ^ (tick * 19349663)) & 0x7fffffff
	value = ((value ^ (value >> 16)) * 1103515245 + 12345) & 0x7fffffff
	value = ((value ^ (value >> 13)) * 1103515245 + 12345) & 0x7fffffff
	return float(value) / 2147483648.0

func _can_enter(index: int) -> bool:
	return cells[index] == CellMaterial.EMPTY and immutable[index] == 0 and reserved[index] == 0 and actor_occupancy[index] == 0

func _move(from_index: int, to_index: int, moved: PackedByteArray) -> void:
	cells[to_index] = cells[from_index]
	cells[from_index] = CellMaterial.EMPTY
	var old_heat: float = heat[to_index]
	heat[to_index] = heat[from_index]
	heat[from_index] = old_heat
	moved[to_index] = 1
	moved[from_index] = 1

func step() -> void:
	tick += 1
	collapsed_this_tick = 0
	# Per-second Bernoulli probability converted to a fixed-tick probability.
	var p_tick: float = 1.0 - pow(1.0 - clampf(flicker_probability_per_second, 0.0, 1.0), 1.0 / TICK_HZ)
	for index in cells.size():
		if immutable[index] != 0:
			continue
		if collapse_until[index] > tick:
			continue
		if collapse_until[index] != 0:
			collapse_until[index] = 0
			cells[index] = CellMaterial.UNSTABLE_ORE
		if ore_origin[index] != 0 and reserved[index] == 0 and actor_occupancy[index] == 0 and (cells[index] == CellMaterial.UNSTABLE_ORE or cells[index] == CellMaterial.EMPTY) and _noise(index) < p_tick:
			cells[index] = CellMaterial.EMPTY if cells[index] == CellMaterial.UNSTABLE_ORE else CellMaterial.UNSTABLE_ORE
			flicker_events += 1
		if (cells[index] == CellMaterial.SOLID or cells[index] == CellMaterial.UNSTABLE_ORE) and heat[index] >= 0.8:
			cells[index] = CellMaterial.SAND
			ore_origin[index] = 0
		elif cells[index] == CellMaterial.SAND and heat[index] >= 0.6:
			cells[index] = CellMaterial.FLUID
		elif cells[index] == CellMaterial.FLUID and heat[index] >= 0.9:
			cells[index] = CellMaterial.EMPTY # Vapor VFX is a renderer event in a later milestone.
	var moved := PackedByteArray()
	moved.resize(cells.size())
	for y in range(height - 2, 0, -1):
		for order_x in range(1, width - 1):
			var x: int = order_x if tick % 2 == 0 else width - 1 - order_x
			var index: int = y * width + x
			if moved[index] != 0 or immutable[index] != 0 or reserved[index] != 0 or actor_occupancy[index] != 0:
				continue
			var material: int = cells[index]
			if material != CellMaterial.SAND and material != CellMaterial.FLUID:
				continue
			var direction: int = -1 if _noise(index) < 0.5 else 1
			var destinations: Array[int] = [index + width, index + width + direction, index + width - direction]
			if material == CellMaterial.FLUID:
				destinations.append(index + direction)
				destinations.append(index - direction)
			for destination in destinations:
				if _can_enter(destination) and moved[destination] == 0:
					_move(index, destination, moved)
					break
	# An all-zero field cannot diffuse or melt matter; skip its scan without changing ticks or rules.
	if not _has_heat:
		return
	# Heat field is double buffered, so scan direction cannot bias diffusion.
	var next_heat := heat.duplicate()
	var remains_hot: bool = false
	for y in range(1, height - 1):
		for x in range(1, width - 1):
			var index: int = y * width + x
			if immutable[index] != 0:
				continue
			var diffusion: float = 0.0
			for neighbor in [index - 1, index + 1, index - width, index + width]:
				if immutable[neighbor] == 0:
					diffusion += (heat[neighbor] - heat[index]) * 0.1 / TICK_HZ
			next_heat[index] = clampf(heat[index] + diffusion - 0.02 / TICK_HZ, 0.0, 1.0)
			remains_hot = remains_hot or next_heat[index] > 0.0
	heat = next_heat
	_has_heat = remains_hot

func snapshot() -> Dictionary:
	return {"schema_version": 1, "width": width, "height": height, "seed": run_seed, "tick": tick,
		"cells": cells.duplicate(), "heat": heat.duplicate(), "immutable": immutable.duplicate(),
		"reserved": reserved.duplicate(), "actor_occupancy": actor_occupancy.duplicate(), "ore_origin": ore_origin.duplicate(), "collapse_until": collapse_until.duplicate(),
		"flicker_probability_per_second": flicker_probability_per_second,
		"collapsed_this_tick": collapsed_this_tick, "flicker_events": flicker_events}

func restore(state: Dictionary) -> bool:
	if state.get("schema_version") != 1 or state.get("width") != width or state.get("height") != height:
		return false
	# Validate all arrays before mutating anything; malformed save data is rejected atomically.
	var expected_types: Dictionary = {"cells": TYPE_PACKED_BYTE_ARRAY, "heat": TYPE_PACKED_FLOAT64_ARRAY,
		"immutable": TYPE_PACKED_BYTE_ARRAY, "reserved": TYPE_PACKED_BYTE_ARRAY, "actor_occupancy": TYPE_PACKED_BYTE_ARRAY,
		"ore_origin": TYPE_PACKED_BYTE_ARRAY, "collapse_until": TYPE_PACKED_INT64_ARRAY}
	for key in expected_types:
		if not state.has(key) or typeof(state[key]) != expected_types[key] or state[key].size() != cells.size():
			return false
	for key in ["seed", "tick", "collapsed_this_tick", "flicker_events"]:
		if not state.has(key) or typeof(state[key]) != TYPE_INT or state[key] < 0:
			return false
	if state.seed > 0x7fffffff or state.tick > 0x7fffffff or state.collapsed_this_tick > COLLAPSE_BUDGET:
		return false
	var probability = state.get("flicker_probability_per_second")
	if (typeof(probability) != TYPE_FLOAT and typeof(probability) != TYPE_INT) or not is_finite(float(probability)) or probability < 0 or probability > 1:
		return false
	var restored_has_heat: bool = false
	for index in cells.size():
		if state.cells[index] > CellMaterial.FLUID or not is_finite(state.heat[index]) or state.heat[index] < 0 or state.heat[index] > 1:
			return false
		restored_has_heat = restored_has_heat or state.heat[index] > 0.0
		if state.immutable[index] > 1 or state.reserved[index] > 1 or state.actor_occupancy[index] > 1 or state.ore_origin[index] > 1 or state.collapse_until[index] < 0:
			return false
		var x: int = index % width
		var y: int = index / width
		if (x == 0 or y == 0 or x == width - 1 or y == height - 1) and (state.immutable[index] != 1 or state.cells[index] != CellMaterial.SOLID):
			return false
	cells = PackedByteArray(state.cells).duplicate()
	heat = PackedFloat64Array(state.heat).duplicate()
	immutable = PackedByteArray(state.immutable).duplicate()
	reserved = PackedByteArray(state.reserved).duplicate()
	actor_occupancy = PackedByteArray(state.actor_occupancy).duplicate()
	ore_origin = PackedByteArray(state.ore_origin).duplicate()
	collapse_until = PackedInt64Array(state.collapse_until).duplicate()
	run_seed = int(state.seed)
	tick = int(state.tick)
	flicker_probability_per_second = float(state.flicker_probability_per_second)
	collapsed_this_tick = int(state.collapsed_this_tick)
	flicker_events = int(state.flicker_events)
	_has_heat = restored_has_heat
	return true

