extends Node
## Initial room load is controlled. All subsequent movement uses the real player input.
const Guard := preload("res://scripts/test/CaptureGuard.gd")
var world: Node2D
var player: CharacterBody2D
var observations: Array = []
var captures: Array = []
var started: int
var camera_measurement: Dictionary = {}

func _ready() -> void:
	if Guard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	started = Time.get_ticks_msec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://qa/castle-region"))
	GameManager.start_new_game()
	world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world._load_room("room_001", "left")
	await get_tree().create_timer(0.5).timeout
	player = world._current_room.get_node("Player")
	var records: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/rooms/rooms.json"))
	var plan: Dictionary = records.rooms.room_001.castleRegionPlan
	var camera: Camera2D = player.get_node("Camera2D")
	var view: Vector2 = get_viewport().get_visible_rect().size / camera.zoom
	camera_measurement = {"zoom": camera.zoom.x, "worldWidth": view.x, "worldHeight": view.y, "regionWidths": float(plan.width) / view.x, "regionHeights": float(plan.height) / view.y}
	await capture("entry")
	var passed := validate_furnishings(plan)
	for route: Dictionary in plan.routes if passed else []:
		for target: Dictionary in route.ascent:
			var approach: bool = await move_to(Vector2(float(target.launchX), player.position.y), 80000, true)
			var reached: bool = approach and await move_to(Vector2(float(target.x), float(target.y)))
			observations.append({"route": route.id, "target": target, "reached": reached, "position": [player.position.x, player.position.y], "elapsedMs": Time.get_ticks_msec() - started})
			print("REGION_STEP " + JSON.stringify(observations.back()))
			if not reached:
				passed = false
				break
		if not passed:
			break
		var landing_x: float = 2688.0 if route.direction > 0 else float(plan.width) - 2688.0
		var landed: bool = await move_to(Vector2(landing_x, float(plan.floors[int(route.to)])))
		observations.append({"route": route.id, "phase": "enclosed-chamber-threshold", "reached": landed, "position": [player.position.x, player.position.y]})
		passed = landed
		await capture("storey-" + str(route.to))
		if not passed:
			break
	if passed:
		var crossed: bool = await move_to(Vector2(float(plan.returnRoute.shaftX)-128, float(plan.floors[4])), 80000)
		observations.append({"route": "crown-gallery-return", "reached": crossed})
		passed = crossed
	if passed:
		await capture("central-return-mouth")
		var return_started := Time.get_ticks_msec()
		var descended: bool = await move_to(Vector2(float(plan.returnRoute.shaftX), float(plan.returnRoute.floorY)), 80000, false)
		observations.append({"route": "central-service-descent", "elapsedMs": Time.get_ticks_msec()-return_started, "reached": descended, "position": [player.position.x, player.position.y]})
		passed = descended
		await capture("return-entry-floor")
	if passed:
		var return_target := Vector2(float(plan.returnRoute.targetX), float(plan.returnRoute.floorY))
		var return_distance := absf(player.position.x - return_target.x)
		var walk_speed: float = maxf(float(player.ability_controller.config.walk_speed), 1.0)
		# Large regions cannot use the short stair-step deadline for long halls.
		# Allow twice the unobstructed walk duration plus settling/combat headroom.
		var return_budget := int(ceil(return_distance / walk_speed * 2000.0)) + 8000
		var return_started := Time.get_ticks_msec()
		var returned: bool = await move_to(return_target, return_budget, false)
		observations.append({"route": "loop-closes-at-entry", "reached": returned, "distancePixels": return_distance, "walkSpeed": walk_speed, "budgetMs": return_budget, "elapsedMs": Time.get_ticks_msec() - return_started, "position": [player.position.x, player.position.y]})
		passed = returned
	if passed:
		for door: Dictionary in [{"direction": "left", "target": "room_000"}, {"direction": "right", "target": "room_001"}, {"direction": "right", "target": "room_002"}, {"direction": "left", "target": "room_001"}]:
			var reached: bool = await walk_through_door(String(door.direction), String(door.target))
			observations.append({"doorDirection": door.direction, "targetRoom": door.target, "reached": reached, "elapsedMs": Time.get_ticks_msec()-started})
			print("REGION_STEP " + JSON.stringify(observations.back()))
			passed = reached
			if not passed:
				break
	for action in ["move_left", "move_right", "jump", "attack"]:
		Input.action_release(action)
	if not passed:
		await capture("failure")
	var file := FileAccess.open("res://qa/castle-region/proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed": passed, "observations": observations, "camera": camera_measurement, "captures": captures, "elapsedMs": Time.get_ticks_msec()-started, "scope": "Controlled initial load then actual input ascent, chamber thresholds, upper hall gap crossings, central service descent and both external doors in both directions. No position, health, ability or enemy changes. Full-game journey requires a separate run.", "visualApproved": false}, "\t"))
	file.close()
	world.queue_free()
	world = null
	player = null
	await get_tree().process_frame
	await get_tree().process_frame
	AudioManager.request_quit(0 if passed else 1)

func validate_furnishings(plan: Dictionary) -> bool:
	var furnishings: Array[Node] = world._current_room.find_children("RegionFurnishing_*", "Sprite2D", true, false)
	var passed: bool = furnishings.size() == 20
	var names: Dictionary = {}
	for sprite: Sprite2D in furnishings:
		var floor_y := float(sprite.get_meta("support_y"))
		var half_width := float(sprite.get_meta("support_half_width"))
		var supported := true
		for offset in [-half_width, 0.0, half_width]:
			var x: float = sprite.global_position.x + float(offset)
			var query := PhysicsRayQueryParameters2D.create(Vector2(x, floor_y - 8.0), Vector2(x, floor_y + 8.0), 1)
			query.collide_with_areas = false
			var hit := player.get_world_2d().direct_space_state.intersect_ray(query)
			supported = supported and not hit.is_empty() and absf(float(hit.position.y) - floor_y) <= 1.0
		var section: Dictionary = {}
		for candidate: Dictionary in plan.sections:
			if candidate.name == sprite.get_meta("chamber_name"):
				section = candidate
		var contained := not section.is_empty() and sprite.position.x - sprite.texture.get_width() * sprite.scale.x * 0.5 >= float(section.x) + 160.0 and sprite.position.x + sprite.texture.get_width() * sprite.scale.x * 0.5 <= float(section.x) + float(section.width) - 160.0
		var mounting: String = sprite.get_meta("mounting", "floor")
		var ceiling_clear: bool = not section.is_empty() and sprite.position.y - sprite.texture.get_height() * sprite.scale.y * 0.5 >= float(section.ceilingY) + 32.0
		var wall_clear: bool = mounting != "rear-wall" or sprite.position.y + sprite.texture.get_height() * sprite.scale.y * 0.5 <= floor_y - 192.0
		names[sprite.get_meta("chamber_name")] = true
		passed = passed and supported and contained and ceiling_clear and wall_clear and sprite.z_index < 0
		observations.append({"phase": "chamber-furnishing", "name": sprite.name, "chamber": sprite.get_meta("chamber_name"), "role": sprite.get_meta("asset_role"), "mounting": mounting, "supported": supported, "thresholdClear": contained, "ceilingClear": ceiling_clear, "wallClearOfActors": wall_clear, "behindPlayer": sprite.z_index < 0})
	passed = passed and names.size() == 10
	observations.append({"phase": "furnishing-coverage", "count": furnishings.size(), "chambers": names.size(), "passed": passed})
	print("REGION_FURNISHINGS " + JSON.stringify(observations.back()))
	return passed


func move_to(target: Vector2, timeout_ms: int = 15000, gap_jump: bool = true) -> bool:
	var begin := Time.get_ticks_msec()
	var last_attack := 0
	var jump_until := 0
	while Time.get_ticks_msec()-begin < timeout_ms:
		if not is_instance_valid(player) or GameManager.current_room_id != "room_001":
			return false
		var dx := target.x-player.position.x
		if absf(dx)<18 and absf(player.position.y-target.y)<4 and player.is_on_floor():
			Input.action_release("move_left")
			Input.action_release("move_right")
			return true
		var direction := signf(dx) if absf(dx)>10 else 0.0
		Input.action_release("move_left")
		Input.action_release("move_right")
		if direction != 0:
			Input.action_press("move_right" if direction>0 else "move_left")
		var ahead := player.global_position+Vector2(direction*60,-6)
		var query := PhysicsRayQueryParameters2D.create(ahead,ahead+Vector2(0,90),1)
		var supported := not player.get_world_2d().direct_space_state.intersect_ray(query).is_empty()
		if player.is_on_floor() and (player.position.y>target.y+6 or (gap_jump and not supported)) and Time.get_ticks_msec()>jump_until+100:
			jump_until=Time.get_ticks_msec()+450
		if Time.get_ticks_msec()<jump_until:
			Input.action_press("jump")
		else:
			Input.action_release("jump")
		if Time.get_ticks_msec()-last_attack>420:
			Input.action_press("attack")
			last_attack=Time.get_ticks_msec()
		await get_tree().physics_frame
		Input.action_release("attack")
	return false

func capture(label: String) -> void:
	await get_tree().process_frame
	if await Guard.await_post_draw(self):
		var path := "res://qa/castle-region/"+label+".png"
		get_viewport().get_texture().get_image().save_png(path)
		captures.append(path)

func walk_through_door(direction: String, target_room: String) -> bool:
	var begin := Time.get_ticks_msec()
	var attack_time := 0
	while Time.get_ticks_msec()-begin < 120000:
		if GameManager.current_room_id == target_room:
			Input.action_release("move_left")
			Input.action_release("move_right")
			await get_tree().create_timer(0.5).timeout
			player = world._current_room.get_node("Player")
			return true
		Input.action_press("move_"+direction)
		if Time.get_ticks_msec()-attack_time > 420:
			Input.action_press("attack")
			attack_time = Time.get_ticks_msec()
		await get_tree().physics_frame
		Input.action_release("attack")
	return false




