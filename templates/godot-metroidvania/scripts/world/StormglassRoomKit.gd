extends Node2D
## Opt-in original room kit. Decoration never creates collision or transition logic.
var room_id := ""
var room_width := 0.0
var room_height := 0.0
var config: Dictionary = {}
var parts: Dictionary = {}
var part_textures: Dictionary = {}
var doorway_views: Array = []
var surface_views: Array = []
var interior_clip: Control

func _ready() -> void:
	for manifest_path: String in config.get("manifests", []):
		var manifest: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://" + manifest_path))
		if not manifest is Dictionary:
			continue
		var atlas: Texture2D = load("res://" + String(manifest.get("atlas", "")))
		if atlas == null:
			continue
		for entry: Dictionary in manifest.get("entries", []):
			parts[String(entry.role)] = {"atlas":atlas,"entry":entry}
	interior_clip = Control.new()
	interior_clip.name = "RoomInteriorClip"
	interior_clip.size = Vector2(room_width, room_height)
	interior_clip.clip_contents = true
	interior_clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(interior_clip)
	var base := ColorRect.new()
	base.name = "RecessedInterior"
	base.size = Vector2(room_width,room_height)
	base.color = Color(String(config.get("ambientColor","101725")))
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	base.z_as_relative = false
	base.z_index = -80
	interior_clip.add_child(base)
	# Recessed masonry fills the authored room bounds behind the facade modules.
	# The same room clip contains the background and every decorative layer.
	var backwall := Node2D.new()
	backwall.set_script(preload("res://scripts/world/StormglassMasonrySurface.gd"))
	backwall.name = "RoomBrickBackwall"
	backwall.dimensions = Vector2(room_width, room_height)
	backwall.stone = Color(String(config.get("wallTint", "46516b"))).darkened(0.65)
	backwall.z_as_relative = false
	backwall.z_index = -70
	interior_clip.add_child(backwall)
	var floor_y := room_height - 64.0
	for tier in range(maxi(1,int(ceil(room_height/480.0)))):
		var bay_floor := floor_y-tier*480.0
		for x in range(192,int(room_width),384):
			var bay_height := float(config.get("wallHeight",416.0))
			var enclosed := false
			for body in get_parent().get_parent().get_children():
				if not body is StaticBody2D or not String(body.name).begins_with("MasonryRoof_"):
					continue
				var shape := body.get_node("CollisionShape2D") as CollisionShape2D
				var bounds := Rect2(body.position-shape.shape.size*0.5,shape.shape.size)
				if x >= bounds.position.x and x < bounds.end.x:
					bay_height = floor_y-bounds.end.y
					enclosed = true
			if enclosed and tier > 0:
				continue
			_place(String(config.get("wallRole","marble_wall")),Vector2(x,bay_floor),bay_height,Color(String(config.get("wallTint","8599bd"))))
			_place("ribbed_column",Vector2(x-176,bay_floor),bay_height if enclosed else 480.0,Color(String(config.get("columnTint","b8c7e0"))))
			if x % 768 == 192 and bool(config.get("stainedWindows",true)):
				_place("stained_window",Vector2(x,bay_floor-bay_height*0.2),minf(224.0,bay_height*0.6),Color(0.80,0.89,1.0))
			else:
				_place("lantern",Vector2(x,bay_floor-bay_height*0.4),minf(96.0,bay_height*0.3),Color.WHITE)
	for prop: Dictionary in config.get("props", []):
		var lift := float(prop.get("lift",0.0))
		for body in get_parent().get_parent().get_children():
			if body is StaticBody2D and String(body.name).begins_with("MasonryRoof_"):
				var shape := body.get_node("CollisionShape2D") as CollisionShape2D
				var bounds := Rect2(body.position-shape.shape.size*0.5,shape.shape.size)
				if float(prop.x) >= bounds.position.x and float(prop.x) < bounds.end.x:
					lift = minf(lift,maxf(0.0,floor_y-bounds.end.y-float(prop.height)-16.0))
		_place(String(prop.role),Vector2(float(prop.x),floor_y-lift),float(prop.height),Color.WHITE)
	_dress_collision_surfaces()
	for child in get_parent().get_parent().get_children():
		if child.is_in_group("room_transition") and child.transition_direction in ["left","right"]:
			var doorway_floor := float(child.get_meta("metroforge_port_floor_y")) if child.has_meta("metroforge_spatial_port") else floor_y
			var anchor := Vector2(clampf(child.position.x,96.0,room_width-96.0),doorway_floor)
			var view := _place("door_open",anchor,128.0,Color.WHITE)
			if view:
				view.set_meta("transition_target",child.target_room_id)
				doorway_views.append({"door":child,"sprite":view})
	# Mark vertical ports at their real sensor X without covering the floor opening.
	for child in get_parent().get_parent().get_children():
		if child.is_in_group("room_transition") and child.transition_direction in ["up","down"]:
			var edge_y := floor_y if child.transition_direction == "down" else 64.0
			for side in [-1,1]:
				var marker_x: float = child.position.x+side*112.0
				# WorldManager places vertical arrivals one spawn margin right of centre.
				# Keep the ornamental trim clear of that landing silhouette.
				var arrival_x := minf(room_width-112.0,room_width*0.5+112.0)
				if absf(marker_x-arrival_x)<64.0:
					marker_x = arrival_x+side*96.0
				var marker := _place("threshold_trim",Vector2(marker_x,edge_y),48.0,Color.WHITE)
				if marker:
					marker.set_meta("transition_target",child.target_room_id)
	_refresh_door_states()
	EventBus.ability_acquired.connect(_refresh_door_states)

## A clipped visual course belongs to one real collider, so a split floor never
## paints over a descent opening. No collision, floor position, or stair rise changes.
func _dress_collision_surfaces() -> void:
	var room := get_parent().get_parent()
	for body in room.get_children():
		if not body is StaticBody2D:
			continue
		var flight := body.get_node_or_null("StoneFlight")
		if flight:
			flight.stone = Color(String(config.get("columnTint", "8599bd"))).darkened(0.4)
			flight.queue_redraw()
		var is_platform := String(body.name).begins_with("Platform_")
		var shape := body.get_node_or_null("CollisionShape2D") as CollisionShape2D
		if shape == null or shape.disabled or not shape.shape is RectangleShape2D:
			continue
		var rectangle := shape.shape as RectangleShape2D
		var top_left := to_local(shape.to_global(-rectangle.size * 0.5))
		var bottom_right := to_local(shape.to_global(rectangle.size * 0.5))
		var rect := Rect2(top_left, bottom_right-top_left)
		if rect.size.x <= 0 or rect.size.y <= 0:
			continue
		if not is_platform and not String(body.name).begins_with("Floor"):
			var masonry := Node2D.new()
			masonry.set_script(preload("res://scripts/world/StormglassMasonrySurface.gd"))
			masonry.name = "Brick_" + String(body.name)
			masonry.position = rect.position
			masonry.dimensions = rect.size
			masonry.roof = String(body.name).begins_with("MasonryRoof_")
			masonry.stone = Color(String(config.get("wallTint", "46516b"))).darkened(0.25)
			masonry.z_as_relative = false
			masonry.z_index = 2
			masonry.set_meta("collision_body", body)
			masonry.set_meta("collision_rect", rect)
			add_child(masonry)
			continue
		# The stair_tread prop depicts a sloped mini-staircase. These colliders
		# are flat landings, so use a flat stone course for truthful footing.
		var role := "floor_course"
		var texture := _texture(role)
		if texture == null:
			continue
		var bounds: Array = parts[role].entry.opaqueBounds
		var factor := rect.size.y / float(bounds[3])
		var course_width := float(bounds[2]) * factor
		if course_width <= 0:
			continue
		var holder := Control.new()
		holder.name = "Surface_" + String(body.name)
		holder.position = rect.position
		holder.size = rect.size
		holder.clip_contents = true
		holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.z_as_relative = false
		holder.z_index = 2
		holder.set_meta("collision_body", body)
		holder.set_meta("collision_rect", rect)
		add_child(holder)
		var foundation := ColorRect.new()
		foundation.name = "StoneFoundation"
		foundation.size = rect.size
		foundation.color = Color("30374b")
		foundation.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(foundation)
		for index in range(int(ceil(rect.size.x/course_width))):
			var sprite := Sprite2D.new()
			sprite.name = "Course_" + str(index)
			sprite.texture = texture
			sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			sprite.scale = Vector2.ONE * factor
			var opaque_bottom_center := Vector2(float(bounds[0])+float(bounds[2])*0.5,float(bounds[1])+float(bounds[3]))
			var anchor := Vector2((index+0.5)*course_width,rect.size.y)
			sprite.position = anchor-(opaque_bottom_center-texture.get_size()*0.5)*factor
			sprite.set_meta("asset_role",role)
			holder.add_child(sprite)
		surface_views.append(holder)

func _refresh_door_states(_ability: String = "") -> void:
	for pair: Dictionary in doorway_views:
		if not is_instance_valid(pair.door) or not is_instance_valid(pair.sprite):
			continue
		var unlocked := true
		for ability in pair.door.required_abilities:
			unlocked = unlocked and GameManager.has_ability(ability)
		var role := "door_open" if pair.door.required_abilities.is_empty() else "rune_gate_open" if unlocked else "rune_gate_sealed"
		var texture := _texture(role)
		if texture:
			_apply_art(pair.sprite,role,pair.sprite.get_meta("anchor"),float(pair.sprite.get_meta("display_height",256.0)))
			pair.sprite.set_meta("asset_role",role)
			pair.sprite.set_meta("transition_unlocked",unlocked)

func _texture(role: String) -> AtlasTexture:
	if part_textures.has(role):
		return part_textures[role]
	if not parts.has(role):
		return null
	var entry: Dictionary = parts[role].entry
	var region: Array = entry.region
	var texture := AtlasTexture.new()
	texture.atlas = parts[role].atlas
	texture.region = Rect2(float(region[0]),float(region[1]),float(region[2]),float(region[3]))
	texture.filter_clip = true
	part_textures[role] = texture
	return texture

func _place(role: String,anchor: Vector2,height: float,tint: Color) -> Sprite2D:
	var texture := _texture(role)
	if texture == null:
		return null
	var entry: Dictionary = parts[role].entry
	var bounds: Array = entry.opaqueBounds
	var scale_to_world := height / float(bounds[3])
	var sprite := Sprite2D.new()
	sprite.name = "Kit_" + role + "_" + str(get_child_count())
	sprite.texture = texture
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.scale = Vector2.ONE * scale_to_world
	# Align the actual opaque bottom/centre, not the transparent slot centre.
	var opaque_center := Vector2(float(bounds[0])+float(bounds[2])*0.5,float(bounds[1])+float(bounds[3]))
	sprite.position = anchor - (opaque_center-texture.get_size()*0.5)*scale_to_world
	sprite.z_as_relative = false
	sprite.z_index = -20
	sprite.modulate = tint
	sprite.set_meta("asset_role",role)
	sprite.set_meta("anchor",anchor)
	sprite.set_meta("display_height",height)
	interior_clip.add_child(sprite)
	return sprite

## Each door state has different opaque bounds; preserve the authored threshold anchor.
func _apply_art(sprite: Sprite2D, role: String, anchor: Vector2, height: float) -> void:
	var texture := _texture(role)
	if texture == null:
		return
	var bounds: Array = parts[role].entry.opaqueBounds
	var factor := height/float(bounds[3])
	var bottom_center := Vector2(float(bounds[0])+float(bounds[2])*0.5,float(bounds[1])+float(bounds[3]))
	sprite.texture=texture
	sprite.scale=Vector2.ONE*factor
	sprite.position=anchor-(bottom_center-texture.get_size()*0.5)*factor
