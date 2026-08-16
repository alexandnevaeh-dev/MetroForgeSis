extends TileMapLayer

@export var biome_id: String = "biome_0"
@export var room_width: int = 800
@export var room_height: int = 600
@export var tile_size: int = 16
@export var painted_cells_json: String = ""
## JSON array of [start_col, end_col) pairs (end exclusive) the room-assembler carved out as real
## pits — the visual backfill below must not repaint these columns solid or the collision gap
## (a separate StaticBody2D floor split, see room-assembler.ts buildFloorSection) would look filled.
@export var pit_columns_json: String = ""

func _ready() -> void:
	_build_tilemap()
	texture_filter = TEXTURE_FILTER_NEAREST
	z_index = 0

func _build_tilemap() -> void:
	var source_path := "res://assets/tilesets/%s/source.png" % biome_id
	if not ResourceLoader.exists(source_path):
		return

	var texture: Texture2D = load(source_path)
	var atlas := TileSetAtlasSource.new()
	atlas.texture = texture
	atlas.texture_region_size = Vector2i(tile_size, tile_size)

	var cols := int(texture.get_width()) / tile_size
	var rows := int(texture.get_height()) / tile_size
	for y in range(rows):
		for x in range(cols):
			atlas.create_tile(Vector2i(x, y))

	var tile_set := TileSet.new()
	tile_set.add_source(atlas, 0)
	self.tile_set = tile_set
	self.texture_filter = TEXTURE_FILTER_NEAREST

	if painted_cells_json != "":
		var parsed = JSON.parse_string(painted_cells_json)
		if parsed is Array:
			for cell in parsed:
				if cell is Array and cell.size() >= 4:
					set_cell(Vector2i(int(cell[0]), int(cell[1])), 0, Vector2i(int(cell[2]), int(cell[3])))
			_paint_visual_mass()
			return

	var floor_row := int((room_height - 64) / tile_size)
	var floor_tile := Vector2i(0, min(2, rows - 1))
	for x in range(int(room_width / tile_size)):
		set_cell(Vector2i(x, floor_row), 0, floor_tile)

	var wall_tile := Vector2i(0, 0)
	for y in range(floor_row):
		set_cell(Vector2i(0, y), 0, wall_tile)
		set_cell(Vector2i(int(room_width / tile_size) - 1, y), 0, wall_tile)
	_paint_visual_mass()


func _pit_columns() -> Array:
	if pit_columns_json == "":
		return []
	var parsed = JSON.parse_string(pit_columns_json)
	return parsed if parsed is Array else []

func _in_pit(x: int, pits: Array) -> bool:
	for pit in pits:
		if pit is Array and pit.size() >= 2 and x >= int(pit[0]) and x < int(pit[1]):
			return true
	return false

## Extra dado / floor fill so a 32px atlas reads as a real tiled room, not a two-row strip.
func _paint_visual_mass() -> void:
	var cols := int(room_width / float(tile_size))
	var max_rows := int(room_height / float(tile_size))
	var floor_row := int((room_height - tile_size * 2) / float(tile_size))
	var wall_tile := Vector2i(1, 0)
	var top_edge := Vector2i(6, 0)
	var ground := Vector2i(0, 0)
	var bottom_edge := Vector2i(7, 0)
	var dado_start := maxi(2, floor_row - 1)
	var pits := _pit_columns()
	for y in range(dado_start, floor_row):
		for x in range(1, cols - 1):
			if get_cell_source_id(Vector2i(x, y)) == -1:
				set_cell(Vector2i(x, y), 0, top_edge if y == dado_start else wall_tile)
	for extra in range(1, 4):
		var y := floor_row + extra
		if y >= max_rows:
			break
		var coords := ground if extra < 3 else bottom_edge
		for x in range(cols):
			if _in_pit(x, pits):
				continue
			if get_cell_source_id(Vector2i(x, y)) == -1:
				set_cell(Vector2i(x, y), 0, coords)
