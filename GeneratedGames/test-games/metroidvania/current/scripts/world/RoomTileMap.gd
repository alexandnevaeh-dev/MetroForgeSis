extends TileMapLayer

@export var biome_id: String = "biome_0"
@export var room_width: int = 800
@export var room_height: int = 600
@export var tile_size: int = 16
@export var painted_cells_json: String = ""
@export var authored_cells: bool = false
@export var room_archetype: String = "combat"
## Set to "foundry" by the room-assembler for the Foundry visual slice. Consumed by
## CameraDirector.apply_room_bounds() (cinematic-plate cover-zoom) and QualityPresentation.
## Must be declared here so the assembler's `visual_kit = "foundry"` scene line applies and
## `ground.get("visual_kit")` returns a String instead of null.
@export var visual_kit: String = ""
## JSON array of [start_col, end_col) pairs (end exclusive) the room-assembler carved out as real
## pits — the visual backfill below must not repaint these columns solid or the collision gap
## (a separate StaticBody2D floor split, see room-assembler.ts buildFloorSection) would look filled.
@export var pit_columns_json: String = ""

func _ready() -> void:
	_build_tilemap()
	texture_filter = TEXTURE_FILTER_NEAREST
	# Every Stormglass chapter is dressed by authored collider-aligned sprites below.
	# Hide the procedural atlas faces so brick blocks and bright caps cannot sit over
	# the painted panorama. StaticBody2D collision remains completely independent.
	if _is_stormglass_reliquary():
		self_modulate = Color(1, 1, 1, 0)
	# Ground stays behind actors (player/NPC z=10). z=5 drew masonry over the courier
	# because the 64px sprite overlaps neighboring wall cells. Collision is unchanged.
	z_index = 1
	z_as_relative = false
	y_sort_enabled = false
	call_deferred("_ensure_shell_colliders")
	if _is_stormglass_reliquary():
		# Authored cell layouts return early from _build_tilemap(), so decoration cannot depend on
		# the generic rear-wall painter. Spawn it from the shared ready path for every room.
		call_deferred("_spawn_stormglass_decor")
		call_deferred("_spawn_stormglass_platform_trims")

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
			if authored_cells:
				_paint_authored_cells(parsed)
				return
			if _is_stormglass_reliquary():
				_paint_stormglass_exposed_surfaces(parsed)
				call_deferred("_paint_rear_wall")
				return
			for cell in parsed:
				if cell is Array and cell.size() >= 4:
					var atlas_coords := Vector2i(int(cell[2]), int(cell[3]))
					# Ground must not inherit assembler "tuft" cells; beam/duct belong on RearWall.
					if atlas_coords.y == 2 and atlas_coords.x >= 6:
						continue
					atlas_coords = _variant_coords(int(cell[0]), int(cell[1]), atlas_coords)
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


## Stormglass is rebuilt as a silhouette-first environment. Collision remains in the room's
## StaticBody2D geometry, so the tile layer only draws faces that touch playable air.
func _paint_stormglass_exposed_surfaces(cells: Array) -> void:
	var occupied: Dictionary = {}
	for cell in cells:
		if cell is Array and cell.size() >= 2:
			occupied[Vector2i(int(cell[0]), int(cell[1]))] = true
	for cell in cells:
		if not (cell is Array) or cell.size() < 4:
			continue
		var pos := Vector2i(int(cell[0]), int(cell[1]))
		var atlas_coords := Vector2i(int(cell[2]), int(cell[3]))
		# Atlas row two contains the old hazards, colored blocks, beams, and prop markers.
		if atlas_coords.y == 2:
			continue
		var open_top := not occupied.has(pos + Vector2i.UP)
		var open_left := not occupied.has(pos + Vector2i.LEFT)
		var open_right := not occupied.has(pos + Vector2i.RIGHT)
		if not open_top and not open_left and not open_right:
			continue
		if open_top:
			# One restrained stone ledge tile replaces the previous atlas patchwork.
			set_cell(pos, 0, Vector2i(3, 0))
		elif (open_left or open_right) and pos.y % 2 == 0:
			set_cell(pos, 0, Vector2i(1, 0))


# Studio paint is exact visual data. Do not add procedural tiles or vary atlas choices.
# Room shell/floor collision remains a separate geometry layer.
func _paint_authored_cells(cells: Array) -> void:
	clear()
	for cell in cells:
		if cell is Array and cell.size() >= 4:
			set_cell(Vector2i(int(cell[0]), int(cell[1])), 0, Vector2i(int(cell[2]), int(cell[3])))


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
	## Seeded wear/moss/crack/rare variants live on atlas rows 3-4. Keep the canonical tile a
	## majority of the time so rooms do not checkerboard, but rotate through the fuller variant
	## palette instead of one wear stamp.
	## Group neighboring cells on BOTH axes so a horizontal run does not checkerboard tile-to-tile
	## and a *vertical* run (a tall wall/pillar) does not stamp the identical variant top to
	## bottom — cell_y used to be accepted here and never hashed, so every row of a pillar landed
	## on the same decision.
	if atlas_coords.y != 0 or atlas_coords.x > 3:
		return atlas_coords
	var run_x: int = int(cell_x / 3)
	var run_y: int = int(cell_y / 3)
	var h: int = hash("%s-%d-%d-%d-%d" % [biome_id, run_x, run_y, atlas_coords.x, atlas_coords.y])
	var n: int = posmod(h, 8)
	# Crack/rare rows only exist for ground (x=0) and wall (x=1) roles; ceiling/platform fall
	# back to wear/moss so every bucket still lands on real painted content, never a blank cell.
	var has_special := atlas_coords.x <= 1
	if n == 4:
		return Vector2i(atlas_coords.x, 3)  # wear
	if n == 5:
		return Vector2i(atlas_coords.x, 4)  # moss
	if n == 6:
		return Vector2i(4 + atlas_coords.x, 3) if has_special else Vector2i(atlas_coords.x, 3)  # crack
	if n == 7:
		return Vector2i(4 + atlas_coords.x, 4) if has_special else Vector2i(atlas_coords.x, 4)  # rare
	return atlas_coords  # n in 0..3: canonical, kept as the plurality outcome


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
	var owning_room := get_parent()
	var room_key := str(owning_room.name if owning_room else name)
	# Re-entry can rename sibling room instances while the outgoing one awaits deletion.
	if owning_room and not owning_room.scene_file_path.is_empty():
		room_key = owning_room.scene_file_path.get_file().get_basename()
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
	var extra_earth := 0
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
	if biome_id.ends_with("1"):
		wall = Vector2i(1, 3)
	elif biome_id.ends_with("2"):
		wall = Vector2i(1, 4)
	var ceiling := Vector2i(2, 0)
	var crop_rows := 1
	var rng := _arch_rng()
	var variant := rng.randi() % 4
	if _is_stormglass_reliquary():
		_paint_stormglass_reliquary(rear, cols, floor_row, crop_rows)
		call_deferred("_spawn_stormglass_decor")
		return
	if biome_id.ends_with("1"):
		_paint_quench_gallery(rear, cols, floor_row, crop_rows, wall, ceiling)
		call_deferred("_spawn_quench")
		_paint_biome_material_band(rear, cols, floor_row, wall)
		return
	if biome_id.ends_with("2"):
		_paint_cooling_yard(rear, cols, floor_row, crop_rows, wall, ceiling)
		call_deferred("_spawn_cooling_yard")
		_paint_biome_material_band(rear, cols, floor_row, wall)
		return
	# Archetype chooses the silhouette family so traversal/combat/boss/NPC cannot
	# collapse to the same arcade. Hash variant only flavors leftover connectors.
	# Distinct architectural identity per gameplay role so rooms do not collapse to one silhouette
	# (the cross-room diversity failure). Each role gets a different rear-wall family; the shared
	# warm soot/gunmetal palette and all collision/traversal geometry are untouched.
	match room_archetype:
		"tutorial":
			_paint_tutorial_gantry(rear, cols, floor_row, crop_rows)
			call_deferred("_spawn_pouring_bay")
		"traversal":
			# Chain shaft: tall pier rhythm reads as a vertical climb shaft.
			_paint_colonnade(rear, cols, floor_row, crop_rows, wall, ceiling)
		"challenge":
			# Maintenance gallery: dado + piers + slit windows, not a solid wallpaper.
			_paint_gallery_wall(rear, cols, floor_row, crop_rows, wall, ceiling)
		"combat", "arena", "miniboss":
			# Furnace hall in foundry biomes. Biome 2's riveted masonry as a hood
			# read as full-width brown bands; use a cavern with openings instead.
			if biome_id.ends_with("2"):
				_paint_moss_cavern(rear, cols, floor_row, crop_rows, wall, ceiling)
			else:
				_paint_furnace_hearth(rear, cols, floor_row, crop_rows, wall, ceiling)
		"boss":
			_paint_ruin_mass(rear, cols, floor_row, crop_rows, wall, ceiling, rng)
		"npc", "shop":
			_paint_night_apse(rear, cols, floor_row, crop_rows, wall, ceiling)
		"save":
			if biome_id.ends_with("2"):
				_paint_moss_cavern(rear, cols, floor_row, crop_rows, wall, ceiling)
			else:
				_paint_gallery_wall(rear, cols, floor_row, crop_rows, wall, ceiling)
		"ability_shrine":
			_paint_furnace_hearth(rear, cols, floor_row, crop_rows, wall, ceiling)
		"ability_gate":
			# Gate colonnade: pier rhythm flanking the gate.
			_paint_colonnade(rear, cols, floor_row, crop_rows, wall, ceiling)
		"secret", "treasure":
			# Maintenance recess: broken, asymmetric rubble masses.
			_paint_ruin_mass(rear, cols, floor_row, crop_rows, wall, ceiling, rng)
		_:
			match variant:
				0:
					_paint_night_apse(rear, cols, floor_row, crop_rows, wall, ceiling)
				1:
					_paint_night_apse(rear, cols, floor_row, crop_rows, wall, ceiling)
				2:
					_paint_ruin_mass(rear, cols, floor_row, crop_rows, wall, ceiling, rng)
				_:
					_paint_ruin_mass(rear, cols, floor_row, crop_rows, wall, ceiling, rng)
	_paint_biome_material_band(rear, cols, floor_row, wall)


func _is_stormglass_reliquary() -> bool:
	return String(ProjectSettings.get_setting("application/config/name", "")).begins_with("Stormglass Reliquary")


func _paint_stormglass_reliquary(rear: TileMapLayer, cols: int, floor_row: int, crop_rows: int) -> void:
	## Clean foundation for the rebuilt rooms. The panorama and authored architecture provide
	## depth. Old atlas masonry on this non-colliding layer forms large brick rectangles over
	## the painted vistas, especially in later chapters and the final arena. Collision-matched
	## platform/floor sprites now carry every playable surface, so this layer stays invisible.
	rear.visible = false

func _paint_biome_material_band(rear: TileMapLayer, cols: int, floor_row: int, wall: Vector2i) -> void:
	## Dado of a second material so the rear wall is not one flat tile. No collision.
	if room_archetype == "tutorial":
		return
	if biome_id.ends_with("2"):
		# Slag crust / vine at the floor line only — not a green masonry wallpaper.
		var moss := Vector2i(0, 4)
		for x in range(2, cols - 2):
			if x % 5 == 2:
				_rear_cell(rear, x, floor_row - 1, moss)
		return
	var dado := wall
	if biome_id.ends_with("1"):
		dado = Vector2i(0, 3)
	else:
		dado = Vector2i(0, 3)
	for x in range(2, cols - 2):
		_rear_cell(rear, x, floor_row - 1, dado)
		if x % 4 == 0:
			_rear_cell(rear, x, floor_row - 2, wall)

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
	## Low dado, short corner haunches, 2–3 tile piers. Empty hall air so FarSky
	## is depth, not a mountain range. Ground keeps collision walls and climb
	## platforms. Never paint ceiling-height ribs — those stacked identical teal
	## columns read as wallpaper even when they do not collide.
	rear.modulate = Color(0.78, 0.84, 0.90, 1)
	var lintel := maxi(1, crop_rows)
	for x in range(2, cols - 2):
		_rear_cell(rear, x, floor_row - 1, wall)
		if x % 5 != 2:
			_rear_cell(rear, x, floor_row - 2, wall)
	for x in [2, 3, cols - 4, cols - 3]:
		for y in range(maxi(lintel + 3, floor_row - 4), floor_row):
			_rear_cell(rear, x, y, wall)
	var pier_h := 3
	for rib in [int(cols * 0.34), int(cols * 0.66)]:
		for y in range(floor_row - pier_h, floor_row):
			_rear_cell(rear, rib, y, wall)
		_rear_cell(rear, rib, floor_row - pier_h, ceiling)


func _paint_tutorial_gantry(rear: TileMapLayer, cols: int, floor_row: int, crop_rows: int) -> void:
	## Opening room is the pouring bay. Place the ladle machine in the *camera* band
	## (just above the player), not up in the cropped ceiling void.
	var beam := Vector2i(6, 2)
	var duct := Vector2i(7, 2)
	var hazard := Vector2i(3, 2)
	var cap := Vector2i(2, 0)
	var lintel := maxi(1, crop_rows)
	var gy := maxi(lintel + 3, floor_row - 5)
	var x0 := int(cols * 0.16)
	var x1 := int(cols * 0.78)
	for x in range(x0, x1):
		_rear_cell(rear, x, gy, beam)
	var ladle_x := int(cols * 0.46)
	for dx in range(-2, 3):
		_rear_cell(rear, ladle_x + dx, gy, cap)
		_rear_cell(rear, ladle_x + dx, gy + 1, duct)
	_rear_cell(rear, ladle_x, gy + 2, duct)
	_rear_cell(rear, ladle_x, gy + 3, hazard)
	_rear_cell(rear, ladle_x - 1, gy + 3, hazard)
	_rear_cell(rear, ladle_x + 1, gy + 3, hazard)
	for hang in [int(cols * 0.34), int(cols * 0.66)]:
		for y in range(gy, mini(floor_row - 1, gy + 4)):
			_rear_cell(rear, hang, y, duct)
	var crucible := int(cols * 0.20)
	for y in range(maxi(gy, floor_row - 5), floor_row - 1):
		_rear_cell(rear, crucible, y, cap)
		_rear_cell(rear, crucible + 3, y, cap)
	_rear_cell(rear, crucible + 1, maxi(gy, floor_row - 5), beam)
	_rear_cell(rear, crucible + 2, maxi(gy, floor_row - 5), beam)
	for x in range(int(cols * 0.28), int(cols * 0.70)):
		if (x % 4) != 1:
			_rear_cell(rear, x, floor_row - 1, hazard)



func _paint_furnace_hearth(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	## Ability shrine. Built furnace: jambs, corners, hood beam, twin stacks braced to their own
	## buttress on BOTH sides (not just the right, as before), and a centered raised crown over
	## the mouth so the whole apparatus reads as one connected machine with a clear focal peak
	## instead of two independent towers flanking a hole. Firebox stays empty (recessed cavity).
	## No collision.
	rear.modulate = Color(0.36, 0.24, 0.22, 1)
	var lintel := maxi(1, crop_rows)
	var left_e := Vector2i(4, 0)
	var right_e := Vector2i(5, 0)
	var top_e := Vector2i(6, 0)
	var beam := Vector2i(6, 2)
	var duct := Vector2i(7, 2)
	var tl := Vector2i(0, 1)
	var tr := Vector2i(1, 1)
	var bl := Vector2i(2, 1)
	var br := Vector2i(3, 1)
	# Low dado only — not a wallpaper of wall cells across the hall.
	for x in range(2, cols - 2):
		_rear_cell(rear, x, floor_row - 1, wall)
	# Pickup sits at x≈220 (col ~7 on 32px). Open the firebox around it so the
	# core reads against the empty mouth instead of matching wall masonry.
	var mouth_x0 := maxi(4, int(cols * 0.22))
	var mouth_x1 := mini(cols - 3, int(cols * 0.72))
	var mouth_top := maxi(lintel + 3, floor_row - 8)
	var mouth_sill := floor_row - 1
	# Hood plate: two courses, then a structural I-beam. Leave the cavity empty.
	for x in range(mouth_x0, mouth_x1 + 1):
		_rear_cell(rear, x, mouth_top, top_e)
		_rear_cell(rear, x, mouth_top + 1, beam)
		_rear_cell(rear, x, mouth_sill, ceiling)
	_rear_cell(rear, mouth_x0, mouth_top, tl)
	_rear_cell(rear, mouth_x1, mouth_top, tr)
	_rear_cell(rear, mouth_x0, mouth_sill, bl)
	_rear_cell(rear, mouth_x1, mouth_sill, br)
	for y in range(mouth_top + 1, mouth_sill):
		_rear_cell(rear, mouth_x0, y, left_e)
		_rear_cell(rear, mouth_x1, y, right_e)
	# A low apron ledge across the full mouth width, one row below the sill, so the firebox
	# stands on a visible base plate instead of meeting the dado edge-on.
	if mouth_sill + 1 < floor_row:
		for x in range(mouth_x0 - 1, mouth_x1 + 2):
			_rear_cell(rear, x, mouth_sill + 1, wall)
	# Side buttresses (outside the mouth) so the hearth is a machine, not a hole.
	for y in range(mouth_top, floor_row):
		_rear_cell(rear, mouth_x0 - 1, y, left_e)
		_rear_cell(rear, mouth_x1 + 1, y, right_e)
	for x in range(mouth_x0 - 1, mouth_x1 + 2):
		_rear_cell(rear, x, mouth_top - 1, beam)
	# Twin stacks: masonry + duct, capped, cross-braced to the buttress on their OWN side (a
	# visible support strut, not a floating column) so every vertical mass ties back into the
	# frame from both directions, not just the right. Kept to 3 rows (was 5): the shrine camera
	# frames a fixed band starting only ~4 rows above the hood (mouth_top) — anything taller than
	# that puts the stack caps and their braces right at the top edge of the visible frame, or
	# past it, where they read as absent rather than "connected machine."
	var stack_h := 3
	var stack_xs: Array[int] = [mouth_x0 + 1, mouth_x1 - 2]
	for i in range(stack_xs.size()):
		var stack_x: int = stack_xs[i]
		var cap_y := maxi(lintel + 2, mouth_top - stack_h)
		for y in range(cap_y, mouth_top):
			_rear_cell(rear, stack_x, y, wall)
			_rear_cell(rear, stack_x + 1, y, duct)
		_rear_cell(rear, stack_x, cap_y, top_e)
		_rear_cell(rear, stack_x + 1, cap_y, duct)
		var brace_y := cap_y + 1
		if i == 0:
			for x in range(mouth_x0 - 1, stack_x):
				_rear_cell(rear, x, brace_y, beam)
		else:
			for x in range(stack_x + 2, mouth_x1 + 2):
				_rear_cell(rear, x, brace_y, beam)
	# Lateral ducts from BOTH stacks toward the room's side walls, so the hood reads as one
	# connected apparatus from either approach direction (previously the right side only).
	for x in range(maxi(2, mouth_x0 - 3), mouth_x0):
		_rear_cell(rear, x, mouth_top - 2, beam)
	for x in range(mouth_x1 - 1, mini(mouth_x1 + 3, cols - 2)):
		_rear_cell(rear, x, mouth_top - 2, beam)
	# Centered raised crown above the hood: a clear focal peak over the firebox mouth instead of
	# a flat beam line, drawing the eye to the furnace centerline the same way the pickup's glow
	# does below it. Same row as the lateral ducts above (mouth_top - 2) — they never overlap in x
	# (ducts hug the buttresses, the crown is centered) — kept low enough to stay inside the fixed
	# shrine-camera frame rather than the taller placement used for the stacks/braces above.
	var crown_w := maxi(2, int((mouth_x1 - mouth_x0) * 0.22))
	var crown_x0 := int((mouth_x0 + mouth_x1) / 2.0 - crown_w / 2.0)
	var crown_y := mouth_top - 2
	if crown_y > lintel + 1:
		for x in range(crown_x0, crown_x0 + crown_w):
			_rear_cell(rear, x, crown_y, top_e)
		_rear_cell(rear, crown_x0 - 1, crown_y, tl)
		_rear_cell(rear, crown_x0 + crown_w, crown_y, tr)


func _paint_quench_gallery(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	## Flooded quench tunnels: tanks, coolant mains, valve risers. Playable air stays empty.
	rear.modulate = Color(0.82, 0.92, 0.94, 1)
	var lintel := maxi(1, crop_rows)
	var beam := Vector2i(6, 2)
	var duct := Vector2i(7, 2)
	var hazard := Vector2i(3, 2)
	var glass_wall := Vector2i(1, 3)
	# Coolant main at mid height — leave the walk band open.
	var main_y := maxi(lintel + 3, floor_row - 7)
	var x0 := 2
	var x1 := cols - 3
	if room_archetype == "combat" or room_archetype == "arena":
		x0 = 3
		x1 = cols - 4
	for x in range(x0, x1):
		_rear_cell(rear, x, main_y, beam)
	# Side tanks (not a wallpaper). Combat keeps a wider center gap.
	var tank_w := 3 if room_archetype == "traversal" else 2
	for tx in [2, cols - 2 - tank_w]:
		for x in range(tx, mini(tx + tank_w, cols - 2)):
			for y in range(maxi(lintel + 2, floor_row - 8), floor_row):
				_rear_cell(rear, x, y, glass_wall)
			_rear_cell(rear, x, maxi(lintel + 1, floor_row - 9), ceiling)
	# Valve risers
	var step := 6 if room_archetype == "traversal" else 8
	var vx := 5
	while vx < cols - 6:
		for y in range(main_y, mini(floor_row - 2, main_y + 4)):
			_rear_cell(rear, vx, y, duct)
		_rear_cell(rear, vx, mini(floor_row - 2, main_y + 4), hazard)
		vx += step
	for x in range(3, cols - 3):
		if x % 4 == 1:
			_rear_cell(rear, x, floor_row - 1, Vector2i(0, 3))


func _paint_cooling_yard(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	## Overgrown cooling yards: abandoned racks, not masonry brick stacks.
	rear.modulate = Color(1, 1, 1, 1)
	var lintel := maxi(1, crop_rows)
	var moss := Vector2i(1, 4)
	var beam := Vector2i(6, 2)
	var duct := Vector2i(7, 2)
	var gap := 7 if room_archetype == "combat" or room_archetype == "arena" else 5
	var x := 3
	var n := 0
	while x < cols - 4:
		var hgt := 5 + (n % 4)
		if room_archetype == "combat" and n % 2 == 1:
			hgt = 3
		var top := maxi(lintel + 2, floor_row - hgt)
		var right := mini(x + 2, cols - 3)
		for y in range(top, floor_row):
			_rear_cell(rear, x, y, duct)
			if right != x:
				_rear_cell(rear, right, y, duct)
		var shelf := top + 1
		while shelf < floor_row - 1:
			if x + 1 < cols - 3:
				_rear_cell(rear, x + 1, shelf, beam)
			shelf += 2
		if n % 2 == 0:
			_rear_cell(rear, mini(x + 3, cols - 3), floor_row - 2, moss)
		x += gap
		n += 1
	for hx in range(4, cols - 4, 6):
		_rear_cell(rear, hx, floor_row - 1, moss)


func _paint_moss_cavern(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	## Biome 2 rear wall: piers, arched openings, hanging moss. Playable air stays
	## empty so fern parallax reads. No collision. Does not touch Ground cells.
	rear.modulate = Color(0.72, 0.82, 0.70, 1)
	var lintel := maxi(1, crop_rows)
	var moss := Vector2i(1, 4)
	var moss_cap := Vector2i(2, 4)
	var pier_h := mini(6, maxi(3, floor_row - lintel - 4))
	var x := 3
	while x < cols - 4:
		for px in range(x, mini(x + 2, cols - 3)):
			for y in range(floor_row - pier_h, floor_row):
				_rear_cell(rear, px, y, moss if y > floor_row - pier_h else wall)
			_rear_cell(rear, px, floor_row - pier_h, moss_cap)
		var arch_l := x + 3
		var arch_r := mini(x + 6, cols - 4)
		var arch_top := lintel + 2
		var arch_bot := mini(floor_row - 3, arch_top + 4)
		if arch_r > arch_l + 1:
			for sx in range(arch_l, arch_r):
				_rear_cell(rear, sx, arch_top, ceiling)
				_rear_cell(rear, sx, arch_bot, moss)
			for y in range(arch_top + 1, arch_bot):
				_rear_cell(rear, arch_l, y, moss)
				_rear_cell(rear, arch_r - 1, y, moss)
		x += 8
	for hx in range(4, cols - 4, 6):
		_rear_cell(rear, hx, lintel + 1, Vector2i(7, 2))
		_rear_cell(rear, hx, lintel + 2, moss)


func _paint_gallery_wall(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	## Maintenance gallery: dado, piers, and high slit windows. Playable air stays
	## open so parallax reads. Not a solid wallpaper of wall cells.
	rear.modulate = Color(0.76, 0.84, 0.90, 1)
	var lintel := maxi(1, crop_rows)
	for x in range(1, cols - 1):
		_rear_cell(rear, x, floor_row - 1, wall)
		_rear_cell(rear, x, floor_row - 2, wall)
		_rear_cell(rear, x, lintel, ceiling)
	var pier_h := mini(8, maxi(4, floor_row - lintel - 3))
	var x := 2
	while x < cols - 3:
		for px in range(x, mini(x + 2, cols - 2)):
			for y in range(floor_row - pier_h, floor_row - 1):
				_rear_cell(rear, px, y, wall)
			_rear_cell(rear, px, floor_row - pier_h, ceiling)
		var slit_l := x + 3
		var slit_r := mini(x + 5, cols - 3)
		var slit_top := lintel + 2
		var slit_bot := mini(slit_top + 3, floor_row - pier_h + 1)
		if slit_r > slit_l and slit_bot > slit_top:
			for sx in range(slit_l, slit_r):
				_rear_cell(rear, sx, slit_top, ceiling)
				_rear_cell(rear, sx, slit_bot, wall)
		x += 7


func _paint_colonnade(
	rear: TileMapLayer,
	cols: int,
	floor_row: int,
	crop_rows: int,
	wall: Vector2i,
	ceiling: Vector2i,
) -> void:
	## Short 1-tile pilasters from the floor, not ceiling-height towers.
	rear.modulate = Color(0.90, 0.86, 0.80, 1)
	var lintel := maxi(1, crop_rows)
	var pier := Vector2i(4, 0)
	var cap := Vector2i(6, 2)
	var pier_h := maxi(3, int((floor_row - lintel) * 0.38))
	var x := 6
	while x < cols - 6:
		for y in range(floor_row - pier_h, floor_row):
			_rear_cell(rear, x, y, pier)
		_rear_cell(rear, x, floor_row - pier_h, cap)
		x += 10


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
		var x0 := 2 + rng.randi() % maxi(1, cols - 8)
		var w := 2 + rng.randi() % 3
		if rng.randf() < 0.5:
			var top := lintel
			var bot := mini(lintel + 2 + rng.randi() % 3, floor_row - 4)
			for x in range(x0, mini(x0 + w, cols - 2)):
				for y in range(top, bot):
					_rear_cell(rear, x, y, ceiling if y == top else wall)
		else:
			var bot := floor_row
			var top := maxi(lintel + 3, floor_row - (2 + rng.randi() % 3))
			for x in range(x0, mini(x0 + w, cols - 2)):
				for y in range(top, bot):
					_rear_cell(rear, x, y, wall)

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



func _spawn_quench() -> void:
	var parent := get_parent()
	if parent == null or parent.get_node_or_null("QuenchDecor") != null:
		return
	var deco := Node2D.new()
	deco.name = "QuenchDecor"
	deco.z_index = 4
	deco.z_as_relative = false
	deco.set_script(load("res://scripts/world/QuenchDecor.gd"))
	deco.set("room_width", room_width)
	deco.set("room_height", room_height)
	deco.set("tile_size", tile_size)
	deco.set("room_archetype", room_archetype)
	parent.add_child(deco)


func _spawn_cooling_yard() -> void:
	var parent := get_parent()
	if parent == null or parent.get_node_or_null("CoolingYardDecor") != null:
		return
	var deco := Node2D.new()
	deco.name = "CoolingYardDecor"
	deco.z_index = 4
	deco.z_as_relative = false
	deco.set_script(load("res://scripts/world/CoolingYardDecor.gd"))
	deco.set("room_width", room_width)
	deco.set("room_height", room_height)
	deco.set("tile_size", tile_size)
	deco.set("room_archetype", room_archetype)
	parent.add_child(deco)


func _spawn_pouring_bay() -> void:
	if room_archetype != "tutorial":
		return
	var parent := get_parent()
	if parent == null or parent.get_node_or_null("PouringBay") != null:
		return
	var deco := Node2D.new()
	deco.name = "PouringBay"
	deco.z_index = 4
	deco.z_as_relative = false
	deco.set_script(load("res://scripts/world/PouringBayDecor.gd"))
	deco.set("room_width", room_width)
	deco.set("room_height", room_height)
	deco.set("tile_size", tile_size)
	parent.add_child(deco)


func _spawn_stormglass_decor() -> void:
	var parent := get_parent()
	if parent == null or parent.get_node_or_null("StormglassDecor") != null:
		return
	var deco := Node2D.new()
	deco.name = "StormglassDecor"
	deco.z_index = -2
	deco.z_as_relative = false
	deco.set_script(load("res://scripts/world/StormglassDecor.gd"))
	deco.set("room_width", room_width)
	deco.set("room_height", room_height)
	deco.set("tile_size", tile_size)
	deco.set("room_archetype", room_archetype)
	deco.set("biome_id", biome_id)
	var resolved_room_id := String(parent.name).to_lower()
	if not parent.scene_file_path.is_empty():
		resolved_room_id = parent.scene_file_path.get_file().get_basename().to_lower()
	deco.set("room_id", resolved_room_id)
	parent.add_child(deco)


func _spawn_stormglass_platform_trims() -> void:
	## Dress the real StaticBody2D collision rectangles rather than inferring ledges
	## from visual-mass tiles. This keeps authored art exactly aligned with gameplay.
	## A shared carved-stone silhouette keeps collision readable across the whole game;
	## biome-specific grading below changes its material language per chapter.
	var parent := get_parent()
	if parent == null or parent.get_node_or_null("StormglassPlatformTrims") != null:
		return
	var path := "res://assets/architecture/stormglass/platform.png"
	if not ResourceLoader.exists(path):
		return
	var texture := load(path) as Texture2D
	if texture == null or texture.get_width() <= 0:
		return
	var holder := Node2D.new()
	holder.name = "StormglassPlatformTrims"
	holder.z_as_relative = false
	holder.z_index = 2
	holder.set_meta("condition_district", _stormglass_district_index())
	parent.add_child(holder)
	var supports := Node2D.new()
	supports.name = "StormglassPlatformSupports"
	supports.z_as_relative = false
	supports.z_index = 0
	parent.add_child(supports)
	for child in parent.get_children():
		if not child.name.begins_with("Platform_") or not child is StaticBody2D:
			continue
		var collider := child.get_node_or_null("CollisionShape2D") as CollisionShape2D
		if collider == null or not collider.shape is RectangleShape2D:
			continue
		var rect := collider.shape as RectangleShape2D
		var center: Vector2 = child.position + collider.position
		_add_stormglass_platform_supports(supports, center, rect.size)
		_add_stormglass_platform_trim(holder, texture, center, rect.size)
	_spawn_stormglass_floor_strip(holder, parent)


func _add_stormglass_platform_trim(holder: Node2D, texture: Texture2D, center: Vector2, collision_size: Vector2) -> void:
	var sprite := Sprite2D.new()
	sprite.name = "CollisionMatchedPlatform_%d_%d" % [int(center.y), int(center.x)]
	sprite.texture = texture
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.centered = true
	var target_width := maxf(collision_size.x, float(tile_size * 3))
	var target_height := minf(80.0, maxf(52.0, collision_size.y * 2.15))
	sprite.scale = Vector2(target_width / float(texture.get_width()), target_height / float(texture.get_height()))
	# The normalized asset is bottom-aligned; overlap the collision body so the
	# bright stone lip lands exactly on its top edge and hides placeholder tiles.
	sprite.position = Vector2(center.x, center.y - collision_size.y * 0.5 + target_height * 0.5 - 9.0)
	sprite.modulate = _stormglass_surface_tint()
	holder.add_child(sprite)


func _add_stormglass_platform_supports(holder: Node2D, center: Vector2, collision_size: Vector2) -> void:
	## Elevated walkways are suspended by paired iron chains. Thin alternating links
	## keep the support readable without obscuring actors or the authored panorama.
	var half_span := minf(collision_size.x * 0.34, maxf(28.0, collision_size.x * 0.5 - 18.0))
	for side in [-1.0, 1.0]:
		var x: float = center.x + half_span * float(side)
		var bottom_y := center.y - collision_size.y * 0.5 + 8.0
		var top_y := maxf(14.0, bottom_y - minf(250.0, maxf(58.0, bottom_y - 14.0)))
		var chain := Line2D.new()
		chain.name = "CollisionMatchedSupport_%d_%d_%s" % [int(center.y), int(center.x), "L" if side < 0.0 else "R"]
		chain.width = 0.8
		var chain_color: Color = _stormglass_surface_tint().darkened(0.72)
		chain_color.a = 0.72
		chain.default_color = chain_color
		chain.antialiased = false
		var points := PackedVector2Array()
		var segment_count := maxi(2, int(ceil((bottom_y - top_y) / 11.0)))
		for segment in range(segment_count + 1):
			var t := float(segment) / float(segment_count)
			var offset := -0.55 if segment % 2 == 0 else 0.55
			points.append(Vector2(x + offset, lerpf(top_y, bottom_y, t)))
		chain.points = points
		holder.add_child(chain)


func _spawn_stormglass_floor_strip(holder: Node2D, parent: Node) -> void:
	var path := "res://assets/architecture/stormglass/floor_strip.png"
	if not ResourceLoader.exists(path):
		return
	var texture := load(path) as Texture2D
	var floor_body := parent.get_node_or_null("Floor") as StaticBody2D
	if texture == null or floor_body == null:
		return
	var collider := floor_body.get_node_or_null("CollisionShape2D") as CollisionShape2D
	if collider == null or not collider.shape is RectangleShape2D:
		return
	var rect := collider.shape as RectangleShape2D
	_add_stormglass_floor_foundation(holder, parent, floor_body.position + collider.position, rect.size)
	var sprite := Sprite2D.new()
	sprite.name = "CollisionMatchedFloorStrip"
	sprite.texture = texture
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.centered = true
	sprite.scale = Vector2(rect.size.x / float(texture.get_width()), rect.size.y / float(texture.get_height()))
	# Raise the decorative masonry into the collision body. The source's beveled
	# walkable lip occupies its lower band; centering it on the body reads one tile low.
	sprite.position = floor_body.position + collider.position + Vector2(0, -24.0)
	sprite.modulate = _stormglass_surface_tint().darkened(0.04)
	holder.add_child(sprite)


func _add_stormglass_floor_foundation(holder: Node2D, parent: Node, center: Vector2, collision_size: Vector2) -> void:
	if parent.get_node_or_null("StormglassFloorFoundation") != null:
		return
	var path := "res://assets/architecture/stormglass/platform.png"
	if not ResourceLoader.exists(path):
		return
	var texture := load(path) as Texture2D
	if texture == null or texture.get_width() < 384 or texture.get_height() < 80:
		return
	var foundation := Node2D.new()
	foundation.name = "StormglassFloorFoundation"
	foundation.position = center - collision_size * 0.5
	foundation.z_as_relative = false
	foundation.z_index = holder.z_index - 1
	parent.add_child(foundation)
	var backing := Polygon2D.new()
	backing.name = "OpaqueStoneBacking"
	backing.polygon = PackedVector2Array([Vector2.ZERO, Vector2(collision_size.x, 0), collision_size, Vector2(0, collision_size.y)])
	backing.color = Color(0.075, 0.095, 0.13, 1)
	foundation.add_child(backing)
	# Repeat only the painted center span; the final segment crops horizontally.
	# Render transforms never resize or add collision geometry.
	var x := 0.0
	while x < collision_size.x:
		var width := minf(308.0, collision_size.x - x)
		var face := Sprite2D.new()
		face.name = "PaintedArcade_%d" % int(x)
		face.texture = texture
		face.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		face.centered = false
		face.region_enabled = true
		face.region_rect = Rect2(38, 12, width, 65)
		face.region_filter_clip_enabled = true
		face.position = Vector2(x, 0)
		face.scale.y = collision_size.y / 65.0
		face.modulate = _stormglass_surface_tint().darkened(0.2)
		foundation.add_child(face)
		x += width


func _stormglass_surface_tint() -> Color:
	# Stormglass intentionally uses one biome id for its connected castle. The ten-room
	# districts represent damage states inside that biome, so surface materials follow the
	# room number rather than splitting the game back into unrelated biome asset buckets.
	match _stormglass_district_index():
		1:
			# Sunken Halls: cold oxidized stone under water-filtered teal light.
			return Color(0.54, 0.80, 0.82, 1.0)
		2:
			# Ancient Ruins: weathered reliquary bronze and warm archive dust.
			return Color(0.78, 0.61, 0.42, 1.0)
		3:
			# Storm-Ice Heights: moonlit frost gathering on blue-black masonry.
			return Color(0.70, 0.88, 1.0, 1.0)
		_:
			return Color(0.90, 0.94, 1.0, 1.0)


func _stormglass_district_index() -> int:
	var parent := get_parent()
	if parent == null:
		return 0
	var resolved_room_id := String(parent.name).to_lower()
	if not parent.scene_file_path.is_empty():
		resolved_room_id = parent.scene_file_path.get_file().get_basename().to_lower()
	var room_index := maxi(0, resolved_room_id.trim_prefix("room_").to_int())
	return clampi(int(room_index / 10), 0, 3)


func _rear_cell(layer: TileMapLayer, x: int, y: int, atlas: Vector2i) -> void:
	if get_cell_source_id(Vector2i(x, y)) != -1:
		return
	if layer.get_cell_source_id(Vector2i(x, y)) != -1:
		return
	# Stormglass uses authored panoramas and deliberately sparse masonry. Applying
	# the generic rare-tile variants here could turn a buttress into a tiny 2x2
	# stained-glass swatch, which read as a debug-colored transition block.
	var coords := atlas if _is_stormglass_reliquary() else _rear_variant(x, y, atlas)
	layer.set_cell(Vector2i(x, y), 0, coords)

## Seeded wear/crack/moss/rare variant for a solid rear-wall fill so a maintenance-gallery /
## furnace-hall wall reads as aged foundry masonry instead of one repeated square panel. Only the
## plain `wall` (1,0) and `ground` (0,0) atlas cells vary; every structural cell (edge/corner/
## beam/duct/pier/cap) is returned unchanged. Grouped 2x2 so neighbours share a decision (no
## tile-to-tile checkerboard) and kept canonical the majority of the time.
func _rear_variant(x: int, y: int, atlas: Vector2i) -> Vector2i:
	if atlas != Vector2i(1, 0) and atlas != Vector2i(0, 0):
		return atlas
	var h: int = hash("%s-rear-%d-%d" % [biome_id, x >> 1, y >> 1])
	match posmod(h, 10):
		6:
			return Vector2i(atlas.x, 3)       # wear
		7:
			return Vector2i(atlas.x, 4)       # moss
		8:
			return Vector2i(4 + atlas.x, 3)   # crack
		9:
			return Vector2i(4 + atlas.x, 4)   # rare
		_:
			return atlas                      # 0-5: canonical (plurality)


func _ensure_shell_colliders() -> void:
	## Assembler-authored Shell* bodies win when present. Fallback builds collision from the
	## painted Ground cells so older rooms and the visual-polish slice still contain jump/dash.
	var parent := get_parent()
	if parent == null:
		return
	for name in ["ShellCeiling", "ShellCeilingLeft", "ShellLeft", "ShellLeftUpper"]:
		if parent.get_node_or_null(name) != null:
			return
	_build_painted_shell(parent)


func _is_shell_atlas(coords: Vector2i) -> bool:
	if coords.x == 1 and coords.y in [0, 3, 4]:
		return true
	if coords.x == 2 and coords.y in [0, 3, 4]:
		return true
	if coords.y == 1 and coords.x in [0, 1]:
		return true
	if coords.y == 0 and coords.x in [4, 5]:
		return true
	if coords.x == 5 and coords.y in [3, 4]:
		return true
	return false


func _build_painted_shell(parent: Node) -> void:
	var cols := int(room_width / float(tile_size))
	var holder := StaticBody2D.new()
	holder.name = "PaintedShell"
	parent.add_child(holder)
	var index := 0
	# Left / right columns: merge consecutive shell cells into vertical rects.
	for col in [0, cols - 1]:
		var run_start := -1
		for row in range(int(room_height / float(tile_size)) + 1):
			var atlas := get_cell_atlas_coords(Vector2i(col, row))
			var solid := get_cell_source_id(Vector2i(col, row)) != -1 and _is_shell_atlas(atlas)
			if solid and run_start < 0:
				run_start = row
			elif (not solid) and run_start >= 0:
				index = _add_shell_rect(holder, index, col * tile_size, run_start * tile_size, tile_size, (row - run_start) * tile_size)
				run_start = -1
		if run_start >= 0:
			var end_row := int(room_height / float(tile_size)) + 1
			index = _add_shell_rect(holder, index, col * tile_size, run_start * tile_size, tile_size, (end_row - run_start) * tile_size)
	# Ceiling row, skipping the left/right columns already covered.
	var ceil_start := -1
	for col in range(cols):
		var atlas := get_cell_atlas_coords(Vector2i(col, 0))
		var solid := get_cell_source_id(Vector2i(col, 0)) != -1 and _is_shell_atlas(atlas)
		if col == 0 or col == cols - 1:
			solid = false
		if solid and ceil_start < 0:
			ceil_start = col
		elif (not solid) and ceil_start >= 0:
			index = _add_shell_rect(holder, index, ceil_start * tile_size, 0, (col - ceil_start) * tile_size, tile_size)
			ceil_start = -1
	if ceil_start >= 0:
		_add_shell_rect(holder, index, ceil_start * tile_size, 0, (cols - ceil_start) * tile_size, tile_size)


func _add_shell_rect(holder: StaticBody2D, index: int, x: float, y: float, w: float, h: float) -> int:
	if w < 1.0 or h < 1.0:
		return index
	var shape := RectangleShape2D.new()
	shape.size = Vector2(w, h)
	var col := CollisionShape2D.new()
	col.name = "ShellSeg_%d" % index
	col.shape = shape
	col.position = Vector2(x + w * 0.5, y + h * 0.5)
	holder.add_child(col)
	return index + 1

