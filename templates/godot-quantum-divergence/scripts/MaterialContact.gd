extends RefCounted
## Shared half-open body bounds and exact material faces for grounded and floating actors.
const Grid = preload("res://scripts/MicrocellGrid.gd")

static func solid(material: int) -> bool:
	return material in [Grid.CellMaterial.SOLID, Grid.CellMaterial.UNSTABLE_ORE, Grid.CellMaterial.SAND]

static func cell_rect(body: Rect2) -> Rect2i:
	var first := Vector2i(floor(body.position / Grid.CELL_PX))
	# Half-open bounds work at full-world coordinates without a rounding-sensitive epsilon.
	var last := Vector2i(ceil(body.end / Grid.CELL_PX)) - Vector2i.ONE
	return Rect2i(first, last - first + Vector2i.ONE)

static func blocked(grid, body: Rect2) -> bool:
	var cells: Rect2i = cell_rect(body)
	for y in range(cells.position.y, cells.end.y):
		for x in range(cells.position.x, cells.end.x):
			if solid(grid.material_at(x, y)):
				return true
	return false

static func contact_position(grid, candidate: Vector2, body: Rect2, axis: int, direction: float) -> Vector2:
	var contact: Vector2 = candidate
	var cells: Rect2i = cell_rect(body)
	var leading_offset: float = (body.end[axis] if direction > 0 else body.position[axis]) - candidate[axis]
	for y in range(cells.position.y, cells.end.y):
		for x in range(cells.position.x, cells.end.x):
			if not solid(grid.material_at(x, y)):
				continue
			var face: float = float((x if axis == 0 else y) + (0 if direction > 0 else 1)) * Grid.CELL_PX
			var limit: float = face - leading_offset
			contact[axis] = minf(contact[axis], limit) if direction > 0 else maxf(contact[axis], limit)
	return contact

static func supported(grid, body: Rect2) -> bool:
	var row: int = int(floor(body.end.y / Grid.CELL_PX))
	if body.end.y != float(row * Grid.CELL_PX) or blocked(grid, body):
		return false
	var columns: Rect2i = cell_rect(body)
	for x in range(columns.position.x, columns.end.x):
		if solid(grid.material_at(x, row)):
			return true
	return false
