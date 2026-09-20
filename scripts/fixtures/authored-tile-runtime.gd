extends SceneTree
func _initialize() -> void:
	var script = load("res://RoomTileMap.gd")
	if script == null:
		quit(1)
		return
	var layer = script.new()
	var atlas = TileSetAtlasSource.new()
	var image = Image.create(128, 64, false, Image.FORMAT_RGBA8)
	image.fill(Color.WHITE)
	atlas.texture = ImageTexture.create_from_image(image)
	atlas.texture_region_size = Vector2i(16, 16)
	atlas.create_tile(Vector2i(6, 2))
	var tiles = TileSet.new()
	tiles.tile_size = Vector2i(16, 16)
	tiles.add_source(atlas, 0)
	layer.tile_set = tiles
	layer._paint_authored_cells([[3, 4, 6, 2]])
	if layer.get_used_cells().size() != 1 or layer.get_cell_atlas_coords(Vector2i(3, 4)) != Vector2i(6, 2):
		push_error("Authored tile not preserved exactly")
		layer.free()
		quit(1)
		return
	layer._paint_authored_cells([])
	if not layer.get_used_cells().is_empty():
		push_error("Erased authored layer was refilled")
		layer.free()
		quit(1)
		return
	layer.free()
	print("PASS: native Godot authored tile atlas choice and clear-all")
	quit(0)
