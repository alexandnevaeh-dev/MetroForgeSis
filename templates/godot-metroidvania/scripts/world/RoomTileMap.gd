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
	z_index = 5

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
	# TileSet.tile_size defaults to 16×16. Rooms are authored on 32px cells; leaving
	# the default packs the whole layout into a postage stamp in the camera corner.
	tile_set.tile_size = Vector2i(tile_size, tile_size)
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
			call_deferred("_paint_rear_wall")
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
	call_deferred("_paint_rear_wall")


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

## Pack extra earth *below* the walkable floor so a 32px atlas isn't a one-row strip.
## Do not backfill playable air on this (colliding) layer — that hid the sky behind a cream
## wall. Interior mass belongs on RearWall, which has no collision.
func _paint_visual_mass() -> void:
	var cols := int(room_width / float(tile_size))
	var max_rows := int(room_height / float(tile_size))
	var floor_row := int((room_height - tile_size * 2) / float(tile_size))
	var ground := Vector2i(0, 0)
	var bottom_edge := Vector2i(7, 0)
	var pits := _pit_columns()
	for extra in range(1, 2):
		var y := floor_row + extra
		if y >= max_rows:
			break
		var coords := ground if extra < 3 else bottom_edge
		for x in range(cols):
			if _in_pit(x, pits):
				continue
			if get_cell_source_id(Vector2i(x, y)) == -1:
				set_cell(Vector2i(x, y), 0, coords)

## Architecture behind the player on a sibling layer: cornice, lintel, dado, pilasters, and
## night window frames in each bay. Playable air and window openings stay empty so the far
## night plate reads as a hall, not wallpaper.
## Cover-zoom on 4:3 rooms crops the authored ceiling, so the lintel is placed on the first
## on-screen row rather than world row 1.
func _paint_rear_wall() -> void:
	var rear := _ensure_rear_layer()
	var cols := int(room_width / float(tile_size))
	var floor_row := int((room_height - tile_size * 2) / float(tile_size))
	var wall := Vector2i(1, 0)
	var ceiling := Vector2i(2, 0)
	var crop_rows := maxi(0, int((float(room_height) - float(room_width) * 9.0 / 16.0) / float(tile_size)))
	var lintel := maxi(1, crop_rows)
	for x in range(1, cols - 1):
		_rear_cell(rear, x, lintel, ceiling)
		if lintel + 1 < floor_row:
			_rear_cell(rear, x, lintel + 1, ceiling)
	for y in range(maxi(lintel + 2, floor_row - 2), floor_row):
		for x in range(1, cols - 1):
			_rear_cell(rear, x, y, ceiling)
	# Night windows in each bay: frame only. The opening stays empty so FarSky
	# reads as glass, not another wallpapered interior.
	var header := lintel + 2
	var sill := floor_row - 3
	if header + 2 < sill:
		for pier in range(1, cols - 1):
			if pier % 6 != 1:
				continue
			var x0 := pier + 2
			var x1 := mini(pier + 5, cols - 2)
			_paint_window_frame(rear, x0, x1, header, sill, wall, ceiling)
	for x in range(1, cols - 1):
		if x % 6 != 1:
			continue
		for y in range(lintel, floor_row):
			_rear_cell(rear, x, y, wall)
			if x + 1 < cols - 1:
				_rear_cell(rear, x + 1, y, wall)

func _ensure_rear_layer() -> TileMapLayer:
	var parent := get_parent()
	if parent == null:
		return self
	var existing := parent.get_node_or_null("RearWall")
	if existing is TileMapLayer:
		var layered := existing as TileMapLayer
		layered.tile_set = tile_set
		layered.collision_enabled = false
		layered.z_index = -4
		layered.z_as_relative = false
		layered.texture_filter = TEXTURE_FILTER_NEAREST
		return layered
	var rear := TileMapLayer.new()
	rear.name = "RearWall"
	rear.z_index = -4
	rear.z_as_relative = false
	rear.collision_enabled = false
	rear.texture_filter = TEXTURE_FILTER_NEAREST
	rear.modulate = Color(1, 1, 1, 1)
	rear.tile_set = tile_set
	parent.add_child(rear)
	parent.move_child(rear, 0)
	return rear

func _paint_window_frame(
	layer: TileMapLayer,
	x0: int,
	x1: int,
	header: int,
	sill: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	if x1 - x0 < 2:
		return
	for x in range(x0, x1 + 1):
		_rear_cell(layer, x, header, ceiling)
		_rear_cell(layer, x, sill, wall)
	for y in range(header + 1, sill):
		_rear_cell(layer, x0, y, wall)
		_rear_cell(layer, x1, y, wall)
	# Soft arch only when the opening is wide enough that inset caps do not
	# become a second solid header across a two-tile night bay.
	if header + 1 < sill and x1 - x0 >= 4:
		_rear_cell(layer, x0 + 1, header + 1, ceiling)
		_rear_cell(layer, x1 - 1, header + 1, ceiling)


func _rear_cell(layer: TileMapLayer, x: int, y: int, atlas: Vector2i) -> void:
	if get_cell_source_id(Vector2i(x, y)) != -1:
		return
	if layer.get_cell_source_id(Vector2i(x, y)) != -1:
		return
	layer.set_cell(Vector2i(x, y), 0, atlas)
