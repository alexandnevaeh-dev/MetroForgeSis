extends TileMapLayer

@export var biome_id: String = "biome_0"
@export var room_width: int = 800
@export var room_height: int = 600
@export var tile_size: int = 16
@export var painted_cells_json: String = ""
@export var room_archetype: String = "combat"
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
	_configure_terrain_set(tile_set, atlas, cols, rows)
	self.tile_set = tile_set
	self.texture_filter = TEXTURE_FILTER_NEAREST

	if painted_cells_json != "":
		var parsed = JSON.parse_string(painted_cells_json)
		if parsed is Array:
			for cell in parsed:
				if cell is Array and cell.size() >= 4:
					var atlas_coords := _variant_coords(int(cell[0]), int(cell[1]), Vector2i(int(cell[2]), int(cell[3])))
					set_cell(Vector2i(int(cell[0]), int(cell[1])), 0, atlas_coords)
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


func _configure_terrain_set(tile_set: TileSet, atlas: TileSetAtlasSource, cols: int, rows: int) -> void:
	tile_set.add_terrain_set()
	tile_set.set_terrain_set_mode(0, TileSet.TERRAIN_MODE_MATCH_SIDES)
	tile_set.add_terrain(0)
	tile_set.set_terrain_name(0, 0, "masonry")
	tile_set.add_terrain(0)
	tile_set.set_terrain_name(0, 1, "platform")
	for y in range(rows):
		for x in range(cols):
			var td := atlas.get_tile_data(Vector2i(x, y), 0)
			if td == null:
				continue
			td.terrain_set = 0
			td.terrain = 1 if (x == 3 and y == 0) or (x <= 1 and y == 2) else 0
			td.set_terrain_peering_bit(TileSet.CELL_NEIGHBOR_RIGHT_SIDE, td.terrain)
			td.set_terrain_peering_bit(TileSet.CELL_NEIGHBOR_LEFT_SIDE, td.terrain)
			td.set_terrain_peering_bit(TileSet.CELL_NEIGHBOR_BOTTOM_SIDE, td.terrain)
			td.set_terrain_peering_bit(TileSet.CELL_NEIGHBOR_TOP_SIDE, td.terrain)


func _variant_coords(cell_x: int, cell_y: int, atlas_coords: Vector2i) -> Vector2i:
	## Seeded wear/moss variants live on atlas rows 3–4. Keep the canonical tile most of the time
	## so rooms do not checkerboard.
	var h: int = hash("%s-%d-%d-%d-%d" % [biome_id, cell_x, cell_y, atlas_coords.x, atlas_coords.y])
	var n: int = posmod(h, 100)
	if n > 88 and atlas_coords.y == 0 and atlas_coords.x <= 3:
		return Vector2i(atlas_coords.x, 3)
	if n > 70 and atlas_coords.y == 0 and atlas_coords.x <= 3:
		return Vector2i(atlas_coords.x, 4)
	return atlas_coords


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
func _arch_rng() -> RandomNumberGenerator:
	var rng := RandomNumberGenerator.new()
	var room_key := get_parent().name if get_parent() else name
	rng.seed = hash("%s-%d-%d" % [str(room_key), room_width, room_height])
	return rng


func _arch_variant() -> int:
	return _arch_rng().randi() % 4


func _paint_visual_mass() -> void:
	var cols := int(room_width / float(tile_size))
	var max_rows := int(room_height / float(tile_size))
	var floor_row := int((room_height - tile_size * 2) / float(tile_size))
	var ground := Vector2i(0, 0)
	var bottom_edge := Vector2i(7, 0)
	var pits := _pit_columns()
	var variant := _arch_variant()
	# Floor mass is the room's silhouette against the camera crop, not a wallpaper.
	var extra_earth := 1 if variant == 0 else (2 if variant == 1 else (1 if variant == 2 else 0))
	if variant == 2:
		ground = Vector2i(3, 0)
		bottom_edge = Vector2i(4, 0)
	for extra in range(1, extra_earth + 1):
		var y := floor_row + extra
		if y >= max_rows:
			break
		var coords := ground if extra < extra_earth else bottom_edge
		for x in range(cols):
			if _in_pit(x, pits):
				continue
			if get_cell_source_id(Vector2i(x, y)) == -1:
				set_cell(Vector2i(x, y), 0, coords)
	if variant == 1:
		for x in range(cols):
			if _in_pit(x, pits):
				continue
			if get_cell_source_id(Vector2i(x, floor_row)) != -1 and x % 3 == 0:
				set_cell(Vector2i(x, floor_row), 0, bottom_edge)

## Architecture behind the player on a sibling layer. Four silhouettes so rooms
## are not copies of the same arcade: night apse, solid gallery, colonnade, ruin.
## Playable air on Ground stays empty. Window/sky openings on RearWall stay empty.
## Camera contain-framing shows the authored ceiling. Do not drop a masonry lintel
## onto the 16:9 crop row — that turned every room into a window-box.
func _paint_rear_wall() -> void:
	var rear := _ensure_rear_layer()
	var cols := int(room_width / float(tile_size))
	var floor_row := int((room_height - tile_size * 2) / float(tile_size))
	var wall := Vector2i(1, 0)
	var ceiling := Vector2i(2, 0)
	var crop_rows := 1
	var rng := _arch_rng()
	var variant := rng.randi() % 4
	# Archetype chooses the silhouette family so traversal/combat/boss/NPC cannot
	# collapse to the same arcade. Hash variant only flavors leftover connectors.
	match room_archetype:
		"traversal", "challenge", "tutorial":
			_paint_night_apse(rear, cols, floor_row, crop_rows, wall, ceiling)
		"combat", "arena", "miniboss":
			_paint_colonnade(rear, cols, floor_row, crop_rows, wall, ceiling)
		"boss":
			_paint_ruin_mass(rear, cols, floor_row, crop_rows, wall, ceiling, rng)
		"npc", "shop", "save":
			_paint_colonnade(rear, cols, floor_row, crop_rows, wall, ceiling)
		"ability_shrine", "ability_gate":
			_paint_night_apse(rear, cols, floor_row, crop_rows, wall, ceiling)
		"secret", "treasure":
			_paint_ruin_mass(rear, cols, floor_row, crop_rows, wall, ceiling, rng)
		_:
			match variant:
				0:
					_paint_night_apse(rear, cols, floor_row, crop_rows, wall, ceiling)
				1:
					_paint_colonnade(rear, cols, floor_row, crop_rows, wall, ceiling)
				2:
					_paint_colonnade(rear, cols, floor_row, crop_rows, wall, ceiling)
				_:
					_paint_ruin_mass(rear, cols, floor_row, crop_rows, wall, ceiling, rng)

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


func _paint_night_apse(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	## Thin side piers + open night vault. No spanning lintel/dado — those read as a window-box.
	rear.modulate = Color(0.84, 0.90, 0.94, 1)
	var lintel := maxi(1, crop_rows)
	var mass_w := 2
	for x in range(1, 1 + mass_w):
		_rear_cell(rear, x, lintel, ceiling)
		for y in range(lintel + 1, floor_row):
			_rear_cell(rear, x, y, wall)
	for x in range(cols - 1 - mass_w, cols - 1):
		_rear_cell(rear, x, lintel, ceiling)
		for y in range(lintel + 1, floor_row):
			_rear_cell(rear, x, y, wall)


func _paint_gallery_wall(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	## Solid rear with a high slit row. Reads as a wall, not an arcade of piers.
	rear.modulate = Color(0.76, 0.84, 0.90, 1)
	var lintel := maxi(1, crop_rows)
	for y in range(lintel, floor_row):
		for x in range(1, cols - 1):
			_rear_cell(rear, x, y, ceiling if y <= lintel + 1 else wall)
	var slit_top := lintel + 2
	var slit_bot := mini(lintel + 5, floor_row - 3)
	if slit_bot <= slit_top:
		return
	var x := 3
	while x < cols - 4:
		for wx in range(x, mini(x + 2, cols - 2)):
			for wy in range(slit_top, slit_bot + 1):
				rear.erase_cell(Vector2i(wx, wy))
		_rear_cell(rear, x - 1, slit_top, ceiling)
		_rear_cell(rear, mini(x + 2, cols - 2), slit_top, ceiling)
		x += 7


func _paint_colonnade(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	## Isolated piers, no connecting lintel, no window frames. Sky is the wall.
	rear.modulate = Color(0.90, 0.86, 0.80, 1)
	var lintel := maxi(1, crop_rows)
	var x := 2
	while x < cols - 3:
		for px in range(2):
			if x + px >= cols - 1:
				break
			_rear_cell(rear, x + px, lintel, ceiling)
			for y in range(lintel + 1, floor_row):
				_rear_cell(rear, x + px, y, wall)
		x += 11


func _paint_ruin_mass(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
	rng: RandomNumberGenerator,
) -> void:
	## Broken, asymmetric masses. No stamped bay rhythm.
	rear.modulate = Color(0.82, 0.88, 0.90, 1)
	var lintel := maxi(1, crop_rows)
	var chunks := 3 + rng.randi() % 3
	for i in range(chunks):
		var x0 := 1 + rng.randi() % maxi(1, cols - 6)
		var w := 2 + rng.randi() % 4
		var top := lintel + rng.randi() % 3
		var bot := floor_row - rng.randi() % 3
		for x in range(x0, mini(x0 + w, cols - 1)):
			_rear_cell(rear, x, top, ceiling)
			for y in range(top + 1, bot):
				_rear_cell(rear, x, y, wall)
			if rng.randf() < 0.35 and bot - 1 > top:
				_rear_cell(rear, x, bot - 1, ceiling)

func _paint_bay_architecture(
	layer: TileMapLayer,
	x0: int,
	x1: int,
	header: int,
	sill: int,
	wall: Vector2i,
	ceiling: Vector2i,
	bay_i: int,
) -> void:
	if x1 - x0 < 2:
		return
	var kind := bay_i % 3
	if kind == 0:
		# High clerestory: a short window under the lintel, night hall below.
		var high_sill := mini(header + 4, sill - 1)
		if high_sill > header + 1:
			_paint_window_frame(layer, x0, x1, header, high_sill, wall, ceiling)
			if x1 - x0 >= 3 and header + 1 < high_sill:
				_rear_cell(layer, x0 + 1, header + 1, ceiling)
		return
	if kind == 1:
		# Standard framed window with a second sill course as an apron.
		_paint_window_frame(layer, x0, x1, header, sill, wall, ceiling)
		if sill + 1 < header:
			return
		for x in range(x0, x1 + 1):
			_rear_cell(layer, x, sill + 1, ceiling)
		return
	# Deep lancet: jambs only, opening is a tall night slit. Leave the aperture
	# empty — no infill of playable air.
	for y in range(header, sill + 1):
		_rear_cell(layer, x0, y, wall)
		_rear_cell(layer, x1, y, wall)
	for x in range(x0, x1 + 1):
		_rear_cell(layer, x, header, ceiling)
		_rear_cell(layer, x, sill, wall)


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
