extends Node
## LOW_RESOURCE presentation: palette depth layers, a few PointLights, data-driven decor
## with exclusion zones, biome variety. Does not rewrite room collision or transitions.

const LIGHTING_PATH := "res://data/quality/apply_lighting_profile.json"
const DECOR_PATH := "res://data/quality/place_room_decor.json"
const PACING_PATH := "res://data/quality/tweak_room_pacing.json"
const STYLE_PATH := "res://style_bible.json"
const ROOMS_PATH := "res://data/rooms/rooms.json"
const COMPOSITION_PATH := "res://data/environment/composition.json"

var _palette := {
	"shadow": Color(0.078, 0.094, 0.125),
	"steel": Color(0.235, 0.267, 0.329),
	"accent": Color(0.353, 0.549, 0.863),
	"danger": Color(0.784, 0.282, 0.282),
}
var _tier := "LOW"
var _rooms: Dictionary = {}
var _composition: Dictionary = {}
var _point_lights := 2

func _ready() -> void:
	_load_jsons()
	EventBus.room_entered.connect(_on_room_entered)

func apply_room(room: Node2D, room_id: String) -> void:
	if room == null:
		return
	_clear_injected(room)
	var info: Dictionary = _rooms.get(room_id, {})
	var size := Vector2(float(info.get("width", 800)), float(info.get("height", 600)))
	var biome := String(info.get("biomeId", "biome_0"))
	var archetype := String(info.get("archetype", "connector"))
	_replace_stretched_background(room, size, biome)
	_hide_collision_slabs(room)
	_tune_parallax(room, size)
	_inject_depth_layers(room, size, biome)
	_inject_lights(room, size, biome, archetype)
	_inject_ambient(room, size, biome, room_id)
	_inject_decor(room, size, biome, archetype, info)
	_apply_outline(room)
	_apply_camera(room, size)
	var modulate := get_tree().get_first_node_in_group("world_manager")
	if modulate:
		var cm := modulate.get_node_or_null("WorldCanvasModulate") as CanvasModulate
		if cm:
			# Tiled citadel interiors are already dark teal; extra dimming turns masonry into mud.
			if room.get_node_or_null("Ground") != null:
				# Dim the plate so key/fill/sun actually read as lighting, not flat teal.
				# Pure white modulate made PointLights invisible against masonry.
				cm.color = Color(0.78, 0.82, 0.88, 1)
			else:
				cm.color = _modulate_for_biome(biome)

func _on_room_entered(room_id: String) -> void:
	var world := get_tree().get_first_node_in_group("world_manager")
	if world == null:
		return
	var room: Node2D = world.get("_current_room") as Node2D
	# Fall back to last child room-like node if the field is not yet assigned.
	if room == null:
		for child in world.get_children():
			if child is Node2D and String(child.name).begins_with("room_"):
				room = child
	apply_room(room, room_id)

func _load_jsons() -> void:
	_ingest_style()
	_ingest_lighting()
	if FileAccess.file_exists(ROOMS_PATH):
		var file := FileAccess.open(ROOMS_PATH, FileAccess.READ)
		if file:
			var parsed = JSON.parse_string(file.get_as_text())
			file.close()
			if typeof(parsed) == TYPE_DICTIONARY:
				_rooms = parsed.get("rooms", {})
	if FileAccess.file_exists(COMPOSITION_PATH):
		var comp := FileAccess.open(COMPOSITION_PATH, FileAccess.READ)
		if comp:
			var parsed_comp = JSON.parse_string(comp.get_as_text())
			comp.close()
			if typeof(parsed_comp) == TYPE_DICTIONARY:
				_composition = parsed_comp.get("rooms", {})

func _ingest_style() -> void:
	if not FileAccess.file_exists(STYLE_PATH):
		return
	var file := FileAccess.open(STYLE_PATH, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	for entry in parsed.get("palette", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var name := String(entry.get("name", "")).to_lower()
		var color := _hex_color(String(entry.get("hex", "")))
		if name == "shadow":
			_palette.shadow = color
		elif name == "steel":
			_palette.steel = color
		elif name == "accent":
			_palette.accent = color
		elif name == "danger":
			_palette.danger = color

func _ingest_lighting() -> void:
	if not FileAccess.file_exists(LIGHTING_PATH):
		return
	var file := FileAccess.open(LIGHTING_PATH, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	_tier = String(parsed.get("tier", "LOW"))
	match _tier:
		"HIGH":
			_point_lights = 4
		"MEDIUM":
			_point_lights = 3
		_:
			_point_lights = 2
	var pal = parsed.get("palette", {})
	if typeof(pal) == TYPE_DICTIONARY:
		if pal.has("shadow"):
			_palette.shadow = _arr_color(pal.shadow)
		if pal.has("steel"):
			_palette.steel = _arr_color(pal.steel)
		if pal.has("accent"):
			_palette.accent = _arr_color(pal.accent)
		if pal.has("danger"):
			_palette.danger = _arr_color(pal.danger)

func _clear_injected(room: Node) -> void:
	var existing := room.get_node_or_null("QualityInjected")
	if existing:
		existing.free()
	var floor_occ := room.get_node_or_null("QualityFloorOccluder")
	if floor_occ:
		floor_occ.free()

func _replace_stretched_background(room: Node, size: Vector2, biome: String) -> void:
	var bg := room.get_node_or_null("Background")
	if bg is ColorRect:
		var sky := bg as ColorRect
		sky.visible = room.get_node_or_null("FarSky") == null and room.get_node_or_null("ParallaxBg/far") == null
		sky.color = _biome_far(biome)
		sky.z_index = -30
		sky.mouse_filter = Control.MOUSE_FILTER_IGNORE
		# Cover the whole room so uncovered camera edges aren't a black void.
		sky.offset_left = -240.0
		sky.offset_top = -180.0
		sky.offset_right = size.x + 240.0
		sky.offset_bottom = size.y + 180.0
	elif bg is CanvasItem:
		(bg as CanvasItem).visible = false


func _layout_parallax_strip(sprite: Sprite2D, size: Vector2, kind: String) -> void:
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.centered = true
	sprite.visible = true
	sprite.modulate = Color(1, 1, 1, 1)
	if sprite.texture == null:
		return
	var tw := float(sprite.texture.get_width())
	var th := float(sprite.texture.get_height())
	if tw < 2.0 or th < 2.0:
		return
	var s: float
	if kind == "far":
		# One full back plate. Overscan so camera look-ahead does not flash the sky ColorRect.
		s = maxf(size.x / tw, size.y / th) * 1.6
		sprite.scale = Vector2(s, s)
		sprite.position = size * 0.5
	else:
		s = size.x / tw
		sprite.scale = Vector2(s, s)
		var y := size.y * 0.88
		if kind == "mid":
			y = size.y * 0.82
		sprite.position = Vector2(size.x * 0.5, y)
	var layer := sprite.get_parent()
	if layer is Parallax2D:
		if kind == "far":
			(layer as Parallax2D).repeat_size = Vector2.ZERO
			(layer as Parallax2D).repeat_times = 1
		else:
			(layer as Parallax2D).repeat_size = Vector2(tw * s, 0.0)
			(layer as Parallax2D).repeat_times = 3


func _tune_parallax(room: Node, size: Vector2) -> void:
	var px := room.get_node_or_null("ParallaxBg")
	if px is CanvasItem:
		(px as CanvasItem).visible = false
	var far_sky := room.get_node_or_null("FarSky")
	if far_sky is CanvasLayer:
		# Fullscreen CanvasLayer composites over the tilemap. Hide leftovers from older rooms.
		far_sky.visible = false
	elif far_sky is Sprite2D:
		_layout_parallax_strip(far_sky as Sprite2D, size, "far")
		return
	if px == null:
		return
	for extra in ["overlay", "foreground", "mid", "near"]:
		var junk := px.get_node_or_null(extra)
		if junk:
			(junk as CanvasItem).visible = false
	var far_layer := px.get_node_or_null("far")
	if far_layer:
		(far_layer as CanvasItem).visible = true
		if far_layer is Parallax2D:
			(far_layer as Parallax2D).scroll_scale = Vector2.ZERO
	var sprite := px.get_node_or_null("far/Sprite") as Sprite2D
	if sprite:
		_layout_parallax_strip(sprite, size, "far")

func _hide_collision_slabs(room: Node) -> void:
	for path in ["Floor/FloorVisual", "FloorLeft/FloorVisual", "FloorRight/FloorVisual"]:
		var slab := room.get_node_or_null(path)
		if slab is CanvasItem:
			(slab as CanvasItem).visible = false
			(slab as CanvasItem).modulate = Color(1, 1, 1, 0)
	for child in room.get_children():
		if child is Area2D and child.has_node("Visual"):
			var vis := child.get_node_or_null("Visual")
			if vis is CanvasItem:
				(vis as CanvasItem).visible = false

func _inject_depth_layers(room: Node, size: Vector2, biome: String) -> void:
	## ParallaxBg already carries far/mid/near. Injecting full plates again covers the tileset.
	if room.get_node_or_null("FarSky") != null:
		return
	if room.get_node_or_null("ParallaxBg") != null:
		return
	## Tileset rooms must not get opaque ColorRect slabs.
	if room.get_node_or_null("Ground") != null:
		return
	var host := _host(room)
	var far_path := "res://assets/backgrounds/%s/far.png" % biome
	if ResourceLoader.exists(far_path):
		_inject_parallax_sprite(host, "DepthFarSprite", far_path, size * 0.5, -8)
		var mid_path := "res://assets/backgrounds/%s/mid.png" % biome
		if ResourceLoader.exists(mid_path):
			_inject_parallax_sprite(host, "DepthMidSprite", mid_path, Vector2(size.x * 0.5, size.y * 0.62), -6)
		var near_path := "res://assets/backgrounds/%s/near.png" % biome
		if ResourceLoader.exists(near_path):
			_inject_parallax_sprite(host, "DepthNearSprite", near_path, Vector2(size.x * 0.5, size.y * 0.78), -3)
		return
	var pad := Vector2(240, 180)
	var far := ColorRect.new()
	far.name = "DepthFar"
	far.position = -pad
	far.size = size + pad * 2.0
	far.color = Color(0.035, 0.04, 0.055, 1)
	far.z_index = -8
	var mouse := Control.MOUSE_FILTER_IGNORE
	far.mouse_filter = mouse
	host.add_child(far)

	var mid := ColorRect.new()
	mid.name = "DepthMid"
	mid.position = Vector2(-80, size.y * 0.42)
	mid.size = Vector2(size.x + 160, size.y * 0.7)
	mid.color = Color(0.16, 0.20, 0.28, 1)
	mid.z_index = -6
	mid.mouse_filter = mouse
	host.add_child(mid)

	var haze := ColorRect.new()
	haze.name = "DepthHaze"
	haze.position = Vector2(0, 0)
	haze.size = Vector2(size.x, size.y * 0.28)
	haze.color = Color(_palette.accent.r, _palette.accent.g, _palette.accent.b, 0.22)
	haze.z_index = -5
	haze.mouse_filter = mouse
	host.add_child(haze)

	var floor_wash := ColorRect.new()
	floor_wash.name = "DepthFloorWash"
	floor_wash.position = Vector2(-40, size.y - 96)
	floor_wash.size = Vector2(size.x + 80, 140)
	floor_wash.color = Color(0.40, 0.44, 0.54, 1)
	floor_wash.z_index = -3
	floor_wash.mouse_filter = mouse
	host.add_child(floor_wash)

func _inject_lights(room: Node, size: Vector2, _biome: String, _archetype: String) -> void:
	var host := _host(room)
	var tex := _light_texture()
	var tiled := room.get_node_or_null("Ground") != null
	var key := PointLight2D.new()
	key.name = "QualityLightKey"
	key.position = Vector2(size.x * 0.22, size.y * 0.26)
	key.texture = tex
	key.color = Color(0.72, 0.86, 1.0, 1)
	key.energy = 1.55 if tiled else 0.4
	key.texture_scale = 2.15 if tiled else 1.35
	key.z_index = 5
	key.shadow_enabled = tiled
	host.add_child(key)
	var fill := PointLight2D.new()
	fill.name = "QualityLightFill"
	fill.position = Vector2(size.x * 0.62, size.y * 0.74)
	fill.texture = tex
	fill.color = Color(1.0, 0.82, 0.62, 1)
	fill.energy = 0.95 if tiled else 0.22
	fill.texture_scale = 1.85 if tiled else 1.05
	fill.z_index = 5
	fill.shadow_enabled = tiled
	host.add_child(fill)
	if tiled:
		var sun := DirectionalLight2D.new()
		sun.name = "QualitySun"
		sun.rotation = deg_to_rad(-42.0)
		sun.color = Color(0.80, 0.90, 1.0, 1)
		sun.energy = 0.78
		sun.shadow_enabled = true
		sun.height = 24.0
		host.add_child(sun)
		_attach_floor_occluder(room, size)
		_attach_actor_occluders(room)
		_enable_terrain_lighting(room)


func _enable_terrain_lighting(room: Node) -> void:
	## Tilemaps default to receiving lights, but an explicit mask plus a warm
	## floor vs cool rear makes the key/fill read in screenshots.
	for node_name in ["Ground", "RearWall"]:
		var layer := room.get_node_or_null(node_name) as CanvasItem
		if layer == null:
			continue
		layer.light_mask = 1
		if node_name == "Ground":
			layer.modulate = Color(1.0, 0.94, 0.88, 1)


func _attach_floor_occluder(room: Node, size: Vector2) -> void:
	if room.get_node_or_null("QualityFloorOccluder") != null:
		return
	var occ := LightOccluder2D.new()
	occ.name = "QualityFloorOccluder"
	var poly := OccluderPolygon2D.new()
	var floor_y := size.y - 48.0
	poly.polygon = PackedVector2Array([
		Vector2(-40.0, floor_y),
		Vector2(size.x + 40.0, floor_y),
		Vector2(size.x + 40.0, size.y + 80.0),
		Vector2(-40.0, size.y + 80.0),
	])
	occ.occluder = poly
	room.add_child(occ)


func _attach_actor_occluders(room: Node) -> void:
	for node_name in ["Player", "Enemy", "Boss"]:
		var actor := room.get_node_or_null(node_name)
		if actor == null or actor.get_node_or_null("QualityOccluder") != null:
			continue
		var occ := LightOccluder2D.new()
		occ.name = "QualityOccluder"
		var poly := OccluderPolygon2D.new()
		var w := 22.0
		var h := 48.0
		if node_name == "Boss":
			w = 72.0
			h = 96.0
		elif node_name == "Enemy":
			w = 28.0
			h = 44.0
		poly.polygon = PackedVector2Array([
			Vector2(-w * 0.5, -h),
			Vector2(w * 0.5, -h),
			Vector2(w * 0.5, 0.0),
			Vector2(-w * 0.5, 0.0),
		])
		occ.occluder = poly
		actor.add_child(occ)

func _inject_ambient(room: Node, size: Vector2, biome: String, room_id: String) -> void:
	## Dust quads sit on the actor and read as a leftover cluster. Tiled rooms
	## already have window key / floor fill.
	if room.get_node_or_null("Ground") != null:
		return
	var spec: Dictionary = _composition.get(room_id, {})
	var biome_spec: Dictionary = spec.get("biome", {})
	var kind := String(biome_spec.get("ambientVfx", "none"))
	if kind == "" or kind == "none":
		return
	var host := _host(room)
	var emitter := GPUParticles2D.new()
	emitter.name = "QualityAmbient"
	emitter.position = Vector2(size.x * 0.5, size.y * 0.35)
	emitter.amount = 8
	emitter.lifetime = 3.2
	emitter.preprocess = 0.8
	emitter.explosiveness = 0.0
	emitter.z_index = 6
	emitter.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	mat.emission_box_extents = Vector3(size.x * 0.35, size.y * 0.12, 1)
	mat.direction = Vector3(0, 1 if kind == "dust" else -1, 0)
	mat.spread = 18.0
	mat.initial_velocity_min = 4.0
	mat.initial_velocity_max = 12.0
	mat.gravity = Vector3(0, 8.0 if kind == "dust" else -6.0, 0)
	mat.scale_min = 0.12
	mat.scale_max = 0.28
	if kind == "embers":
		mat.color = Color(1.0, 0.55, 0.22, 0.55)
	elif kind == "mist":
		mat.color = Color(0.72, 0.82, 0.9, 0.35)
	else:
		mat.color = Color(0.85, 0.8, 0.7, 0.28)
	emitter.process_material = mat
	host.add_child(emitter)

func _light_texture() -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.width = 256
	tex.height = 256
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(0.5, 0.0)
	return tex

func _inject_decor(
	room: Node,
	size: Vector2,
	biome: String,
	archetype: String,
	info: Dictionary,
) -> void:
	## ColorRect "pillars" read as opaque slabs over the tileset. Skip when tiles exist.
	if room.get_node_or_null("Ground") != null:
		return
	var host := _host(room)
	var excluded := _exclusion_rects(size, archetype, info)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(String(info.get("id", room.name)) + biome)
	var count := 5
	if _tier == "MEDIUM":
		count = 8
	elif _tier == "HIGH":
		count = 12
	match archetype:
		"boss", "arena", "combat":
			count += 2
		"save", "npc", "shop":
			count += 1
	for i in range(count):
		var pos := Vector2(rng.randf_range(40, size.x - 40), rng.randf_range(size.y * 0.35, size.y - 90))
		if _excluded(pos, excluded):
			continue
		var prop := ColorRect.new()
		prop.name = "Decor_%d" % i
		prop.size = Vector2(rng.randf_range(10, 22), rng.randf_range(28, 64))
		prop.position = pos - Vector2(0, prop.size.y)
		prop.mouse_filter = Control.MOUSE_FILTER_IGNORE
		prop.z_index = -2
		var t := rng.randf()
		if t < 0.45:
			prop.color = Color(_palette.steel.r, _palette.steel.g, _palette.steel.b, 0.82)
		elif t < 0.75:
			prop.color = Color(_palette.shadow.r, _palette.shadow.g, _palette.shadow.b, 0.9).lightened(0.12)
		else:
			prop.color = Color(_palette.accent.r, _palette.accent.g, _palette.accent.b, 0.35)
		host.add_child(prop)

func _exclusion_rects(size: Vector2, archetype: String, info: Dictionary) -> Array[Rect2]:
	var rects: Array[Rect2] = []
	rects.append(Rect2(60, size.y - 140, 120, 120)) ## spawn
	rects.append(Rect2(size.x - 150, size.y - 160, 140, 140)) ## right combat/door
	rects.append(Rect2(0, size.y - 150, 56, 140)) ## left door
	rects.append(Rect2(size.x * 0.5 - 60, 20, 120, 90)) ## up transition / jump
	rects.append(Rect2(size.x * 0.5 - 40, size.y - 140, 180, 90)) ## pickup / jump center
	if archetype == "boss":
		rects.append(Rect2(size.x * 0.5 - 80, size.y - 180, 160, 140))
	return rects

func _excluded(pos: Vector2, rects: Array[Rect2]) -> bool:
	for r in rects:
		if r.has_point(pos):
			return true
	return false

func _apply_outline(room: Node) -> void:
	## Interior knockout holes get a pale ring from this shader and read as a
	## cluster of eyes at the player's feet. Tiled rooms already have contrast
	## plus sprite_foot_clean on AnimatedAssetSprite.
	if room.get_node_or_null("Ground") != null:
		for node_name in ["Player", "Enemy", "Boss"]:
			var actor := room.get_node_or_null(node_name)
			if actor == null:
				continue
			var sprite := actor.get_node_or_null("Sprite") as CanvasItem
			if sprite:
				# Keep the contact-band cleaner; never layer readability outline over it.
				if sprite.material == null and ResourceLoader.exists("res://scripts/shaders/sprite_foot_clean.gdshader"):
					var shader: Shader = load("res://scripts/shaders/sprite_foot_clean.gdshader")
					if shader:
						var mat := ShaderMaterial.new()
						mat.shader = shader
						sprite.material = mat
		return
	if not ResourceLoader.exists("res://scripts/shaders/sprite_outline.gdshader"):
		return
	if not FileAccess.file_exists("res://data/quality/install_readability_outline.json"):
		return
	var shader: Shader = load("res://scripts/shaders/sprite_outline.gdshader")
	if shader == null:
		return
	for node_name in ["Player", "Enemy", "Boss"]:
		var actor := room.get_node_or_null(node_name)
		if actor == null:
			continue
		var sprite := actor.get_node_or_null("Sprite") as CanvasItem
		if sprite == null or sprite.material != null:
			continue
		var mat := ShaderMaterial.new()
		mat.shader = shader
		sprite.material = mat

func _apply_camera(room: Node, size: Vector2) -> void:
	var player := room.get_node_or_null("Player")
	if player == null:
		return
	var camera := player.get_node_or_null("Camera2D")
	if camera and camera.has_method("apply_room_bounds"):
		camera.apply_room_bounds(size)

func _host(room: Node) -> Node2D:
	var existing := room.get_node_or_null("QualityInjected") as Node2D
	if existing:
		return existing
	var host := Node2D.new()
	host.name = "QualityInjected"
	room.add_child(host)
	room.move_child(host, 0)
	return host

func _inject_parallax_sprite(host: Node, node_name: String, path: String, pos: Vector2, z: int) -> void:
	var sprite := Sprite2D.new()
	sprite.name = node_name
	sprite.texture = load(path)
	sprite.position = pos
	sprite.centered = true
	sprite.z_index = z
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	host.add_child(sprite)

func _biome_far(biome: String) -> Color:
	var idx := _biome_index(biome)
	var far: Color = _palette.shadow.darkened(0.15)
	if idx % 3 == 1:
		far = far.lerp(_palette.accent, 0.08)
	elif idx % 3 == 2:
		far = far.lerp(_palette.danger, 0.08)
	else:
		far = far.lerp(_palette.steel, 0.12)
	return far

func _biome_mid(biome: String) -> Color:
	return _palette.steel.darkened(0.25).lerp(_palette.shadow, 0.35)

func _modulate_for_biome(biome: String) -> Color:
	var idx := _biome_index(biome)
	if idx % 3 == 1:
		return Color(0.88, 0.90, 0.98, 1)
	if idx % 3 == 2:
		return Color(0.92, 0.86, 0.86, 1)
	return Color(0.90, 0.91, 0.96, 1)

func _biome_index(biome: String) -> int:
	var digits := biome.get_slice("_", 1)
	return int(digits)

func _hex_color(hex: String) -> Color:
	if hex.begins_with("#"):
		hex = hex.substr(1)
	if hex.length() != 6:
		return Color(0.1, 0.1, 0.12)
	return Color(
		hex.substr(0, 2).hex_to_int() / 255.0,
		hex.substr(2, 2).hex_to_int() / 255.0,
		hex.substr(4, 2).hex_to_int() / 255.0,
	)

func _arr_color(value) -> Color:
	if value is Array and value.size() >= 3:
		return Color(float(value[0]), float(value[1]), float(value[2]))
	return Color(0.1, 0.1, 0.12)
