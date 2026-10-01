extends Node
## Frozen, identical-camera captures before and after terrain-only presentation changes.
var checks := 0
var failures := 0
const DIRECTORY := "res://.qa/terrain-depth"
func check(label: String, ok: bool) -> void:
	checks += 1
	print(("PASS: " if ok else "FAIL: ")+label)
	if not ok: failures += 1
func freeze(node: Node) -> void:
	node.set_physics_process(false)
	node.set_process(false)
	if node is AnimatedSprite2D:
		node.pause()
		node.set_frame_and_progress(0,0)
	for child in node.get_children(): freeze(child)
func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIRECTORY))
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.2).timeout
	var presenter = get_tree().get_first_node_in_group("hd2d_presenter")
	var baseline := OS.get_environment("CANOPY_DEPTH_BASELINE")=="1"
	var rows: Array = []
	for id in ["canopy_bridge","canopy_gardens","canopy_cistern","canopy_hamlet"]:
		world.load_area(id)
		await get_tree().process_frame
		await get_tree().physics_frame
		freeze(world.get("_area_root"))
		var player = get_tree().get_first_node_in_group("player")
		player.global_position = Vector2(480,352)
		presenter.set_process(false)
		presenter.call("_process",0.0)
		presenter.camera.position = Vector3(480,820,1032)
		presenter.camera.look_at(Vector3(480,0,352),Vector3.UP)
		var area: Dictionary = world.call("_find_area",id)
		var water := 0
		var edges := 0
		var platforms := 0
		for y in range(area.heightTiles):
			for x in range(area.widthTiles):
				if int(area.tiles[y][x])==2: water += 1; continue
				var touches := false
				var platform: bool = y<area.get("floorRoles",[]).size() and String(area.floorRoles[y][x])=="platform"
				for direction in [Vector2i.UP,Vector2i.RIGHT,Vector2i.DOWN,Vector2i.LEFT]:
					var neighbor: Vector2i = Vector2i(x,y)+direction
					if neighbor.x>=0 and neighbor.y>=0 and neighbor.x<area.widthTiles and neighbor.y<area.heightTiles and int(area.tiles[neighbor.y][neighbor.x])==2:
						if not platform: edges += 1
						touches = true
				if touches and platform: platforms += 1
		var mesh: ArrayMesh = presenter.terrain.get_node("TexturedGround").mesh
		var vertices: PackedVector3Array = mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
		var low := 0
		var land := 0
		for vertex in vertices:
			if is_equal_approx(vertex.y,-18): low += 1
			if is_zero_approx(vertex.y): land += 1
		check(id+"_floor_grid_retained",presenter.floor_cells==int(area.widthTiles)*int(area.heightTiles))
		if not baseline:
			check(id+"_only_water_lowered",low==water*4 and land==(int(area.widthTiles)*int(area.heightTiles)-water)*4)
			check(id+"_bank_faces_follow_water_boundary",presenter.bank_faces==edges)
			check(id+"_bridge_piers_follow_platform_edges",presenter.bridge_supports==platforms*2)
			check(id+"_earth_does_not_cover_water",presenter.terrain.get_node("EarthVolume").position.y+20 < -18)
			check(id+"_banks_have_depth",water==0 or presenter.terrain.has_node("ShoreBanks"))
		var source: AnimatedSprite2D = player.get_node("Sprite")
		var mirror: Sprite3D = presenter.mirrors[source.get_instance_id()]
		check(id+"_hero_grounded_and_exact_frame",mirror.position==Vector3(480,0.2,352) and mirror.texture==source.sprite_frames.get_frame_texture(source.animation,source.frame))
		check(id+"_crisp_nearest_filter",mirror.texture_filter==BaseMaterial3D.TEXTURE_FILTER_NEAREST)
		await RenderingServer.frame_post_draw
		check(id+"_native_capture",get_viewport().get_texture().get_image().save_png(DIRECTORY+"/"+id+".png")==OK)
		rows.append({"room":id,"waterCells":water,"shoreEdges":edges,"bridgeEdgeCells":platforms,"loweredVertices":low,"landVertices":land})
	print("CANOPY_TERRAIN_DEPTH_END")
	FileAccess.open(DIRECTORY+"/results.json",FileAccess.WRITE).store_string(JSON.stringify({"checks":checks,"failures":failures,"baseline":baseline,"rooms":rows}))
	get_tree().quit(0 if failures==0 else 1)
