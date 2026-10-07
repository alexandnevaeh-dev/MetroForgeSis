extends Node
## Input traversal of newly enclosed Drowned Hall, with encounters removed.
var checks: Array = []
var observations: Array = []
var world: Node
var camera_span := Vector2.ZERO

func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("DROWNED_INPUT ","PASS " if passed else "FAIL ",label)

func release_actions() -> void:
	for action in ["move_left","move_right","jump"]:
		Input.action_release(action)

func reach(target: float) -> bool:
	var elapsed := 0.0
	var last_x := -9999.0
	var stalled := 0.0
	while elapsed < 15.0 and GameManager.current_room_id == "room_011":
		var player = world._current_room.get_node("Player")
		release_actions()
		if absf(player.position.x-target)<10 and player.is_on_floor():
			return true
		Input.action_press("move_right" if player.position.x<target else "move_left")
		stalled = stalled+0.05 if absf(player.position.x-last_x)<2 else 0.0
		if stalled>0.15 and player.is_on_floor():
			Input.action_press("jump")
			stalled=0.0
		last_x=player.position.x
		await get_tree().create_timer(0.05).timeout
		elapsed+=0.05
	release_actions()
	return false

func _ready() -> void:
	GameManager.start_new_game()
	world=load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world._load_room("room_011","left")
	for enemy in get_tree().get_nodes_in_group("enemies"):
		enemy.queue_free()
	await get_tree().create_timer(0.8).timeout
	var room=world._current_room
	var player=room.get_node("Player")
	var kit=room.find_child("ThemedRoomKit",true,false)
	check("Drowned Hall kit exists",kit!=null)
	check("left arrival grounded",player.is_on_floor())
	var roofs:=0
	var piers:=0
	for body in room.get_children():
		if String(body.name).begins_with("MasonryRoof_"):
			roofs+=1
		if String(body.name).begins_with("MasonryPier_"):
			piers+=1
			var collision=body.get_node("CollisionShape2D")
			check(String(body.name)+" leaves 256px walking clearance",is_equal_approx(1216.0-body.position.y-collision.shape.size.y*0.5,256.0))
	check("three roofs and two threshold piers",roofs==3 and piers==2)
	camera_span=get_viewport().get_visible_rect().size/player.camera.zoom
	check("camera has finite world span",camera_span.x>0 and camera_span.y>0)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/drowned-input"))
	for target in [576.0,1024.0,1440.0,1800.0,1440.0,1024.0,576.0,192.0]:
		var reached:=await reach(target)
		check("input reaches x="+str(target),reached)
		if not reached:
			break
		release_actions()
		await get_tree().create_timer(0.25).timeout
		player=world._current_room.get_node("Player")
		check("grounded at x="+str(target),player.is_on_floor())
		observations.append({"target":target,"position":{"x":player.position.x,"y":player.position.y},"grounded":player.is_on_floor()})
		if observations.size() in [1,2,4]:
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png("user://qa/drowned-input/stop-"+str(observations.size())+".png")
	release_actions()
	check("no unintended room transition",GameManager.current_room_id=="room_011")
	var passed:=checks.all(func(row):return row.passed)
	var file:=FileAccess.open("user://qa/drowned-input/proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"observations":observations,"cameraWorldSpan":{"x":camera_span.x,"y":camera_span.y},"roomCameraWidths":2048.0/camera_span.x,"roomCameraHeights":1280.0/camera_span.y,"scope":"One initial load; eight targets traversed using native walking/jump input, two thresholds in both directions. Encounters removed; no combat, doors, earned progression or campaign acceptance."},"\t"))
	file.close()
	print("DROWNED_INPUT_RESULT passed=",passed," checks=",checks.size())
	AudioManager.request_quit(0 if passed else 1)
