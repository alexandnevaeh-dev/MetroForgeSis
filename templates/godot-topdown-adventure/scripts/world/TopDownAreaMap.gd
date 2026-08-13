extends Node2D
## Renders a TopDownArea's tile grid (packages/procedural/src/topdown/world.ts) as flat colored
## cells and builds matching real collision from the area's precomputed collision rects — no
## external tileset texture required, so a fresh generation never depends on art that may not
## exist yet. Colors are a deliberate honest placeholder, not a claim of real tile art.

const TILE_COLORS := {
	0: Color(0.29, 0.5, 0.25, 1.0), # grass
	1: Color(0.42, 0.33, 0.22, 1.0), # dirt
	2: Color(0.2, 0.4, 0.65, 1.0), # water
	3: Color(0.22, 0.22, 0.26, 1.0), # wall
}

@export var tiles_json: String = ""
@export var collision_rects_json: String = ""
@export var tile_size: int = 16

var _tiles: Array = []

func _ready() -> void:
	if tiles_json != "":
		var parsed = JSON.parse_string(tiles_json)
		if parsed is Array:
			_tiles = parsed
	_build_collision()
	queue_redraw()

func _draw() -> void:
	for y in range(_tiles.size()):
		var row: Array = _tiles[y]
		for x in range(row.size()):
			var tile_type := int(row[x])
			var color: Color = TILE_COLORS.get(tile_type, TILE_COLORS[0])
			draw_rect(Rect2(x * tile_size, y * tile_size, tile_size, tile_size), color, true)

func _build_collision() -> void:
	if collision_rects_json == "":
		return
	var parsed = JSON.parse_string(collision_rects_json)
	if not (parsed is Array):
		return
	var body := StaticBody2D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	add_child(body)
	for rect in parsed:
		if not (rect is Dictionary):
			continue
		var w: float = float(rect.get("w", 0))
		var h: float = float(rect.get("h", 0))
		if w <= 0.0 or h <= 0.0:
			continue
		var shape := RectangleShape2D.new()
		shape.size = Vector2(w, h)
		var collider := CollisionShape2D.new()
		collider.shape = shape
		collider.position = Vector2(float(rect.get("x", 0)) + w / 2.0, float(rect.get("y", 0)) + h / 2.0)
		body.add_child(collider)
