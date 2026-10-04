extends Node2D

@export var room_width: int = 2048
@export var room_height: int = 1152
@export var tile_size: int = 32
@export var room_archetype: String = "tutorial"
@export var biome_id: String = "biome_0"
@export var room_id: String = "room_000"

const INK := Color("11152b")
const STONE := Color("343958")
const STONE_LIT := Color("596184")
const TEAL := Color("3fc7c0")
const ROSE := Color("cf477f")
const AMBER := Color("eea13e")
const GLASS_DARK := Color("18344f")
const MIST := Color(0.26, 0.68, 0.72, 0.12)
const CASTLE_INTERIOR_PANORAMA := "res://assets/backgrounds/stormglass/reliquary_interior.png"
const CONDITION_DECAL_ROOT := "res://assets/architecture/stormglass/conditions"
const CONDITION_DECAL_FAMILIES := [
	["intact_altar", "intact_banner", "intact_sconce", "intact_statue"],
	["flooded_waterline", "flooded_arch", "flooded_roots", "flooded_puddle"],
	["archive_bookcase", "archive_books", "archive_rubble", "archive_balcony"],
	["frozen_bell", "frozen_gears", "frozen_icicles", "frozen_window"],
]
static var _texture_metrics_cache: Dictionary = {}

const CONDITION_LABELS := ["intact_nave", "flooded_undercroft", "collapsed_archive", "frozen_bell_tower"]


func _ready() -> void:
	_spawn_authored_panorama()
	_spawn_authored_architecture()
	call_deferred("_spawn_authored_props")
	call_deferred("_spawn_condition_decals")
	queue_redraw()


static func background_settings(biome: String) -> Dictionary:
	var file := FileAccess.open("res://data/visual/biome-backgrounds.json", FileAccess.READ)
	if file == null:
		return {}
	var config: Variant = JSON.parse_string(file.get_as_text())
	if not config is Dictionary or config.get("version", 0) != 1 or not config.get("biomes") is Dictionary:
		return {}
	var value: Variant = config["biomes"].get(biome, {})
	if not value is Dictionary:
		return {}
	var path := String(value.get("path", ""))
	if not path.begins_with("assets/") or not path.ends_with(".png") or path.contains("..") or path.contains("\\") or not ResourceLoader.exists("res://" + path):
		return {}
	var opacity := float(value.get("opacity", 0.85))
	var anchor := float(value.get("anchorY", 1.0))
	if not is_finite(opacity) or opacity < 0.1 or opacity > 1.0 or not is_finite(anchor) or anchor < 0.0 or anchor > 1.0:
		return {}
	return value


static func castle_background_path(biome: String) -> String:
	var settings := background_settings(biome)
	return "res://" + String(settings["path"]) if not settings.is_empty() else CASTLE_INTERIOR_PANORAMA


func _spawn_authored_panorama() -> void:
	var room_index := maxi(0, room_id.trim_prefix("room_").to_int())
	# All 40 rooms use the same castle interior mass. District identity is expressed by
	# condition overlays and lighting, so the world never cuts to an unrelated exterior vista.
	var settings := background_settings(biome_id)
	var background_path := castle_background_path(biome_id)
	if not ResourceLoader.exists(background_path):
		return
	var texture := load(background_path) as Texture2D
	if texture == null or texture.get_width() <= 0 or texture.get_height() <= 0:
		return
	var sprite := Sprite2D.new()
	sprite.name = "AuthoredStormglassPanorama"
	sprite.texture = texture
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.centered = true
	sprite.z_as_relative = false
	sprite.z_index = -70
	var cover_scale := maxf(
		float(room_width) / float(texture.get_width()),
		float(room_height) / float(texture.get_height()),
	)
	sprite.scale = Vector2.ONE * cover_scale
	sprite.position = Vector2(room_width * 0.5, room_height * 0.5)
	if settings.is_empty():
		sprite.modulate = _district_panorama_tint(int(room_index / 10))
	else:
		var floor_y := float(room_height - tile_size * 2)
		var plate_height := float(texture.get_height()) * cover_scale
		sprite.position.y = plate_height * 0.5 + (floor_y - plate_height) * float(settings["anchorY"])
		sprite.modulate = Color(1.0, 1.0, 1.0, float(settings["opacity"]))
		sprite.set_meta("background_asset_id", String(settings.get("assetId", "")))
	sprite.set_meta("interior_continuity", true)
	sprite.set_meta("district_index", int(room_index / 10))
	sprite.set_meta("castle_base", background_path)
	# Stormglass supplies its own full-room plate. Hide the assembler fallback rectangle so it
	# cannot cover the panorama when generic far/mid/near plates are intentionally absent.
	var room := get_parent()
	if room:
		var fallback := room.get_node_or_null("Background") as CanvasItem
		if fallback:
			fallback.visible = false
	add_child(sprite)


func _district_panorama_tint(district_index: int) -> Color:
	# Keep the same stone, arches, windows, and bell-tower landmarks. These restrained tints
	# communicate intact nave, flooded undercroft, collapsed archive, and frozen upper tower.
	match clampi(district_index, 0, 3):
		1:
			return Color(0.48, 0.66, 0.76, 0.74)
		2:
			return Color(0.62, 0.58, 0.72, 0.73)
		3:
			return Color(0.58, 0.68, 0.86, 0.76)
		_:
			return Color(0.62, 0.66, 0.76, 0.74)


func _spawn_authored_architecture() -> void:
	# Recurrent arches and lancets bind every district into one monastery. Regional panoramas,
	# damage states and room geometry provide variation without making the world feel disconnected.
	var arch_path := "res://assets/architecture/stormglass/grand_arch.png"
	if not ResourceLoader.exists(arch_path):
		return
	var texture := load(arch_path) as Texture2D
	if texture == null or texture.get_height() <= 0:
		return
	var floor_y := float(room_height - tile_size * 2)
	var placements: Array[Dictionary] = []
	match room_id:
		"room_000":
			# Castle Gate: one monumental threshold framed by twin lancets.
			placements = [{"x": room_width * 0.50, "height": 420.0, "alpha": 0.72, "lift": 8.0}]
		"room_001":
			# Grand Hall: paired arcades establish the wide combat floor and three tiers.
			placements = [
				{"x": room_width * 0.30, "height": 350.0, "alpha": 0.78, "lift": 6.0},
				{"x": room_width * 0.72, "height": 390.0, "alpha": 0.84, "lift": 10.0},
			]
		"room_002":
			# Moonlit Gallery: a tall narrow landmark reinforces the vertical climb.
			placements = [{"x": room_width * 0.52, "height": 620.0, "alpha": 0.86, "lift": 30.0}]
		"room_003":
			# Wall-Jump Shrine: strict symmetry and a contained focal altar.
			placements = [{"x": room_width * 0.50, "height": 470.0, "alpha": 0.90, "lift": 8.0}]
		"room_004":
			# Upper Hall: asymmetrical broken nave distinguishes the mastery encounter.
			placements = [{"x": room_width * 0.66, "height": 430.0, "alpha": 0.82, "lift": 12.0}]
		_:
			pass
	if placements.is_empty():
		match room_archetype:
			"boss", "miniboss":
				placements = [{"x": room_width * 0.5, "height": 610.0, "alpha": 0.92, "lift": 8.0}]
			"ability_shrine", "save":
				placements = [{"x": room_width * 0.5, "height": 470.0, "alpha": 0.84, "lift": 8.0}]
			_:
				placements = [{"x": room_width * 0.5, "height": 420.0, "alpha": 0.68, "lift": 8.0}]
	# Add readable arcade bays throughout wider halls without enlarging existing assets.
	# They remain scenery behind the actual collision surfaces and actors.
	if room_width >= 1600 and room_archetype not in ["boss", "miniboss", "save", "ability_shrine"]:
		for bay_x in range(320, room_width - 240, 480):
			var occupied := false
			for existing in placements:
				if absf(float(existing["x"]) - float(bay_x)) < 240.0:
					occupied = true
			if not occupied:
				placements.append({"x": float(bay_x), "height": 360.0, "alpha": 0.70, "lift": 0.0})
	for placement_index in range(placements.size()):
		var placement: Dictionary = placements[placement_index]
		var sprite := Sprite2D.new()
		sprite.name = "AuthoredGrandArch_%02d" % placement_index
		sprite.texture = texture
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		# Keep authored architecture above the rear-wall tile layer while still
		# remaining behind actors, collision tiles, pickups, and foreground props.
		sprite.z_as_relative = false
		sprite.z_index = -1
		sprite.centered = true
		var target_height := float(placement["height"])
		var uniform_scale := target_height / float(texture.get_height())
		sprite.scale = Vector2.ONE * uniform_scale
		sprite.position = Vector2(float(placement["x"]), floor_y - target_height * 0.5 + _texture_bottom_inset(texture) * uniform_scale)
		sprite.modulate = Color(0.82, 0.88, 1.0, float(placement["alpha"]))
		add_child(sprite)
	_spawn_authored_windows(floor_y)


func _spawn_authored_windows(floor_y: float) -> void:
	var path := "res://assets/architecture/stormglass/lancet_window.png"
	if not ResourceLoader.exists(path):
		return
	var texture := load(path) as Texture2D
	if texture == null or texture.get_height() <= 0:
		return
	var window_specs: Array[Dictionary] = []
	match room_id:
		"room_000": window_specs = [{"x": 0.32, "height": 300.0, "lift": 70.0}, {"x": 0.68, "height": 300.0, "lift": 70.0}]
		"room_001": window_specs = [{"x": 0.50, "height": 330.0, "lift": 105.0}]
		"room_002": window_specs = [{"x": 0.50, "height": 390.0, "lift": 520.0}, {"x": 0.50, "height": 320.0, "lift": 145.0}]
		"room_003": window_specs = [{"x": 0.50, "height": 340.0, "lift": 105.0}]
		"room_004": window_specs = [{"x": 0.22, "height": 300.0, "lift": 80.0}, {"x": 0.43, "height": 260.0, "lift": 62.0}]
		_:
			var default_height := 360.0 if room_archetype in ["boss", "miniboss"] else 300.0
			var default_positions: Array[float] = [0.32, 0.68]
			if room_archetype in ["ability_shrine", "save", "boss", "miniboss"]:
				default_positions = [0.50]
			for x_fraction in default_positions:
				window_specs.append({"x": x_fraction, "height": default_height, "lift": 70.0})
	for window_index in range(window_specs.size()):
		var spec: Dictionary = window_specs[window_index]
		var sprite := Sprite2D.new()
		sprite.name = "AuthoredLancetWindow_%02d" % window_index
		sprite.texture = texture
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		sprite.z_as_relative = false
		sprite.z_index = -20
		sprite.centered = true
		var window_height := float(spec["height"])
		var uniform_scale := window_height / float(texture.get_height())
		sprite.scale = Vector2.ONE * uniform_scale
		sprite.position = Vector2(room_width * float(spec["x"]), floor_y - window_height * 0.5 - float(spec["lift"]))
		sprite.modulate = Color(0.72, 0.82, 1.0, 0.60)
		add_child(sprite)


func _spawn_condition_decals() -> void:
	# Each ten-room district keeps the same castle shell while a small authored decal family
	# communicates its physical condition. Decals are selected deterministically per room so
	# adjacent spaces share materials without repeating the same landmark composition.
	await get_tree().physics_frame
	var room_index := maxi(0, room_id.trim_prefix("room_").to_int())
	var district_index := clampi(int(room_index / 10), 0, 3)
	var family: Array = CONDITION_DECAL_FAMILIES[district_index]
	var holder := Node2D.new()
	holder.name = "StormglassConditionDecals"
	holder.z_as_relative = false
	holder.z_index = -1
	holder.set_meta("condition_district", district_index)
	holder.set_meta("condition_label", CONDITION_LABELS[district_index])
	holder.set_meta("castle_base", castle_background_path(biome_id))
	add_child(holder)
	var primary_index := room_index % family.size()
	var accent_index := (primary_index + 2) % family.size()
	var primary_x := float([0.20, 0.34, 0.50, 0.66, 0.80][room_index % 5])
	var accent_x := clampf(1.0 - primary_x + (0.05 if room_index % 2 == 0 else -0.05), 0.18, 0.82)
	var specs: Array[Dictionary] = [
		{"name": String(family[primary_index]), "x": primary_x, "scale": _condition_decal_scale(String(family[primary_index])), "role": "primary"},
		{"name": String(family[accent_index]), "x": accent_x, "scale": _condition_decal_scale(String(family[accent_index])) * 0.82, "role": "accent"},
	]
	if room_width >= 1600:
		for bay_x in range(320, room_width - 240, 512):
			var fraction := float(bay_x) / float(room_width)
			if absf(fraction - primary_x) > 0.12 and absf(fraction - accent_x) > 0.12:
				var detail_name := String(family[(int(bay_x / 512) + room_index) % family.size()])
				specs.append({"name": detail_name, "x": fraction, "scale": _condition_decal_scale(detail_name) * 0.72, "role": "detail"})
	for index in range(specs.size()):
		var spec: Dictionary = specs[index]
		var decal_name := String(spec["name"])
		var path := "%s/%s.png" % [CONDITION_DECAL_ROOT, decal_name]
		if not ResourceLoader.exists(path):
			continue
		var texture := load(path) as Texture2D
		if texture == null or texture.get_width() <= 0 or texture.get_height() <= 0:
			continue
		var sprite := Sprite2D.new()
		sprite.name = "ConditionDecal_%s_%02d" % [decal_name, index]
		sprite.texture = texture
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		sprite.centered = true
		sprite.z_as_relative = false
		var uniform_scale := float(spec["scale"])
		sprite.scale = Vector2.ONE * uniform_scale
		var x := room_width * float(spec["x"])
		var mount := _condition_decal_mount(decal_name)
		match mount:
			"ceiling":
				sprite.position = Vector2(x, float(texture.get_height()) * uniform_scale * 0.5 + tile_size * 0.35)
				sprite.z_index = -1
			"wall":
				sprite.position = Vector2(x, room_height * (0.38 if String(spec["role"]) == "primary" else 0.47))
				sprite.z_index = -1
			_:
				var fallback_floor_y := float(room_height - tile_size * 2)
				var surface_y := _support_surface_y(x, fallback_floor_y, _texture_half_width(texture) * uniform_scale)
				if not is_finite(surface_y):
					sprite.queue_free()
					continue
				var bottom_inset := _texture_bottom_inset(texture)
				sprite.position = Vector2(x, surface_y - float(texture.get_height()) * uniform_scale * 0.5 + bottom_inset * uniform_scale)
				sprite.z_index = 0
		sprite.modulate = Color(1.0, 1.0, 1.0, 0.96 if String(spec["role"]) == "primary" else 0.78)
		sprite.set_meta("condition_district", district_index)
		sprite.set_meta("condition_label", CONDITION_LABELS[district_index])
		sprite.set_meta("condition_role", spec["role"])
		sprite.set_meta("mount", mount)
		holder.add_child(sprite)


func _condition_decal_mount(decal_name: String) -> String:
	if decal_name in ["flooded_roots", "frozen_icicles"]:
		return "ceiling"
	if decal_name in [
		"intact_banner", "intact_sconce", "flooded_waterline", "flooded_arch",
		"archive_balcony", "frozen_gears", "frozen_window",
	]:
		return "wall"
	return "floor"


func _condition_decal_scale(decal_name: String) -> float:
	match decal_name:
		"intact_sconce": return 0.58
		"intact_banner": return 0.62
		"intact_altar", "intact_statue": return 0.70
		"flooded_waterline", "flooded_puddle": return 0.78
		"flooded_arch": return 0.72
		"flooded_roots": return 0.66
		"archive_books": return 0.62
		"archive_bookcase", "archive_rubble": return 0.72
		"archive_balcony": return 0.66
		"frozen_bell": return 0.78
		"frozen_gears", "frozen_window": return 0.72
		"frozen_icicles": return 0.82
		_: return 0.70


func _spawn_authored_props() -> void:
	# Wait for StaticBody2D floor and platform shapes to enter the physics world, then anchor each
	# prop to actual collision. This prevents lanterns, shards and pedestals from hovering over
	# pits or clipping into raised architecture when a room uses a nonstandard floor profile.
	await get_tree().physics_frame
	var placement_specs: Array[Dictionary] = []
	match room_id:
		"room_001":
			placement_specs = [{"prop": 8, "x": 0.12, "scale": 0.86}, {"prop": 0, "x": 0.50, "scale": 0.80}, {"prop": 5, "x": 0.87, "scale": 0.78}]
		"room_002":
			placement_specs = [{"prop": 4, "x": 0.18, "scale": 0.88}, {"prop": 3, "x": 0.82, "scale": 0.78}]
		"room_003":
			placement_specs = [{"prop": 11, "x": 0.25, "scale": 0.76}, {"prop": 6, "x": 0.50, "scale": 0.94}, {"prop": 11, "x": 0.75, "scale": 0.76}]
		"room_004":
			placement_specs = [{"prop": 5, "x": 0.15, "scale": 0.82}, {"prop": 8, "x": 0.54, "scale": 0.88}, {"prop": 0, "x": 0.88, "scale": 0.80}]
		_:
			pass
	if placement_specs.is_empty():
		match room_archetype:
			"tutorial":
				placement_specs = [{"prop": 0, "x": 0.18, "scale": 0.82}, {"prop": 5, "x": 0.78, "scale": 0.76}]
			"combat":
				placement_specs = [{"prop": 8, "x": 0.17, "scale": 0.84}, {"prop": 0, "x": 0.82, "scale": 0.78}]
			"traversal":
				placement_specs = [{"prop": 4, "x": 0.20, "scale": 0.86}, {"prop": 3, "x": 0.80, "scale": 0.76}]
			"ability_shrine":
				placement_specs = [{"prop": 11, "x": 0.25, "scale": 0.76}, {"prop": 6, "x": 0.50, "scale": 0.92}, {"prop": 11, "x": 0.75, "scale": 0.76}]
			"save":
				placement_specs = [{"prop": 1, "x": 0.26, "scale": 0.76}, {"prop": 6, "x": 0.50, "scale": 0.92}, {"prop": 1, "x": 0.74, "scale": 0.76}]
			"secret":
				placement_specs = [{"prop": 3, "x": 0.22, "scale": 0.84}, {"prop": 11, "x": 0.72, "scale": 0.82}]
			"miniboss", "boss":
				placement_specs = [{"prop": 8, "x": 0.14, "scale": 0.92}, {"prop": 4, "x": 0.50, "scale": 0.90}, {"prop": 8, "x": 0.86, "scale": 0.92}]
			"ability_gate", "transition":
				placement_specs = [{"prop": 5, "x": 0.22, "scale": 0.82}, {"prop": 0, "x": 0.80, "scale": 0.82}]
			_:
				placement_specs = [{"prop": 5, "x": 0.24, "scale": 0.78}, {"prop": 0, "x": 0.76, "scale": 0.78}]
	if room_width >= 1600 and room_archetype not in ["boss", "miniboss", "save", "ability_shrine"]:
		for cluster_x in range(280, room_width - 240, 420):
			var fraction := float(cluster_x) / float(room_width)
			var occupied := false
			for existing in placement_specs:
				if absf(float(existing["x"]) * room_width - cluster_x) < 180.0:
					occupied = true
			if not occupied:
				placement_specs.append({"prop": 0 if int(cluster_x / 420) % 2 == 0 else 5, "x": fraction, "scale": 0.74})
	var fallback_floor_y := float(room_height - tile_size * 2)
	for placement_index in range(placement_specs.size()):
		var spec: Dictionary = placement_specs[placement_index]
		var prop_index := int(spec["prop"])
		var path := "res://assets/props/biome_0/biome_0_prop_%d.png" % prop_index
		if not ResourceLoader.exists(path):
			continue
		var texture := load(path) as Texture2D
		if texture == null or texture.get_width() <= 0 or texture.get_height() <= 0:
			continue
		var uniform_scale := float(spec["scale"])
		var sprite := Sprite2D.new()
		sprite.name = "AuthoredStormglassProp_%02d_%02d" % [prop_index, placement_index]
		sprite.texture = texture
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		sprite.centered = true
		sprite.z_as_relative = false
		sprite.z_index = -2 if prop_index == 4 else 1
		sprite.scale = Vector2.ONE * uniform_scale
		var x := room_width * float(spec["x"])
		if prop_index == 4:
			# The architecture pass already supplies recessed lancet windows; avoid a second
			# unframed glass cutout in front of the player.
			sprite.queue_free()
			continue
		else:
			var surface_y := _support_surface_y(x, fallback_floor_y, _texture_half_width(texture) * uniform_scale)
			if not is_finite(surface_y):
				sprite.queue_free()
				continue
			var bottom_inset := _texture_bottom_inset(texture)
			sprite.position = Vector2(
				x,
				surface_y - float(texture.get_height()) * uniform_scale * 0.5 + bottom_inset * uniform_scale,
			)
		add_child(sprite)


func _support_surface_y(x: float, fallback_y: float, half_width: float = 0.0) -> float:
	var room := get_parent() as Node2D
	if room == null:
		return NAN
	# Floor furniture belongs on the main floor. A center-only ray used to select a tiny
	# raised platform and leave most of a bookcase or altar suspended above playable air.
	var excluded: Array[RID] = []
	for body in room.get_children():
		if body is StaticBody2D and not _is_primary_floor(body):
			excluded.append(body.get_rid())
	var samples := [-0.8, -0.4, 0.0, 0.4, 0.8] if half_width > 0.0 else [0.0]
	var support_y := NAN
	for fraction in samples:
		var query := PhysicsRayQueryParameters2D.create(
			room.to_global(Vector2(x + half_width * float(fraction), maxf(0.0, fallback_y - 192.0))),
			room.to_global(Vector2(x + half_width * float(fraction), float(room_height) + 64.0)),
			1,
		)
		query.collide_with_areas = false
		query.exclude = excluded
		var hit := get_world_2d().direct_space_state.intersect_ray(query)
		if hit.is_empty() or not _is_primary_floor(hit.get("collider")):
			return NAN
		var y := room.to_local(hit["position"]).y
		if is_finite(support_y) and absf(support_y - y) > 1.0:
			return NAN
		support_y = y
	return support_y


func _is_primary_floor(body: Object) -> bool:
	return body is StaticBody2D and (String(body.name) in ["Floor", "FloorLeft", "FloorRight"] or String(body.name).begins_with("FloorSeg") or String(body.name).begins_with("FloorSection_"))


func _texture_metrics(texture: Texture2D) -> Dictionary:
	var key := texture.get_instance_id()
	if _texture_metrics_cache.has(key):
		return _texture_metrics_cache[key]
	var image := texture.get_image()
	if image == null or (image.is_compressed() and image.decompress() != OK):
		return {"bottom_inset": 0.0, "half_width": float(texture.get_width()) * 0.5}
	image.convert(Image.FORMAT_RGBA8)
	var bytes := image.get_data()
	var width := image.get_width()
	var visited := PackedByteArray()
	visited.resize(width * image.get_height())
	var left := width
	var right := -1
	var bottom := -1
	var largest := 0
	# AI props may include disconnected scraps beneath the object. Ground the actual
	# largest silhouette, not decorative specks that make the main body hover.
	for seed in range(visited.size()):
		if visited[seed] != 0 or bytes[seed * 4 + 3] < 31:
			continue
		var queue := PackedInt32Array([seed])
		visited[seed] = 1
		var head := 0
		var part_left := width
		var part_right := -1
		var part_bottom := -1
		while head < queue.size():
			var pixel := queue[head]
			head += 1
			var x := pixel % width
			var y := int(pixel / width)
			part_left = mini(part_left, x)
			part_right = maxi(part_right, x)
			part_bottom = maxi(part_bottom, y)
			for dy in range(-1, 2):
				for dx in range(-1, 2):
					var xx := x + dx
					var yy := y + dy
					if xx < 0 or yy < 0 or xx >= width or yy >= image.get_height():
						continue
					var neighbor := yy * width + xx
					if visited[neighbor] == 0 and bytes[neighbor * 4 + 3] >= 31:
						visited[neighbor] = 1
						queue.append(neighbor)
		if queue.size() > largest:
			largest = queue.size()
			left = part_left
			right = part_right
			bottom = part_bottom
	var result := {
		"bottom_inset": float(image.get_height() - 1 - bottom) if bottom >= 0 else 0.0,
		"half_width": float(right - left + 1) * 0.5 if right >= left else float(width) * 0.5,
	}
	if _texture_metrics_cache.size() >= 128:
		_texture_metrics_cache.clear()
	_texture_metrics_cache[key] = result
	return result


func _texture_bottom_inset(texture: Texture2D) -> float:
	return float(_texture_metrics(texture)["bottom_inset"])


func _texture_half_width(texture: Texture2D) -> float:
	return float(_texture_metrics(texture)["half_width"])


func _draw() -> void:
	# Authored panoramas and sprite architecture provide the landmark layer. The former
	# procedural hanging lamps were screen-height lines ending in flat circles; at gameplay
	# scale they read as editor handles and obscured the room silhouette. The authored
	# panorama also carries organic ground fog, so rigid screen-wide mist bands are omitted.
	pass


func _draw_pointed_frame(center: Vector2, width: float, height: float, color: Color, thickness: float) -> void:
	var spring := center.y + height * 0.08
	var base := center.y + height * 0.5
	var apex := center.y - height * 0.5
	draw_line(Vector2(center.x - width * 0.5, base), Vector2(center.x - width * 0.5, spring), color, thickness)
	draw_line(Vector2(center.x + width * 0.5, base), Vector2(center.x + width * 0.5, spring), color, thickness)
	draw_line(Vector2(center.x - width * 0.5, spring), Vector2(center.x, apex), color, thickness)
	draw_line(Vector2(center.x, apex), Vector2(center.x + width * 0.5, spring), color, thickness)


func _draw_lancet(center: Vector2, glass: Color) -> void:
	_draw_pointed_frame(center, 72.0, 176.0, STONE_LIT, 13.0)
	_draw_pointed_frame(center, 48.0, 150.0, glass, 20.0)
	draw_line(Vector2(center.x, center.y - 62), Vector2(center.x, center.y + 72), INK, 4.0)
	draw_line(Vector2(center.x - 22, center.y + 8), Vector2(center.x + 22, center.y + 8), INK, 4.0)


func _draw_rose_window(center: Vector2, radius: float) -> void:
	draw_circle(center, radius + 12.0, STONE)
	draw_circle(center, radius, GLASS_DARK)
	for segment in range(12):
		var angle := TAU * float(segment) / 12.0
		var color: Color = [TEAL, ROSE, AMBER][segment % 3]
		var inner := center + Vector2(cos(angle), sin(angle)) * radius * 0.28
		var outer := center + Vector2(cos(angle), sin(angle)) * radius * 0.88
		draw_line(inner, outer, color, radius * 0.2)
		draw_line(center, outer, INK, 3.0)
	draw_circle(center, radius * 0.24, AMBER)
	draw_circle(center, radius * 0.12, TEAL)


func _draw_hanging_lamp(position: Vector2, chain: float) -> void:
	draw_line(Vector2(position.x, position.y - chain), position, STONE_LIT, 3.0)
	draw_line(position + Vector2(-10, 0), position + Vector2(10, 0), STONE, 5.0)
	draw_circle(position + Vector2(0, 7), 7.0, AMBER)
	draw_circle(position + Vector2(0, 7), 15.0, Color(0.94, 0.55, 0.18, 0.09))


func _draw_stormglass_nave(floor_y: float) -> void:
	for i in range(4):
		_draw_hanging_lamp(Vector2(room_width * (0.22 + i * 0.19), floor_y - 116.0), 108.0 + (i % 2) * 38.0)


func _draw_broken_cloister(floor_y: float) -> void:
	for i in range(4):
		var x := room_width * (0.16 + i * 0.23)
		_draw_pointed_frame(Vector2(x, floor_y - 174), 180, 290 - (i % 2) * 36, STONE, 18)
		draw_line(Vector2(x - 84, floor_y - 48), Vector2(x + 60, floor_y - 48), STONE_LIT, 8)
	for x in range(150, room_width, 330):
		draw_line(Vector2(x, floor_y - 48), Vector2(x + 74, floor_y - 150), STONE, 10)


func _draw_reliquary_shrine(floor_y: float) -> void:
	_draw_rose_window(Vector2(room_width * 0.5, floor_y - 250), 92)
	_draw_lancet(Vector2(room_width * 0.26, floor_y - 205), TEAL)
	_draw_lancet(Vector2(room_width * 0.74, floor_y - 205), ROSE)
	for i in range(7):
		_draw_hanging_lamp(Vector2(room_width * (0.2 + i * 0.1), floor_y - 72), 48 + (i % 3) * 18)


func _draw_boss_sanctum(floor_y: float) -> void:
	_draw_rose_window(Vector2(room_width * 0.5, floor_y - 310), 138)
	_draw_pointed_frame(Vector2(room_width * 0.5, floor_y - 225), room_width * 0.58, 510, STONE, 28)
	for i in range(6):
		var x := room_width * (0.14 + i * 0.144)
		draw_line(Vector2(x, floor_y - 40), Vector2(x, floor_y - 178 - (i % 2) * 42), STONE_LIT, 12)
		draw_circle(Vector2(x, floor_y - 32), 8, [TEAL, ROSE, AMBER][i % 3])
