extends Node3D
## Opt-in 3D presentation of the same authoritative 2D world and animation frames.
## Terrain and cutout actors receive real lights and shadows. No physics is duplicated.
var world: Node2D
var room_id := ""
var mirrors: Dictionary = {}
var terrain: Node3D
var camera: Camera3D
var room_size := Vector2(960,704)
var build_count := 0
var floor_cells := 0
const WATER_LEVEL := -18.0
const BANK_BOTTOM := -24.0
var water_cells := 0
var bank_faces := 0
var bridge_supports := 0

func _ready() -> void:
	name = "HD2DWorld"
	add_to_group("hd2d_presenter")
	world = get_parent()
	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("172e33")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("b8c9c0")
	environment.ambient_light_energy = 0.45
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.fog_enabled = true
	environment.fog_light_color = Color("7b9b93")
	environment.fog_density = 0.00004
	if RenderingServer.get_current_rendering_method() != "gl_compatibility":
		environment.glow_enabled = true
		environment.glow_intensity = 0.45
		environment.glow_hdr_threshold = 1.4
		environment.ssao_enabled = true
	environment_node.environment = environment
	add_child(environment_node)
	var sun := DirectionalLight3D.new()
	sun.name = "CanopySun"
	sun.rotation_degrees = Vector3(-55,-28,0)
	sun.light_color = Color("ffe7ba")
	sun.light_energy = 0.8
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 2400
	add_child(sun)
	camera = Camera3D.new()
	camera.name = "DioramaCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 480
	camera.near = 1
	camera.far = 3000
	add_child(camera)
	camera.make_current()
	_rebuild_room()

func _process(delta: float) -> void:
	if room_id != GameManager.current_room_id: _rebuild_room()
	var player: Node2D = get_tree().get_first_node_in_group("player")
	if player:
		var margin := Vector2(minf(400,room_size.x/2),minf(200,room_size.y/2))
		var target := Vector3(clampf(player.global_position.x,margin.x,room_size.x-margin.x),0,clampf(player.global_position.y,margin.y,room_size.y-margin.y))
		var desired := target + Vector3(0,820,680)
		camera.position = camera.position.lerp(desired, minf(1,delta*9))
		camera.look_at(camera.position-Vector3(0,820,680),Vector3.UP)
	var sources: Array[Node] = []
	_collect(world.get("_area_root"),sources)
	# Combat effects are hosted on the current scene, outside the hidden area root.
	var scene := get_tree().current_scene
	if scene:
		for child in scene.get_children():
			if child is Sprite2D or child is AnimatedSprite2D:
				child.visibility_layer = 2
				get_viewport().canvas_cull_mask = 1
				sources.append(child)
	var live: Dictionary = {}
	for source in sources:
		var id := source.get_instance_id()
		live[id] = true
		if source is Line2D:
			if not mirrors.has(id):
				var warning := MeshInstance3D.new()
				warning.name = "CommittedAttackWarning"
				warning.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				warning.mesh = BoxMesh.new()
				var material := StandardMaterial3D.new()
				material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
				warning.material_override = material
				add_child(warning)
				mirrors[id] = warning
			var warning: MeshInstance3D = mirrors[id]
			warning.visible = _presentation_visible(source) and source.points.size()>=2
			if warning.visible:
				var start: Vector2 = source.to_global(source.points[0])
				var end: Vector2 = source.to_global(source.points[1])
				var middle := (start+end)/2
				warning.mesh.size = Vector3(start.distance_to(end),1.0,maxf(2,source.width))
				warning.position = Vector3(middle.x,1.2,middle.y)
				warning.rotation.y = -(end-start).angle()
				warning.material_override.albedo_color = source.default_color * _presentation_tint(source)
			continue
		if source is Label:
			if not mirrors.has(id):
				var label := Label3D.new()
				label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
				label.pixel_size = 0.45
				label.font_size = 24
				label.outline_size = 7
				add_child(label)
				mirrors[id] = label
			var label: Label3D = mirrors[id]
			label.text = source.text
			label.visible = _presentation_visible(source)
			label.modulate = _presentation_tint(source)
			var origin: Vector2 = source.get_parent().global_position
			label.position = Vector3(origin.x+source.position.x+source.size.x/2,-source.position.y+5,origin.y)
			continue
		if not mirrors.has(id):
			var sprite := Sprite3D.new()
			sprite.name = "PixelActor"
			sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
			sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
			sprite.shaded = true
			sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_DOUBLE_SIDED
			sprite.pixel_size = 1.0
			add_child(sprite)
			mirrors[id] = sprite
		var sprite: Sprite3D = mirrors[id]
		var texture: Texture2D
		if source is AnimatedSprite2D:
			if source.sprite_frames and source.sprite_frames.has_animation(source.animation):
				texture = source.sprite_frames.get_frame_texture(source.animation,source.frame)
		elif source is Sprite2D: texture = source.texture
		if texture == null: sprite.visible = false; continue
		sprite.texture = texture
		sprite.visible = _presentation_visible(source)
		sprite.modulate = _presentation_tint(source)
		sprite.flip_h = source.flip_h
		var parent: Node2D = source.get_parent() as Node2D
		var anchor: Vector2 = parent.global_position if parent else source.global_position
		var center: Vector2 = (source.position if parent else Vector2.ZERO) + source.offset
		if not source.centered: center += Vector2(texture.get_size())/2
		sprite.offset = Vector2(center.x,-center.y)
		sprite.scale = Vector3(source.scale.x,source.scale.y,1)
		sprite.position = Vector3(anchor.x,0.2,anchor.y)
	for id in mirrors.keys():
		if not live.has(id): mirrors[id].queue_free(); mirrors.erase(id)

func _presentation_visible(source: CanvasItem) -> bool:
	# Only the area root is hidden to suppress duplicate 2D rendering. All other
	# visibility belongs to the authoritative actor/effect hierarchy.
	var hidden_root: Node = world.get("_area_root")
	var ancestor: Node = source
	while ancestor != null:
		if ancestor is CanvasItem and ancestor != hidden_root and not ancestor.visible:
			return false
		ancestor = ancestor.get_parent()
	return true

func _presentation_tint(source: CanvasItem) -> Color:
	var tint := source.self_modulate
	var ancestor: Node = source
	while ancestor != null:
		if ancestor is CanvasItem:
			tint *= ancestor.modulate
		ancestor = ancestor.get_parent()
	return tint

func _collect(node: Node, sources: Array[Node]) -> void:
	if not is_instance_valid(node): return
	for child in node.get_children():
		if child.is_queued_for_deletion(): continue
		if child is Sprite2D or child is AnimatedSprite2D or child is Label or child is Line2D: sources.append(child)
		_collect(child,sources)

func _rebuild_room() -> void:
	room_id = GameManager.current_room_id
	build_count += 1
	if terrain: terrain.queue_free()
	terrain = Node3D.new()
	terrain.name = "TerrainDiorama"
	add_child(terrain)
	var area: Dictionary = world.call("_find_area",room_id)
	room_size = Vector2(float(area.get("widthTiles",30)),float(area.get("heightTiles",22))) * float(area.get("tileSize",32))
	var root: Node2D = world.get("_area_root")
	root.hide()
	var layer: TileMapLayer
	for child in root.get_children():
		if child is TileMapLayer: layer = child; break
	if layer == null: return
	var atlas: TileSetAtlasSource = layer.tile_set.get_source(0)
	var material := StandardMaterial3D.new()
	material.albedo_texture = atlas.texture
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	material.roughness = 0.95
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	var vertices := PackedVector3Array()
	var uvs := PackedVector2Array()
	var normals := PackedVector3Array()
	var indices := PackedInt32Array()
	var tile_size: float = float(area.get("tileSize",32))
	floor_cells = 0
	water_cells = 0
	bank_faces = 0
	bridge_supports = 0
	for cell: Vector2i in layer.get_used_cells():
		var coords: Vector2i = layer.get_cell_atlas_coords(cell)
		var uv := Vector2(coords)*tile_size / Vector2(atlas.texture.get_size())
		var span := Vector2.ONE*tile_size / Vector2(atlas.texture.get_size())
		var at := vertices.size()
		var x := cell.x*tile_size
		var z := cell.y*tile_size
		var level := WATER_LEVEL if _is_water(area,cell) else 0.0
		if level == WATER_LEVEL: water_cells += 1
		vertices.append_array(PackedVector3Array([Vector3(x,level,z),Vector3(x+tile_size,level,z),Vector3(x+tile_size,level,z+tile_size),Vector3(x,level,z+tile_size)]))
		uvs.append_array(PackedVector2Array([uv,uv+Vector2(span.x,0),uv+span,uv+Vector2(0,span.y)]))
		normals.append_array(PackedVector3Array([Vector3.UP,Vector3.UP,Vector3.UP,Vector3.UP]))
		indices.append_array(PackedInt32Array([at,at+2,at+1,at,at+3,at+2]))
		floor_cells += 1
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var ground := MeshInstance3D.new()
	ground.name = "TexturedGround"
	ground.mesh = mesh
	ground.material_override = material
	terrain.add_child(ground)
	# A solid terrain volume makes the scene a diorama rather than a floating picture.
	var earth := MeshInstance3D.new()
	earth.name = "EarthVolume"
	var volume := BoxMesh.new()
	volume.size = Vector3(room_size.x,40,room_size.y)
	earth.mesh = volume
	earth.position = Vector3(room_size.x/2,BANK_BOTTOM-20.1,room_size.y/2)
	var soil := StandardMaterial3D.new()
	soil.albedo_color = Color("304a44")
	soil.roughness = 1
	earth.material_override = soil
	terrain.add_child(earth)
	_build_shore_depth(area,layer,tile_size)
	for poi: Dictionary in area.get("pois",[]):
		if String(poi.get("kind","")) not in ["save","chest","npc"]: continue
		var lamp := OmniLight3D.new()
		lamp.position = Vector3(float(poi.x),35,float(poi.y))
		lamp.light_color = Color("65ddc7") if poi.kind == "save" else Color("eeb866")
		lamp.light_energy = 0.75
		lamp.omni_range = 110
		terrain.add_child(lamp)
	_build_houses(area)
	camera.position = Vector3(room_size.x/2,820,room_size.y/2+680)
	camera.look_at(Vector3(room_size.x/2,0,room_size.y/2),Vector3.UP)

func _is_water(area: Dictionary, cell: Vector2i) -> bool:
	var rows: Array = area.get("tiles",[])
	return cell.y>=0 and cell.y<rows.size() and cell.x>=0 and cell.x<rows[cell.y].size() and int(rows[cell.y][cell.x])==2

func _depth_material(timber: bool) -> StandardMaterial3D:
	# Original pixel strata continue the biome palette; keep texels sharp under lights.
	var image := Image.create(32,32,false,Image.FORMAT_RGBA8)
	for y in range(32):
		for x in range(32):
			var color := Color("635345") if timber else Color("53614c")
			if timber:
				if x%8==0: color = Color("302f2c")
				elif (x+y*3)%17==0: color = Color("a28a62")
			else:
				if y<5: color = Color("789866")
				elif y>18: color = Color("343f3c")
				if (x*7+y*3)%23<3: color = color.lightened(0.12)
			image.set_pixel(x,y,color)
	var material := StandardMaterial3D.new()
	material.albedo_texture = ImageTexture.create_from_image(image)
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	material.roughness = 1
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material

func _build_shore_depth(area: Dictionary, layer: TileMapLayer, tile_size: float) -> void:
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var wood := _depth_material(true)
	var directions: Array[Vector2i] = [Vector2i.UP,Vector2i.RIGHT,Vector2i.DOWN,Vector2i.LEFT]
	for cell: Vector2i in layer.get_used_cells():
		if _is_water(area,cell): continue
		var x := cell.x*tile_size
		var z := cell.y*tile_size
		var touches_water := false
		var roles: Array = area.get("floorRoles",[])
		var platform := cell.y<roles.size() and String(roles[cell.y][cell.x])=="platform"
		for direction: Vector2i in directions:
			if not _is_water(area,cell+direction): continue
			touches_water = true
			if platform: continue
			var a := Vector3(x,0,z)
			var b := Vector3(x+tile_size,0,z)
			if direction==Vector2i.RIGHT: a=Vector3(x+tile_size,0,z); b=Vector3(x+tile_size,0,z+tile_size)
			elif direction==Vector2i.DOWN: a=Vector3(x+tile_size,0,z+tile_size); b=Vector3(x,0,z+tile_size)
			elif direction==Vector2i.LEFT: a=Vector3(x,0,z+tile_size); b=Vector3(x,0,z)
			var at := vertices.size()
			vertices.append_array(PackedVector3Array([a,b,b+Vector3(0,BANK_BOTTOM,0),a+Vector3(0,BANK_BOTTOM,0)]))
			var normal := Vector3(direction.x,0,direction.y)
			normals.append_array(PackedVector3Array([normal,normal,normal,normal]))
			uvs.append_array(PackedVector2Array([Vector2.ZERO,Vector2(1,0),Vector2.ONE,Vector2(0,1)]))
			indices.append_array(PackedInt32Array([at,at+1,at+2,at,at+2,at+3]))
			bank_faces += 1
		if not touches_water or not platform: continue
		# Piers and an underside give bridge tiles weight without raising the walking plane.
		var beam := MeshInstance3D.new()
		beam.name = "BridgeUnderside"
		var deck := BoxMesh.new()
		deck.size = Vector3(tile_size,5,tile_size)
		beam.mesh = deck
		beam.position = Vector3(x+tile_size/2,-2.6,z+tile_size/2)
		beam.material_override = wood
		terrain.add_child(beam)
		for offset in [-0.3,0.3]:
			var pier := MeshInstance3D.new()
			pier.name = "BridgePier"
			var post := BoxMesh.new()
			post.size = Vector3(5,-BANK_BOTTOM-4,5)
			pier.mesh = post
			pier.position = Vector3(x+tile_size/2+tile_size*offset,(BANK_BOTTOM-4)/2,z+tile_size/2)
			pier.material_override = wood
			terrain.add_child(pier)
			bridge_supports += 1
	if vertices.is_empty(): return
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var banks := MeshInstance3D.new()
	banks.name = "ShoreBanks"
	banks.mesh = mesh
	banks.material_override = _depth_material(false)
	terrain.add_child(banks)

func _build_houses(area: Dictionary) -> void:
	for building: Dictionary in area.get("buildings",[]):
		var w := float(building.get("width",96))
		var d := float(building.get("depth",64))
		var h := float(building.get("height",64))
		var origin := Vector3(float(building.x),0,float(building.y))
		var timber := Image.create(16,16,false,Image.FORMAT_RGBA8)
		for y in range(16):
			for x in range(16):
				var color := Color("655447") if x%4 else Color("3d3939")
				if x%4==1: color = Color("a18c65")
				if (x*7+y*3)%19==0: color = Color("544c43")
				timber.set_pixel(x,y,color)
		var walls_material := StandardMaterial3D.new()
		walls_material.albedo_texture = ImageTexture.create_from_image(timber)
		walls_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		walls_material.uv1_scale = Vector3(4,3,1)
		walls_material.roughness = 1
		var house := MeshInstance3D.new()
		house.name = String(building.id)
		var body := BoxMesh.new()
		body.size = Vector3(w,h,d)
		house.mesh = body
		house.material_override = walls_material
		house.position = origin+Vector3(0,h/2,0)
		terrain.add_child(house)
		var a := Vector3(-w/2-6,0,-d/2-6)
		var b := Vector3(w/2+6,0,-d/2-6)
		var c := Vector3(0,32,-d/2-6)
		var e := Vector3(-w/2-6,0,d/2+6)
		var f := Vector3(w/2+6,0,d/2+6)
		var g := Vector3(0,32,d/2+6)
		var points := PackedVector3Array([a,c,b,e,f,g,a,e,g,a,g,c,b,c,g,b,g,f])
		var normals := PackedVector3Array()
		for i in range(0,points.size(),3):
			var normal := (points[i+1]-points[i]).cross(points[i+2]-points[i]).normalized()
			normals.append_array(PackedVector3Array([normal,normal,normal]))
		var arrays: Array = []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = points
		arrays[Mesh.ARRAY_NORMAL] = normals
		var roof_uvs := PackedVector2Array()
		for point in points: roof_uvs.append(Vector2((point.x+w/2+6)/(w+12),(point.z+d/2+6)/(d+12)))
		arrays[Mesh.ARRAY_TEX_UV] = roof_uvs
		var roof_mesh := ArrayMesh.new()
		roof_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
		var roof := MeshInstance3D.new()
		roof.mesh = roof_mesh
		roof.position = origin+Vector3(0,h,0)
		var moss := StandardMaterial3D.new()
		var shingles := Image.create(32,32,false,Image.FORMAT_RGBA8)
		for sy in range(32):
			for sx in range(32):
				var seam := (sx+(4 if (sy/8)%2 else 0))%8
				var color := Color("316458")
				if sy%8==0 or seam==0: color = Color("193e39")
				elif sy%8==1: color = Color("639176")
				elif (sx*3+sy*7)%17<3: color = Color("477762")
				shingles.set_pixel(sx,sy,color)
		moss.albedo_texture = ImageTexture.create_from_image(shingles)
		moss.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		moss.uv1_scale = Vector3(4,3,1)
		moss.cull_mode = BaseMaterial3D.CULL_DISABLED
		moss.roughness = 1
		roof.material_override = moss
		terrain.add_child(roof)
		for x in [-w/3,w/3]:
			var window := MeshInstance3D.new()
			var quad := QuadMesh.new()
			quad.size = Vector2(12,18)
			window.mesh = quad
			window.position = origin+Vector3(x,h*0.58,d/2+0.3)
			var lit := StandardMaterial3D.new()
			lit.albedo_color = Color("eeb866")
			lit.emission_enabled = true
			lit.emission = Color("eeb866")
			lit.emission_energy_multiplier = 1.1
			window.material_override = lit
			terrain.add_child(window)
