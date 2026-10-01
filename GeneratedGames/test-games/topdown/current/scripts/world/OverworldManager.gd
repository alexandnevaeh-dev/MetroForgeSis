extends Node2D
## Loads generated overworld/dungeon areas from data/world/overworld.json and Y-sorts entities.

const PLAYER_SCENE := preload("res://scenes/player/Player.tscn")
const ENEMY_SCENE := preload("res://scenes/enemies/Enemy.tscn")
const BOSS_SCENE := preload("res://scenes/bosses/Boss.tscn")
const NPC_SCENE := preload("res://scenes/world/NPC.tscn")
const SAVE_SCENE := preload("res://scenes/world/SavePoint.tscn")
const ITEM_PICKUP_SCENE := preload("res://scenes/world/ItemPickup.tscn")

## Real per-cell terrain (area.tiles, values 0..3 matching TILE_GRASS/DIRT/WATER/WALL in
## packages/procedural/src/topdown/world.ts) and a real generated tileset atlas
## (assets/tilesets/<biome>/source.png + terrain.json) both existed on disk and were fully
## unused â€” _build_ground() below used to draw one flat ColorRect per area regardless of this
## data, and _build_collision() drew a second, separate flat-color rect over every wall/water
## cell, so none of the 200+ generated environment tile assets ever reached the screen. The
## overworld.json schema has no per-area biome field for top-down worlds (only worldGraph's
## single region, always "biome_0" â€” see packages/procedural/src/topdown/world.ts), so every
## area uses biome_0's tileset, matching what the generator actually produces.
const TILE_GRASS := 0
const TILE_DIRT := 1
const TILE_WATER := 2
const TILE_WALL := 3
const DEFAULT_BIOME_ID := "biome_0"

## Real generated environment props (assets/props/<biome>/<biome>_prop_<N>.png â€” always written by
## the asset pipeline, and the metroforge-research-facility pack overrides indices 0-3 with real
## authored designs) existed on disk but nothing in this template ever placed them in a room â€”
## the exact same class of "generated and ignored" gap chest/portal/checkpoint art had before an
## earlier phase of this milestone. Sparse, wall-adjacent, POI-clearance-respecting placement
## added below; still genuinely decorative â€” collision keeps a prop from being walked through,
## but placement never reduces a room to fewer than its already-guaranteed-clear routes.
const PROP_MIN_DISTANCE_FROM_POI_CELLS := 2
const PROP_MAX_PER_ROOM := 2
const PROP_FILE_COUNT_TO_TRY := 12
## A plain untyped array literal (`[Vector2i(...), ...]`) iterates as Variant in GDScript's strict
## typing mode, which broke `:=` inference on every loop variable derived from it below (a real
## parse-error regression this exact project's strict-typing settings turn into a hard failure,
## not just a warning) â€” a typed constant sidesteps that entirely.
const WALL_ADJACENCY_OFFSETS: Array[Vector2i] = [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]
## role -> Vector2i atlas cell, cached per biome so repeated room loads don't re-parse terrain.json.
var _terrain_role_cache: Dictionary = {}
## biome_id -> built TileSet, cached for the same reason.
var _tileset_cache: Dictionary = {}

var _overworld: Dictionary = {}
var _current_area_id: String = ""
var _area_root: Node2D
var _entities: Node2D
var _player: Node2D
var _transitioning := false

## load_area() frees every child of _area_root â€” including the current Player â€” and
## _ensure_player() below always instantiates a fresh one for the new area, so HealthComponent's
## own _ready() (current_health = max_health) silently reset the player to full health on every
## ordinary room transition, with no way to tell that apart from a real heal. Carrying the
## outgoing player's live health across a normal transition (while still letting a real
## save-file/death-driven restore â€” SaveManager.has_pending_health_restore() â€” take precedence
## when one is actually pending) fixes that without touching the death/respawn or save/load paths,
## which already carry health correctly via SaveManager.consume_pending_player_health().
var _carried_health: float = -1.0
var _carried_max_health: float = -1.0
var _carried_spells: Dictionary = {}

func _ready() -> void:
	add_to_group("world_manager")
	y_sort_enabled = true
	_load_overworld()
	_area_root = Node2D.new()
	_area_root.name = "AreaRoot"
	_area_root.y_sort_enabled = true
	add_child(_area_root)
	var resume := GameManager.current_room_id if GameManager.current_room_id != "" else String(_overworld.get("startAreaId", "overworld"))
	load_area(resume)
	var presentation_path := "res://data/visual/hd2d.json"
	if FileAccess.file_exists(presentation_path):
		var presentation: Variant = JSON.parse_string(FileAccess.get_file_as_string(presentation_path))
		if presentation is Dictionary and presentation.get("enabled", false):
			var presenter := Node3D.new()
			presenter.set_script(load("res://scripts/world/HD2DWorldPresenter.gd"))
			add_child(presenter)

func _load_overworld() -> void:
	var path := "res://data/world/overworld.json"
	if not FileAccess.file_exists(path):
		return
	var file := FileAccess.open(path, FileAccess.READ)
	var json := JSON.new()
	if json.parse(file.get_as_text()) == OK:
		_overworld = json.data
	file.close()

func get_start_area_id() -> String:
	return String(_overworld.get("startAreaId", "overworld"))

func is_transitioning() -> bool:
	return _transitioning

func transition_to_room(room_id: String, _spawn_side: String = "left") -> void:
	load_area(room_id, _current_area_id)

func load_area(area_id: String, from_area_id: String = "") -> void:
	if _transitioning or area_id.is_empty():
		return
	# Validate destinations before removing the current playable area.
	var area := _find_area(area_id)
	if area.is_empty():
		return
	_transitioning = true
	if _player and is_instance_valid(_player):
		var outgoing_spells := _player.get_node_or_null("Spells")
		if outgoing_spells: _carried_spells = outgoing_spells.get_transient_state()
		var outgoing_health: HealthComponent = _player.get_node_or_null("HealthComponent")
		if outgoing_health and outgoing_health.is_alive():
			_carried_health = outgoing_health.current_health
			_carried_max_health = outgoing_health.max_health
	if SaveManager.has_pending_spells_restore():
		# A loaded save takes precedence over the outgoing body's live state.
		_carried_spells = SaveManager.consume_pending_player_spells()
	for child in _area_root.get_children():
		child.queue_free()
	await get_tree().process_frame

	_current_area_id = area_id
	GameManager.current_room_id = area_id
	EventBus.room_entered.emit(area_id)
	EventBus.room_discovered.emit(area_id)

	_entities = Node2D.new()
	_entities.name = "Entities"
	_entities.y_sort_enabled = true
	_area_root.add_child(_entities)

	_build_ground(area)
	_build_collision(area)
	_spawn_pois(area)
	if _player and not _carried_spells.is_empty():
		var incoming_spells := _player.get_node_or_null("Spells")
		if incoming_spells: incoming_spells.restore_transient_state(_carried_spells)
		_carried_spells.clear()
	_spawn_props(area)
	_spawn_ambient_pickups(area)
	# Reciprocal passages return the player beside the entrance they used. Leave
	# enough clearance to prevent its contact trigger immediately sending them back.
	if _player and not from_area_id.is_empty():
		var middle := Vector2(float(area.get("widthTiles", 16)), float(area.get("heightTiles", 12))) * float(area.get("tileSize", 16)) * 0.5
		for poi: Dictionary in area.get("pois", []):
			if String(poi.get("metadata", {}).get("targetAreaId", "")) == from_area_id:
				var passage := Vector2(float(poi.get("x", 0)), float(poi.get("y", 0)))
				_player.position = passage + (middle - passage).normalized() * 56.0
				break

	var bounds := Rect2(Vector2.ZERO, Vector2(float(area.get("widthTiles", 16)) * float(area.get("tileSize", 16)), float(area.get("heightTiles", 12)) * float(area.get("tileSize", 16))))
	if _player and _player.has_node("Camera2D"):
		var cam = _player.get_node("Camera2D")
		if cam.has_method("apply_world_style"):
			cam.apply_world_style(String(_overworld.get("worldStyle", "continuous")), bounds.size)
		if cam.has_method("set_map_bounds"):
			cam.set_map_bounds(bounds)
		cam.make_current()

	_transitioning = false

## Public accessor for PlaytestAgent.gd / other external inspectors â€” _entities is otherwise
## just GDScript's underscore-convention-private, not engine-enforced, but a real method here
## keeps callers from reaching into the manager's internals directly.
func get_current_entities() -> Node2D:
	return _entities

func _find_area(area_id: String) -> Dictionary:
	for area in _overworld.get("areas", []):
		if String(area.get("id", "")) == area_id:
			return area
	return {}

func _build_ground(area: Dictionary) -> void:
	var tile_size := int(area.get("tileSize", 16))
	var w := int(area.get("widthTiles", 16))
	var h := int(area.get("heightTiles", 12))
	var tiles: Array = area.get("tiles", [])
	var tile_set := _get_biome_tileset(DEFAULT_BIOME_ID, tile_size)
	if tile_set == null or tiles.size() < h:
		# No generated tileset/terrain data available (e.g. an older project or a biome whose
		# assets failed to generate) â€” fall back to the flat placeholder rather than crash or
		# leave the room invisible.
		var ground := ColorRect.new()
		ground.color = Color(0.22, 0.38, 0.22, 1) if String(area.get("kind", "")) == "overworld" else Color(0.28, 0.24, 0.2, 1)
		ground.size = Vector2(float(w) * float(tile_size), float(h) * float(tile_size))
		ground.z_index = -8
		_area_root.add_child(ground)
		return

	var roles: Dictionary = _terrain_role_cache.get(DEFAULT_BIOME_ID, {})
	var layer := TileMapLayer.new()
	layer.tile_set = tile_set
	layer.z_index = -8
	layer.y_sort_enabled = false
	_area_root.add_child(layer)
	for y in range(h):
		var row: Array = tiles[y] if y < tiles.size() else []
		for x in range(w):
			var value := int(row[x]) if x < row.size() else TILE_WALL
			var role := _ground_role_for_cell(value, x, y, roles)
			if value == TILE_GRASS and roles.has("ground_variant_0"):
				role = "ground_variant_" + str(_cell_hash(x,y,4))
			if value == TILE_WATER and roles.has("water_edge_0"):
				var shore_mask := 0
				var shore_neighbors: Array[Vector2i] = [Vector2i.UP,Vector2i.RIGHT,Vector2i.DOWN,Vector2i.LEFT]
				for i in range(4):
					var cell := Vector2i(x,y)+shore_neighbors[i]
					var water_neighbor: bool = cell.y>=0 and cell.x>=0 and cell.y<tiles.size() and tiles[cell.y] is Array and cell.x<tiles[cell.y].size() and int(tiles[cell.y][cell.x])==TILE_WATER
					if not water_neighbor: shore_mask |= 1<<i
				role = "water_edge_" + str(shore_mask)
			var authored_rows: Array = area.get("floorRoles", [])
			if value in [TILE_GRASS,TILE_DIRT] and y < authored_rows.size() and authored_rows[y] is Array and x < authored_rows[y].size():
				var authored_role: String = String(authored_rows[y][x])
				if roles.has(authored_role): role = authored_role
			if value == TILE_DIRT and role in ["path","platform"]:
				var edge_mask := 0
				var neighbors: Array[Vector2i] = [Vector2i.UP,Vector2i.RIGHT,Vector2i.DOWN,Vector2i.LEFT]
				for i in range(4):
					var next := Vector2i(x,y)+neighbors[i]
					var connected: bool = next.y>=0 and next.x>=0 and next.y<tiles.size() and tiles[next.y] is Array and next.x<tiles[next.y].size() and int(tiles[next.y][next.x])==TILE_DIRT
					if connected and next.y<authored_rows.size() and authored_rows[next.y] is Array and next.x<authored_rows[next.y].size():
						var next_role: String = String(authored_rows[next.y][next.x])
						connected = (next_role if not next_role.is_empty() else "path") == role
					if not connected: edge_mask |= 1<<i
				var edge_role: String = role+"_edge_"+str(edge_mask)
				if edge_mask == 0 and roles.has(role+"_variant_0"):
					edge_role = role+"_variant_"+str(_cell_hash(x,y,4))
				if roles.has(edge_role): role = edge_role
			var coords: Vector2i = roles.get(role, roles.get("ground", Vector2i.ZERO))
			layer.set_cell(Vector2i(x, y), 0, coords)

## Deterministically hashed material variety per cell â€” a real biome-provided terrain.json (e.g.
## metroforge-research-facility-v2's) can declare extra ground/wall sub-roles (ground_grate,
## ground_cable, ground_hazard, ground_stain, ground_dirty, wall_accent) beyond the four this
## template originally ever requested; when present, cells deterministically roll one of them
## instead of every ground cell using the same single "ground" tile. Falls back to the exact
## original fixed 1:1 mapping when a biome's terrain.json has none of the extra roles (every
## pre-v2 generated project keeps rendering byte-identical to before this change).
const GROUND_VARIANT_ROLES: Array[String] = ["ground_grate", "ground_cable", "ground_hazard", "ground_stain", "ground_dirty"]
const WALL_VARIANT_ROLES: Array[String] = ["wall_accent"]

func _available_roles(candidates: Array[String], roles: Dictionary) -> Array[String]:
	var available: Array[String] = []
	for candidate in candidates:
		if roles.has(candidate):
			available.append(candidate)
	return available

func _ground_role_for_cell(value: int, x: int, y: int, roles: Dictionary) -> String:
	match value:
		TILE_WALL:
			var wall_variants := _available_roles(WALL_VARIANT_ROLES, roles)
			if wall_variants.is_empty():
				return "wall"
			# ~1 in 6 wall cells picks an accent variant â€” frequent enough to read as real
			# architectural detail, rare enough that it doesn't overwhelm the plain wall band.
			if _cell_hash(x, y, 7) == 0:
				return wall_variants[_cell_hash(x, y, 11) % wall_variants.size()]
			return "wall"
		TILE_WATER:
			return "hazard"
		TILE_DIRT:
			# Purpose-built biomes can declare a continuous path role. Older atlases omit
			# it and retain the sparse ground-wear behavior below.
			if roles.has("path"):
				return "path"
			# Corrected, evidence-based finding (was wrong before): a fixed 1:1 role here (the
			# original, pre-v2 behavior) meant every TILE_DIRT floor tile showed the exact same
			# "ground_wear" (cracked) cell. This branch's own weighting was tuned twice against
			# real screenshots this pass: this file's own prior comment claimed "the overworld is
			# TILE_GRASS" â€” that was never actually verified, and was wrong. A real gameplay
			# screenshot after the first two tuning attempts still showed a diagonal crack line on
			# nearly every visible overworld tile, which only happens if the overworld itself is
			# substantially TILE_DIRT and hitting *this* branch, not the "_"/open-floor one below.
			# Plain "ground" is now the real dominant outcome; ground_wear and the five material
			# variants are both genuine minority accents.
			if not roles.has("ground_wear"):
				return "ground"
			var dirt_variants := _available_roles(GROUND_VARIANT_ROLES, roles)
			var roll := _cell_hash(x, y, 15)
			if roll < 10:
				return "ground"
			if roll < 13:
				return "ground_wear"
			if not dirt_variants.is_empty():
				return dirt_variants[_cell_hash(x, y, 13) % dirt_variants.size()]
			return "ground"
		_:
			var ground_variants := _available_roles(GROUND_VARIANT_ROLES, roles)
			if ground_variants.is_empty():
				return "ground"
			# A real, visible over-saturation regression was found and fixed here: ~1 in 5 sounds
			# sparse in isolation, but the overworld's real camera shows hundreds of tiles at once
			# (unlike an enclosed dungeon room), so 1-in-5 rendered as a near-uniform maze of
			# hazard-stripe/grate/stain cells covering most of the visible floor â€” confirmed
			# directly by inspecting the actual gameplay screenshot, not assumed from the ratio
			# alone. 1 in 15 reads as real, scattered, deliberate detail at overworld scale while
			# staying visible at all.
			if _cell_hash(x, y, 15) == 0:
				return ground_variants[_cell_hash(x, y, 13) % ground_variants.size()]
			return "ground"

## Small deterministic hash (same area always produces the same tile layout on every generation/
## replay â€” no per-run flicker) â€” not cryptographic, just spatially well-mixed enough that a
## simple x%N/y%N wouldn't be (which would produce visible repeating stripes at period N).
func _cell_hash(x: int, y: int, modulo: int) -> int:
	var h_val := (x * 374761393 + y * 668265263 + int(_current_area_id.hash()))
	h_val = (h_val ^ (h_val >> 13)) * 1274126177
	h_val = h_val ^ (h_val >> 16)
	return posmod(h_val, modulo)

## Loads assets/tilesets/<biome_id>/source.png + terrain.json (both already written by the real
## asset pipeline for every biome) into a TileSet with one atlas source covering the whole sheet,
## same approach the side-view template's RoomTileMap.gd already uses for its own tileset. Also
## populates _terrain_role_cache[biome_id] with the role -> atlas-cell lookup _build_ground needs.
func _get_biome_tileset(biome_id: String, tile_size: int) -> TileSet:
	if _tileset_cache.has(biome_id):
		return _tileset_cache[biome_id]

	var texture_path := "res://assets/tilesets/%s/source.png" % biome_id
	var terrain_path := "res://assets/tilesets/%s/terrain.json" % biome_id
	if not ResourceLoader.exists(texture_path) or not FileAccess.file_exists(terrain_path):
		_tileset_cache[biome_id] = null
		return null

	var file := FileAccess.open(terrain_path, FileAccess.READ)
	var json := JSON.new()
	if file == null or json.parse(file.get_as_text()) != OK:
		_tileset_cache[biome_id] = null
		return null
	file.close()
	var terrain_data: Dictionary = json.data
	var atlas_tile_size := int(terrain_data.get("tileSize", tile_size))

	var texture: Texture2D = load(texture_path)
	var atlas := TileSetAtlasSource.new()
	atlas.texture = texture
	atlas.texture_region_size = Vector2i(atlas_tile_size, atlas_tile_size)
	var cols := int(texture.get_width()) / atlas_tile_size
	var rows := int(texture.get_height()) / atlas_tile_size
	for y in range(rows):
		for x in range(cols):
			atlas.create_tile(Vector2i(x, y))

	var tile_set := TileSet.new()
	tile_set.tile_size = Vector2i(atlas_tile_size, atlas_tile_size)
	tile_set.add_source(atlas, 0)

	var roles: Dictionary = {}
	for role_data in terrain_data.get("roles", []):
		roles[String(role_data.get("role", ""))] = Vector2i(int(role_data.get("col", 0)), int(role_data.get("row", 0)))
	_terrain_role_cache[biome_id] = roles
	_tileset_cache[biome_id] = tile_set
	return tile_set

func _build_collision(area: Dictionary) -> void:
	var body := StaticBody2D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	_area_root.add_child(body)
	for rect in area.get("collisionRects", []):
		var shape := RectangleShape2D.new()
		shape.size = Vector2(float(rect.get("w", 16)), float(rect.get("h", 16)))
		var node := CollisionShape2D.new()
		node.shape = shape
		node.position = Vector2(float(rect.get("x", 0)), float(rect.get("y", 0))) + shape.size * 0.5
		body.add_child(node)
		# The wall/water tile art painted by _build_ground() above already renders these cells â€”
		# no separate placeholder visual needed here anymore (it used to draw a second, flat-color
		# ColorRect on top of every collision rect, duplicating and fighting with the real tile art).

## Places sparse, deterministic decoration using whatever real prop art exists for this room's
## biome. Never touches area.tiles/collisionRects (the real walkable grid â€” clearWalkableFootprint
## in packages/procedural/src/topdown/world.ts already guarantees every POI/door/route stays
## clear); this only *adds* an optional, avoidable obstacle on top of already-open floor cells,
## and only ones flush against a real wall (reads as placed furniture/architecture, never as
## debris blocking an open room).
##
## Deliberately skipped for the overworld: real-input testing this pass (TestScenarios.gd, the
## asset-quality-overhaul milestone) reproduced a consistent â€” not random â€” navigation failure at
## the identical overworld->dungeon_000_r0 hop on every one of 3 separate real-input runs against
## the same generated project, always specifically on the post-respawn traversal, never the first,
## pre-death one. The overworld's own hand-placed POI layout (spawn/chest/save/npc/enemy/portal)
## already fills its available open space with real, load-bearing content; clearWalkableFootprint's
## own POI clearance guarantee (packages/procedural/src/topdown/world.ts) was never designed to
## account for THIS pass's own added decoration on top of it, so an overworld prop is the most
## plausible real cause of a corridor narrowing enough to defeat simple bot pathing even though a
## human player would route around it easily. Dungeon interiors (this function's real target) have
## no equivalent competing hand-placed layout and are unaffected by this change.
## Explicit placements replace scatter, including an intentionally empty list.
func _spawn_authored_props(area: Dictionary) -> void:
	var entries: Variant = area.get("propPlacements")
	if not entries is Array or entries.size() > 512:
		push_warning("Invalid authored prop placements")
		return
	var layout_script = preload("res://scripts/world/AuthoredPropLayout.gd")
	var seen := {}
	for entry: Variant in entries:
		if not entry is Dictionary or not entry.get("id") is String or entry.id.is_empty() or seen.has(entry.id):
			push_warning("Invalid or duplicate authored prop identity")
			continue
		seen[entry.id] = true
		var image: Variant = entry.get("image")
		if not image is String or not image.begins_with("res://") or image.contains("..") or image.contains("\\") or image.substr(6).contains(":"):
			push_warning("Invalid authored prop resource path")
			continue
		if not layout_script._number(entry.get("x")) or not layout_script._number(entry.get("y")) or not entry.get("layout") is Dictionary or entry.layout.is_empty():
			push_warning("Invalid authored prop position or layout")
			continue
		if not ResourceLoader.exists(image, "Texture2D"):
			push_warning("Missing authored prop image: " + image)
			continue
		var before := _entities.get_child_count()
		_place_prop(image, Vector2(float(entry.x),float(entry.y)), int(area.get("tileSize",16)), entry.layout)
		if _entities.get_child_count() > before:
			_entities.get_child(before).set_meta("placement_id", entry.id)
func _spawn_props(area: Dictionary) -> void:
	if area.has("propPlacements"):
		_spawn_authored_props(area)
		return
	if String(area.get("kind", "")) != "dungeon":
		return
	var tile_size := int(area.get("tileSize", 16))
	var w := int(area.get("widthTiles", 16))
	var h := int(area.get("heightTiles", 12))
	var tiles: Array = area.get("tiles", [])
	if tiles.size() < h or w < 3 or h < 3:
		return

	var available_props: Array[String] = []
	for i in range(PROP_FILE_COUNT_TO_TRY):
		var path := "res://assets/props/%s/%s_prop_%d.png" % [DEFAULT_BIOME_ID, DEFAULT_BIOME_ID, i]
		if ResourceLoader.exists(path):
			available_props.append(path)
	if available_props.is_empty():
		return

	var blocked := {}
	for poi in area.get("pois", []):
		var pcx := int(float(poi.get("x", 0)) / tile_size)
		var pcy := int(float(poi.get("y", 0)) / tile_size)
		for dy in range(-PROP_MIN_DISTANCE_FROM_POI_CELLS, PROP_MIN_DISTANCE_FROM_POI_CELLS + 1):
			for dx in range(-PROP_MIN_DISTANCE_FROM_POI_CELLS, PROP_MIN_DISTANCE_FROM_POI_CELLS + 1):
				blocked["%d,%d" % [pcx + dx, pcy + dy]] = true

	var candidates: Array[Vector2i] = []
	for y in range(1, h - 1):
		var row: Array = tiles[y] if y < tiles.size() else []
		for x in range(1, w - 1):
			var value := int(row[x]) if x < row.size() else TILE_WALL
			if value != TILE_GRASS and value != TILE_DIRT:
				continue
			if blocked.has("%d,%d" % [x, y]):
				continue
			var against_wall := false
			for offset: Vector2i in WALL_ADJACENCY_OFFSETS:
				var ny: int = y + offset.y
				var nx: int = x + offset.x
				if ny >= 0 and ny < tiles.size():
					var nrow: Array = tiles[ny]
					if nx >= 0 and nx < nrow.size() and int(nrow[nx]) == TILE_WALL:
						against_wall = true
						break
			if against_wall:
				candidates.append(Vector2i(x, y))
	if candidates.is_empty():
		return

	# Deterministic per-room seed â€” the same generated project always places props the same way
	# (no flicker between two runs of the identical output), without needing a dedicated RNG
	# thread through from the generator itself.
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(String(area.get("id", "")))
	for i in range(candidates.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp: Vector2i = candidates[i]
		candidates[i] = candidates[j]
		candidates[j] = tmp

	var count: int = min(PROP_MAX_PER_ROOM, candidates.size())
	for i in range(count):
		var cell: Vector2i = candidates[i]
		var prop_path: String = available_props[rng.randi() % available_props.size()]
		var ground_anchor := Vector2((cell.x + 0.5) * tile_size, (cell.y + 1.0) * tile_size)
		_place_prop(prop_path, ground_anchor, tile_size)

## One decorative prop instance: a bottom-anchored sprite (same centered=true/negative-offset
## convention AnimatedAssetSprite.gd uses, so props sit on the ground the same way characters do)
## plus a real but deliberately small StaticBody2D footprint â€” roughly the base of the sprite, not
## its full silhouette â€” so a tall prop blocks only the tile it actually stands on.
func _place_prop(path: String, ground_anchor_pos: Vector2, tile_size: int, authored_layout: Dictionary = {}) -> void:
	var tex: Texture2D = load(path)
	if tex == null:
		# Import-cache race: right after a fresh --import (especially under concurrent load) the
		# .import metadata is on disk and ResourceLoader.exists() is true, but the compiled .ctex
		# may not be readable yet and the first load() returns null and caches that null. Force one
		# fresh, cache-ignoring read before giving up so the prop still appears.
		tex = ResourceLoader.load(path, "Texture2D", ResourceLoader.CACHE_MODE_IGNORE)
	if tex == null:
		return
	if not authored_layout.is_empty():
		var layout_script = preload("res://scripts/world/AuthoredPropLayout.gd")
		if not layout_script.validate(authored_layout, tex.get_size()).is_empty():
			push_warning("Invalid authored prop layout: " + path)
			return
		var layer_textures := {}
		for layer: Dictionary in authored_layout.get("layers", []):
			var image_name: Variant = layer.get("image")
			# Layers are sibling project resources, never arbitrary external paths.
			if not image_name is String or image_name.is_empty() or image_name in [".", ".."] or image_name.contains("/") or image_name.contains("\\") or image_name.contains(":"):
				push_warning("Invalid prop layer image name: " + path)
				return
			var layer_path := path.get_base_dir().path_join(image_name)
			if not ResourceLoader.exists(layer_path, "Texture2D"):
				push_warning("Missing prop layer texture: " + layer_path)
				return
			var layer_texture := ResourceLoader.load(layer_path, "Texture2D") as Texture2D
			if layer_texture == null:
				push_warning("Unreadable prop layer texture: " + layer_path)
				return
			layer_textures[layer.id] = layer_texture
		var authored: Node2D = layout_script.create(tex, authored_layout, layer_textures)
		if authored == null:
			push_warning("Invalid authored prop layout: " + path)
			return
		authored.position = ground_anchor_pos
		_entities.add_child(authored)
		return
	var prop := Node2D.new()
	prop.position = ground_anchor_pos
	var sprite := Sprite2D.new()
	sprite.texture = tex
	sprite.centered = true
	sprite.offset = Vector2(0, -tex.get_height() / 2.0)
	prop.add_child(sprite)

	var body := StaticBody2D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(tile_size * 0.6, tile_size * 0.5)
	shape.shape = rect
	shape.position = Vector2(0, -rect.size.y / 2.0)
	body.add_child(shape)
	prop.add_child(body)

	_entities.add_child(prop)

## `ItemPickup.gd`/`ItemPickup.tscn` was a real, complete scene (Area2D + collision + grant_item()
## + pickup SFX/VFX + queue_free() on collection) that nothing in this template ever instantiated
## â€” confirmed by direct search of every _spawn_pois()-style call site before this fix; copying its
## generated icon files into the project alone would not have made this true. Places one health
## pickup (grants the always-real "health_vial" consumable â€” a real heal, not a placeholder) and
## one progression pickup (grants the always-real "scrap" currency) per non-boss dungeon room,
## on open floor cleared the same way _spawn_props() clears its own candidates. Deliberately
## dungeon-only (not the overworld, which already has its own hand-placed chest/save/npc/enemy
## layout) and skipped entirely for the boss's own room so the arena stays uncluttered.
func _spawn_ambient_pickups(area: Dictionary) -> void:
	if String(area.get("kind", "")) != "dungeon":
		return
	for poi in area.get("pois", []):
		if String(poi.get("kind", "")) in ["boss", "victory"]:
			return

	var tile_size := int(area.get("tileSize", 16))
	var w := int(area.get("widthTiles", 16))
	var h := int(area.get("heightTiles", 12))
	var tiles: Array = area.get("tiles", [])
	if tiles.size() < h or w < 3 or h < 3:
		return

	var blocked := {}
	for poi in area.get("pois", []):
		var pcx := int(float(poi.get("x", 0)) / tile_size)
		var pcy := int(float(poi.get("y", 0)) / tile_size)
		for dy in range(-1, 2):
			for dx in range(-1, 2):
				blocked["%d,%d" % [pcx + dx, pcy + dy]] = true

	var candidates: Array[Vector2i] = []
	for y in range(1, h - 1):
		var row: Array = tiles[y] if y < tiles.size() else []
		for x in range(1, w - 1):
			var value := int(row[x]) if x < row.size() else TILE_WALL
			if value != TILE_GRASS and value != TILE_DIRT:
				continue
			if blocked.has("%d,%d" % [x, y]):
				continue
			candidates.append(Vector2i(x, y))
	if candidates.is_empty():
		return

	var rng := RandomNumberGenerator.new()
	rng.seed = hash(String(area.get("id", "")) + "_pickups")
	for i in range(candidates.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp: Vector2i = candidates[i]
		candidates[i] = candidates[j]
		candidates[j] = tmp

	var defs: Array[Dictionary] = [{"item_id": "health_vial", "amount": 1}, {"item_id": "scrap", "amount": 15}]
	for i in range(min(defs.size(), candidates.size())):
		var cell: Vector2i = candidates[i]
		var pickup := ITEM_PICKUP_SCENE.instantiate()
		pickup.position = Vector2((cell.x + 0.5) * tile_size, (cell.y + 0.5) * tile_size)
		pickup.item_id = String(defs[i]["item_id"])
		pickup.amount = int(defs[i]["amount"])
		_entities.add_child(pickup)

func _spawn_pois(area: Dictionary) -> void:
	var exits: Array = []
	var boss: Node = null
	for poi in area.get("pois", []):
		var kind := String(poi.get("kind", ""))
		var pos := Vector2(float(poi.get("x", 0)), float(poi.get("y", 0)))
		match kind:
			"spawn":
				_ensure_player(pos)
				# Bind the player to this explicit authored spawn for persistence.
				_player.set_meta("metroforge_room_id", String(area.get("id", "")))
				_player.set_meta("metroforge_entity_kind", "player_spawn")
				_player.set_meta("metroforge_entity_id", String(poi.get("id", "")))
			"npc":
				var npc := NPC_SCENE.instantiate()
				npc.position = pos
				if npc.get("npc_id") != null:
					npc.npc_id = String(poi.get("metadata", {}).get("npcId", "npc_000"))
				_entities.add_child(npc)
			"chest":
				var chest := ChestPickup.new()
				chest.position = pos
				chest.item_id = String(poi.get("metadata", {}).get("itemId", "scrap"))
				chest.chest_id = String(poi.get("id", ""))
				_entities.add_child(chest)
			"save":
				var save_pt := SAVE_SCENE.instantiate()
				save_pt.position = pos
				_entities.add_child(save_pt)
			"dungeon_entrance":
				var portal := AreaPortal.new()
				portal.position = pos
				portal.target_area_id = String(poi.get("metadata", {}).get("targetAreaId", "overworld"))
				_entities.add_child(portal)
				exits.append(portal)
			"enemy":
				var enemy := ENEMY_SCENE.instantiate()
				enemy.position = pos
				# Real data/enemies/enemies.json stats/combat-type (melee vs projectile, etc.) are
				# keyed by this id â€” TopDownEnemyController._apply_enemy_data() reads it in its own
				# _ready(), which only fires once this node actually enters the tree, so it must be
				# set before add_child(), not after.
				if poi.get("metadata", {}).has("enemyId"):
					enemy.enemy_id = String(poi.get("metadata", {}).get("enemyId"))
				_entities.add_child(enemy)
			"boss":
				var b := BOSS_SCENE.instantiate()
				b.position = pos
				b.boss_id = String(poi.get("metadata", {}).get("bossId", "boss_final"))
				_entities.add_child(b)
				boss = b
			"locked_door":
				var door := LockedDoor.new()
				door.position = pos
				door.key_id = String(poi.get("metadata", {}).get("keyId", "rusted_key"))
				door.target_area_id = String(poi.get("metadata", {}).get("targetAreaId", ""))
				door.door_id = String(poi.get("id", ""))
				_entities.add_child(door)
				exits.append(door)
			"switch":
				var sw := FloorSwitch.new()
				sw.position = pos
				sw.opens_door_id = String(poi.get("metadata", {}).get("opensDoorId", ""))
				_entities.add_child(sw)
			"item_gate":
				var gate := ItemGate.new()
				gate.position = pos
				gate.item_id = String(poi.get("metadata", {}).get("itemId", "wind_disc"))
				_entities.add_child(gate)
			"victory":
				var shrine := VictoryShrine.new()
				shrine.position = pos
				_entities.add_child(shrine)
	if _player == null:
		_ensure_player(Vector2(64, 64))
	if boss:
		_lock_arena_exits(boss, exits)

## Classic boss-arena pattern: seal the room's own exits while its boss is alive, so neither a
## real player nor the free-roaming boss AI can carry someone out of an in-progress fight through
## the back door. Re-opens automatically on the boss's death signal.
func _lock_arena_exits(boss: Node, exits: Array) -> void:
	# Freshly-instantiated exits set monitoring = true in their own _ready() (AreaPortal.gd/
	# LockedDoor.gd), and add_child() defers _ready() on a node whose parent is already inside
	# the tree â€” it runs *after* this function's caller (_spawn_pois), not before. Locking here
	# synchronously would just get silently overwritten a moment later; wait a frame so every
	# exit's own _ready() has already run before this applies the lock on top of it.
	await get_tree().process_frame
	for exit in exits:
		if is_instance_valid(exit) and exit is Area2D:
			exit.monitoring = false
			exit.monitorable = false
	if not is_instance_valid(boss):
		return
	var health := boss.get_node_or_null("HealthComponent")
	if health and health.has_signal("died"):
		health.died.connect(func():
			# died fires from inside HurtboxComponent's own area_entered handling (the killing
			# blow's signal chain), and Godot rejects monitoring/monitorable writes made while
			# still inside an Area2D's in/out signal callback â€” set_deferred applies them right
			# after physics processing finishes instead of raising "blocked during in/out signal".
			for exit in exits:
				if is_instance_valid(exit) and exit is Area2D:
					exit.set_deferred("monitoring", true)
					exit.set_deferred("monitorable", true)
		)

func _ensure_player(pos: Vector2) -> void:
	if _player and is_instance_valid(_player):
		_player.position = pos
		# Not a real recreation (e.g. a second "spawn" POI in the same area) â€” nothing to apply
		# carried health to, and leaving it set would misapply it to a later, unrelated transition.
		_carried_health = -1.0
		_carried_max_health = -1.0
		return
	# Must be read before add_child() below â€” that's what runs the new Player's own _ready(),
	# which is what actually consumes SaveManager's pending-restore flag. Reading it after would
	# always see it already cleared, regardless of which case this was.
	var use_carried_health := _carried_health >= 0.0 and not SaveManager.has_pending_health_restore()
	_player = PLAYER_SCENE.instantiate()
	_player.position = pos
	_entities.add_child(_player)
	if use_carried_health:
		var health: HealthComponent = _player.get_node_or_null("HealthComponent")
		if health:
			if _carried_max_health > 0.0:
				health.max_health = _carried_max_health
			health.current_health = _carried_health
			health.health_changed.emit(health.current_health, health.max_health)
	_carried_health = -1.0
	_carried_max_health = -1.0
