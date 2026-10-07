extends Node
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("HEDGE_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	for tick in range(12):
		await get_tree().process_frame
	var area: Dictionary = world._find_area("overworld")
	var tiles: Array = area.tiles
	var layer: TileMapLayer
	for node in world._area_root.get_children():
		if node is TileMapLayer:
			layer = node
	check("native ground layer exists",layer!=null)
	var walls := 0
	var rendered := true
	var colliding := true
	var variants: Dictionary = {}
	var variants_match := true
	await get_tree().physics_frame
	for y in range(tiles.size()):
		for x in range(tiles[y].size()):
			if int(tiles[y][x])!=3:
				continue
			walls += 1
			rendered = rendered and layer.get_cell_atlas_coords(Vector2i(x,y)).y>=9
			var variant: int = world._cell_hash(x,y,4)
			variants[variant] = true
			var mask := 0
			var offsets: Array[Vector2i] = [Vector2i.UP,Vector2i.RIGHT,Vector2i.DOWN,Vector2i.LEFT]
			for side in range(4):
				var neighbor := Vector2i(x,y)+offsets[side]
				if neighbor.y<0 or neighbor.y>=tiles.size() or neighbor.x<0 or neighbor.x>=tiles[neighbor.y].size() or int(tiles[neighbor.y][neighbor.x])!=3:
					mask |= 1<<side
			variants_match = variants_match and layer.get_cell_atlas_coords(Vector2i(x,y))==Vector2i(mask%8,9+variant*2+mask/8)
			var query := PhysicsPointQueryParameters2D.new()
			query.position = Vector2(x*32+16,y*32+16)
			query.collision_mask = 1
			colliding = colliding and not world.get_world_2d().direct_space_state.intersect_point(query).is_empty()
	check("all solid cells use hedge roles",walls>0 and rendered)
	check("hedge cells retain real collisions",walls>0 and colliding)
	check("four foliage variants appear with correct edge masks",variants.size()==4 and variants_match)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://qa/hedges"))
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://qa/hedges/overworld.png")
	var passed := true
	for row in checks:
		passed = passed and row.passed
	var file := FileAccess.open("res://qa/hedges/proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"wallCells":walls,"scope":"Native overworld barrier art and collision at every wall-cell center. Full navigation and visual approval separate."},"	"))
	file.close()
	print("HEDGE_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
