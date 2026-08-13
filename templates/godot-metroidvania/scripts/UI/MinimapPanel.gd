extends WorldMapPanel
## Compact always-visible corner minimap — reuses WorldMapPanel drawing, auto-scaled to fit.

func _ready() -> void:
	super._ready()
	if not EventBus.room_entered.is_connected(_on_room_entered):
		EventBus.room_entered.connect(_on_room_entered)

func _on_room_entered(_room_id: String) -> void:
	queue_redraw()

func _draw() -> void:
	if MapManager.get_graph().is_empty():
		return

	var positions: Dictionary = MapManager.get_room_positions()
	if positions.is_empty():
		return

	var bounds := Rect2()
	var first := true
	for room_id in positions.keys():
		var pos: Vector2 = positions[room_id]
		var cell := Rect2(pos + Vector2(4, 4), Vector2(20, 20))
		if first:
			bounds = cell
			first = false
		else:
			bounds = bounds.merge(cell)
	bounds = bounds.grow(8)

	var scale_factor := 1.0
	if bounds.size.x > 0.0 and bounds.size.y > 0.0:
		scale_factor = minf(size.x / bounds.size.x, size.y / bounds.size.y)

	var offset := -bounds.position * scale_factor
	if size.x > bounds.size.x * scale_factor:
		offset.x += (size.x - bounds.size.x * scale_factor) * 0.5
	if size.y > bounds.size.y * scale_factor:
		offset.y += (size.y - bounds.size.y * scale_factor) * 0.5

	draw_set_transform(offset, 0.0, Vector2(scale_factor, scale_factor))
	super._draw()
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
