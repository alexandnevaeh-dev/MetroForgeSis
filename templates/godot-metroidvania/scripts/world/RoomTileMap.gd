extends TileMapLayer

@export var biome_id: String = "biome_0"
@export var room_width: int = 800
@export var room_height: int = 600
@export var tile_size: int = 16

func _ready() -> void:
	_build_tilemap()

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

	var floor_row := int((room_height - 64) / tile_size)
	var floor_tile := Vector2i(0, min(2, rows - 1))
	for x in range(int(room_width / tile_size)):
		set_cell(Vector2i(x, floor_row), 0, floor_tile)

	var wall_tile := Vector2i(0, 0)
	for y in range(floor_row):
		set_cell(Vector2i(0, y), 0, wall_tile)
		set_cell(Vector2i(int(room_width / tile_size) - 1, y), 0, wall_tile)
