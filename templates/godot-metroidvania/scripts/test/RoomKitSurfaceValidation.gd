extends Node
## Real native room loads: architecture follows collision and preserves openings.
var checks: Array = []
var surfaces_checked := 0

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.3).timeout
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/room-kit-surfaces"))
	var configured: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/visual/stormglass-room-kits.json")).rooms
	var room_ids: Array = configured.keys()
	room_ids.sort()
	var graph: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://world_graph.json"))
	var campaign_rooms: Array = []
	for node in graph.get("nodes", []):
		if node.get("type")=="room" and node.get("metadata", {}).get("stormglassCampaignLayout")=="stormglass-gallery-campaign-v1":
			campaign_rooms.append(node.id)
	if not campaign_rooms.is_empty():
		campaign_rooms.sort()
		check("all43campaign rooms have configured themes",room_ids==campaign_rooms and room_ids.size()==43)
	for id in room_ids:
		await world._load_room(id,"left")
		await get_tree().create_timer(0.2).timeout
		var room: Node2D = world._current_room
		var kit = room.find_child("ThemedRoomKit",true,false)
		check(id+" themed kit exists",kit != null)
		if kit == null:
			continue
		var interior := kit.get_node_or_null("RoomInteriorClip") as Control
		var backwall := interior.get_node_or_null("RoomBrickBackwall") if interior else null
		var ground := room.get_node("Ground")
		var room_size := Vector2(float(ground.room_width),float(ground.room_height))
		check(id+" background stays clipped to authored room bounds",interior != null and interior.clip_contents and interior.size.is_equal_approx(room_size))
		check(id+" brick backwall matches room dimensions",backwall != null and backwall.position == Vector2.ZERO and backwall.dimensions.is_equal_approx(room_size))
		check(id+" collision surface renderer exists",kit.get("surface_views") is Array)
		for body in room.get_children():
			if not body is StaticBody2D or not (String(body.name).begins_with("MasonryRoof_") or String(body.name).begins_with("MasonryPier_")):
				continue
			var collision := body.get_node_or_null("CollisionShape2D") as CollisionShape2D
			var visual := kit.get_node_or_null("Brick_"+String(body.name))
			var matches := false
			if collision != null and collision.shape is RectangleShape2D and visual != null:
				var bounds := Rect2(body.position+collision.position-collision.shape.size*0.5,collision.shape.size)
				matches = visual.position.is_equal_approx(bounds.position) and visual.dimensions.is_equal_approx(bounds.size) and visual.get_meta("collision_body")==body
			check(id+" "+String(body.name)+" masonry matches real collider",matches)
		if not kit.get("surface_views") is Array:
			continue
		var expected_count := 0
		for body in room.get_children():
			if not body is StaticBody2D or not (String(body.name).begins_with("Floor") or String(body.name).begins_with("Platform_")):
				continue
			var shape := body.get_node_or_null("CollisionShape2D") as CollisionShape2D
			if shape == null or shape.disabled or not shape.shape is RectangleShape2D:
				continue
			expected_count += 1
			var matches: Array = []
			for surface in kit.surface_views:
				if surface.get_meta("collision_body") == body:
					matches.append(surface)
			check(id+" "+String(body.name)+" has one stone course",matches.size()==1)
			if matches.size()!=1:
				continue
			var surface: Control = matches[0]
			var rect := Rect2(body.position+shape.position-shape.shape.size*0.5,shape.shape.size)
			check(id+" "+String(body.name)+" art matches real collision",surface.position.is_equal_approx(rect.position) and surface.size.is_equal_approx(rect.size))
			check(id+" "+String(body.name)+" boundary clips art",surface.clip_contents and surface.mouse_filter==Control.MOUSE_FILTER_IGNORE and surface.z_index>1)
			var foundation := surface.get_node_or_null("StoneFoundation") as ColorRect
			check(id+" "+String(body.name)+" foundation fills collider",foundation!=null and foundation.position==Vector2.ZERO and foundation.size.is_equal_approx(rect.size))
			var expected_role := "floor_course"
			var has_art := false
			var clipped_atlas := true
			for child in surface.get_children():
				if child is Sprite2D:
					has_art = true
					clipped_atlas = clipped_atlas and child.texture is AtlasTexture and child.texture.filter_clip and child.get_meta("asset_role")==expected_role
			check(id+" "+String(body.name)+" correct clipped module",has_art and clipped_atlas)
			surfaces_checked += 1
		check(id+" every floor and stair dressed",kit.surface_views.size()==expected_count and expected_count>0)
		var player := room.get_node("Player") as CharacterBody2D
		player.get_node("HealthComponent").invulnerable = true
		if id in ["room_000","room_003","room_004","room_014","room_021","room_033","room_038","room_041","room_042"]:
			if id=="room_004":
				player.position.x=room.get_node("Ground").room_width*0.5
			await get_tree().create_timer(0.3).timeout
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png("user://qa/room-kit-surfaces/"+id+".png")
	var passed := true
	for row in checks:
		passed = passed and row.passed
		if not row.passed:
			print("ROOM_KIT_SURFACE_FAIL "+JSON.stringify(row))
	var file := FileAccess.open("user://qa/room-kit-surfaces/proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"roomCount":room_ids.size(),"surfacesChecked":surfaces_checked,"scope":"Native loads of configured themed rooms; complete campaign coverage when selected, visual courses match real floor/platform collision, clip at their bounds and preserve split-floor openings. Controlled room entry/camera setup; gameplay traversal separate."},"\t"))
	file.close()
	print("ROOM_KIT_SURFACE_RESULT "+JSON.stringify({"passed":passed,"checks":checks.size(),"surfaces":surfaces_checked}))
	AudioManager.request_quit(0 if passed else 1)

func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
