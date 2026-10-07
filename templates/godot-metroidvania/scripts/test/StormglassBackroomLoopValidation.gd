extends Node
## One initial room setup; the complete backroom loop uses native movement.
## Encounters are removed explicitly so this is route, not combat acceptance.
var world: Node
var checks: Array = []

func check(label: String, passed: bool) -> bool:
	checks.append({"label":label,"passed":passed})
	print("BACKROOM_LOOP ","PASS " if passed else "FAIL ",label)
	return passed

func clear_encounters() -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		enemy.queue_free()

func capture_room() -> void:
	if DisplayServer.get_name()=="headless":
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/backroom-loop"))
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://qa/backroom-loop/"+GameManager.current_room_id+".png")

func walk_to_x(x: float, timeout: float = 12.0) -> bool:
	var elapsed := 0.0
	while elapsed < timeout:
		var player = get_tree().get_first_node_in_group("player")
		if player == null:
			return false
		Input.action_release("move_left")
		Input.action_release("move_right")
		if absf(player.position.x-x)<8.0:
			return true
		Input.action_press("move_right" if player.position.x<x else "move_left")
		await get_tree().create_timer(0.05).timeout
		elapsed += 0.05
	Input.action_release("move_left")
	Input.action_release("move_right")
	var actor = get_tree().get_first_node_in_group("player")
	if actor:
		print("BACKROOM_WALK_TIMEOUT room=",GameManager.current_room_id," pos=",actor.position," targetX=",x," velocity=",actor.velocity)
		for i in range(actor.get_slide_collision_count()):
			print("BACKROOM_CONTACT ",actor.get_slide_collision(i).get_collider().name)
	return false

func walk_exit(target: String, direction: String) -> bool:
	var elapsed := 0.0
	Input.action_press(direction)
	while GameManager.current_room_id != target and elapsed < 14.0:
		await get_tree().create_timer(0.05).timeout
		elapsed += 0.05
	Input.action_release(direction)
	await get_tree().create_timer(0.5).timeout
	clear_encounters()
	await capture_room()
	return GameManager.current_room_id == target

func finish() -> void:
	for action in ["move_left","move_right","move_down","move_up","jump"]:
		Input.action_release(action)
	var passed := true
	for row in checks:
		passed = passed and row.passed
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/backroom-loop"))
	var file := FileAccess.open("user://qa/backroom-loop/proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Input-driven backroom loop, initial direct room setup and encounters removed; combat acceptance separate."},"\t"))
	file.close()
	print("BACKROOM_LOOP_RESULT passed=",passed," checks=",checks.size())
	AudioManager.request_quit(0 if passed else 1)

func _ready() -> void:
	GameManager.start_new_game()
	world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world._load_room("room_007","left")
	await get_tree().create_timer(0.5).timeout
	clear_encounters()
	if not check("walk to Echo Chamber descent",await walk_to_x(512)):
		finish(); return
	var elapsed := 0.0
	while GameManager.current_room_id != "room_040" and elapsed < 8.0:
		await get_tree().create_timer(0.1).timeout
		elapsed += 0.1
	if not check("fall enters the real Echo Service Descent",GameManager.current_room_id=="room_040"):
		finish(); return
	await get_tree().create_timer(0.5).timeout
	clear_encounters()
	Input.action_press("move_down")
	for flight in range(6,-1,-1):
		var x := 150.0 if flight%2==0 else 858.0
		if not check("descend service flight "+str(flight),await walk_to_x(x)):
			finish(); return
	Input.action_release("move_down")
	if not check("service door enters Archive Vault",await walk_exit("room_041","move_left")):
		finish(); return
	if not check("vault corridor enters Memorial Return Stair",await walk_exit("room_042","move_left")):
		finish(); return
	if not check("approach return stair foot",await walk_to_x(880)):
		finish(); return
	for flight in range(7):
		var x := 112.0 if flight%2==0 else 896.0
		if not check("ascend return flight "+str(flight),await walk_to_x(x)):
			finish(); return
	if not check("approach upper return landing",await walk_to_x(500)):
		finish(); return
	Input.action_press("move_up")
	Input.action_press("jump")
	await get_tree().create_timer(0.1).timeout
	Input.action_release("jump")
	elapsed = 0.0
	while GameManager.current_room_id != "room_004" and elapsed < 4.0:
		await get_tree().create_timer(0.1).timeout
		elapsed += 0.1
	Input.action_release("move_up")
	check("upper return reconnects with main Memorial Passage",GameManager.current_room_id=="room_004")
	await get_tree().create_timer(0.5).timeout
	await capture_room()
	finish()
